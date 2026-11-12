import { test, expect } from '@playwright/test';
import { signIn } from './helpers';

const isPhone = () => test.info().project.name === 'mobile';

// On phones the navigation sits in a menu that starts closed.
async function openMenuIfPhone(page: import('@playwright/test').Page) {
  if (isPhone()) await page.getByTestId('menu-button').click();
}

test('reception sees the front-of-house links and none of the management ones', async ({ page }) => {
  await signIn(page, 'reception@spa.test');
  await openMenuIfPhone(page);
  for (const id of ['today', 'schedule', 'guests', 'rooms']) await expect(page.getByTestId(`nav-${id}`)).toBeVisible();
  await expect(page.getByTestId('nav-payments')).toHaveCount(0);
  await expect(page.getByTestId('nav-settings')).toHaveCount(0);
});

test('a therapist sees only Today, Schedule and Rooms, and no business or setup group', async ({ page }) => {
  await signIn(page, 'therapist@spa.test');
  await openMenuIfPhone(page);
  await expect(page.locator('[data-testid^="nav-"]:not([data-testid="nav-account"])')).toHaveCount(3);
  for (const id of ['today', 'schedule', 'rooms']) await expect(page.getByTestId(`nav-${id}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ธุรกิจ', level: 2 })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'ตั้งค่า', level: 2 })).toHaveCount(0);
  await expect(page.getByTestId('nav-account')).toBeVisible();
});

test('the therapist admin page marks Therapists, not Settings, as current', async ({ page }) => {
  await signIn(page, 'manager@spa.test');
  await page.goto('/th/admin/therapists');
  await openMenuIfPhone(page);
  await expect(page.getByTestId('nav-therapists')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('nav-settings')).not.toHaveAttribute('aria-current', 'page');
});

test('the settings hub lists owner-only tools for the owner and not for a manager', async ({ page }) => {
  await signIn(page, 'owner@spa.test');
  await page.goto('/th/admin');
  await expect(page.getByTestId('admin-tool-staff')).toBeVisible();
  await expect(page.getByTestId('admin-tool-settings')).toBeVisible();
  await page.context().clearCookies();
  await signIn(page, 'manager@spa.test');
  await page.goto('/th/admin');
  await expect(page.getByTestId('admin-tool-services')).toBeVisible();
  await expect(page.getByTestId('admin-tool-staff')).toHaveCount(0);
  await expect(page.getByTestId('admin-tool-settings')).toHaveCount(0);
});

test('on a phone the menu opens, closes on Escape and returns focus to its button', async ({ page }) => {
  test.skip(!isPhone(), 'phone menu only');
  await signIn(page, 'reception@spa.test');
  const button = page.getByRole('button', { name: 'เมนู' });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('nav-today')).toBeHidden();
  await button.click();
  const open = page.getByTestId('menu-button');
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('nav-today')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(open).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('nav-today')).toBeHidden();
  await expect(open).toBeFocused();
});

test('sign-out and live status each appear at most once', async ({ page }) => {
  await signIn(page, 'reception@spa.test');
  await expect(page.getByTestId('sign-out')).toHaveCount(1);
  expect(await page.getByTestId('live-status').count()).toBeLessThanOrEqual(1);
});
