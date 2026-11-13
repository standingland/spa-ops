import { test, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { asAdmin, asRole, asService, resetDb, book, bkk, type Base } from './helpers';

let b: Base;
let day: string;
beforeEach(async () => {
  b = await resetDb();
  day = new Date(Date.now() + 7 * 3600_000 + 3 * 86400_000).toISOString().slice(0, 10);
  await asAdmin(async (c) => {
    await c.query(`update therapists set public=true where id=$1`, [b.t1]);
    await c.query(`update services set bookable_online=true where id=$1`, [b.svc60]);
    await c.query(`insert into app_settings(key, value) values ('online.enabled','true')`);
    await c.query(`insert into therapist_shifts(therapist_id, during) values ($1, tstzrange($2,$3))`, [b.t1, bkk('10:00', day), bkk('22:00', day)]);
  });
});

const guest = (line = 'U-guest-1', name = 'Guest One') => ({ line, name });
const online = (start: string, g = guest(), key: string = randomUUID(), therapist = () => b.t1) =>
  asService((c) => c.query(`select * from public_book($1,$2,$3,$4,$5,$6)`, [g.line, g.name, therapist(), b.svc60, start, key])).then((r) => r.rows[0]);
const code = async (p: Promise<unknown>) => p.then(() => 'OK', (e) => e.message as string);
const times = () => asService((c) => c.query(`select starts_at from public_free_times($1,$2,$3)`, [b.t1, b.svc60, day])).then((r) => r.rows.map((x) => new Date(x.starts_at).getTime()));

test('a guest books: confirmed, source online, linked to a new LINE customer who consented', async () => {
  const r = await online(bkk('12:00', day));
  const row = (await asAdmin((c) => c.query(`select b.status, b.source, c.line_user_id, c.display_name, c.comms_consent, c.phone from bookings b join customers c on c.id=b.customer_id where b.id=$1`, [r.booking_id]))).rows[0];
  expect(row).toEqual({ status: 'confirmed', source: 'online', line_user_id: 'U-guest-1', display_name: 'Guest One', comms_consent: true, phone: null });
});

test('the same idempotency key returns the same booking', async () => {
  const key = randomUUID();
  const a = await online(bkk('12:00', day), guest(), key);
  const c2 = await online(bkk('12:00', day), guest(), key);
  expect(c2.booking_id).toBe(a.booking_id);
  expect((await asAdmin((c) => c.query(`select count(*)::int n from bookings`))).rows[0].n).toBe(1);
});

test('a third upcoming booking is refused TOO_MANY_BOOKINGS; a cancelled one does not count', async () => {
  const a = await online(bkk('10:00', day));
  await online(bkk('12:00', day));
  expect(await code(online(bkk('14:00', day)))).toBe('TOO_MANY_BOOKINGS');
  await asService((c) => c.query(`select public_cancel($1)`, [a.booking_id]));
  expect(await code(online(bkk('14:00', day)))).toBe('OK');
});

test('two guests racing for one slot: exactly one succeeds, the other is told the time is gone', async () => {
  const results = await Promise.all([
    code(online(bkk('12:00', day), guest('U-a', 'A'))),
    code(online(bkk('12:00', day), guest('U-b', 'B'))),
  ]);
  expect(results.filter((x) => x === 'OK')).toHaveLength(1);
  expect(['THERAPIST_BUSY', 'SLOT_TAKEN']).toContain(results.find((x) => x !== 'OK'));
  expect((await asAdmin((c) => c.query(`select count(*)::int n from bookings`))).rows[0].n).toBe(1);
});

test('booking is refused when online is off, the service is not bookable, or the therapist is not public', async () => {
  const cases: string[] = [
    `update app_settings set value='false' where key='online.enabled'`,
    `update services set bookable_online=false`,
    `update therapists set public=false`,
  ];
  for (const sql of cases) {
    await asAdmin((c) => c.query(sql));
    expect(await code(online(bkk('12:00', day))), sql).toBe('ONLINE_CLOSED');
    await asAdmin((c) => c.query(`update app_settings set value='true' where key='online.enabled'; update services set bookable_online=true; update therapists set public=true`));
  }
});

test('outside the lead time or the horizon is refused OUT_OF_WINDOW', async () => {
  await asAdmin((c) => c.query(`insert into therapist_shifts(therapist_id, during) values ($1, tstzrange(now() - interval '1 hour', now() + interval '3 hours'))`, [b.t1]));
  expect(await code(online(new Date(Date.now() + 60 * 60_000).toISOString()))).toBe('OUT_OF_WINDOW');
  expect(await code(online(bkk('12:00', new Date(Date.now() + 7 * 3600_000 + 40 * 86400_000).toISOString().slice(0, 10))))).toBe('OUT_OF_WINDOW');
});

test('a guest never attaches to an existing customer, even with the same name', async () => {
  await asAdmin((c) => c.query(`update customers set display_name='Guest One', full_name='Guest One' where id=$1`, [b.c1]));
  const r = await online(bkk('12:00', day));
  const row = (await asAdmin((c) => c.query(`select customer_id from bookings where id=$1`, [r.booking_id]))).rows[0];
  expect([b.c1, b.c2]).not.toContain(row.customer_id);
  expect((await asAdmin((c) => c.query(`select count(*)::int n from customers`))).rows[0].n).toBe(3);
});

test('a returning guest reuses their own LINE customer record', async () => {
  const a = await online(bkk('10:00', day));
  const b2 = await online(bkk('12:00', day));
  const rows = (await asAdmin((c) => c.query(`select distinct customer_id from bookings where id = any($1)`, [[a.booking_id, b2.booking_id]]))).rows;
  expect(rows).toHaveLength(1);
});

test('cancel works before the cutoff, frees the slot, and records the guest as the actor', async () => {
  const r = await online(bkk('12:00', day));
  expect(await times()).not.toContain(new Date(bkk('12:00', day)).getTime());
  await asService((c) => c.query(`select public_cancel($1)`, [r.booking_id]));
  expect(await times()).toContain(new Date(bkk('12:00', day)).getTime());
  const ev = (await asAdmin((c) => c.query(`select kind, via, after->>'status' s from booking_events where booking_id=$1 order by id desc limit 1`, [r.booking_id]))).rows[0];
  expect(ev).toEqual({ kind: 'status_changed', via: 'guest_online', s: 'cancelled' });
});

test('cancel after the cutoff, twice, or on a staff booking is refused', async () => {
  await asAdmin((c) => c.query(`insert into therapist_shifts(therapist_id, during) values ($1, tstzrange(now() - interval '1 hour', now() + interval '6 hours'))`, [b.t1]));
  const soon = new Date(Math.ceil((Date.now() + 3 * 3600_000) / 1800_000) * 1800_000).toISOString();     // ~3h ahead, inside the 4h cutoff, outside the 2h lead
  const near = await online(soon);
  expect(await code(asService((c) => c.query(`select public_cancel($1)`, [near.booking_id])))).toBe('CANCEL_TOO_LATE');

  const far = await online(bkk('12:00', day));
  expect(await code(asService((c) => c.query(`select public_cancel($1)`, [far.booking_id])))).toBe('OK');
  expect(await code(asService((c) => c.query(`select public_cancel($1)`, [far.booking_id])))).toBe('INVALID_TRANSITION');

  const staff = await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('16:00', day) }));
  expect(await code(asService((c) => c.query(`select public_cancel($1)`, [staff.id])))).toBe('NOT_AUTHORIZED');
});

