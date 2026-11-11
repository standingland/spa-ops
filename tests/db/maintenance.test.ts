import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, asService, resetDb, book, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

const old = () => asAdmin((c) => c.query(`
  insert into audit_log(at, table_name, action) values (now() - interval '30 months', 'rooms', 'UPDATE'), (now() - interval '2 months', 'rooms', 'UPDATE');
  update notification_outbox set status='sent', sent_at = now() - interval '100 days', created_at = now() - interval '100 days'`));
const counts = () => asAdmin((c) => c.query(`select (select count(*)::int from audit_log where table_name='rooms' and action='UPDATE') audit, (select count(*)::int from notification_outbox) outbox, (select count(*)::int from bookings) bookings`)).then((r) => r.rows[0]);

test('nothing is deleted until the owner enables pruning', async () => {
  await asAdmin((c) => c.query(`update customers set comms_consent=true, phone='0810000000' where id=$1`, [b.c1]));
  await asRole(b, 'receptionist', (c) => book(c, b)); await old();
  const before = await counts();
  expect(before.outbox).toBe(1);
  expect((await asService((c) => c.query(`select run_maintenance() r`))).rows[0].r).toEqual({ enabled: false });
  expect(await counts()).toEqual(before);
  await asRole(b, 'owner', (c) => c.query(`select set_setting('retention.prune_enabled','true')`));
  expect((await asService((c) => c.query(`select run_maintenance() r`))).rows[0].r).toMatchObject({ enabled: true, audit_deleted: 1, outbox_deleted: 1 });
  expect(await counts()).toEqual({ audit: before.audit - 1, outbox: 0, bookings: 1 });
});
test('only the scheduler role may run maintenance', async () => {
  await expect(asRole(b, 'owner', (c) => c.query(`select run_maintenance()`))).rejects.toMatchObject({ code: '42501' });
});
test('the retention months are validated', async () => {
  await expect(asRole(b, 'owner', (c) => c.query(`select set_setting('retention.audit_months','6')`))).rejects.toMatchObject({ message: 'INVALID_SETTING' });
});
