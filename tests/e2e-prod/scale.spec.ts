import { test, expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { signIn } from '../e2e/helpers';

const dayOf = (offset: number) => new Date(Date.now() + 7 * 3600000 + offset * 86400000).toISOString().slice(0, 10);

async function timed(page: Page, url: string, ready: Locator, budgetMs: number) {
  const t0 = Date.now();
  await page.goto(url);
  await expect(ready).toBeVisible({ timeout: budgetMs });
  return Date.now() - t0;
}

test('today, rooms, calendar, customers and reports open within budget at full size', async ({ page }) => {
  await signIn(page, 'owner@spa.test');
  const got = {
    today: await timed(page, '/th/today', page.getByTestId('count-available'), 3000),
    rooms: await timed(page, '/th/rooms', page.getByTestId('room-tile').nth(39), 3000),
    calendarRooms: await timed(page, '/th/calendar?view=rooms', page.getByTestId('calendar-column').nth(39), 4000),
    week: await timed(page, '/th/calendar?span=week', page.getByTestId('week-day').nth(6), 4000),
    customers: await timed(page, '/th/customers', page.getByTestId('customer-row').nth(49), 3000),
    reports: await timed(page, `/th/reports?from=${dayOf(-364)}&to=${dayOf(0)}&grain=month`, page.getByTestId('kpi-booked'), 8000),
  };
  mkdirSync('.testdb', { recursive: true });
  writeFileSync('.testdb/scale-results.json', JSON.stringify({ date: new Date().toISOString(), budgetsMs: { today: 3000, rooms: 3000, calendarRooms: 4000, week: 4000, customers: 3000, reports: 8000 }, measuredMs: got }, null, 2));
});

test('forty rooms stay usable: filter responds, columns scroll, the time axis stays in view', async ({ page }) => {
  await signIn(page, 'manager@spa.test');
  await page.goto('/th/rooms');
  await expect(page.getByTestId('room-tile').nth(39)).toBeVisible();
  const t0 = Date.now();
  await page.getByTestId('room-search').fill('R-01');
  await expect(page.getByTestId('room-tile')).toHaveCount(1);
  expect(Date.now() - t0).toBeLessThan(500);
  await page.goto('/th/calendar?view=rooms');
  await expect(page.getByTestId('calendar-column').nth(39)).toBeAttached();
  await page.getByTestId('calendar-scroll').evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await expect(page.getByTestId('calendar-column').nth(39)).toBeInViewport();
  await expect(page.getByTestId('time-axis')).toBeInViewport();
});

test('the phone layout shows today at full size without horizontal page scroll', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page, 'reception@spa.test');
  await expect(page.getByTestId('count-available')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await context.close();
});
