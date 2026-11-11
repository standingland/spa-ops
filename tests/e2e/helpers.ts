import { expect, type Page } from '@playwright/test';

export async function signIn(page: Page, email: string, password = 'local-dev-only') {
  await page.goto('/th/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/th\/calendar/);
}