test('booking queues one confirmed message and cancelling queues one cancelled message for a LINE-only guest', async () => {
  const r = await online(bkk('12:00', day));
  await asService((c) => c.query(`select public_cancel($1)`, [r.booking_id]));
  const rows = (await asAdmin((c) => c.query(`select template from notification_outbox where booking_id=$1 order by created_at, template`, [r.booking_id]))).rows.map((x) => x.template);
  expect(rows.sort()).toEqual(['booking_cancelled', 'booking_confirmed']);
});

test('public_booking_view shows only the minimum, and only for online bookings', async () => {
  const r = await online(bkk('12:00', day));
  const v = (await asService((c) => c.query(`select * from public_booking_view($1)`, [r.booking_id]))).rows[0];
  expect(Object.keys(v).sort()).toEqual(['ends_at', 'service_name_en', 'service_name_th', 'starts_at', 'status', 'therapist_name']);
  const staff = await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('16:00', day) }));
  expect((await asService((c) => c.query(`select * from public_booking_view($1)`, [staff.id]))).rowCount).toBe(0);
});

test('public booking functions are not executable by anon or authenticated', async () => {
  const id = '00000000-0000-0000-0000-000000000000';
  const calls = [
    `select * from public_book('u','n','${id}','${id}', now(), 'k')`,
    `select public_cancel('${id}')`,
    `select * from public_booking_view('${id}')`,
  ];
  for (const a of ['anon', 'owner'] as const)
    for (const q of calls)
      await expect(asRole(b, a, (c) => c.query(q)), `${a}: ${q}`).rejects.toMatchObject({ message: expect.stringContaining('permission denied') });
});

