import { randomUUID } from 'node:crypto';
import { beforeEach, expect, test } from 'vitest';
import { asAdmin, asRole, expectCode, resetDb, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

const issue = () => asRole(b, 'manager', async (c) => {
  const r = await c.query('select issue_staff_clock_code() as issue');
  return r.rows[0].issue as { code: string; expires_at: string };
});
const record = (code: string, action: 'in' | 'out', attempt = randomUUID()) =>
  asRole(b, 'therapist', async (c) => {
    const r = await c.query('select record_staff_clock($1, $2, $3) as id', [code, action, attempt]);
    return r.rows[0].id as string;
  });
const board = (role: 'therapist' | 'receptionist') => asRole(b, role, async (c) => {
  const r = await c.query('select read_staff_clock() as board');
  return r.rows[0].board;
});

test('only management can issue a live clock code and attendance writes require it', async () => {
  await expectCode(asRole(b, 'therapist', (c) => c.query('select issue_staff_clock_code()')), 'NOT_AUTHORIZED');
  await expect(asRole(b, 'anon', (c) => c.query('select read_staff_clock()'))).rejects.toMatchObject({ code: '42501' });
  await expectCode(asRole(b, 'customer', (c) => c.query('select read_staff_clock()')), 'NOT_AUTHORIZED');

  const [first, second] = await Promise.all([issue(), issue()]);
  expect(first.code).toBe(second.code);
  expect(Date.parse(first.expires_at)).toBeGreaterThan(Date.now());
  await expectCode(record(first.code, 'out'), 'INVALID_TRANSITION');
  await asAdmin((c) => c.query("update private.staff_clock_codes set expires_at = now() - interval '1 second'"));
  await expectCode(record(first.code, 'in'), 'CLOCK_CODE_EXPIRED');
  await expect(asRole(b, 'therapist', (c) => c.query('select * from private.staff_clock_codes'))).rejects.toMatchObject({ code: '42501' });
});

test('the board shows only status for coworkers and duplicate clock submissions record once', async () => {
  await asAdmin((c) => c.query(
    "insert into therapist_shifts(therapist_id, during) values ($1, tstzrange(now() - interval '1 hour', now() + interval '1 hour'))", [b.t1],
  ));
  const colleague = { user_id: b.users.therapist, display_name: 'therapist', role: 'therapist' };
  expect(await board('receptionist')).toEqual({ attendance: null, coworkers: [{ ...colleague, state: 'waiting' }] });
  const { code } = await issue();
  const attempt = randomUUID();
  const [first, duplicate] = await Promise.all([record(code, 'in', attempt), record(code, 'in', attempt)]);
  expect(first).toBe(duplicate);
  await expectCode(record(code, 'in'), 'INVALID_TRANSITION');
  expect((await board('receptionist')).coworkers).toEqual([{ ...colleague, state: 'working' }]);
  expect((await board('therapist')).attendance).toEqual({ started_at: expect.any(String), ended_at: null });

  expect(await record(code, 'out')).toBe(first);
  expect((await board('receptionist')).coworkers).toEqual([{ ...colleague, state: 'finished' }]);
  expect((await board('therapist')).attendance).toEqual({ started_at: expect.any(String), ended_at: expect.any(String) });
  // A second intentional attendance session can start using the still-valid QR.
  expect(await record(code, 'in')).not.toBe(first);
});
