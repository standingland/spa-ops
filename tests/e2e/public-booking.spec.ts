import { test, expect } from '@playwright/test';
import { admin, resetTestData } from './db';
import { addDays, bangkokDay } from '../../src/lib/time';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

const NIL = '00000000-0000-0000-0000-000000000000';

/** Opens online booking for the first therapist and the first service they offer, with a shift tomorrow. */
async function openUp() {
  const { data: th } = await admin.from('therapists').select('id, display_name, therapist_services(service_id)').order('sort_order');
  const t = th!.find((x) => x.therapist_services.length)!;
  const serviceId = t.therapist_services[0].service_id;
  await admin.from('therapists').update({ public: true, bio_en: 'Ten years of Thai massage', specialties: ['Thai', 'Aroma'] }).eq('id', t.id);
  await admin.from('services').update({ bookable_online: true }).eq('id', serviceId);
  await admin.from('app_settings').upsert({ key: 'online.enabled', value: true });
  const day = addDays(bangkokDay(new Date()), 2);
  await admin.from('therapist_shifts').insert({ therapist_id: t.id, during: `[${day}T10:00:00+07:00,${day}T22:00:00+07:00)` });
  return { therapistId: t.id as string, name: t.display_name as string, serviceId: serviceId as string, day };
}

test('/book says it is not open until the owner turns online booking on', async ({ page }) => {
  await page.goto('/en/book');
  await expect(page.getByTestId('book-closed')).toBeVisible();
});

test('a guest sees only public therapists, books through the stubbed LINE login, and can cancel from the confirmation', async ({ page }) => {
  const s = await openUp();
  await page.goto('/en/book');
  await expect(page.getByTestId('therapist-card')).toHaveCount(1);
  await page.getByTestId('therapist-card').click();
  await expect(page).toHaveURL(/\/en\/book$/);
  await expect(page.getByTestId('therapist-profile')).toContainText('Ten years of Thai massage');

  await page.getByTestId('service-option').first().check();
  await page.getByTestId('book-day').fill(s.day);
  await page.getByTestId('time-option').first().click();
  await page.getByTestId('book-line').click();                  // stub LINE sends the browser straight back, signed in
  await expect(page.getByTestId('booking-as')).toContainText('E2E Guest');
  await expect(page).toHaveURL(/\/en\/book\?/);
  await expect(page.getByTestId('time-option').first()).toHaveAttribute('aria-pressed', 'true');   // the choices survived the round trip
  await page.getByTestId('book-confirm').click();

  await expect(page.getByTestId('booking-summary')).toBeVisible();
  await expect(page).toHaveURL(/\/en\/book\?token=/);
  const { data: b } = await admin.from('bookings').select('source, status').eq('source', 'online');
  expect(b).toEqual([{ source: 'online', status: 'confirmed' }]);

  await page.getByTestId('cancel-link').click();
  await page.getByTestId('cancel-confirm').click();
  await expect(page.getByTestId('cancel-done')).toBeVisible();
  const { data: after } = await admin.from('bookings').select('status').neq('id', NIL);
  expect(after).toEqual([{ status: 'cancelled' }]);
});

test('a slot taken by someone else shows the taken message and keeps the choices', async ({ page }) => {
  const s = await openUp();
  await page.goto(`/en/book/${s.therapistId}`);
  await page.getByTestId('service-option').first().check();
  await page.getByTestId('book-day').fill(s.day);
  await page.getByTestId('time-option').first().click();
  await page.getByTestId('book-line').click();
  await expect(page.getByTestId('booking-as')).toBeVisible();
  // another guest books the same slot first
  await admin.rpc('public_book', { p_line_user_id: 'U-other', p_line_name: 'Other', p_therapist_id: s.therapistId, p_service_id: s.serviceId, p_start: `${s.day}T10:00:00+07:00`, p_idempotency_key: crypto.randomUUID() });
  await page.getByTestId('book-confirm').click();
  await expect(page.getByTestId('book-error')).toContainText('just taken');
  await expect(page.getByTestId('service-option').first()).toBeChecked();
});

test('a therapist switched off after the page loaded gives a friendly message and no booking', async ({ page }) => {
  const s = await openUp();
  await page.goto(`/en/book/${s.therapistId}`);
  await page.getByTestId('service-option').first().check();
  await page.getByTestId('book-day').fill(s.day);
  await page.getByTestId('time-option').first().click();
  await page.getByTestId('book-line').click();
  await expect(page.getByTestId('booking-as')).toBeVisible();
  await admin.from('therapists').update({ public: false }).eq('id', s.therapistId);
  await page.getByTestId('book-confirm').click();
  await expect(page.getByTestId('book-error')).toBeVisible();
  const { data } = await admin.from('bookings').select('id').eq('source', 'online');
  expect(data).toEqual([]);
});

test('the public pages fit a phone: no horizontal scroll', async ({ page }) => {
  await openUp();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/en/book');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
