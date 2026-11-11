import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { addRooms, admin, resetTestData, seedBookingNow, setStatusAsReception } from './db';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

test('forty more rooms stay searchable, filterable and grouped', async ({ page }) => {
  await addRooms(40, { zones: ['A', 'B', 'C', 'D'] });               // service client; codes X01..X40
  await signIn(page, 'manager@spa.test'); await page.goto('/th/rooms');
  await expect(page.getByTestId('room-tile')).toHaveCount(46);
  expect(await page.getByTestId('zone-heading').count()).toBeGreaterThanOrEqual(4);
  await page.getByTestId('room-search').fill('X1');
  await expect(page.getByTestId('room-tile')).toHaveCount(10);        // X10..X19
  await page.getByTestId('room-search').fill('');
  await page.getByTestId('compact-toggle').click();
  await expect(page.getByTestId('room-tile')).toHaveCount(46);
});

test('a tile follows the room through occupied, cleaning and ready', async ({ page }) => {
  const k = await seedBookingNow({ roomCode: 'R1' });
  await signIn(page, 'manager@spa.test'); await page.goto('/th/rooms');
  const tile = page.locator('[data-testid=room-tile][data-code="R1"]');
  await expect(tile).toHaveAttribute('data-status', 'reserved');
  await setStatusAsReception(k.id, 'in_treatment');
  await page.reload();
  await expect(tile).toHaveAttribute('data-status', 'occupied');
  await setStatusAsReception(k.id, 'completed');
  await page.reload();
  await expect(tile).toHaveAttribute('data-status', 'cleaning');
  await page.getByTestId('room-status-filter').selectOption('cleaning');
  await expect(page.getByTestId('room-tile')).toHaveCount(1);
  await tile.getByTestId('act-ready').click();
  await page.getByTestId('room-status-filter').selectOption('');
  await expect(tile).toHaveAttribute('data-status', 'available');
});

test('a therapist reports an issue from a tile and does not see room notes', async ({ page }) => {
  await admin.from('rooms').update({ notes: 'NOTE-SECRET' }).eq('code', 'R2');
  await signIn(page, 'therapist@spa.test'); await page.goto('/th/rooms');
  await expect(page.getByText('NOTE-SECRET')).toHaveCount(0);
  const tile = page.locator('[data-testid=room-tile][data-code="R2"]');
  await tile.getByTestId('report-open').click();
  await page.getByTestId('report-note').fill('ไฟเสีย');
  await page.getByTestId('report-send').click();
  await expect(tile.getByTestId('open-reports')).toContainText('1');
  await admin.from('rooms').update({ notes: null }).eq('code', 'R2');
});
