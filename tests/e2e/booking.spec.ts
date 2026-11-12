import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers';
import { resetTestData, seedBooking, tomorrowAt } from './db';
import { bangkokDay, formatTime } from '../../src/lib/time';
import th from '../../messages/th.json';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

const dayOf = (iso: string) => bangkokDay(iso);
const localInput = (iso: string) => `${bangkokDay(iso)}T${formatTime(iso)}`;

async function openNewBooking(page: Page) { await page.getByTestId('new-booking').click(); }
async function createCustomerInline(page: Page, c: { displayName: string; phone: string }) {
  await page.getByTestId('customer-new-name').fill(c.displayName);
  await page.getByTestId('customer-new-phone').fill(c.phone);
  await page.getByTestId('customer-new-save').click();
  await expect(page.getByTestId('customer-selected')).toContainText(c.displayName);
}
async function pickExistingCustomer(page: Page, term: string) {
  await page.getByTestId('customer-search').fill(term);
  await page.getByTestId('customer-option').first().click();
  await expect(page.getByTestId('customer-selected')).toContainText(term);
}
async function pickService(page: Page, index: number) { await page.getByTestId('booking-service').selectOption({ index }); }
async function pickStart(page: Page, iso: string) { await page.getByTestId('booking-start').fill(localInput(iso)); }
async function bookManually(page: Page, o: { therapist: string; room: string; at: string }) {
  await page.goto(`/th/calendar?day=${dayOf(o.at)}`);
  await openNewBooking(page);
  await pickExistingCustomer(page, 'E2E');
  await pickService(page, 0);
  await pickStart(page, o.at);
  await page.getByTestId('booking-therapist').selectOption({ label: o.therapist });
  await page.getByTestId('booking-position').selectOption({ label: `${o.room} · 1` });
  await page.getByTestId('confirm-booking').click();
}
const cardFor = (page: Page, text: string) => page.getByTestId('booking-card').filter({ hasText: text });
const alertWith = (page: Page, text: string) => page.getByRole('alert').filter({ hasText: text });

test('a receptionist books a new customer with a suggested therapist and room', async ({ page }) => {
  await signIn(page, 'reception@spa.test');
  await page.goto('/th/calendar');
  await openNewBooking(page);
  await createCustomerInline(page, { displayName: 'คุณบี', phone: '0820000000' });
  await pickService(page, 0);
  await pickStart(page, tomorrowAt('14:00'));
  await expect(page.getByTestId('suggestion')).not.toHaveCount(0);
  await page.getByTestId('suggestion').first().click();
  await page.getByTestId('confirm-booking').click();
  await expect(cardFor(page, 'คุณบี')).toBeVisible();
});

test('a taken slot is refused with a clear message', async ({ page }) => {
  const k = await seedBooking({ at: tomorrowAt('14:00') });
  await signIn(page, 'reception@spa.test');
  await bookManually(page, { therapist: k.therapistName, room: 'R2', at: tomorrowAt('14:30') });
  await expect(alertWith(page, th.errors.THERAPIST_BUSY)).toBeVisible();
});

test('double-clicking confirm creates one booking', async ({ page }) => {
  await seedBooking({ at: tomorrowAt('10:30') }); // makes the customer E2E Customer exist
  await signIn(page, 'reception@spa.test');
  await page.goto(`/th/calendar?day=${dayOf(tomorrowAt('16:00'))}`);
  await openNewBooking(page);
  await pickExistingCustomer(page, 'E2E');
  await pickService(page, 0);
  await pickStart(page, tomorrowAt('16:00'));
  await expect(page.getByTestId('suggestion')).not.toHaveCount(0);
  await page.getByTestId('suggestion').first().click();
  await page.getByTestId('confirm-booking').dblclick();
  await expect(cardFor(page, '16:00')).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(cardFor(page, '16:00')).toHaveCount(1);
});

test('a manager moves a booking; a refused move leaves it in place', async ({ page }) => {
  const a = await seedBooking({ at: tomorrowAt('11:00'), roomCode: 'R1', customerName: 'คุณเอ' });
  await seedBooking({ at: tomorrowAt('15:00'), roomCode: 'R2', customerName: 'คุณซี' });
  await signIn(page, 'manager@spa.test');
  await page.goto(`/th/calendar?day=${dayOf(a.at)}`);
  const move = async (to: string) => {
    await cardFor(page, 'คุณเอ').click();
    await page.getByTestId('booking-move').click();
    await page.getByTestId('move-start').fill(localInput(to));
    await page.getByTestId('move-confirm').click();
  };
  await move(tomorrowAt('15:30')); // same therapist is busy with the other booking
  await expect(alertWith(page, th.errors.THERAPIST_BUSY)).toBeVisible();
  await expect(cardFor(page, 'คุณเอ')).toContainText('11:00');
  await page.getByTestId('panel-close').click();
  await move(tomorrowAt('13:00'));
  await expect(cardFor(page, 'คุณเอ')).toContainText('13:00');
});

