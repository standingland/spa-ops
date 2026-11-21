import { expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { authFile, SEEDED } from './global-setup';

/** Always signs in through the login form (use it for tests about signing in). */
export async function signInFresh(page: Page, email: string, password = 'local-dev-only') {
  await page.goto('/th/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/th\/staff$/);
}

/**
 * Signs in and opens Today for operations tests. Seeded accounts reuse the state
 * saved by the global setup. Other accounts sign in through the form.
 */
export async function signIn(page: Page, email: string, password?: string) {
  const name = email.replace('@spa.test', '');
  const file = authFile(name);
  if (password === undefined && email.endsWith('@spa.test') && (SEEDED as readonly string[]).includes(name) && existsSync(file)) {
    const state = JSON.parse(readFileSync(file, 'utf8')) as { cookies: Parameters<ReturnType<Page['context']>['addCookies']>[0] };
    await page.context().addCookies(state.cookies);
  } else {
    await signInFresh(page, email, password);
  }
  await page.goto('/th/today');
  await expect(page).toHaveURL(/\/th\/today/);
}
