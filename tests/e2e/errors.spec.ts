import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { admin, resetTestData, sql, tomorrowAt } from './db';
import { bangkokDay, formatTime } from '../../src/lib/time';
import th from '../../messages/th.json';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

test('an unexpected failure shows a reference code and leaves the form filled', async ({ page }) => {
  await admin.from('customers').insert({ display_name: 'E2E Customer' });
  const { data: th1 } = await admin.from('therapists').select('display_name').eq('active', true).order('sort_order').limit(1).single();
  const at = tomorrowAt('13:00');
  await sql(`create function public._e2e_boom() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
             create trigger _e2e_boom before insert on public.bookings for each row execute function public._e2e_boom();`);
  try {
    await signIn(page, 'reception@spa.test');
    await page.goto(`/th/calendar?day=${bangkokDay(at)}`);
    await page.getByTestId('new-booking').click();
    await page.getByTestId('customer-search').fill('E2E');
    await page.getByTestId('customer-option').first().click();
    await page.getByTestId('booking-service').selectOption({ index: 0 });
    await page.getByTestId('booking-start').fill(`${bangkokDay(at)}T${formatTime(at)}`);
    await page.getByTestId('booking-therapist').selectOption({ label: th1!.display_name });
    await page.getByTestId('booking-position').selectOption({ label: 'R1 · 1' });
    await page.getByTestId('confirm-booking').click();
    await expect(page.getByRole('alert').filter({ hasText: th.errors.UNKNOWN })).toBeVisible();
    await expect(page.getByTestId('error-ref')).toHaveText(/[A-Z2-9]{8}/);
    await expect(page.getByTestId('confirm-booking')).toBeVisible();
  } finally {
    await sql(`drop trigger if exists _e2e_boom on public.bookings; drop function if exists public._e2e_boom();`);
  }
});
test('the health check answers without sign-in and says nothing else', async ({ request }) => {
  const r = await request.get('/api/health');
  expect([r.status(), await r.json()]).toEqual([200, { ok: true }]);
});
