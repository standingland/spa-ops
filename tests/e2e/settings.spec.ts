import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { resetTestData, seedBookingNow } from './db';
import th from '../../messages/th.json';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

test('the owner shortens the arrival window and Today follows', async ({ page }) => {
  await seedBookingNow({ inMinutes: 30, customerName: 'คุณรอบ' });
  await signIn(page, 'owner@spa.test');
  await expect(page.getByTestId('arrival-row').filter({ hasText: 'คุณรอบ' })).toBeVisible();
  await page.goto('/th/admin/settings');
  await page.getByTestId('setting-ops.arrival_window_min').fill('5');
  await page.getByTestId('setting-ops.arrival_window_min').blur();
  await expect(page.getByTestId('setting-saved')).toBeVisible();
  await page.goto('/th/today');
  await expect(page.getByTestId('arrival-row')).toHaveCount(0);
});
test('an out-of-range value is refused and the old value stays', async ({ page }) => {
  await signIn(page, 'owner@spa.test'); await page.goto('/th/admin/settings');
  await page.getByTestId('setting-policy.cancel_fee_percent').fill('150');
  await page.getByTestId('setting-policy.cancel_fee_percent').blur();
  await expect(page.getByRole('alert').filter({ hasText: th.errors.INVALID_SETTING })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('setting-policy.cancel_fee_percent')).toHaveValue('0');
});
test('a manager cannot open settings', async ({ page }) => {
  await signIn(page, 'manager@spa.test'); await page.goto('/th/admin/settings');
  await expect(page.getByTestId('forbidden')).toBeVisible();
});