test('staff create_booking still works and still needs a staff role', async () => {
  const row = await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('16:00', day) }));
  expect(row.status).toBe('confirmed');
  await expect(asRole(b, 'customer', (c) => book(c, b, { start: bkk('18:00', day) }))).rejects.toMatchObject({ message: 'NOT_AUTHORIZED' });
});

test('a booking key belonging to another guest is refused, and returns nothing of theirs', async () => {
  const key = randomUUID();
  await online(bkk('12:00', day), guest('U-a', 'A'), key);
  expect(await code(online(bkk('14:00', day), guest('U-b', 'B'), key))).toBe('INVALID_INPUT');
  expect((await asAdmin((c) => c.query(`select count(*)::int n from bookings`))).rows[0].n).toBe(1);
});

test('a key whose booking was cancelled is not handed back as a success', async () => {
  const key = randomUUID();
  const r = await online(bkk('12:00', day), guest(), key);
  await asService((c) => c.query(`select public_cancel($1)`, [r.booking_id]));
  expect(await code(online(bkk('12:00', day), guest(), key))).toBe('INVALID_INPUT');
});

test('two simultaneous submissions with the same key (two tabs) give one booking and the same answer to both', async () => {
  const key = randomUUID();
  const [x, y] = await Promise.all([online(bkk('12:00', day), guest(), key), online(bkk('12:00', day), guest(), key)]);
  expect(x.booking_id).toBe(y.booking_id);
  expect((await asAdmin((c) => c.query(`select count(*)::int n from bookings`))).rows[0].n).toBe(1);
});

test('only starts on the 30-minute grid can be booked', async () => {
  expect(await code(online(bkk('12:07', day)))).toBe('OUT_OF_WINDOW');
  expect(await code(online(new Date(new Date(bkk('12:00', day)).getTime() + 30_000).toISOString()))).toBe('OUT_OF_WINDOW');   // 12:00:30
  expect(await code(online(bkk('12:30', day)))).toBe('OK');
});

test('a guest who cancels inside the free-cancellation window pays the same fee a staff cancel would charge', async () => {
  await asAdmin((c) => c.query(`insert into app_settings(key, value) values ('policy.cancel_free_min','600'), ('policy.cancel_fee_percent','50')`));
  await asAdmin((c) => c.query(`insert into therapist_shifts(therapist_id, during) values ($1, tstzrange(now() - interval '1 hour', now() + interval '9 hours'))`, [b.t1]));
  const start = new Date(Math.ceil((Date.now() + 5 * 3600_000) / 1800_000) * 1800_000).toISOString();   // 5h ahead: outside the 4h cutoff, inside the 10h window
  const r = await online(start);
  await asService((c) => c.query(`select public_cancel($1)`, [r.booking_id]));
  const row = (await asAdmin((c) => c.query(`select status, fee_satang, price_satang from bookings where id=$1`, [r.booking_id]))).rows[0];
  expect(row.status).toBe('cancelled');
  expect(row.fee_satang).toBe(row.price_satang / 2);
});

test('a guest who cancels well ahead of the free window pays nothing', async () => {
  await asAdmin((c) => c.query(`insert into app_settings(key, value) values ('policy.cancel_fee_percent','50')`));
  const r = await online(bkk('12:00', day));
  await asService((c) => c.query(`select public_cancel($1)`, [r.booking_id]));
  expect((await asAdmin((c) => c.query(`select fee_satang from bookings where id=$1`, [r.booking_id]))).rows[0].fee_satang).toBe(0);
});
