import { defineConfig, devices } from '@playwright/test';

process.env.CRON_SECRET ??= 'local-dev-only';

/** Runs against the production build (`next build` + `next start`) on port 3200: headers, and the full-size screen budgets. */
export default defineConfig({
  testDir: 'tests/e2e-prod',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 10000 },
  use: { baseURL: 'http://localhost:3200', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run start -- -p 3200',
    url: 'http://localhost:3200/th/login',
    reuseExistingServer: true,
    env: { NEXT_PUBLIC_LIVE_POLL_MS: '3000', CRON_SECRET: process.env.CRON_SECRET, NOTIFY_SENDER_NAME: 'Studio' },
    timeout: 600000,
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
