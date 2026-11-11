import { test, expect } from '@playwright/test';
import { signIn } from '../e2e/helpers';

test('pages carry the security headers and are never cached or indexed', async ({ page }) => {
  await signIn(page, 'reception@spa.test');
  const r = await page.goto('/th/today');
  const h = r!.headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-robots-tag']).toContain('noindex');
  expect(h['cache-control']).toContain('no-store');
  const csp = h['content-security-policy'];
  for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) expect(csp).toContain(d);
  expect(csp).not.toContain("'unsafe-eval'");
  expect(csp).toMatch(/connect-src 'self' http:\/\/127\.0\.0\.1:54321 ws:\/\/127\.0\.0\.1:54321/);
});
test('the policy does not break the app: sign-in, live status and a booking panel work with no CSP violation', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await signIn(page, 'reception@spa.test');
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-state', 'live');
  await page.goto('/th/calendar');
  await page.goto('/th/rooms');
  expect(violations).toEqual([]);
});
test('API responses carry the strict policy; downloads are not cacheable', async ({ page }) => {
  await signIn(page, 'owner@spa.test');
  const day = new Date().toISOString().slice(0, 10);
  const r = await page.request.get(`/api/reports/revenue/csv?from=${day}&to=${day}&grain=day`);
  expect([r.status(), r.headers()['cache-control']]).toEqual([200, expect.stringContaining('no-store')]);
  expect(r.headers()['content-security-policy']).toContain("default-src 'none'");
});
