import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, bkk, book, runTo, expectCode, today, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

// Fixture on 2030-01-15 (t1, t2 work 10:00–22:00 = 720 open minutes):
//   t1 break 13:00–14:00; R3 maintenance block 10:00–16:00
//   A c1/t1/R1 10:00 completed; E c1/t1/R1 17:00 confirmed; B c2/t2/R2 10:00 completed; X c2/t2/R2 14:00 cancelled
async function fixture() {
  await asAdmin(async (c) => {
    await c.query(`insert into therapist_time_off(therapist_id, during, kind) values ($1, tstzrange($2,$3), 'break')`, [b.t1, bkk('13:00'), bkk('14:00')]);
    await c.query(`insert into room_blocks(room_id, during, kind) values ($1, tstzrange($2,$3), 'maintenance')`, [b.rooms[2], bkk('10:00'), bkk('16:00')]);
  });
  const rec = <T>(f: (c: any) => Promise<T>) => asRole(b, 'receptionist', f);
  const A = await rec((c) => book(c, b)); await runTo(b, A.id, 'completed');
  const B = await rec((c) => book(c, b, { customer: b.c2, therapist: b.t2, position: b.pos[1] })); await runTo(b, B.id, 'completed');
  const X = await rec((c) => book(c, b, { start: bkk('14:00'), customer: b.c2, therapist: b.t2, position: b.pos[1] }));
  await rec((c) => c.query(`select set_booking_status($1,'cancelled',1)`, [X.id]));
  await rec((c) => book(c, b, { start: bkk('17:00') }));
}
const R = '2030-01-15';

test('room utilisation uses open time and removes maintenance', async () => {
  await fixture();
  const rows = (await asRole(b, 'owner', (c) => c.query(`select room_id, open_minutes, booked_minutes, utilization from report_room_utilization($1,$1)`, [R]))).rows;
  const by = Object.fromEntries(rows.map((x) => [x.room_id, x]));
  expect(by[b.rooms[0]]).toEqual({ room_id: b.rooms[0], open_minutes: 720, booked_minutes: 120, utilization: '0.1667' });
  expect(by[b.rooms[1]]).toMatchObject({ booked_minutes: 60, utilization: '0.0833' });
  expect(by[b.rooms[2]]).toMatchObject({ open_minutes: 360, booked_minutes: 0, utilization: '0.0000' });
  expect(rows).toHaveLength(7);
});
test('rooms follow configuration: a new room appears, a retired room with history stays', async () => {
  await fixture();
  await asRole(b, 'manager', (c) => c.query(`insert into rooms(code, display_name, category_id, zone) values ('R7','ห้อง 7',$1,'ZZ')`, [b.cat.standard]));
  await asAdmin((c) => c.query(`update bookings set status='cancelled' where status='confirmed'; update rooms set active=false where id='${b.rooms[0]}'`));
  const rows = (await asRole(b, 'owner', (c) => c.query(`select room_id, zone from report_room_utilization($1,$1)`, [R]))).rows;
  expect(rows).toHaveLength(8);
  expect(rows.map((x) => x.room_id)).toContain(b.rooms[0]);
  expect(rows.filter((x) => x.zone === 'ZZ')).toHaveLength(1);
});
test('therapist utilisation removes breaks from rostered time', async () => {
  await fixture();
  const rows = (await asRole(b, 'owner', (c) => c.query(`select therapist_id, shift_minutes, time_off_minutes, booked_minutes, utilization from report_therapist_utilization($1,$1) order by utilization desc`, [R]))).rows;
  expect(rows).toEqual([
    { therapist_id: b.t1, shift_minutes: 720, time_off_minutes: 60, booked_minutes: 120, utilization: '0.1818' },
    { therapist_id: b.t2, shift_minutes: 720, time_off_minutes: 0, booked_minutes: 60, utilization: '0.0833' }]);
});
test('peak periods count by Bangkok weekday and hour', async () => {
  await fixture();
  const p = await asRole(b, 'owner', (c) => c.query(`select dow, hour, bookings from report_peak_periods($1,$1) order by hour`, [R]));
  expect(p.rows).toEqual([{ dow: 2, hour: 10, bookings: 2 }, { dow: 2, hour: 17, bookings: 1 }]);
});
test('turnover efficiency is measured from start to ready', async () => {
  await fixture(); const day = await today();
  await asRole(b, 'therapist', (c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]]));
  const r = (await asRole(b, 'owner', (c) => c.query(`select turnovers, on_time_rate, avg_turnover_min is not null as timed from report_room_utilization($1,$1) where room_id=$2`, [day, b.rooms[0]]))).rows[0];
  expect(r).toEqual({ turnovers: 1, on_time_rate: '1.0000', timed: true });
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select report_peak_periods($1,$1)`, [R])), 'NOT_AUTHORIZED');
});
