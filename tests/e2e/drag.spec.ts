import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers';
import { admin, resetTestData, seedBooking, tomorrowAt } from './db';
import { bangkokDay } from '../../src/lib/time';
import th from '../../messages/th.json';

test.skip(({ isMobile }) => isMobile, 'touch dragging is covered by the move form');

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

const day = () => bangkokDay(tomorrowAt('11:00'));

/** Presses on the card, moves past the drag threshold, then drops it over the centre of the given column. */
async function dragCardToColumn(page: Page, cardIndex: number, columnIndex: number) {
  const card = page.getByTestId('booking-card').nth(cardIndex);
  const col = page.getByTestId('calendar-column').nth(columnIndex);
  const c = (await card.boundingBox())!;
  const k = (await col.boundingBox())!;
  const x = c.x + c.width / 2, y = c.y + 12;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y, { steps: 3 });
  await page.mouse.move(k.x + k.width / 2, y, { steps: 12 });
  await page.mouse.up();
}

test('dragging a card to another therapist moves it after confirmation', async ({ page }) => {
  await seedBooking({ at: tomorrowAt('11:00'), roomCode: 'R1', customerName: 'คุณลาก' });
  await signIn(page, 'manager@spa.test');
  await page.goto(`/th/calendar?day=${day()}&view=therapists`);
  await expect(page.getByTestId('calendar-column').nth(0).getByTestId('booking-card')).toHaveCount(1);
  await dragCardToColumn(page, 0, 1);
  await expect(page.getByTestId('drop-bar')).toBeVisible();
  await page.getByTestId('drop-confirm').click();
  await expect(page.getByTestId('calendar-column').nth(1).getByTestId('booking-card')).toHaveCount(1);
  await expect(page.getByTestId('calendar-column').nth(0).getByTestId('booking-card')).toHaveCount(0);
});

test('undo leaves the booking untouched', async ({ page }) => {
  const k = await seedBooking({ at: tomorrowAt('11:00'), roomCode: 'R1', customerName: 'คุณลาก' });
  await signIn(page, 'manager@spa.test');
  await page.goto(`/th/calendar?day=${day()}&view=therapists`);
  await dragCardToColumn(page, 0, 1);
  await page.getByTestId('drop-undo').click();
  await expect(page.getByTestId('drop-bar')).toHaveCount(0);
  await expect(page.getByTestId('calendar-column').nth(0).getByTestId('booking-card')).toHaveCount(1);
  const { data } = await admin.from('bookings').select('version').eq('id', k.id).single();
  expect(data!.version).toBe(1);
});

test('a refused drop explains why and the card stays', async ({ page }) => {
  await seedBooking({ at: tomorrowAt('11:00'), roomCode: 'R1', customerName: 'คุณลาก' });
  await seedBooking({ at: tomorrowAt('11:00'), roomCode: 'R2', customerName: 'คุณอยู่แล้ว', otherTherapist: true });
  await signIn(page, 'manager@spa.test');
  await page.goto(`/th/calendar?day=${day()}&view=therapists`);
  await dragCardToColumn(page, 0, 1);                              // the first card belongs to the first therapist
  await page.getByTestId('drop-confirm').click();
  await expect(page.getByRole('alert').filter({ hasText: th.errors.THERAPIST_BUSY })).toBeVisible();
  await expect(page.getByTestId('calendar-column').nth(0).getByTestId('booking-card')).toHaveCount(1);
});
