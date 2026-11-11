import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { resetTestData, seedBookingNow, setStatusAsReception } from './db';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

test('a booking made at one desk appears on another without a reload', async ({ page }) => {
  await signIn(page, 'manager@spa.test');
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-state', 'live');
  await seedBookingNow({ customerName: 'คุณสด' });
  await expect(page.getByTestId('arrival-row').filter({ hasText: 'คุณสด' })).toBeVisible({ timeout: 5000 });
});

test('room tiles follow a status change made elsewhere', async ({ page }) => {
  const k = await seedBookingNow({ roomCode: 'R1' });
  await signIn(page, 'manager@spa.test'); await page.goto('/th/rooms');
  const tile = page.locator('[data-testid=room-tile][data-code="R1"]');
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-state', 'live');
  await setStatusAsReception(k.id, 'in_treatment');
  await expect(tile).toHaveAttribute('data-status', 'occupied', { timeout: 5000 });
});

test('offline is shown, and the screen catches up when the connection returns', async ({ page, context }) => {
  await signIn(page, 'manager@spa.test');
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-state', 'live');
  await context.setOffline(true);
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-state', 'offline');
  await seedBookingNow({ customerName: 'คุณกลับ' });
  await context.setOffline(false);
  await expect(page.getByTestId('arrival-row').filter({ hasText: 'คุณกลับ' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-state', 'live');
});
