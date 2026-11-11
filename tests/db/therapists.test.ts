import { test, expect, beforeEach } from 'vitest';
import { asRole, resetDb, bkk, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

test('a therapist cannot hold two overlapping shifts', async () => {
  await expect(asRole(b, 'manager', (c) => c.query(
    `insert into therapist_shifts(therapist_id, during) values ($1, tstzrange($2,$3))`,
    [b.t1, bkk('21:00'), bkk('23:00')]))).rejects.toMatchObject({ code: '23P01' });
});
test('a shift may cross midnight', async () => {
  const r = await asRole(b, 'manager', (c) => c.query(
    `insert into therapist_shifts(therapist_id, during) values ($1, tstzrange($2,$3)) returning id`,
    [b.t1, bkk('22:00'), bkk('02:00', '2030-01-16')]));
  expect(r.rowCount).toBe(1);
});
test('receptionist cannot edit shifts; therapist can read their own', async () => {
  expect((await asRole(b, 'receptionist', (c) => c.query(`delete from therapist_shifts returning id`))).rowCount).toBe(0);
  expect((await asRole(b, 'therapist', (c) => c.query(`select 1 from therapist_shifts where therapist_id=$1`, [b.t1]))).rowCount).toBe(1);
});
