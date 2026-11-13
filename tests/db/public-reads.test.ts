import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, asService, resetDb, book, bkk, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

/** A Bangkok calendar day n days from today, as YYYY-MM-DD, plus a helper for times on it. */
const bangkokDay = (plusDays: number) => new Date(Date.now() + 7 * 3600_000 + plusDays * 86400_000).toISOString().slice(0, 10);
const at = (hhmm: string, day: string) => bkk(hhmm, day);

/** Therapist t1 public, service bookable online, online.enabled on, and a 10:00-22:00 shift on the given day. */
async function openUp(day: string, over: { therapist?: boolean; service?: boolean; enabled?: boolean } = {}) {
  await asAdmin(async (c) => {
    await c.query(`update therapists set public=$2, bio_en='Bio', specialties='{Thai}' where id=$1`, [b.t1, over.therapist ?? true]);
    await c.query(`update services set bookable_online=$2 where id=$1`, [b.svc60, over.service ?? true]);
    await c.query(`insert into app_settings(key, value) values ('online.enabled', $1::jsonb) on conflict (key) do update set value=excluded.value`, [String(over.enabled ?? true)]);
    await c.query(`insert into therapist_shifts(therapist_id, during) values ($1, tstzrange($2,$3))`, [b.t1, at('10:00', day), at('22:00', day)]);
  });
}
const freeTimes = (day: string) => asService((c) => c.query(`select starts_at from public_free_times($1,$2,$3) order by 1`, [b.t1, b.svc60, day]))
  .then((r) => r.rows.map((x) => new Date(x.starts_at).toISOString()));

test('available_candidates still needs a staff role and still returns candidates for one', async () => {
  await expect(asRole(b, 'therapist', (c) => c.query(`select * from available_candidates($1,$2)`, [b.svc60, bkk('10:00')]))).rejects.toMatchObject({ message: 'NOT_AUTHORIZED' });
  const r = await asRole(b, 'receptionist', (c) => c.query(`select * from available_candidates($1,$2)`, [b.svc60, bkk('10:00')]));
  expect(r.rowCount).toBeGreaterThan(0);
});

test('public_therapists lists only public, active therapists and exactly the documented columns', async () => {
  await openUp(bangkokDay(3));
  const r = await asService((c) => c.query(`select * from public_therapists()`));
  expect(r.rows).toHaveLength(1);
  expect(Object.keys(r.rows[0]).sort()).toEqual(['bio_en', 'bio_th', 'display_name', 'has_photo', 'id', 'specialties']);
  expect(r.rows[0]).toMatchObject({ id: b.t1, display_name: 'T1', bio_en: 'Bio', specialties: ['Thai'], has_photo: false });
  await asAdmin((c) => c.query(`update therapists set active=false where id=$1`, [b.t1]));
  expect((await asService((c) => c.query(`select * from public_therapists()`))).rowCount).toBe(0);
});

test('public_therapist_services hides services that are not bookable online or not offered, and non-public therapists', async () => {
  await openUp(bangkokDay(3));
  const list = () => asService((c) => c.query(`select * from public_therapist_services($1)`, [b.t1]));
  const r = await list();
  expect(r.rows).toHaveLength(1);
  expect(Object.keys(r.rows[0]).sort()).toEqual(['duration_min', 'name_en', 'name_th', 'price_satang', 'service_id']);
  await asAdmin((c) => c.query(`update services set bookable_online=false`));
  expect((await list()).rowCount).toBe(0);
  await asAdmin((c) => c.query(`update services set bookable_online=true; update therapists set public=false`));
  expect((await list()).rowCount).toBe(0);
});

