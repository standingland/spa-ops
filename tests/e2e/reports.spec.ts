import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signIn } from './helpers';
import { addRooms, admin, payViaApi, resetTestData, seedBookingNow, setStatusAsReception, voidViaApi, SEED_SERVICE_NAMES } from './db';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

/** Two completed bookings today: ฿1,500 paid in full and ฿1,500 paid ฿500. Returns the ids of the second booking's payment. */
async function seedDay() {
  const a = await seedBookingNow({ customerName: 'ก' }); await setStatusAsReception(a.id, 'completed'); await payViaApi(a.id, 150000, 'cash');
  const z = await seedBookingNow({ roomCode: 'R2', otherTherapist: true, customerName: 'ข' }); await setStatusAsReception(z.id, 'completed');
  const small = await payViaApi(z.id, 50000, 'cash');
  return { a, z, small };
}
async function openToday(page: Page) {
  await page.goto('/th/reports');
  await page.getByTestId('range-preset-today').click();
  await expect(page.getByTestId('range-label')).toContainText(new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10));
}

test('daily revenue reflects what was actually recorded', async ({ page }) => {
  const { small } = await seedDay();
  await signIn(page, 'owner@spa.test'); await openToday(page);
  await expect(page.getByTestId('kpi-booked')).toHaveText('฿3,000.00');
  await expect(page.getByTestId('kpi-collected')).toHaveText('฿2,000.00');
  await expect(page.getByTestId('kpi-bookings')).toHaveText('2');
  await voidViaApi(small.id);
  await page.reload();
  await expect(page.getByTestId('kpi-collected')).toHaveText('฿1,500.00');
  await expect(page.getByTestId('metric-help').first()).not.toBeEmpty();
});
test('the revenue export is a spreadsheet-safe CSV with the same numbers', async ({ page }) => {
  await seedDay();
  await signIn(page, 'owner@spa.test'); await openToday(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-revenue').click()]);
  const text = readFileSync(await dl.path(), 'utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  const lines = text.slice(1).trimEnd().split('\r\n');
  expect(lines[0]).toContain('รายได้ตามการจอง');
  expect(lines).toHaveLength(2);
  const cells = lines[1].split(',');
  expect([cells[1], cells[2]]).toEqual(['3000.00', '2000.00']);
});
test('a service named like a formula cannot execute in the export', async ({ page }) => {
  const k = await seedBookingNow({ customerName: 'ค' }); await setStatusAsReception(k.id, 'completed');
  await admin.from('services').update({ name_th: '=1+1' }).eq('name_th', SEED_SERVICE_NAMES[0]);
  try {
    await signIn(page, 'owner@spa.test'); await openToday(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-services').click()]);
    const text = readFileSync(await dl.path(), 'utf8');
    expect(text).toContain("'=1+1");
    expect(text).not.toMatch(/\r\n=1\+1/);
  } finally {
    await admin.from('services').update({ name_th: SEED_SERVICE_NAMES[0] }).eq('name_th', '=1+1');
  }
});
test('room utilisation regroups by zone and by category from configuration', async ({ page }) => {
  await addRooms(4, { zones: ['ZoneA', 'ZoneB'] });
  await signIn(page, 'owner@spa.test'); await openToday(page);
  await expect(page.locator('[data-testid=room-group][data-group=ZoneA]')).toBeVisible();
  await expect(page.locator('[data-testid=room-group][data-group=ZoneB]')).toBeVisible();
  await page.getByTestId('group-by').selectOption('category');
  await expect(page.locator('[data-testid=room-group][data-group=ZoneA]')).toHaveCount(0);
  await expect(page.getByTestId('room-group-title').first()).not.toBeEmpty();
});
test('managers lose reports when the owner switches them off; reception never has them', async ({ page, browser, request }) => {
  await signIn(page, 'manager@spa.test'); await page.goto('/th/reports');
  await expect(page.getByTestId('kpi-booked')).toBeVisible();
  await admin.from('app_settings').upsert({ key: 'reports.manager_can_view', value: false });
  await page.goto('/th/reports');
  await expect(page.getByTestId('forbidden')).toBeVisible();
  const res = await page.request.get('/api/reports/revenue/csv?from=2030-01-01&to=2030-01-31');
  expect(res.status()).toBe(403);
  expect((await request.get('/api/reports/revenue/csv?from=2030-01-01&to=2030-01-31')).status()).toBe(403);
  expect((await page.request.get('/api/reports/nope/csv?from=2030-01-01&to=2030-01-31')).status()).toBe(404);
  const p2 = await (await browser.newContext()).newPage();
  await signIn(p2, 'reception@spa.test'); await p2.goto('/th/reports');
  await expect(p2.getByTestId('forbidden')).toBeVisible();
});
