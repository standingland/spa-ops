import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';

export const SEEDED = ['owner', 'manager', 'reception', 'therapist'] as const;
export const authFile = (name: string) => `tests/e2e/.auth/${name}.json`;

/** Signs in once per seeded account and saves the browser state; the auth server allows only 30 sign-ins per 5 minutes. */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? 'http://localhost:3100';
  mkdirSync('tests/e2e/.auth', { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const name of SEEDED) {
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await page.goto('/th/login');
      await page.getByTestId('login-email').fill(`${name}@spa.test`);
      await page.getByTestId('login-password').fill('local-dev-only');
      await page.getByTestId('login-submit').click();
      await page.waitForURL(/\/th\/staff$/, { timeout: 60000 });
      await context.storageState({ path: authFile(name) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
