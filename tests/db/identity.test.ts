import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

test('current_role reflects the signed-in staff member', async () => {
  for (const r of ['owner','manager','receptionist','therapist'] as const) {
    const got = await asRole(b, r, (c) => c.query(`select private.current_role() as r`));
    expect(got.rows[0].r).toBe(r);
  }
});
test('deactivated staff lose their role', async () => {
  await asAdmin((c) => c.query(`update staff set active=false where user_id=$1`, [b.users.receptionist]));
  const got = await asRole(b, 'receptionist', (c) => c.query(`select private.current_role() as r`));
  expect(got.rows[0].r).toBeNull();
});
test('only the owner can change roles', async () => {
  const sql = `update staff set role='owner' where user_id=$1 returning user_id`;
  expect((await asRole(b, 'manager', (c) => c.query(sql, [b.users.manager]))).rowCount).toBe(0);
  expect((await asRole(b, 'owner', (c) => c.query(sql, [b.users.manager]))).rowCount).toBe(1);
});
test('staff changes are audited with the actor', async () => {
  await asRole(b, 'owner', (c) => c.query(`update staff set display_name='X' where user_id=$1`, [b.users.manager]));
  const a = await asAdmin((c) => c.query(`select actor, action from audit_log where table_name='staff' and row_id=$1 order by id desc limit 1`, [b.users.manager]));
  expect(a.rows[0]).toEqual({ actor: b.users.owner, action: 'UPDATE' });
});
test('receptionist cannot read the audit log', async () => {
  expect((await asRole(b, 'receptionist', (c) => c.query(`select 1 from audit_log`))).rowCount).toBe(0);
});
