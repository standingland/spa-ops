import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, bkk, book, runTo, expectCode, randomUUID, pay, today, type Actor, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

// On 2030-01-15:  A c1/t1/R1 10:00 completed, discount 30000 → 120000, paid cash 120000
//                 B c2/t2/R2 10:00 completed → 150000, unpaid
//                 C c1/t1/R1 14:00 paid 150000 by transfer, then cancelled (fee 0), refunded 150000
//                 D c2/t2/R2 14:00 no-show, fee set to 50000 by a manager
//                 E c1/t1/R1 16:00 walk-in, moved to 17:00, still confirmed
// On 2030-01-10:  P c1/t1/R1 10:00 completed (an extra shift for t1 is inserted for that day)
async function fixture() {
  const rec = <T>(f: (c: any) => Promise<T>) => asRole(b, 'receptionist', f);
  await asAdmin((c) => c.query(`insert into therapist_shifts(therapist_id, during) values ($1, tstzrange($2,$3))`, [b.t1, bkk('10:00', '2030-01-10'), bkk('22:00', '2030-01-10')]));
  const P = await rec((c) => book(c, b, { start: bkk('10:00', '2030-01-10') })); await runTo(b, P.id, 'completed');
  await rec((c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]]));

  const A = await rec((c) => book(c, b));
  await asRole(b, 'manager', (c) => c.query(`select adjust_booking_charge($1, 30000, null, 'สมาชิก', 1)`, [A.id]));
  await runTo(b, A.id, 'completed'); await pay(b, 'receptionist', A.id, 120000);
  const B = await rec((c) => book(c, b, { customer: b.c2, therapist: b.t2, position: b.pos[1] })); await runTo(b, B.id, 'completed');

  const C = await rec((c) => book(c, b, { start: bkk('14:00') }));
  const pc = await pay(b, 'receptionist', C.id, 150000, { method: 'bank_transfer', reference: 'TXN-1' });
  await rec((c) => c.query(`select set_booking_status($1,'cancelled',1)`, [C.id]));
  await asRole(b, 'manager', (c) => c.query(`select record_refund($1,150000,$2,'ยกเลิก')`, [pc.id, randomUUID()]));

  const D = await rec((c) => book(c, b, { start: bkk('14:00'), customer: b.c2, therapist: b.t2, position: b.pos[1] }));
  await rec((c) => c.query(`select set_booking_status($1,'no_show',1)`, [D.id]));
  await asRole(b, 'manager', (c) => c.query(`select adjust_booking_charge($1, null, 50000, 'ไม่มาตามนัด', 2)`, [D.id]));

  const E = await rec((c) => book(c, b, { start: bkk('16:00') }));
  await asAdmin((c) => c.query(`update bookings set source='walk_in' where id=$1`, [E.id]));
  await rec((c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [E.id, bkk('17:00'), b.t1, b.pos[0]]));
}

test('summary: one definition per number', async () => {
  await fixture();
  const s = (await asRole(b, 'owner', (c) => c.query(`select * from report_summary('2030-01-15','2030-01-15')`))).rows[0];
  expect(s).toMatchObject({ bookings: 5, completed: 2, cancelled: 1, no_shows: 1, walk_ins: 1, reschedules: 1,
    cancellation_rate: '0.2000', no_show_rate: '0.2000', booked_satang: '320000', fee_satang: '50000',
    avg_transaction_satang: '135000', customers: 2, returning_customers: 1, returning_rate: '0.5000' });
});
test('booked revenue sits on the service day; collected and refunded on the day money moved', async () => {
  await fixture(); const day = await today();
  const rows = (await asRole(b, 'owner', (c) => c.query(`select bucket::text, booked_satang::int b, collected_satang::int c, refunded_satang::int r, net_collected_satang::int n from report_revenue(least($1::date,'2030-01-10'), greatest($1::date,'2030-01-15'))`, [day]))).rows;
  const by = Object.fromEntries(rows.map((x) => [x.bucket, x]));
  expect(by['2030-01-15']).toMatchObject({ b: 320000 });
  expect(by['2030-01-10']).toMatchObject({ b: 150000 });
  expect(by[day]).toMatchObject({ c: 270000, r: 150000, n: 120000 });
  expect(rows.reduce((t, x) => t + x.b, 0)).toBe(470000);
});
test('week and month buckets start on Monday and on the 1st', async () => {
  await fixture();
  const g = (grain: string) => asRole(b, 'owner', (c) => c.query(`select bucket::text, booked_satang::int b from report_revenue('2030-01-01','2030-01-31',$1) where booked_satang > 0`, [grain])).then((r) => r.rows);
  expect(await g('week')).toEqual([{ bucket: '2030-01-07', b: 150000 }, { bucket: '2030-01-14', b: 320000 }]);
  expect(await g('month')).toEqual([{ bucket: '2030-01-01', b: 470000 }]);
  await expectCode(asRole(b, 'owner', (c) => c.query(`select report_revenue('2030-01-01','2030-01-31','hour')`)), 'INVALID_SETTING');
});
test('revenue by service and by therapist counts completed work only', async () => {
  await fixture();
  const svc = await asRole(b, 'owner', (c) => c.query(`select service_id, completed, minutes, booked_satang::int b from report_by_service('2030-01-15','2030-01-15')`));
  expect(svc.rows).toEqual([{ service_id: b.svc60, completed: 2, minutes: 120, b: 270000 }]);
  const th = await asRole(b, 'owner', (c) => c.query(`select therapist_id, completed, booked_satang::int b from report_by_therapist('2030-01-15','2030-01-15') order by b`));
  expect(th.rows).toEqual([{ therapist_id: b.t1, completed: 1, b: 120000 }, { therapist_id: b.t2, completed: 1, b: 150000 }]);
});
test('reports are for the owner, and for managers only while allowed', async () => {
  const q = (a: Actor) => asRole(b, a, (c) => c.query(`select 1 from report_summary('2030-01-15','2030-01-15')`));
  await q('manager');
  for (const a of ['receptionist', 'therapist', 'customer'] as const) await expectCode(q(a), 'NOT_AUTHORIZED');
  await asRole(b, 'owner', (c) => c.query(`select set_setting('reports.manager_can_view','false')`));
  await expectCode(q('manager'), 'NOT_AUTHORIZED'); await q('owner');
});
