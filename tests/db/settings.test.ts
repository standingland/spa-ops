import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, bkk, book, expectCode, type Actor, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

const settings = (a: Actor) => asRole(b, a, (c) => c.query(`select get_settings() s`)).then((r) => r.rows[0].s);

test('every key has a default until the owner changes it', async () => {
  const s = await settings('therapist');
  expect(Object.keys(s)).toHaveLength(23);
  expect([s['ops.reserved_lead_min'], s['policy.cancel_fee_percent'], s['reports.manager_can_view']]).toEqual([30, 0, true]);
});
test('the reserved lead time drives room status', async () => {
  await asRole(b, 'receptionist', (c) => book(c, b));                                   // 10:00
  const at = (t: string) => asRole(b, 'receptionist', (c) => c.query(`select status from room_status_board($1) where room_id=$2`, [t, b.rooms[0]])).then((r) => r.rows[0].status);
  expect(await at(bkk('09:20'))).toBe('available');
  await asRole(b, 'owner', (c) => c.query(`select set_setting('ops.reserved_lead_min', '45')`));
  expect(await at(bkk('09:20'))).toBe('reserved');
});
test('only the owner may change settings, and only valid ones', async () => {
  await expectCode(asRole(b, 'manager', (c) => c.query(`select set_setting('ops.late_arrival_min', '5')`)), 'NOT_AUTHORIZED');
  for (const [k, v] of [['ops.unknown', '5'], ['policy.cancel_fee_percent', '150'], ['ops.late_arrival_min', '"ten"'], ['reports.manager_can_view', '1']])
    await expectCode(asRole(b, 'owner', (c) => c.query(`select set_setting($1, $2::jsonb)`, [k, v])), 'INVALID_SETTING');
  expect((await asRole(b, 'owner', (c) => c.query(`update app_settings set value='1' returning key`))).rowCount).toBe(0);
});
test('a change is audited with the owner as actor', async () => {
  await asRole(b, 'owner', (c) => c.query(`select set_setting('retention.inactive_months', '36')`));
  const a = await asAdmin((c) => c.query(`select actor from audit_log where table_name='app_settings' order by id desc limit 1`));
  expect(a.rows[0].actor).toBe(b.users.owner);
});
