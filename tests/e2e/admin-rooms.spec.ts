import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers';
import { resetTestData, seedBooking, admin } from './db';
import th from '../../messages/th.json';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

async function addRoom(page: Page, r: { code: string; displayName: string }) {
  await page.getByTestId('room-add').click();
  await page.getByTestId('room-code').fill(r.code);
  await page.getByTestId('room-name').fill(r.displayName);
  await page.getByTestId('room-save').click();
}
async function deactivate(page: Page, code: string) {
  const row = page.getByTestId('room-row').filter({ hasText: code });
  await row.getByTestId('room-deactivate').click();
  await row.getByTestId('room-deactivate-confirm').click();
}

test('an owner adds a seventh room and it is listed without a deploy', async ({ page }) => {
  await signIn(page, 'owner@spa.test');
  await page.goto('/th/admin/rooms');
  await expect(page.getByTestId('room-row')).toHaveCount(6);
  await addRoom(page, { code: 'R7', displayName: 'ห้อง 7' });
  await expect(page.getByTestId('room-row')).toHaveCount(7);
});
test('deactivating a room with a future booking shows the reason and changes nothing', async ({ page }) => {
  await seedBooking({ roomCode: 'R1' });
  await signIn(page, 'manager@spa.test');
  await page.goto('/th/admin/rooms');
  await deactivate(page, 'R1');
  await expect(page.getByRole('alert').filter({ hasText: th.errors.CONFLICTS_WITH_BOOKINGS })).toBeVisible();
  await expect(page.getByTestId('room-row').filter({ hasText: 'R1' })).toHaveAttribute('data-active', 'true');
});
test('a manager creates a service limited to one room category', async ({ page }) => {
  await signIn(page, 'manager@spa.test');
  await page.goto('/th/admin/services');
  await page.getByTestId('service-add').click();
  await page.getByTestId('service-name-th').fill('นวดพิเศษ');
  await page.getByTestId('service-duration').fill('75');
  await page.getByTestId('service-price').fill('1800');
  await page.getByTestId('service-category-option').filter({ hasText: 'วีไอพี' }).getByRole('checkbox').check();
  await page.getByTestId('service-save').click();
  await expect(page.getByTestId('service-row').filter({ hasText: 'นวดพิเศษ' })).toBeVisible();
  await page.reload();
  const row = page.getByTestId('service-row').filter({ hasText: 'นวดพิเศษ' });
  await expect(row).toContainText('วีไอพี');
  const { data } = await admin.from('services').select('price_satang,duration_min').eq('name_th', 'นวดพิเศษ').single();
  expect(data).toEqual({ price_satang: 180000, duration_min: 75 });
});