test('public_free_times offers 30-minute starts inside the shift and excludes busy, time-off and blocked-room starts', async () => {
  const day = bangkokDay(3);
  await openUp(day);
  const all = await freeTimes(day);
  expect(all[0]).toBe(new Date(at('10:00', day)).toISOString());
  expect(all).toContain(new Date(at('20:30', day)).toISOString());   // a 60-minute service must finish by 22:00
  expect(all).not.toContain(new Date(at('21:30', day)).toISOString());
  // a booking 12:00-13:00 for this therapist removes 11:30 (overlap), 12:00 and 12:30
  await asRole(b, 'receptionist', (c) => book(c, b, { start: at('12:00', day) }));
  const afterBooking = await freeTimes(day);
  for (const t of ['11:30', '12:00', '12:30']) expect(afterBooking).not.toContain(new Date(at(t, day)).toISOString());
  expect(afterBooking).toContain(new Date(at('13:00', day)).toISOString());
  // time off 15:00-16:00
  await asAdmin((c) => c.query(`insert into therapist_time_off(therapist_id, during, kind) values ($1, tstzrange($2,$3), 'break')`, [b.t1, at('15:00', day), at('16:00', day)]));
  expect(await freeTimes(day)).not.toContain(new Date(at('15:00', day)).toISOString());
  // every room blocked 17:00-19:00
  await asAdmin((c) => c.query(`insert into room_blocks(room_id, during, kind) select id, tstzrange($1,$2), 'maintenance' from rooms`, [at('17:00', day), at('19:00', day)]));
  expect(await freeTimes(day)).not.toContain(new Date(at('18:00', day)).toISOString());
});

test('public_free_times respects the lead time and the booking horizon', async () => {
  const far = bangkokDay(40);
  await openUp(far);
  expect(await freeTimes(far)).toEqual([]);                                   // beyond online.max_ahead_days (30)
  const today = bangkokDay(0);
  await asAdmin((c) => c.query(`insert into therapist_shifts(therapist_id, during) values ($1, tstzrange(now() - interval '1 hour', now() + interval '12 hours'))`, [b.t1]));
  const min = Date.now() + 120 * 60_000;
  for (const t of await freeTimes(today)) expect(new Date(t).getTime()).toBeGreaterThanOrEqual(min - 1);
});

test('public_free_times is empty when online.enabled is false, the therapist is not public or the service is not bookable online', async () => {
  const day = bangkokDay(3);
  await openUp(day);
  expect((await freeTimes(day)).length).toBeGreaterThan(0);
  const cases: [string, string][] = [
    ['online.enabled false', `update app_settings set value='false' where key='online.enabled'`],
    ['therapist not public', `update therapists set public=false`],
    ['service not bookable online', `update services set bookable_online=false`],
  ];
  for (const [name, undo] of cases) {
    await asAdmin((c) => c.query(undo));
    expect(await freeTimes(day), name).toEqual([]);
    await asAdmin((c) => c.query(`update app_settings set value='true' where key='online.enabled'; update therapists set public=true; update services set bookable_online=true`));
  }
});

test('public_therapist_photo_path is null until online booking is on and the therapist is public, and again once switched off', async () => {
  await asAdmin((c) => c.query(`update therapists set photo_path='x.jpg' where id=$1`, [b.t1]));
  const path = () => asService((c) => c.query(`select public_therapist_photo_path($1) p`, [b.t1])).then((r) => r.rows[0].p);
  expect(await path()).toBeNull();
  await asAdmin((c) => c.query(`update therapists set public=true where id=$1`, [b.t1]));
  expect(await path()).toBeNull();                       // online booking is still off, so nothing is public yet
  await asAdmin((c) => c.query(`insert into app_settings(key, value) values ('online.enabled','true')`));
  expect(await path()).toBe('x.jpg');
  await asAdmin((c) => c.query(`update therapists set public=false where id=$1`, [b.t1]));
  expect(await path()).toBeNull();
});

test('anon and authenticated cannot execute any public_ function', async () => {
  const calls = [
    `select * from public_therapists()`,
    `select * from public_therapist_services('${'00000000-0000-0000-0000-000000000000'}')`,
    `select * from public_free_times('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000', current_date)`,
    `select public_therapist_photo_path('00000000-0000-0000-0000-000000000000')`,
  ];
  for (const a of ['anon', 'owner'] as const)
    for (const q of calls)
      await expect(asRole(b, a, (c) => c.query(q)), `${a}: ${q}`).rejects.toMatchObject({ message: expect.stringContaining('permission denied') });
});
