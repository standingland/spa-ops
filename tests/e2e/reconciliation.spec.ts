import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { admin, payViaApi, resetTestData, seedBookingNow, setStatusAsReception } from './db';
import th from '../../messages/th.json';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

test('a manager verifies a transfer and the totals move from awaiting to verified', async ({ page }) => {
  const k = await seedBookingNow(); await payViaApi(k.id, 150000, 'bank_transfer');
  await signIn(page, 'manager@spa.test'); await page.goto('/th/payments');
  const row = page.locator('[data-testid=ledger-method-row][data-code=bank_transfer]');
  await expect(row).toContainText('฿1,500.00');
  await expect(page.getByTestId('ledger-entry')).toHaveAttribute('data-state', 'unverified');
  await page.getByTestId('entry-verify').click(); await page.getByTestId('confirm').click();
  await expect(page.getByTestId('ledger-entry')).toHaveAttribute('data-state', 'verified');
});
test('cash is closed against a count and a later change is flagged', async ({ page }) => {
  const k = await seedBookingNow(); await payViaApi(k.id, 150000, 'cash');
  await signIn(page, 'owner@spa.test'); await page.goto('/th/payments');
  await page.getByTestId('cash-counted').fill('1,400'); await page.getByTestId('cash-close').click();
  await expect(page.getByTestId('cash-difference')).toHaveText('-฿100.00');
  await page.getByTestId('entry-void').click(); await page.getByTestId('reason').fill('บันทึกผิด'); await page.getByTestId('confirm').click();
  await expect(page.getByTestId('cash-changed')).toBeVisible();
  await expect(page.getByTestId('ledger-entry')).toHaveAttribute('data-state', 'voided');
});
test('a refund needs a reason and cannot exceed the payment', async ({ page }) => {
  const k = await seedBookingNow(); await payViaApi(k.id, 150000, 'cash');
  await signIn(page, 'manager@spa.test'); await page.goto('/th/payments');
  await page.getByTestId('entry-refund').click();
  await page.getByTestId('refund-amount').fill('2,000'); await page.getByTestId('reason').fill('ยกเลิก');
  await page.getByTestId('confirm').click();
  await expect(page.getByRole('alert').filter({ hasText: th.errors.REFUND_EXCEEDS_PAYMENT })).toBeVisible();
  await page.getByTestId('refund-amount').fill('1,500'); await page.getByTestId('reason').fill('');
  await page.getByTestId('confirm').click();
  await expect(page.getByRole('alert').filter({ hasText: th.errors.REASON_REQUIRED })).toBeVisible();
  await page.getByTestId('reason').fill('ลูกค้ายกเลิก'); await page.getByTestId('confirm').click();
  await expect(page.locator('[data-testid=ledger-entry][data-kind=refund]')).toHaveCount(1);
  expect((await admin.from('payments').select('id').eq('kind', 'refund')).data).toHaveLength(1);
});
test('the owner adds a payment method and it is offered at the desk; reception cannot open reconciliation', async ({ page, browser }) => {
  await signIn(page, 'owner@spa.test'); await page.goto('/th/payments');
  await page.getByTestId('method-code').fill('store_credit'); await page.getByTestId('method-name').fill('เครดิตร้าน');
  await page.getByTestId('method-add').click();
  await expect(page.locator('[data-testid=method-row][data-code=store_credit]')).toBeVisible();
  const k = await seedBookingNow({ customerName: 'คุณเครดิต' }); await setStatusAsReception(k.id, 'completed');
  const p2 = await (await browser.newContext()).newPage();
  await signIn(p2, 'reception@spa.test');
  await p2.getByTestId('pending-payment-row').filter({ hasText: 'คุณเครดิต' }).getByTestId('pay-open').click();
  await expect(p2.getByTestId('pay-method').locator('option', { hasText: 'เครดิตร้าน' })).toHaveCount(1);
  await p2.goto('/th/payments');
  await expect(p2.getByTestId('forbidden')).toBeVisible();
});
