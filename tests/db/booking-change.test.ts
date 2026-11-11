import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, bkk, book, expectCode, randomUUID, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

test('move updates in place and records a reschedule', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const m = await asRole(b, 'manager', (c) => c.query(`select * from move_booking($1,$2,$3,$4,$5)`, [k.id, bkk('14:00'), b.t2, b.pos[1], 1])).then((r) => r.rows[0]);
  expect([m.id, m.version, m.therapist_id]).toEqual([k.id, 2, b.t2]);
  const ev = await asAdmin((c) => c.query(`select kind from booking_events where booking_id=$1 order by id`, [k.id]));
  expect(ev.rows.map((r) => r.kind)).toEqual(['created', 'rescheduled']);
  expect((await asAdmin((c) => c.query(`select 1 from bookings`))).rowCount).toBe(1);
});
test('a booking can shift into time it already occupies', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [k.id, bkk('10:30'), b.t1, b.pos[0]]));
});
test('a conflicting move fails and changes nothing', async () => {
  const a = await asRole(b, 'receptionist', (c) => book(c, b));
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('14:00'), customer: b.c2 }));
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [z.id, bkk('10:30'), b.t1, b.pos[1]])), 'THERAPIST_BUSY');
  const still = await asAdmin((c) => c.query(`select service_during, version from bookings where id=$1`, [z.id]));
  expect(still.rows[0]).toEqual({ service_during: z.service_during, version: 1 });
  expect(a.version).toBe(1);
});
test('the second save from a stale screen is refused', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [k.id, bkk('12:00'), b.t1, b.pos[0]]));
  await expectCode(asRole(b, 'manager', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [k.id, bkk('16:00'), b.t1, b.pos[0]])), 'STALE_VERSION');
});
test('lifecycle transitions are validated', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'completed',1)`, [k.id])), 'INVALID_TRANSITION');
  await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'checked_in',1)`, [k.id]));
  await asRole(b, 'therapist', (c) => c.query(`select set_booking_status($1,'in_treatment',2)`, [k.id]));
  await asRole(b, 'therapist', (c) => c.query(`select set_booking_status($1,'completed',3)`, [k.id]));
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select set_booking_status($1,'cancelled',4)`, [k.id])), 'INVALID_TRANSITION');
});
test('cancelling frees the slot', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'cancelled',1)`, [k.id]));
  await asRole(b, 'receptionist', (c) => book(c, b, { customer: b.c2 }));
});
test.each([
  ['deactivate room',     (b: Base): [string, unknown[]] => [`update rooms set active=false where id=$1`, [b.rooms[0]]]],
  ['deactivate position', (b: Base): [string, unknown[]] => [`update room_positions set active=false where id=$1`, [b.pos[0]]]],
  ['deactivate therapist',(b: Base): [string, unknown[]] => [`update therapists set active=false where id=$1`, [b.t1]]],
  ['block room',          (b: Base): [string, unknown[]] => [`insert into room_blocks(room_id, during, kind) values ($1, tstzrange('${bkk('09:00')}','${bkk('12:00')}'), 'maintenance')`, [b.rooms[0]]]],
  ['time off',            (b: Base): [string, unknown[]] => [`insert into therapist_time_off(therapist_id, during, kind) values ($1, tstzrange('${bkk('10:30')}','${bkk('11:30')}'), 'leave')`, [b.t1]]],
  ['shrink shift',        (b: Base): [string, unknown[]] => [`update therapist_shifts set during = tstzrange('${bkk('12:00')}','${bkk('22:00')}') where therapist_id=$1`, [b.t1]]],
])('%s is refused while a booking depends on it', async (_n, q) => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  const [sql, args] = q(b);
  await expectCode(asRole(b, 'manager', (c) => c.query(sql, args)), 'CONFLICTS_WITH_BOOKINGS');
});
test('a room with only past or cancelled bookings can be deactivated and keeps its history', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'cancelled',1)`, [k.id]));
  await asRole(b, 'manager', (c) => c.query(`update rooms set active=false where id=$1`, [b.rooms[0]]));
  const h = await asAdmin((c) => c.query(`select r.code from bookings k join rooms r on r.id=k.room_id where k.id=$1`, [k.id]));
  expect(h.rows[0].code).toBe('R1');
});
test('adding a position raises capacity; it cannot drop below a live booking', async () => {
  await asRole(b, 'manager', (c) => c.query(`insert into room_positions(room_id, label) values ($1,'2')`, [b.rooms[0]]));
  const party = randomUUID();
  await asRole(b, 'receptionist', (c) => book(c, b, { party }));
  const p2 = await asAdmin((c) => c.query(`select id from room_positions where room_id=$1 and label='2'`, [b.rooms[0]]));
  await asRole(b, 'receptionist', (c) => book(c, b, { party, therapist: b.t2, position: p2.rows[0].id, customer: b.c2 }));
  await expectCode(asRole(b, 'manager', (c) => c.query(`update room_positions set active=false where id=$1`, [p2.rows[0].id])), 'CONFLICTS_WITH_BOOKINGS');
});
