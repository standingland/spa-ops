import { test, expect, beforeEach } from 'vitest';
import type { PoolClient } from 'pg';
import { asRole, resetDb, bkk, book, expectCode, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

const stranded = (c: PoolClient) => c.query(`select * from stranded_bookings()`).then((r) => r.rows);

test('an absence over a live booking is recorded and the booking is queued for reassignment', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const hit = await asRole(b, 'manager', (c) => c.query(`select * from record_absence($1,$2,$3,'absence')`, [b.t1, bkk('09:00'), bkk('13:00')]));
  expect(hit.rows.map((r) => r.record_absence)).toEqual([k.id]);
  expect(await asRole(b, 'receptionist', stranded)).toEqual([{ booking_id: k.id, reason: 'therapist_time_off' }]);
  await asRole(b, 'receptionist', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [k.id, bkk('10:00'), b.t2, b.pos[0]]));
  expect(await asRole(b, 'receptionist', stranded)).toEqual([]);
});
test('a forced room block queues its bookings; moving rooms clears it', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'owner', (c) => c.query(`select force_room_block($1,$2,$3,'maintenance','แอร์เสีย')`, [b.rooms[0], bkk('09:00'), bkk('18:00')]));
  expect(await asRole(b, 'manager', stranded)).toEqual([{ booking_id: k.id, reason: 'room_blocked' }]);
  await asRole(b, 'manager', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [k.id, bkk('10:00'), b.t1, b.pos[1]]));
  expect(await asRole(b, 'manager', stranded)).toEqual([]);
});
test('the plain insert is still refused, and only owner or manager may force', async () => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  await expectCode(asRole(b, 'manager', (c) => c.query(`insert into therapist_time_off(therapist_id, during, kind) values ($1, tstzrange($2,$3), 'leave')`, [b.t1, bkk('09:00'), bkk('13:00')])), 'CONFLICTS_WITH_BOOKINGS');
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select record_absence($1,$2,$3,'absence')`, [b.t1, bkk('09:00'), bkk('13:00')])), 'NOT_AUTHORIZED');
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select force_room_block($1,$2,$3,'closed')`, [b.rooms[0], bkk('09:00'), bkk('13:00')])), 'NOT_AUTHORIZED');
});
test('a therapist reports a room issue; reception resolves it once', async () => {
  const r = await asRole(b, 'therapist', (c) => c.query(`select * from report_room_issue($1,'ผ้าขนหนูหมด')`, [b.rooms[0]]));
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select resolve_room_report($1)`, [r.rows[0].id])), 'NOT_AUTHORIZED');
  await asRole(b, 'receptionist', (c) => c.query(`select resolve_room_report($1)`, [r.rows[0].id]));
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select resolve_room_report($1)`, [r.rows[0].id])), 'INVALID_TRANSITION');
});
