import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers';
import { resetTestData, seedBooking, tomorrowAt } from './db';
import { addDays, bangkokDay, mondayOf } from '../../src/lib/time';
import th from '../../messages/th.json';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

async function createStaffMember(page: Page, s: { email: string; password: string; role: string; displayName: string }) {
  await page.goto('/th/admin/staff');
  await page.getByTestId('staff-add').click();
  await page.getByTestId('staff-email').fill(s.email);
  await page.getByTestId('staff-password').fill(s.password);
  await page.getByTestId('staff-role').selectOption(s.role);
  await page.getByTestId('staff-name').fill(s.displayName);
  await page.getByTestId('staff-save').click();
  await expect(page.getByTestId('staff-row').filter({ hasText: s.email })).toBeVisible();
}

test('an owner creates a receptionist who can then sign in', async ({ page, browser }) => {
  await signIn(page, 'owner@spa.test');
  await createStaffMember(page, { email: 'new@spa.test', password: 'local-dev-only', role: 'receptionist', displayName: 'ใหม่' });
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('http://localhost:3100/th/login');
  await p2.getByTestId('login-email').fill('new@spa.test');
  await p2.getByTestId('login-password').fill('local-dev-only');
  await p2.getByTestId('login-submit').click();
  await expect(p2).toHaveURL(/\/th\/staff$/);
  await ctx.close();
});

test('a manager cannot open staff accounts', async ({ page }) => {
  await signIn(page, 'manager@spa.test');
  await page.goto('/th/admin/staff');
  await expect(page.getByTestId('forbidden')).toBeVisible();
});

test('a manager adds a shift and it appears on the week grid', async ({ page }) => {
  // the seed already covers the next 14 days, so use a day beyond it
  const day = addDays(bangkokDay(new Date()), 20);
  await signIn(page, 'manager@spa.test');
  await page.goto(`/th/admin/therapists?week=${mondayOf(day)}`);
  const row = page.getByTestId('therapist-row').first();
  await expect(row).toBeVisible();
  await page.getByTestId('shift-add').click();
  await page.getByTestId('shift-therapist').selectOption({ index: 0 });
  await page.getByTestId('shift-start').fill(`${day}T12:00`);
  await page.getByTestId('shift-end').fill(`${day}T20:00`);
  await page.getByTestId('shift-save').click();
  const block = row.getByTestId('shift-block').filter({ hasText: '12:00' });
  await expect(block).toHaveAttribute('data-day', day);
  await expect(block).toContainText('20:00');
});

test('shrinking a shift under a booking shows CONFLICTS_WITH_BOOKINGS', async ({ page }) => {
  await seedBooking({ at: tomorrowAt('11:00') });
  const day = addDays(bangkokDay(new Date()), 1);
  await signIn(page, 'manager@spa.test');
  await page.goto(`/th/admin/therapists?week=${mondayOf(day)}`);
  const block = page.getByTestId('therapist-row').first().getByTestId('shift-block').and(page.locator(`[data-day="${day}"]`));
  const before = await block.getAttribute('data-start');
  await block.click();
  await page.getByTestId('shift-start').fill(`${day}T12:00`);
  await page.getByTestId('shift-save').click();
  await expect(page.getByRole('alert').filter({ hasText: th.errors.CONFLICTS_WITH_BOOKINGS })).toBeVisible();
  await expect(page.getByTestId('therapist-row').first().getByTestId('shift-block').and(page.locator(`[data-day="${day}"]`))).toHaveAttribute('data-start', before!);
});
