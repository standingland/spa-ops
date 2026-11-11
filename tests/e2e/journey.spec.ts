import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signIn } from './helpers';
import { admin, resetTestData, shiftsAroundNow } from './db';
import { addDays, bangkokDay, formatTime, mondayOf } from '../../src/lib/time';
import th from '../../messages/th.json';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

const today = () => bangkokDay(new Date());
const local = (day: string, hhmm: string) => `${day}T${hhmm}`;
const card = (page: Page, text: string) => page.getByTestId('booking-card').filter({ hasText: text });

async function createStaffMember(page: Page, s: { email: string; password: string; role: string; displayName: string }) {
  await page.goto('/th/admin/staff');
  await page.getByTestId('staff-add').click();
  await page.getByTestId('staff-email').fill(s.email);
  await page.getByTestId('staff-password').fill(s.password);
  await page.getByTestId('staff-role').selectOption(s.role);
  await page.getByTestId('staff-name').fill(s.displayName);
  await page.getByTestId('staff-save').click();
  await expect(page.getByTestId('staff-row').filter({ hasText: s.email })).toBeVisible();
}
async function newCustomer(page: Page, name: string, phone: string) {
  await page.getByTestId('customer-new-name').fill(name);
  await page.getByTestId('customer-new-phone').fill(phone);
  await page.getByTestId('customer-new-save').click();
  await expect(page.getByTestId('customer-selected')).toContainText(name);
}
async function fillBooking(page: Page, o: { therapist: string; position: string; start: string; walkIn?: boolean }) {
  await page.getByTestId('booking-service').selectOption({ index: 0 });
  if (o.walkIn) await page.getByTestId('walk-in').click(); else await page.getByTestId('booking-start').fill(o.start);
  await page.getByTestId('booking-therapist').selectOption({ label: o.therapist });
  await page.getByTestId('booking-position').selectOption({ label: o.position });
  await page.getByTestId('confirm-booking').click();
}

