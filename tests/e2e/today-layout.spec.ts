import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { resetTestData, seedBookingNow, setStatusAsReception } from './db';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

const LONG_THAI = 'สมชายนามสกุลยาวมากเป็นพิเศษสำหรับทดสอบการตัดบรรทัดบนจอโทรศัพท์'.slice(0, 60);

test('(a) the room panel has one row per room, and the counts add up to the same number', async ({ page }) => {
  await seedBookingNow({ roomCode: 'R1', customerName: 'คุณห้อง' });
  await signIn(page, 'reception@spa.test');
  const keys = ['available', 'reserved', 'occupied', 'cleaning', 'out_of_service'];
  let total = 0;
  for (const k of keys) total += Number(await page.getByTestId(`count-${k}`).innerText());
  expect(total).toBeGreaterThan(0);
  await expect(page.getByTestId('room-status-row')).toHaveCount(total);
});

test('(b) the shared screen removes the guest from every room row and arrival row', async ({ page }) => {
  const k = await seedBookingNow({ roomCode: 'R1', customerName: 'คุณลับห้อง' });
  await signIn(page, 'reception@spa.test');
  // Occupied room: the room row shows the guest until the shared screen is turned on.
  await setStatusAsReception(k.id, 'in_treatment');
  await page.reload();
  await expect(page.getByTestId('room-status-row').filter({ hasText: 'คุณลับห้อง' })).toHaveCount(1);
  await page.getByTestId('shared-toggle').click();
  await expect(page.getByTestId('shared-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('room-status-row').filter({ hasText: 'คุณลับห้อง' })).toHaveCount(0);
  await expect(page.locator('[data-testid=arrival-row]').filter({ hasText: 'คุณลับห้อง' })).toHaveCount(0);
  await expect(page.getByText('คุณลับห้อง')).toHaveCount(0);
});

test('(c) a 60-character Thai name does not scroll the page sideways on a phone', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile', 'phone project only');
  await seedBookingNow({ roomCode: 'R1', customerName: LONG_THAI });
  await signIn(page, 'reception@spa.test');
  await expect(page.getByTestId('arrival-row').filter({ hasText: LONG_THAI })).toHaveCount(1);
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});

test('(d) every arrival is listed once', async ({ page }) => {
  await seedBookingNow({ roomCode: 'R1', customerName: 'คุณหนึ่ง' });
  await seedBookingNow({ roomCode: 'R2', customerName: 'คุณสอง', inMinutes: 5 });
  await signIn(page, 'reception@spa.test');
  await expect(page.getByTestId('arrival-row')).toHaveCount(2);
  await expect(page.getByTestId('arrival-row').filter({ hasText: 'คุณหนึ่ง' })).toHaveCount(1);
  await expect(page.getByTestId('arrival-row').filter({ hasText: 'คุณสอง' })).toHaveCount(1);
});
