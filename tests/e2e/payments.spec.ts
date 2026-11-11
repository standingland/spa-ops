import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers';
import { admin, resetTestData, seedBookingNow, setStatusAsReception } from './db';
import th from '../../messages/th.json';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

const payments = async () => (await admin.from('payments').select('id, amount_satang, verified_at')).data ?? [];

async function openPanel(page: Page, name: string) {
  await page.goto('/th/calendar');
  await page.getByTestId('booking-card').filter({ hasText: name }).click();
  await expect(page.getByTestId('booking-panel')).toBeVisible();
}

test('a finished treatment is paid in cash and leaves the pending list', async ({ page }) => {
  const k = await seedBookingNow({ customerName: 'คุณจ่าย' }); await setStatusAsReception(k.id, 'completed');
  await signIn(page, 'reception@spa.test');
  const row = page.getByTestId('pending-payment-row').filter({ hasText: 'คุณจ่าย' });
  await expect(row.getByTestId('due-amount')).toHaveText('฿1,500.00');
  await row.getByTestId('pay-open').click();
  await expect(page.getByTestId('pay-amount')).toHaveValue('1,500.00');
  await page.getByTestId('pay-submit').dblclick();
  await expect(page.getByTestId('pending-payment-row')).toHaveCount(0);
  expect(await payments()).toHaveLength(1);
});
test('a part payment leaves the rest due; a transfer waits for verification', async ({ page }) => {
  const k = await seedBookingNow({ customerName: 'คุณแบ่ง' }); await setStatusAsReception(k.id, 'completed');
  await signIn(page, 'reception@spa.test');
  const row = () => page.getByTestId('pending-payment-row').filter({ hasText: 'คุณแบ่ง' });
  await row().getByTestId('pay-open').click();
  await page.getByTestId('pay-amount').fill('500');
  await page.getByTestId('pay-submit').click();
  await expect(row().getByTestId('due-amount')).toHaveText('฿1,000.00');
  await row().getByTestId('pay-open').click();
  await page.getByTestId('pay-method').selectOption({ label: 'โอนเงิน' });
  await page.getByTestId('pay-reference').fill('TXN-9001');
  await page.getByTestId('pay-submit').click();
  await expect(page.getByTestId('pending-payment-row')).toHaveCount(0);
  await openPanel(page, 'คุณแบ่ง');
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'paid');
  await expect(page.getByTestId('payment-unverified')).toBeVisible();
});
test('typing a card number is refused in plain words', async ({ page }) => {
  await seedBookingNow({ customerName: 'คุณบัตร' });
  await signIn(page, 'reception@spa.test'); await openPanel(page, 'คุณบัตร');
  await page.getByTestId('pay-open').click();
  await page.getByTestId('pay-reference').fill('4111 1111 1111 1111');
  await page.getByTestId('pay-submit').click();
  await expect(page.getByRole('alert').filter({ hasText: th.errors.CARD_DATA_REFUSED })).toBeVisible();
  expect(await payments()).toHaveLength(0);
});
test('more than is due is refused', async ({ page }) => {
  await seedBookingNow({ customerName: 'คุณเกิน' });
  await signIn(page, 'reception@spa.test'); await openPanel(page, 'คุณเกิน');
  await page.getByTestId('pay-open').click();
  await page.getByTestId('pay-amount').fill('2,000');
  await page.getByTestId('pay-submit').click();
  await expect(page.getByRole('alert').filter({ hasText: th.errors.OVERPAYMENT })).toBeVisible();
  expect(await payments()).toHaveLength(0);
});
test('a manager gives a discount with a reason; reception cannot', async ({ page, browser }) => {
  await seedBookingNow({ customerName: 'คุณลด' });
  await signIn(page, 'manager@spa.test'); await openPanel(page, 'คุณลด');
  await page.getByTestId('charge-open').click();
  await page.getByTestId('charge-discount').fill('300');
  await page.getByTestId('charge-reason').fill('สมาชิก');
  await page.getByTestId('charge-submit').click();
  await expect(page.getByTestId('due-amount')).toHaveText('฿1,200.00');
  const p2 = await (await browser.newContext()).newPage();
  await signIn(p2, 'reception@spa.test'); await openPanel(p2, 'คุณลด');
  await expect(p2.getByTestId('payment-status')).toBeVisible();
  await expect(p2.getByTestId('charge-open')).toHaveCount(0);
});
test('a therapist sees no money anywhere', async ({ page }) => {
  const k = await seedBookingNow({ customerName: 'คุณนักบำบัด', therapistEmail: 'therapist@spa.test' });
  await setStatusAsReception(k.id, 'completed');
  await signIn(page, 'therapist@spa.test');
  await expect(page.getByTestId('pending-payment-row')).toHaveCount(0);
  await openPanel(page, 'คุณนักบำบัด');
  await expect(page.getByTestId('payment-status')).toHaveCount(0);
  await expect(page.getByTestId('payment-section')).toHaveCount(0);
});
