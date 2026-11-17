import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, bkk, book, runTo, expectCode, pay, type Actor, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

test('a phone number identifies one customer and must be normalised', async () => {
  const ins = (p: string) => asRole(b, 'receptionist', (c) => c.query(`insert into customers(display_name, phone) values ('x', $1)`, [p]));
  await ins('0810000000');
  await expect(ins('0810000000')).rejects.toMatchObject({ code: '23505' });
  await expect(ins('081-000-0000')).rejects.toMatchObject({ code: '23514' });
  await ins('+14155550100');
});
test('the summary counts visits, cancellations and no-shows', async () => {
  const mk = (start: string) => asRole(b, 'receptionist', (c) => book(c, b, { start }));
  await runTo(b, (await mk(bkk('10:00'))).id, 'completed');
  await asRole(b, 'receptionist', (c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]]));
  await runTo(b, (await mk(bkk('12:30'))).id, 'completed');
  const x = await mk(bkk('15:00')); await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'cancelled',1)`, [x.id]));
  const n = await mk(bkk('17:00')); await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'no_show',1)`, [n.id]));
  await mk(bkk('19:00'));
  const s = await asRole(b, 'receptionist', (c) => c.query(`select * from customer_summary($1)`, [b.c1]));
  expect(s.rows[0]).toMatchObject({ visits: 2, cancelled: 1, no_shows: 1, top_service_id: b.svc60, upcoming: 1 });
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select customer_summary($1)`, [b.c1])), 'NOT_AUTHORIZED');
});
test('a therapist reads treatment notes for their own booking only, never contact details', async () => {
  await asAdmin((c) => c.query(`update customers set service_notes='แรงกดปานกลาง', phone='0810000000' where id=$1`, [b.c1]));
  const mine = await asRole(b, 'receptionist', (c) => book(c, b, { note: 'มาสาย 5 นาที' }));
  const other = await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, position: b.pos[1], customer: b.c2 }));
  const d = await asRole(b, 'therapist', (c) => c.query(`select * from booking_detail($1)`, [mine.id]));
  expect(d.rows[0]).toEqual({ booking_id: mine.id, note: 'มาสาย 5 นาที', service_notes: 'แรงกดปานกลาง', customer_display_name: expect.any(String) });
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select booking_detail($1)`, [other.id])), 'NOT_AUTHORIZED');
});
test('export gathers everything held about one person, for owner and manager only', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b)); await pay(b, 'receptionist', k.id, 150000);
  await asRole(b, 'manager', (c) => c.query(`insert into customer_private_notes(customer_id, body) values ($1,'n')`, [b.c1]));
  const e = (await asRole(b, 'manager', (c) => c.query(`select export_customer($1) e`, [b.c1]))).rows[0].e;
  expect(Object.keys(e).sort()).toEqual(['bookings', 'notes', 'payments', 'preferences', 'profile', 'waitlist']);
  expect([e.bookings.length, e.payments.length, e.notes.length]).toEqual([1, 1, 1]);
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select export_customer($1)`, [b.c1])), 'NOT_AUTHORIZED');
});
test('anonymising empties the person and keeps the business record', async () => {
  await asAdmin((c) => c.query(`update customers set full_name='ชื่อ จริง', phone='0810000000', comms_consent=true where id=$1`, [b.c1]));
  await asRole(b, 'manager', (c) => c.query(`insert into customer_private_notes(customer_id, body) values ($1,'ลับ')`, [b.c1]));
  const k = await asRole(b, 'receptionist', (c) => book(c, b, { note: 'โน้ต' })); await pay(b, 'receptionist', k.id, 150000);
  const anon = (a: Actor, why = 'ลูกค้าขอลบข้อมูล') => asRole(b, a, (c) => c.query(`select * from anonymise_customer($1,$2)`, [b.c1, why]));
  await expectCode(anon('manager'), 'NOT_AUTHORIZED');
  await expectCode(anon('owner', ''), 'REASON_REQUIRED');
  await expectCode(anon('owner'), 'CONFLICTS_WITH_BOOKINGS');
  await runTo(b, k.id, 'completed');
  const r = (await anon('owner')).rows[0];
  expect([r.display_name, r.full_name, r.phone, r.comms_consent, r.anonymised_at === null]).toEqual(['Removed', null, null, false, false]);
  const left = await asAdmin((c) => c.query(`select
    (select count(*)::int from customer_private_notes where customer_id=$1) notes,
    (select note from bookings where id=$2) note,
    (select count(*)::int from payments where booking_id=$2) payments,
    (select count(*)::int from notification_outbox where customer_id=$1 and status in ('pending','failed')) queued,
    (select count(*)::int from audit_log where row_id=$1 and (old::text like '%0810000000%' or new::text like '%0810000000%')) leaked,
    (select count(*)::int from booking_events where before::text like '%โน้ต%' or after::text like '%โน้ต%') event_notes,
    (select count(*)::int from audit_log where old::text like '%โน้ต%' or new::text like '%โน้ต%' or old::text like '%ลับ%') audit_notes`, [b.c1, k.id]));
  expect(left.rows[0]).toEqual({ notes: 0, note: null, payments: 1, queued: 0, leaked: 0, event_notes: 0, audit_notes: 0 });
  await expectCode(anon('owner'), 'INVALID_TRANSITION');
});
test('an emptied record cannot be refilled, and only the function may set anonymised_at', async () => {
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`update customers set anonymised_at=now() where id=$1`, [b.c1])), 'NOT_AUTHORIZED');
  await asRole(b, 'owner', (c) => c.query(`select anonymise_customer($1,'x')`, [b.c1]));
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`update customers set phone='0899999999' where id=$1`, [b.c1])), 'INVALID_TRANSITION');
});
test('the retention list follows the configured months and only lists', async () => {
  await asRole(b, 'receptionist', (c) => book(c, b));                                                       // c1 active on 2030-01-15
  const list = (asOf: string) => asRole(b, 'owner', (c) => c.query(`select customer_id from retention_candidates($1)`, [asOf])).then((r) => r.rows.map((x) => x.customer_id));
  expect(await list('2031-06-01T00:00:00Z')).toEqual([b.c2]);                                               // c2 never booked, created long before
  expect((await list('2033-01-01T00:00:00Z')).sort()).toEqual([b.c1, b.c2].sort());
  await expectCode(asRole(b, 'manager', (c) => c.query(`select retention_candidates()`)), 'NOT_AUTHORIZED');
  expect((await asAdmin((c) => c.query(`select 1 from customers where anonymised_at is not null`))).rowCount).toBe(0);
});
