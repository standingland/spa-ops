import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, expectCode, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

test('new therapists are not public and new services are not bookable online', async () => {
  const t = await asAdmin((c) => c.query(`select public, bio_th, bio_en, specialties from therapists where id=$1`, [b.t1]));
  expect(t.rows[0]).toEqual({ public: false, bio_th: null, bio_en: null, specialties: [] });
  const s = await asAdmin((c) => c.query(`select bookable_online from services where id=$1`, [b.svc60]));
  expect(s.rows[0].bookable_online).toBe(false);
});

test('online settings have the stated defaults', async () => {
  const s = (await asRole(b, 'owner', (c) => c.query(`select get_settings() s`))).rows[0].s;
  expect([s['online.enabled'], s['online.max_upcoming'], s['online.min_lead_min'], s['online.max_ahead_days'], s['online.cancel_cutoff_min']])
    .toEqual([false, 2, 120, 30, 240]);
});

test('only the owner can change online settings, and only valid values', async () => {
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select set_setting('online.enabled', 'true')`)), 'NOT_AUTHORIZED');
  await expectCode(asRole(b, 'owner', (c) => c.query(`select set_setting('online.max_upcoming', '0')`)), 'INVALID_SETTING');
  await expectCode(asRole(b, 'owner', (c) => c.query(`select set_setting('online.enabled', '1')`)), 'INVALID_SETTING');
  const s = (await asRole(b, 'owner', (c) => c.query(`select set_setting('online.enabled', 'true') s`))).rows[0].s;
  expect(s['online.enabled']).toBe(true);
});

test('owner and manager can set therapists.public and services.bookable_online; receptionist cannot', async () => {
  for (const r of ['owner', 'manager'] as const) {
    const t = await asRole(b, r, (c) => c.query(`update therapists set public=true where id=$1 returning id`, [b.t1]));
    expect(t.rowCount, r).toBe(1);
    const s = await asRole(b, r, (c) => c.query(`update services set bookable_online=true where id=$1 returning id`, [b.svc60]));
    expect(s.rowCount, r).toBe(1);
  }
  const t = await asRole(b, 'receptionist', (c) => c.query(`update therapists set public=true where id=$1 returning id`, [b.t2]));
  expect(t.rowCount).toBe(0);
});
