import { test, expect, beforeEach } from 'vitest';
import { asRole, asAdmin, resetDb, bkk, book, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

test('the board shows display names only, and therapists only their own rows', async () => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, position: b.pos[1], customer: b.c2 }));
  const q = (c: any) => c.query(`select * from booking_board($1,$2)`, [bkk('00:00'), bkk('00:00', '2030-01-16')]);
  const all = await asRole(b, 'receptionist', q);
  expect(all.rowCount).toBe(2);
  expect(Object.keys(all.rows[0])).not.toEqual(expect.arrayContaining(['phone', 'email', 'full_name', 'note']));
  for (const k of ['phone', 'email', 'full_name', 'note']) expect(Object.keys(all.rows[0])).not.toContain(k);
  expect(all.rows.map((r: any) => r.customer_display_name).sort()).toEqual(['C1', 'C2']);
  const mine = await asRole(b, 'therapist', q);
  expect(mine.rows.map((r: any) => [r.therapist_id, r.customer_id])).toEqual([[b.t1, null]]);
});
test('a booking crossing midnight appears on the day it starts and the next', async () => {
  await asAdmin((c) => c.query(`update therapist_shifts set during = tstzrange($2,$3) where therapist_id=$1`, [b.t1, bkk('18:00'), bkk('02:00','2030-01-16')]));
  await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('23:30') }));
  for (const [from, to] of [[bkk('00:00'), bkk('00:00','2030-01-16')], [bkk('00:00','2030-01-16'), bkk('00:00','2030-01-17')]])
    expect((await asRole(b, 'manager', (c) => c.query(`select 1 from booking_board($1,$2)`, [from, to]))).rowCount).toBe(1);
});
