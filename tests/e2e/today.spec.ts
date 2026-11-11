import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { resetTestData, seedBooking, seedBookingNow, setStatusAsReception } from './db';
import th from '../../messages/th.json';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

test('a walk-in goes from arrival to a ready room on one screen', async ({ page }) => {
  await seedBookingNow({ roomCode: 'R1', customerName: 'คุณเดิน' });
  await signIn(page, 'reception@spa.test');
  await expect(page).toHaveURL(/\/th\/today/);
  const arrival = page.getByTestId('arrival-row').filter({ hasText: 'คุณเดิน' });
  await arrival.getByTestId('act-checked_in').click();
  await page.getByTestId('waiting-row').filter({ hasText: 'คุณเดิน' }).getByTestId('act-in_treatment').click();
  await expect(page.getByTestId('count-occupied')).toHaveText('1');
  await page.getByTestId('treatment-row').filter({ hasText: 'คุณเดิน' }).getByTestId('act-completed').click();
  const cleaning = page.getByTestId('cleaning-row').filter({ hasText: 'R1' });
  await expect(cleaning).toBeVisible();
  await cleaning.getByTestId('act-ready').click();
  await expect(page.getByTestId('cleaning-row')).toHaveCount(0);
  await expect(page.getByTestId('count-available')).toHaveText('6');
});

test('a therapist runs their own treatment from a phone and cannot cancel', async ({ page }) => {
  const k = await seedBookingNow({ therapistEmail: 'therapist@spa.test' });
  await setStatusAsReception(k.id, 'checked_in');
  await signIn(page, 'therapist@spa.test');
  const mine = page.getByTestId('waiting-row');
  await expect(mine).toHaveCount(1);
  await expect(page.getByTestId('act-cancelled')).toHaveCount(0);
  await mine.getByTestId('act-in_treatment').click();
  await page.getByTestId('treatment-row').getByTestId('act-completed').click();
  await page.getByTestId('cleaning-row').getByTestId('act-ready').click();
  await expect(page.getByTestId('cleaning-row')).toHaveCount(0);
});

test('two desks, one booking: the second tap is told the screen was out of date', async ({ page, browser }) => {
  await seedBookingNow({ customerName: 'คุณซ้ำ' });
  const p2 = await (await browser.newContext()).newPage();
  await p2.addInitScript(() => { (window as unknown as { __pauseLive?: boolean }).__pauseLive = true; }); // keep this desk stale on purpose
  await signIn(page, 'reception@spa.test'); await signIn(p2, 'manager@spa.test');
  await page.getByTestId('act-checked_in').click();
  await expect(page.getByTestId('waiting-row')).toHaveCount(1);
  await p2.getByTestId('arrival-row').getByTestId('act-checked_in').click();
  await expect(p2.getByRole('alert').filter({ hasText: th.errors.STALE_VERSION })).toBeVisible();
});

test('starting in a room that is still being cleaned is refused in plain words', async ({ page }) => {
  const a = await seedBookingNow({ roomCode: 'R1', customerName: 'คุณแรก' });
  const z = await seedBooking({ roomCode: 'R1', customerName: 'คุณสอง', at: new Date(Date.now() + 105 * 60000).toISOString() });
  await setStatusAsReception(a.id, 'completed');                              // R1 is now being cleaned
  await setStatusAsReception(z.id, 'checked_in');
  await signIn(page, 'reception@spa.test');
  const row = page.getByTestId('waiting-row').filter({ hasText: 'คุณสอง' });
  await row.getByTestId('act-in_treatment').click();
  await expect(page.getByRole('alert').filter({ hasText: th.errors.ROOM_NOT_READY })).toBeVisible();
  await expect(page.getByTestId('waiting-row').filter({ hasText: 'คุณสอง' })).toHaveCount(1);
});

test('shared-screen mode hides customer names and survives a reload', async ({ page }) => {
  await seedBookingNow({ customerName: 'คุณลับ' });
  await signIn(page, 'reception@spa.test');
  await page.getByTestId('shared-toggle').click();
  await expect(page.getByText('คุณลับ')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('arrival-row')).toHaveCount(1);
  await expect(page.getByText('คุณลับ')).toHaveCount(0);
});
