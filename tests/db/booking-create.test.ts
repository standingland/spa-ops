import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, bkk, book, expectCode, randomUUID, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

test('creates a confirmed booking with service and room ranges', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  expect(k.status).toBe('confirmed');
  expect(k.price_satang).toBe(150000);
  expect(k.service_during).toBe(`["2030-01-15 03:00:00+00","2030-01-15 04:00:00+00")`);
  expect(k.room_during).toBe(`["2030-01-15 03:00:00+00","2030-01-15 04:15:00+00")`);
});
test('back to back: the therapist may continue at once, the room may not', async () => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('11:00'), position: b.pos[1], customer: b.c2 }));           // same therapist, other room
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('12:00'), therapist: b.t2, position: b.pos[1] })), 'POSITION_TAKEN'); // 12:00 < 12:15
  await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('12:15'), therapist: b.t2, position: b.pos[1] }));
});
test.each([
  ['THERAPIST_BUSY',          (b: Base) => ({ position: b.pos[1], start: bkk('10:30') })],
  ['THERAPIST_OFF_SHIFT',     () => ({ start: bkk('21:30') })],
  ['ROOM_INCOMPATIBLE',       (b: Base) => ({ position: b.couple.pos[0], start: bkk('15:00') })],
])('%s', async (code, over) => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { customer: b.c2, ...over(b) })), code);
});
test('THERAPIST_TIME_OFF, ROOM_BLOCKED, THERAPIST_NOT_QUALIFIED, RESOURCE_INACTIVE', async () => {
  await asAdmin((c) => c.query(`insert into therapist_time_off(therapist_id, during, kind) values ($1, tstzrange($2,$3), 'break')`, [b.t1, bkk('13:00'), bkk('14:00')]));
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('12:30') })), 'THERAPIST_TIME_OFF');
  await asAdmin((c) => c.query(`insert into room_blocks(room_id, during, kind) values ($1, tstzrange($2,$3), 'maintenance')`, [b.rooms[2], bkk('15:00'), bkk('17:00')]));
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('16:00'), position: b.pos[2] })), 'ROOM_BLOCKED');
  await asAdmin((c) => c.query(`delete from therapist_services where therapist_id=$1`, [b.t2]));
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2 })), 'THERAPIST_NOT_QUALIFIED');
  await asAdmin((c) => c.query(`update rooms set active=false where id=$1`, [b.rooms[3]]));
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { position: b.pos[3] })), 'RESOURCE_INACTIVE');
});
test('therapists cannot create bookings', async () => {
  await expectCode(asRole(b, 'therapist', (c) => book(c, b)), 'NOT_AUTHORIZED');
});
test('the same idempotency key returns the same booking', async () => {
  const key = randomUUID();
  const a = await asRole(b, 'receptionist', (c) => book(c, b, { key }));
  const again = await asRole(b, 'receptionist', (c) => book(c, b, { key }));
  expect(again.id).toBe(a.id);
  expect((await asAdmin((c) => c.query(`select 1 from bookings`))).rowCount).toBe(1);
});
test('a booking may cross midnight inside a late shift', async () => {
  await asAdmin((c) => c.query(`update therapist_shifts set during = tstzrange($2,$3) where therapist_id=$1`, [b.t1, bkk('18:00'), bkk('02:00','2030-01-16')]));
  const k = await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('23:30') }));
  expect(k.status).toBe('confirmed');
});
test('editing duration or buffer later leaves existing bookings untouched', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asAdmin((c) => c.query(`update services set duration_min=90; update rooms set turnover_min=30`));
  const after = await asAdmin((c) => c.query(`select service_during, room_during from bookings where id=$1`, [k.id]));
  expect(after.rows[0]).toEqual({ service_during: k.service_during, room_during: k.room_during });
});
test('candidates follow the configured rooms with no code change', async () => {
  const n = (c: any) => c.query(`select count(*)::int n from available_candidates($1,$2)`, [b.svc60, bkk('10:00')]).then((r: any) => r.rows[0].n);
  expect(await asRole(b, 'receptionist', n)).toBe(12);                       // 2 therapists × 6 standard positions
  await asRole(b, 'manager', (c) => c.query(`insert into rooms(code, display_name, category_id) values ('R7','ห้อง 7',$1)`, [b.cat.standard]));
  expect(await asRole(b, 'receptionist', n)).toBe(14);
  await asRole(b, 'receptionist', (c) => book(c, b));                        // t1 in R1 at 10:00
  const at1030 = await asRole(b, 'receptionist', (c) => c.query(`select distinct therapist_id from available_candidates($1,$2)`, [b.svc60, bkk('10:30')]));
  expect(at1030.rows).toEqual([{ therapist_id: b.t2 }]);
});
