import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signIn } from './helpers';

const PAGES: { path: string; as: string | null }[] = [
  { path: '/th/login', as: null },
  { path: '/th/today', as: 'reception@spa.test' },
  { path: '/th/rooms', as: 'reception@spa.test' },
  { path: '/th/calendar', as: 'reception@spa.test' },
  { path: '/th/customers', as: 'reception@spa.test' },
  { path: '/th/payments', as: 'manager@spa.test' },
  { path: '/th/reports', as: 'manager@spa.test' },
  { path: '/th/admin', as: 'owner@spa.test' },
  { path: '/th/admin/settings', as: 'owner@spa.test' },
  { path: '/th/admin/therapists', as: 'owner@spa.test' },
];

for (const p of PAGES) {
  test(`no serious or critical accessibility violation on ${p.path}`, async ({ page }) => {
    if (p.as) await signIn(page, p.as);
    await page.goto(p.path);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    expect(bad).toEqual([]);
  });
}

test('a failed sign-in is announced as an alert', async ({ page }) => {
  await page.goto('/th/login');
  await page.getByTestId('login-email').fill('owner@spa.test');
  await page.getByTestId('login-password').fill('wrong-password-123');
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('login-error')).toHaveAttribute('role', 'alert');
});

test('a saved setting is announced as a status message', async ({ page }) => {
  await signIn(page, 'owner@spa.test');
  await page.goto('/th/admin/settings');
  const box = page.getByTestId('setting-ops.ending_soon_min');
  await box.fill('11');
  await box.blur();
  await expect(page.getByTestId('setting-saved')).toHaveAttribute('role', 'status');
  await box.fill('10');
  await box.blur();
  await expect(page.getByTestId('setting-saved')).toBeVisible();
});
