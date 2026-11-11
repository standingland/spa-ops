import { test, expect } from '@playwright/test';
import { signIn } from './helpers';

test('signed-out visitors are sent to the Thai login page', async ({ page }) => {
  await page.goto('/th/calendar');
  await expect(page).toHaveURL(/\/th\/login/);
});
test('a receptionist cannot open room administration', async ({ page }) => {
  await signIn(page, 'reception@spa.test');
  await page.goto('/th/admin/rooms');
  await expect(page.getByTestId('forbidden')).toBeVisible();
});
test('the interface switches to English', async ({ page }) => {
  await signIn(page, 'owner@spa.test');
  await page.goto('/en/calendar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('forty page sign-ins in a row do not hit the sign-in rate limit', async ({ browser }) => {
  test.setTimeout(240000);
  for (let i = 0; i < 40; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, 'reception@spa.test');
    await expect(page).toHaveURL(/\/th\/today/);
    await context.close();
  }
});
