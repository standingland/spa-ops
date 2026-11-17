import { beforeEach, expect, test } from 'vitest';
import { asAdmin, asRole, asService, resetDb, book, bkk, runTo, today, pay, randomUUID, expectCode, type Base } from './helpers';

let b: Base; let day: string;
beforeEach(async () => {
  b = await resetDb(); day = new Date(Date.now() + 7 * 3600000 + 3 * 86400000).toISOString().slice(0, 10);
  await asAdmin(async (c) => {
    await c.query(`update therapists set public=true where id=$1`, [b.t1]);
    await c.query(`update services set bookable_online=true where id=$1`, [b.svc60]);
    await c.query(`insert into app_settings(key,value) values ('online.enabled','true'),('care.waitlist_enabled','true'),('care.reminders_enabled','true')`);
    await c.query(`insert into therapist_shifts(therapist_id,during) values($1,tstzrange($2,$3))`, [b.t1, bkk('10:00', day), bkk('22:00', day)]);
  });
});
const join = (line = 'U-wait', from = '12:00', to = from) => asService(async (c) => (await c.query(`select public_join_waitlist($1,'Guest',$2,$3,$4,$5,true) id`, [line, b.t1, b.svc60, bkk(from, day), bkk(to, day)])).rows[0].id as string);
const processCare = () => asService(async (c) => (await c.query(`select process_guest_care() r`)).rows[0].r);
const mine = (line = 'U-wait') => asService(async (c) => (await c.query(`select public_my_appointments($1) r`, [line])).rows[0].r);
const state = (id: string) => asAdmin(async (c) => (await c.query(`select * from waitlist_entries where id=$1`, [id])).rows[0]);
const accept = (id: string, line = 'U-wait') => asService(async (c) => (await c.query(`select * from public_accept_waitlist($1,'Guest',$2)`, [line, id])).rows[0]);
const online = (line: string, at = '12:00') => asService((c) => c.query(`select * from public_book($1,'Guest',$2,$3,$4,$5)`, [line, b.t1, b.svc60, bkk(at, day), randomUUID()]));

test('FIFO offers hold resources, expire to the next guest, and can be accepted only once', async () => {
  const a = await join('U-a'); const z = await join('U-b');
  expect((await processCare()).offers).toBe(1);
  expect((await state(a)).status).toBe('offered'); expect((await state(z)).status).toBe('waiting');
  await expectCode(online('U-other'), 'SLOT_TAKEN');
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('12:00', day) })), 'SLOT_HELD');
  await asAdmin((c) => c.query(`update waitlist_entries set offer_expires_at=now()-interval '1 minute' where id=$1`, [a]));
  expect((await processCare()).offers).toBe(1);
  expect((await state(a)).status).toBe('expired'); expect((await state(z)).status).toBe('offered');
  await expectCode(accept(a, 'U-a'), 'OFFER_EXPIRED');
  const [first, retry] = await Promise.all([accept(z, 'U-b'), accept(z, 'U-b')]);
  expect(first.booking_id).toBe(retry.booking_id); expect((await state(z)).booking_id).toBe(first.booking_id);
  expect((await mine('U-b')).upcoming).toHaveLength(1);
});

test('offers do not bypass shift changes and cancellation releases a hold', async () => {
  const a = await join(); await processCare();
  await asAdmin((c) => c.query(`delete from therapist_shifts where therapist_id=$1 and during @> $2::timestamptz`, [b.t1, bkk('12:00', day)]));
  await expectCode(accept(a), 'SLOT_TAKEN');
  expect((await state(a)).status).toBe('offered'); // failed acceptance rolls back
  await asService((c) => c.query(`select public_cancel_waitlist('U-wait',$1)`, [a]));
  expect((await state(a)).status).toBe('cancelled');
});

test('waitlist duplicate submissions are idempotent; invalid ranges and other guests are refused', async () => {
  const [a, z] = await Promise.all([join(), join()]); expect(a).toBe(z);
  await expectCode(accept(a, 'U-stranger'), 'NOT_AUTHORIZED');
  await expectCode(asService((c) => c.query(`select public_cancel_waitlist('U-stranger',$1)`, [a])), 'NOT_AUTHORIZED');
  await expectCode(join('U-wait', '13:00', '12:00'), 'OUT_OF_WINDOW');
  await expectCode(join('U-wait', '12:15', '13:00'), 'OUT_OF_WINDOW');
  for (const h of ['13:00', '14:00', '15:00', '16:00']) await join('U-wait', h);
  await expectCode(join('U-wait', '17:00'), 'WAITLIST_LIMIT');
  expect((await mine('U-stranger')).waitlist).toEqual([]);
});

test('competing dispatchers cannot create duplicate holds or notifications', async () => {
  await join('U-a'); await join('U-b'); await Promise.all([processCare(), processCare()]);
  const r = await asAdmin((c) => c.query(`select count(*)::int n from waitlist_entries where status='offered'`)); expect(r.rows[0].n).toBe(1);
  const n = await asAdmin((c) => c.query(`select count(*)::int n from notification_outbox where template='waitlist_offer'`)); expect(n.rows[0].n).toBe(1);
});