test('cancelling asks for confirmation and frees the slot', async ({ page }) => {
  const a = await seedBooking({ at: tomorrowAt('11:00'), roomCode: 'R1', customerName: 'คุณเอ' });
  await signIn(page, 'manager@spa.test');
  await page.goto(`/th/calendar?day=${dayOf(a.at)}`);
  await cardFor(page, 'คุณเอ').click();
  await page.getByTestId('booking-cancel').click();
  await page.getByTestId('cancel-confirm').click();
  await expect(cardFor(page, 'คุณเอ')).toHaveAttribute('data-status', 'cancelled');
  await seedBooking({ at: tomorrowAt('11:00'), roomCode: 'R1', customerName: 'คุณบี' }); // throws if the slot were still taken
});

test('a therapist sees only their own bookings and no create button', async ({ page }) => {
  const mine = await seedBooking({ therapistEmail: 'therapist@spa.test', roomCode: 'R1' });
  await seedBooking({ otherTherapist: true, roomCode: 'R2' });
  await signIn(page, 'therapist@spa.test');
  await page.goto(`/th/calendar?day=${dayOf(mine.at)}`);
  await expect(page.getByTestId('booking-card')).toHaveCount(1);
  await expect(page.getByTestId('new-booking')).toHaveCount(0);
});

test('a newly added room becomes a calendar column', async ({ page }) => {
  await signIn(page, 'owner@spa.test');
  await page.goto('/th/admin/rooms');
  await page.getByTestId('room-add').click();
  await page.getByTestId('room-code').fill('R7');
  await page.getByTestId('room-name').fill('ห้อง 7');
  await page.getByTestId('room-save').click();
  await expect(page.getByTestId('room-row')).toHaveCount(7);
  await page.goto('/th/calendar?view=rooms');
  await expect(page.getByTestId('calendar-column')).toHaveCount(7);
});

test.describe('booking details panel', () => {
  const NOTE = 'บันทึกลับ-SECRET-7731';

  test('a desk role sees the panel with the booking history', async ({ page }) => {
    const a = await seedBooking({ at: tomorrowAt('11:00'), customerName: 'คุณประวัติ' });
    await signIn(page, 'reception@spa.test');
    await page.goto(`/th/calendar?day=${dayOf(a.at)}`);
    await cardFor(page, 'คุณประวัติ').click();
    await expect(page.getByTestId('booking-panel')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('คุณประวัติ');
    await expect(page.getByTestId('booking-history')).toBeVisible();
    await expect(page.getByTestId('booking-history').locator('[data-kind=created]')).toHaveCount(1);
  });

  test('Escape closes the panel and returns focus to the booking card', async ({ page }) => {
    const a = await seedBooking({ at: tomorrowAt('11:00'), customerName: 'คุณหลบ' });
    await signIn(page, 'manager@spa.test');
    await page.goto(`/th/calendar?day=${dayOf(a.at)}`);
    const card = cardFor(page, 'คุณหลบ');
    await card.click();
    await expect(page.getByTestId('booking-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('booking-panel')).toHaveCount(0);
    await expect(card).toBeFocused();
  });

  test('a therapist opening their own booking sees no history', async ({ page }) => {
    const mine = await seedBooking({ therapistEmail: 'therapist@spa.test', roomCode: 'R1', note: NOTE });
    await signIn(page, 'therapist@spa.test');
    await page.goto(`/th/calendar?day=${dayOf(mine.at)}`);
    await page.getByTestId('booking-card').click();
    await expect(page.getByTestId('booking-panel')).toBeVisible();
    await expect(page.getByTestId('treatment-note')).toContainText(NOTE); // the panel has finished loading its data
    await expect(page.getByTestId('booking-history')).toHaveCount(0);
  });

  test('the history never shows the booking note', async ({ page }) => {
    const a = await seedBooking({ at: tomorrowAt('11:00'), customerName: 'คุณโน้ต', note: NOTE });
    await signIn(page, 'manager@spa.test');
    await page.goto(`/th/calendar?day=${dayOf(a.at)}`);
    await cardFor(page, 'คุณโน้ต').click();
    await page.getByTestId('status-checked_in').click(); // adds a status_changed event whose snapshots carry the note
    await expect(cardFor(page, 'คุณโน้ต')).toHaveAttribute('data-status', 'checked_in');
    await cardFor(page, 'คุณโน้ต').click();
    await expect(page.getByTestId('booking-history').locator('li')).toHaveCount(2);
    await expect(page.getByTestId('booking-history')).not.toContainText(NOTE);
    await expect(page.getByTestId('booking-history')).not.toContainText('SECRET');
  });
});
