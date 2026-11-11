import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { admin, resetTestData, seedBookingNow } from './db';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

const dispatch = (request: import('@playwright/test').APIRequestContext) =>
  request.post('/api/internal/dispatch', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });

test('the dispatch endpoint refuses callers without the secret', async ({ request }) => {
  expect((await request.post('/api/internal/dispatch')).status()).toBe(401);
  expect((await request.post('/api/internal/dispatch', { headers: { authorization: 'Bearer wrong' } })).status()).toBe(401);
});

test('a consented booking is sent once and shown as sent', async ({ page, request }) => {
  await seedBookingNow({ customerName: 'คุณแจ้ง', consent: true });
  const r = await dispatch(request);
  expect(await r.json()).toEqual({ sent: 1, failed: 0 });
  expect(await (await dispatch(request)).json()).toEqual({ sent: 0, failed: 0 });
  await signIn(page, 'manager@spa.test'); await page.goto('/th/admin/notifications');
  await expect(page.getByTestId('outbox-row')).toHaveAttribute('data-status', 'sent');
  await expect(page.getByText('คุณแจ้ง')).toHaveCount(0);
  await expect(page.getByText('0810000000')).toHaveCount(0);
});

test('a dead message can be retried by a manager; reception cannot open the page', async ({ page, browser }) => {
  await seedBookingNow({ customerName: 'คุณตาย', consent: true });
  await admin.from('notification_outbox').update({ status: 'dead', attempts: 5, last_error: 'boom' }).neq('id', '00000000-0000-0000-0000-000000000000');
  await signIn(page, 'manager@spa.test'); await page.goto('/th/admin/notifications');
  const row = page.getByTestId('outbox-row');
  await expect(row).toHaveAttribute('data-status', 'dead');
  await row.getByTestId('outbox-retry').click();
  await expect(page.getByTestId('outbox-row')).toHaveAttribute('data-status', 'pending');
  const p2 = await (await browser.newContext()).newPage();
  await signIn(p2, 'reception@spa.test');
  await p2.goto('/th/admin/notifications');
  await expect(p2.getByTestId('forbidden')).toBeVisible();
});

test('the maintenance endpoint needs the secret and deletes nothing while pruning is off', async ({ request }) => {
  expect((await request.post('/api/internal/maintenance')).status()).toBe(401);
  const r = await request.post('/api/internal/maintenance', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect([r.status(), await r.json()]).toEqual([200, { enabled: false }]);
});