test('rejoining an expired request goes to the end of the queue and receives a fresh notification', async () => {
  const id = await join(); await processCare();
  await asAdmin((c) => c.query(`update waitlist_entries set offer_expires_at=now()-interval '1 minute' where id=$1`, [id]));
  await processCare(); expect(await join()).toBe(id); await processCare();
  const msgs = await asAdmin((c) => c.query(`select id from notification_outbox where template='waitlist_offer' order by created_at`));
  expect(msgs.rows).toHaveLength(2);
  const claimed = await asService((c) => c.query(`select * from claim_notifications(100)`));
  expect(claimed.rows.filter((r) => r.template === 'waitlist_offer').map((r) => r.id)).toEqual([msgs.rows[1].id]);
});

test('desk staff cannot attach or insert another customer under an arbitrary LINE identity', async () => {
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`update customers set line_user_id='U-forged' where id=$1`, [b.c1])), 'NOT_AUTHORIZED');
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`insert into customers(display_name,line_user_id) values('Forged','U-forged')`)), 'NOT_AUTHORIZED');
});

test('my appointments shows only the LINE owner, including staff bookings, and works while new bookings are closed', async () => {
  await online('U-a'); await online('U-b', '14:00');
  await asAdmin((c) => c.query(`update customers set line_user_id='U-staff' where id=$1`, [b.c1]));
  await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('16:00', day) }));
  await asAdmin((c) => c.query(`update app_settings set value='false' where key='online.enabled'`));
  expect((await mine('U-a')).upcoming).toHaveLength(1); expect((await mine('U-b')).upcoming).toHaveLength(1);
  expect((await mine('U-staff')).upcoming[0].source).toBe('advance');
  const a = (await mine('U-a')).upcoming[0]; expect(a).not.toHaveProperty('customer_id'); expect(a).not.toHaveProperty('note');
  expect((await mine('unknown')).upcoming).toEqual([]);
});

async function reminderBooking(minutes = 120) {
  const k = await online('U-reminder'); const id = k.rows[0].booking_id;
  // Move the scheduler clock relative to a real booking through the configured lead time; the booked slot remains valid.
  await asAdmin((c) => c.query(`update bookings set service_during=tstzrange(now()+make_interval(mins=>$2),now()+make_interval(mins=>$2+60)),room_during=tstzrange(now()+make_interval(mins=>$2),now()+make_interval(mins=>$2+70)) where id=$1`, [id, minutes]));
  return id as string;
}
test('reminders deduplicate across dispatches; a scheduler delay does not send both reminders together', async () => {
  await reminderBooking(119); await processCare(); await processCare();
  const r = await asAdmin((c) => c.query(`select payload from notification_outbox where template='booking_reminder'`));
  expect(r.rows).toHaveLength(1); expect(r.rows[0].payload.lead_min).toBe(120);
});
test.each(['cancel', 'reschedule', 'consent', 'started', 'disabled'])('queued reminders are discarded after %s', async (change) => {
  const id = await reminderBooking(119); await processCare();
  await asAdmin(async (c) => {
    if (change === 'cancel') await c.query(`update bookings set status='cancelled' where id=$1`, [id]);
    if (change === 'reschedule') await c.query(`update bookings set service_during=tstzrange(lower(service_during)+interval '1 day',upper(service_during)+interval '1 day'),room_during=tstzrange(lower(room_during)+interval '1 day',upper(room_during)+interval '1 day') where id=$1`, [id]);
    if (change === 'started') await c.query(`update bookings set status='in_treatment' where id=$1`, [id]);
    if (change === 'consent') await c.query(`update customers set comms_consent=false where line_user_id='U-reminder'`);
    if (change === 'disabled') await c.query(`update app_settings set value='false' where key='care.reminders_enabled'`);
  });
  const claimed = await asService((c) => c.query(`select * from claim_notifications(100)`));
  expect(claimed.rows.filter((r) => r.template === 'booking_reminder')).toEqual([]);
});
test('expired waitlist offers are not sent even before the next scheduling pass', async () => {
  const id = await join(); await processCare();
  await asAdmin((c) => c.query(`update waitlist_entries set offer_expires_at=now()-interval '1 minute' where id=$1`, [id]));
  const claimed = await asService((c) => c.query(`select * from claim_notifications(100)`)); expect(claimed.rows.filter((r) => r.template === 'waitlist_offer')).toEqual([]);
});

