import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { resetTestData, seedBooking, tomorrowAt } from './db';
import { bangkokDay } from '../../src/lib/time';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

const dayOf = (iso: string) => bangkokDay(iso);

test('week view lists a booking under its day', async ({ page }) => {
  const k = await seedBooking({ at: tomorrowAt('15:00'), customerName: 'คุณสัปดาห์' });
  await signIn(page, 'reception@spa.test'); await page.goto(`/th/calendar?span=week&day=${dayOf(k.at)}`);
  await expect(page.getByTestId('week-day')).toHaveCount(7);
  await expect(page.locator(`[data-testid=week-day][data-day="${dayOf(k.at)}"]`).getByTestId('week-card')).toContainText('คุณสัปดาห์');
});

test('month view counts the day and opens it', async ({ page }) => {
  const k = await seedBooking({ at: tomorrowAt('15:00') });
  await signIn(page, 'manager@spa.test'); await page.goto(`/th/calendar?span=month&day=${dayOf(k.at)}`);
  const cell = page.locator(`[data-testid=month-cell][data-day="${dayOf(k.at)}"]`);
  await expect(cell).toContainText('1');
  await expect(cell.getByTestId('month-count')).toContainText('1');
  await cell.click();
  await expect(page).toHaveURL(new RegExp(`span=day.*day=${dayOf(k.at)}|day=${dayOf(k.at)}.*span=day`));
  await expect(page.getByTestId('booking-card')).toHaveCount(1);
});

test('a therapist sees only their own bookings in week and month', async ({ page }) => {
  const mine = await seedBooking({ at: tomorrowAt('11:00'), therapistEmail: 'therapist@spa.test', roomCode: 'R1' });
  await seedBooking({ at: tomorrowAt('11:00'), otherTherapist: true, roomCode: 'R2' });
  await signIn(page, 'therapist@spa.test');
  await page.goto(`/th/calendar?span=week&day=${dayOf(mine.at)}`);
  await expect(page.getByTestId('week-card')).toHaveCount(1);
  await page.goto(`/th/calendar?span=month&day=${dayOf(mine.at)}`);
  await expect(page.locator(`[data-testid=month-cell][data-day="${dayOf(mine.at)}"]`).getByTestId('month-count')).toContainText('1');
});
