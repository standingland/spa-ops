import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, bkk, book, expectCode, runTo, type Actor, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

const st = (a: Actor, at: string, room?: string) =>
  asRole(b, a, (c) => c.query(`select * from room_status_board($1) where room_id=$2`, [at, room ?? b.rooms[0]])).then((r) => r.rows[0]);

test('status follows the booking through the day', async () => {
  expect((await st('receptionist', bkk('09:00'))).status).toBe('available');
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  expect((await st('receptionist', bkk('09:00'))).status).toBe('available');           // 60 min ahead > 30 lead
  expect(await st('receptionist', bkk('09:45'))).toMatchObject({ status: 'reserved', next_booking_id: k.id });
  await runTo(b, k.id, 'checked_in');
  expect((await st('receptionist', bkk('08:00'))).status).toBe('reserved');
  await runTo(b, k.id, 'in_treatment');
  const occ = await st('receptionist', bkk('10:10'));
  expect(occ).toMatchObject({ status: 'occupied', current_booking_id: k.id, current_therapist_id: b.t1 });
  expect(occ.expected_end).not.toBeNull();
  await runTo(b, k.id, 'completed');
  const cl = await st('receptionist', bkk('11:05'));
  expect(cl.status).toBe('cleaning'); expect(cl.turnover_due_at).not.toBeNull();
  await asRole(b, 'therapist', (c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]]));
  expect((await st('receptionist', bkk('11:10'))).status).toBe('available');
});
test('blocks: maintenance is out of service, a cleaning block is cleaning, an occupied room stays occupied', async () => {
  await asAdmin((c) => c.query(`insert into room_blocks(room_id, during, kind, note) values ($1, tstzrange($2,$3), 'maintenance', 'x'), ($4, tstzrange($2,$3), 'cleaning', null)`, [b.rooms[1], bkk('15:00'), bkk('17:00'), b.rooms[2]]));
  expect(await st('manager', bkk('16:00'), b.rooms[1])).toMatchObject({ status: 'out_of_service', block_kind: 'maintenance', block_note: 'x' });
  expect((await st('therapist', bkk('16:00'), b.rooms[1])).block_note).toBeNull();
  expect((await st('manager', bkk('16:00'), b.rooms[2])).status).toBe('cleaning');
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await runTo(b, k.id, 'in_treatment');
  await asRole(b, 'owner', (c) => c.query(`select force_room_block($1,$2,$3,'closed')`, [b.rooms[0], bkk('09:00'), bkk('18:00')]));
  expect((await st('manager', bkk('10:30'))).status).toBe('occupied');
});
test('one row per active room, following configuration', async () => {
  const n = () => asRole(b, 'receptionist', (c) => c.query(`select 1 from room_status_board($1)`, [bkk('09:00')])).then((r) => r.rowCount);
  expect(await n()).toBe(7);
  await asRole(b, 'manager', (c) => c.query(`insert into rooms(code, display_name, category_id) values ('R7','ห้อง 7',$1)`, [b.cat.standard]));
  await asRole(b, 'manager', (c) => c.query(`update rooms set active=false where id=$1`, [b.rooms[5]]));
  expect(await n()).toBe(7);
});
test('therapists see a customer name only on their own treatment; outsiders see nothing', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, customer: b.c2 }));
  await runTo(b, k.id, 'in_treatment');
  expect((await st('therapist', bkk('10:10'))).current_customer_display_name).toBeNull();
  expect((await st('receptionist', bkk('10:10'))).current_customer_display_name).not.toBeNull();
  for (const a of ['customer', 'anon'] as const)
    await expectCode(asRole(b, a, (c) => c.query(`select 1 from room_status_board()`)), 'NOT_AUTHORIZED');
});
test('the board carries treatment times; day counts skip cancellations and count by start day', async () => {
  await asAdmin((c) => c.query(`update therapist_shifts set during = tstzrange($2,$3) where therapist_id=$1`, [b.t1, bkk('09:00'), bkk('02:00', '2030-01-16')]));
  const a = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('23:30'), customer: b.c2 }));
  const x = await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, position: b.pos[1], start: bkk('14:00') }));
  await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'cancelled',1)`, [x.id]));
  await runTo(b, a.id, 'in_treatment');
  const row = (await asRole(b, 'manager', (c) => c.query(`select * from booking_board($1,$2) where booking_id=$3`, [bkk('00:00'), bkk('00:00', '2030-01-16'), a.id]))).rows[0];
  expect([row.started_at === null, row.expected_end === null, row.completed_at]).toEqual([false, false, null]);
  const d = await asRole(b, 'manager', (c) => c.query(`select day::text, bookings, booked_minutes from booking_day_counts('2030-01-14','2030-01-17')`));
  expect(d.rows).toEqual([{ day: '2030-01-15', bookings: 2, booked_minutes: 120 }]);
});
