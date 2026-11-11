import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

test('a seventh room needs no schema change and gets one position', async () => {
  const r = await asRole(b, 'manager', (c) => c.query(
    `insert into rooms(code, display_name, category_id) values ('R7','ห้อง 7',$1) returning id`, [b.cat.standard]));
  const p = await asAdmin((c) => c.query(`select label from room_positions where room_id=$1`, [r.rows[0].id]));
  expect(p.rows).toEqual([{ label: '1' }]);
});
test('rooms cannot be deleted by anyone signed in', async () => {
  for (const r of ['owner','manager'] as const)
    expect((await asRole(b, r, (c) => c.query(`delete from rooms where id=$1`, [b.rooms[0]]))).rowCount).toBe(0);
});
test('receptionist can read rooms but not edit them', async () => {
  expect((await asRole(b, 'receptionist', (c) => c.query(`select 1 from rooms`))).rowCount).toBe(7);
  expect((await asRole(b, 'receptionist', (c) => c.query(`update rooms set zone='A' returning id`))).rowCount).toBe(0);
});
test('room codes are unique', async () => {
  await expect(asRole(b, 'owner', (c) => c.query(
    `insert into rooms(code, display_name, category_id) values ('R1','dup',$1)`, [b.cat.standard]))).rejects.toMatchObject({ code: '23505' });
});
test('anonymous visitors see nothing', async () => {
  expect((await asRole(b, 'anon', (c) => c.query(`select 1 from rooms`))).rowCount).toBe(0);
});