test('one whole day, from setup to the owner\'s report', async ({ page, browser }) => {
  test.setTimeout(240000);
  await shiftsAroundNow();
  const { data: linked } = await admin.from('therapists').select('display_name').not('staff_user_id', 'is', null).limit(1).single();
  const therapistName = linked!.display_name as string;
  const tomorrow = addDays(today(), 1), later = addDays(today(), 2);

  await test.step('1. Owner creates a manager account, adds room R7 in a new zone and a second position', async () => {
    await signIn(page, 'owner@spa.test');
    await createStaffMember(page, { email: 'journey-manager@spa.test', password: 'journey-pass-1', role: 'manager', displayName: 'ผู้จัดการทดสอบ' });
    await page.goto('/th/admin/rooms');
    await page.getByTestId('room-add').click();
    await page.getByTestId('room-code').fill('R7');
    await page.getByTestId('room-name').fill('ห้อง 7');
    await page.getByTestId('room-zone').fill('โซนใหม่');
    await page.getByTestId('room-save').click();
    const row = page.getByTestId('room-row').filter({ hasText: 'R7' });
    await expect(row).toBeVisible();
    await row.locator('summary').click();
    await row.getByTestId('position-label').fill('2');
    await row.getByTestId('position-add').click();
    await expect(row.getByTestId('position')).toHaveCount(2);
  });

  await test.step('2. Manager creates a service limited to one room category and gives a therapist a shift', async () => {
    const m = await (await browser.newContext()).newPage();
    await signIn(m, 'manager@spa.test');
    await m.goto('/th/admin/services');
    await m.getByTestId('service-add').click();
    await m.getByTestId('service-name-th').fill('นวดเฉพาะวีไอพี');
    await m.getByTestId('service-duration').fill('75');
    await m.getByTestId('service-price').fill('1800');
    await m.getByTestId('service-category-option').filter({ hasText: 'วีไอพี' }).getByRole('checkbox').check();
    await m.getByTestId('service-save').click();
    await expect(m.getByTestId('service-row').filter({ hasText: 'นวดเฉพาะวีไอพี' })).toContainText('วีไอพี');
    const day = addDays(today(), 20);
    await m.goto(`/th/admin/therapists?week=${mondayOf(day)}`);
    await m.getByTestId('shift-add').click();
    await m.getByTestId('shift-therapist').selectOption({ index: 0 });
    await m.getByTestId('shift-start').fill(local(day, '12:00'));
    await m.getByTestId('shift-end').fill(local(day, '20:00'));
    await m.getByTestId('shift-save').click();
    await expect(m.getByTestId('therapist-row').first().getByTestId('shift-block').filter({ hasText: '12:00' })).toHaveAttribute('data-day', day);
    await m.context().close();
  });

  const r = await (await browser.newContext()).newPage();
  await test.step('3. Receptionist books a new customer, books a walk-in, and a repeat of the same slot is refused', async () => {
    await signIn(r, 'reception@spa.test');
    await r.goto(`/th/calendar?day=${later}`);
    await r.getByTestId('new-booking').click();
    await newCustomer(r, 'คุณเดินทาง', '0845551234');
    await fillBooking(r, { therapist: therapistName, position: 'R7 · 1', start: local(later, '11:00') });
    await expect(card(r, 'คุณเดินทาง')).toHaveCount(1);
    await r.getByTestId('new-booking').click();
    await r.getByTestId('customer-search').fill('คุณเดินทาง');
    await r.getByTestId('customer-option').first().click();
    await fillBooking(r, { therapist: therapistName, position: 'R7 · 1', start: local(later, '11:00') });
    await expect(r.getByRole('alert').filter({ hasText: new RegExp(`${th.errors.THERAPIST_BUSY}|${th.errors.POSITION_TAKEN}`) })).toBeVisible();
    await r.goto('/th/calendar');
    await r.getByTestId('new-booking').click();
    await r.getByTestId('customer-search').fill('คุณเดินทาง');
    await r.getByTestId('customer-option').first().click();
    await fillBooking(r, { therapist: therapistName, position: 'R7 · 1', start: '', walkIn: true });
    await expect(card(r, 'คุณเดินทาง')).toHaveCount(1);
  });

  await test.step('4. Manager reschedules the first booking to tomorrow; the calendar shows it once; shrinking a shift under it is refused', async () => {
    const m = await (await browser.newContext()).newPage();
    await signIn(m, 'manager@spa.test');
    await m.goto(`/th/calendar?day=${later}`);
    await card(m, 'คุณเดินทาง').click();
    await m.getByTestId('booking-move').click();
    await m.getByTestId('move-start').fill(local(tomorrow, '11:00'));
    await m.getByTestId('move-confirm').click();
    await expect(card(m, 'คุณเดินทาง')).toHaveCount(0);
    await m.goto(`/th/calendar?day=${tomorrow}`);
    await expect(card(m, 'คุณเดินทาง')).toHaveCount(1);
    await m.goto(`/th/admin/therapists?week=${mondayOf(tomorrow)}`);
    const row = m.getByTestId('therapist-row').filter({ hasText: therapistName });
    const block = row.getByTestId('shift-block').and(m.locator(`[data-day="${tomorrow}"]`));
    await block.click();
    await m.getByTestId('shift-start').fill(local(tomorrow, '12:00'));
    await m.getByTestId('shift-save').click();
    await expect(m.getByRole('alert').filter({ hasText: th.errors.CONFLICTS_WITH_BOOKINGS })).toBeVisible();
    await m.context().close();
  });

  await test.step('5. Receptionist checks the walk-in in; the therapist (on a phone) runs the treatment and readies the room; reception sees it without a reload', async () => {
    await r.goto('/th/today');
    await r.getByTestId('arrival-row').filter({ hasText: 'คุณเดินทาง' }).getByTestId('act-checked_in').click();
    const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
    await signIn(phone, 'therapist@spa.test');
    await phone.getByTestId('waiting-row').getByTestId('act-in_treatment').click();
    await phone.getByTestId('treatment-row').getByTestId('act-completed').click();
    await expect(r.getByTestId('cleaning-row').filter({ hasText: 'R7' })).toBeVisible({ timeout: 20000 });
    await phone.getByTestId('cleaning-row').getByTestId('act-ready').click();
    await expect(r.getByTestId('cleaning-row')).toHaveCount(0, { timeout: 20000 });
    await phone.context().close();
  });

  await test.step('6. Receptionist takes part payment in cash and the rest by transfer; manager verifies it and closes the cash day', async () => {
    await r.goto('/th/today');
    const row = () => r.getByTestId('pending-payment-row').filter({ hasText: 'คุณเดินทาง' });
    await row().getByTestId('pay-open').click();
    await r.getByTestId('pay-amount').fill('500');
    await r.getByTestId('pay-submit').click();
    await expect(row().getByTestId('due-amount')).toHaveText('฿300.00');
    await row().getByTestId('pay-open').click();
    await r.getByTestId('pay-method').selectOption({ label: 'โอนเงิน' });
    await r.getByTestId('pay-reference').fill('JOURNEY-1');
    await r.getByTestId('pay-submit').click();
    await expect(r.getByTestId('pending-payment-row')).toHaveCount(0);
    const m = await (await browser.newContext()).newPage();
    await signIn(m, 'manager@spa.test');
    await m.goto('/th/payments');
    await m.locator('[data-testid=ledger-entry][data-state=unverified]').getByTestId('entry-verify').click();
    await m.getByTestId('confirm').click();
    await expect(m.locator('[data-testid=ledger-entry][data-state=unverified]')).toHaveCount(0);
    await m.getByTestId('cash-counted').fill('500');
    await m.getByTestId('cash-close').click();
    await expect(m.getByTestId('cash-difference')).toHaveText('฿0.00');
    await m.context().close();
  });

  const o = await (await browser.newContext()).newPage();
  await test.step('7. Owner reads today\'s report (booked = collected = the walk-in; the moved booking is not today) and exports it', async () => {
    await signIn(o, 'owner@spa.test');
    await o.goto('/th/reports');
    await o.getByTestId('range-preset-today').click();
    await expect(o.getByTestId('kpi-booked')).toHaveText('฿800.00');
    await expect(o.getByTestId('kpi-collected')).toHaveText('฿800.00');
    await expect(o.getByTestId('kpi-bookings')).toHaveText('1');
    const [dl] = await Promise.all([o.waitForEvent('download'), o.getByTestId('export-revenue').click()]);
    expect(readFileSync(await dl.path(), 'utf8').charCodeAt(0)).toBe(0xfeff);
  });

  await test.step('8. Owner cannot deactivate R7 while tomorrow\'s booking is in it; after the booking moves it can; history keeps the room code', async () => {
    await o.goto('/th/admin/rooms');
    const row = o.getByTestId('room-row').filter({ hasText: 'R7' });
    await row.getByTestId('room-deactivate').click();
    await row.getByTestId('room-deactivate-confirm').click();
    await expect(o.getByRole('alert').filter({ hasText: th.errors.CONFLICTS_WITH_BOOKINGS })).toBeVisible();
    await o.goto(`/th/calendar?day=${tomorrow}`);
    await card(o, 'คุณเดินทาง').click();
    await o.getByTestId('booking-move').click();
    await o.getByTestId('move-position').selectOption({ label: 'R1 · 1' });
    await o.getByTestId('move-confirm').click();
    await expect(card(o, 'คุณเดินทาง')).toContainText('R1');
    await o.goto('/th/admin/rooms');
    const row2 = o.getByTestId('room-row').filter({ hasText: 'R7' });
    await row2.getByTestId('room-deactivate').click();
    await row2.getByTestId('room-deactivate-confirm').click();
    await expect(row2).toHaveAttribute('data-active', 'false');
    await o.goto(`/th/calendar?day=${today()}`);
    await expect(card(o, 'คุณเดินทาง')).toContainText('R7');
    expect(formatTime(new Date().toISOString())).toMatch(/^\d\d:\d\d$/);
  });

  await test.step('9. A therapist cannot open customers, payments, reports or settings; reception cannot open reports or settings', async () => {
    const t = await (await browser.newContext()).newPage();
    await signIn(t, 'therapist@spa.test');
    for (const path of ['customers', 'payments', 'reports', 'admin/settings']) {
      await t.goto(`/th/${path}`);
      await expect(t.getByTestId('forbidden')).toBeVisible();
    }
    for (const path of ['reports', 'admin/settings']) {
      await r.goto(`/th/${path}`);
      await expect(r.getByTestId('forbidden')).toBeVisible();
    }
    await t.context().close();
  });
});
