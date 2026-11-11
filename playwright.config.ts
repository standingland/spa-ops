import { defineConfig, devices } from '@playwright/test';

process.env.CRON_SECRET ??= 'local-dev-only';

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- -p 3100', url: 'http://localhost:3100/th/login', reuseExistingServer: true,
    env: { NEXT_PUBLIC_LIVE_POLL_MS: '3000', CRON_SECRET: process.env.CRON_SECRET, NOTIFY_SENDER_NAME: 'Studio' }, timeout: 180000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