test('preferences are limited to desk staff and the assigned therapist, exported and erased on anonymisation', async () => {
  await asRole(b, 'receptionist', (c) => c.query(`select save_customer_preferences($1,'firm','Unscented','Quiet','Warm room')`, [b.c1]));
  const a = await asRole(b, 'receptionist', (c) => book(c, b));
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, customer: b.c2, position: b.pos[1] }));
  const own = await asRole(b, 'therapist', (c) => c.query(`select booking_preferences($1) p`, [a.id])); expect(own.rows[0].p.pressure).toBe('firm');
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select booking_preferences($1)`, [z.id])), 'NOT_AUTHORIZED');
  expect((await asRole(b, 'therapist', (c) => c.query(`select * from customer_preferences`))).rows).toEqual([]);
  const exported = await asRole(b, 'manager', (c) => c.query(`select export_customer($1) e`, [b.c1])); expect(exported.rows[0].e.preferences.oil).toBe('Unscented');
  await asRole(b, 'manager', (c) => c.query(`select set_booking_status($1,'cancelled',$2)`, [a.id, a.version]));
  await asRole(b, 'owner', (c) => c.query(`select anonymise_customer($1,'customer request')`, [b.c1]));
  expect((await asAdmin((c) => c.query(`select * from customer_preferences where customer_id=$1`, [b.c1]))).rows).toEqual([]);
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select save_customer_preferences($1,'firm','','','')`, [b.c1])), 'NOT_AUTHORIZED');
});

async function completeCommission() {
  await asRole(b, 'manager', (c) => c.query(`select save_commission_rule($1,null,'percent',2000,0)`, [b.svc60]));
  const k = await asRole(b, 'receptionist', (c) => book(c, b)); await runTo(b, k.id, 'completed'); return k;
}
const settlement = async () => { const d = await today(); return asRole(b, 'manager', async (c) => (await c.query(`select commission_settlement_report($1,$1) r`, [d])).rows[0].r); };
const close = async (revision: string, key = randomUUID()) => { const d = await today(); return asRole(b, 'manager', async (c) => (await c.query(`select close_commission_period($1,$1,$2,$3) id`, [d, revision, key])).rows[0].id as string); };
test('approval and payout are idempotent; post-payment refund becomes a negative adjustment without rewriting history', async () => {
  const k = await completeCommission(); const p = await pay(b, 'manager', k.id, 150000);
  const report = await settlement(); expect(report.total_satang).toBe(30000);
  const key = randomUUID(); const [a, z] = await Promise.all([close(report.revision, key), close(report.revision, key)]); expect(a).toBe(z);
  const payout = () => asRole(b, 'manager', async (c) => (await c.query(`select record_commission_payout($1,$2,'transfer 123') id`, [a, b.t1])).rows[0].id);
  const [pa, pz] = await Promise.all([payout(), payout()]); expect(pa).toBe(pz);
  expect((await settlement()).count).toBe(0);
  await asRole(b, 'manager', (c) => c.query(`select record_refund($1,75000,$2,'partial return')`, [p.id, randomUUID()]));
  const adjusted = await settlement(); expect(adjusted.total_satang).toBe(-15000);
  expect(adjusted.batches[0].therapists[0]).toMatchObject({ amount_satang: 30000, reference: 'transfer 123' });
  await close(adjusted.revision); expect((await settlement()).count).toBe(0);
});
test('approval refuses stale previews and overlapping periods cannot pay the same commission twice', async () => {
  const k = await completeCommission(); const first = await settlement();
  const version = (await asAdmin((c) => c.query(`select version from bookings where id=$1`, [k.id]))).rows[0].version;
  await asRole(b, 'manager', (c) => c.query(`select adjust_booking_charge($1,30000,null,'discount',$2)`, [k.id, version]));
  await expectCode(close(first.revision), 'STALE_VERSION');
  const next = await settlement(); const results = await Promise.allSettled([close(next.revision), close(next.revision)]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1); expect((await settlement()).count).toBe(0);
});
test('a payout records its actual date and a separate record timestamp; future payment dates are refused', async () => {
  await completeCommission(); const r = await settlement(); const batch = await close(r.revision);
  await expectCode(asRole(b, 'manager', (c) => c.query(`select record_commission_payout($1,$2,'future',now()+interval '1 day')`, [batch, b.t1])), 'INVALID_INPUT');
  await asRole(b, 'manager', (c) => c.query(`select record_commission_payout($1,$2,'paid yesterday',now()-interval '1 day')`, [batch, b.t1]));
  const p = (await asAdmin((c) => c.query(`select recorded_at-paid_at delta from commission_payouts where batch_id=$1`, [batch]))).rows[0];
  expect(p.delta.days).toBe(1);
});
test('customer-facing and scheduler APIs are inaccessible to authenticated and anonymous roles; settlement is management-only', async () => {
  for (const role of ['anon', 'receptionist', 'therapist', 'customer'] as const) {
    await expect(asRole(b, role, (c) => c.query(`select public_my_appointments('U-wait')`))).rejects.toMatchObject({ code: '42501' });
    await expect(asRole(b, role, (c) => c.query(`select process_guest_care()`))).rejects.toMatchObject({ code: '42501' });
    const read = asRole(b, role, (c) => c.query(`select commission_settlement_report(current_date,current_date)`));
    if (role === 'anon') await expect(read).rejects.toMatchObject({ code: '42501' });
    else await expectCode(read, 'NOT_AUTHORIZED');
  }
});
