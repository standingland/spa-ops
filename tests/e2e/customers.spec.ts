import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signIn } from './helpers';
import { admin, cancelAsReception, payViaApi, resetTestData, seedBooking, seedBookingNow, setStatusAsReception, tomorrowAt } from './db';
import th from '../../messages/th.json';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

const customerId = async (name: string) => (await admin.from('customers').select('id').eq('display_name', name).single()).data!.id as string;

test('reception finds a customer by phone in any format and updates consent', async ({ page }) => {
  await admin.from('customers').insert({ display_name: 'คุณค้น', phone: '0812223333' });
  await signIn(page, 'reception@spa.test'); await page.goto('/th/customers');
  await page.getByTestId('customer-search').fill('081-222-3333');
  await page.getByTestId('customer-row').filter({ hasText: 'คุณค้น' }).click();
  await page.getByTestId('consent').check(); await page.getByTestId('save-customer').click();
  await expect(page.getByTestId('consent-recorded')).not.toBeEmpty();
  await expect(page.getByTestId('private-note')).toHaveCount(0);
  await expect(page.getByTestId('anonymise-open')).toHaveCount(0);
});
test('the profile shows visits, cancellations and payment state per booking', async ({ page }) => {
  const done = await seedBookingNow({ customerName: 'คุณประวัติ' }); await setStatusAsReception(done.id, 'completed'); await payViaApi(done.id, 150000);
  const gone = await seedBooking({ customerName: 'คุณประวัติ', roomCode: 'R2', at: tomorrowAt('14:00') }); await cancelAsReception(gone.id);
  await signIn(page, 'reception@spa.test'); await page.goto(`/th/customers/${await customerId('คุณประวัติ')}`);
  await expect(page.getByTestId('stat-visits')).toHaveText('1');
  await expect(page.getByTestId('stat-cancelled')).toHaveText('1');
  await expect(page.getByTestId('history-row')).toHaveCount(2);
  await expect(page.locator('[data-testid=history-row][data-status=completed]').getByTestId('payment-status')).toHaveAttribute('data-status', 'paid');
});
test('a second customer with the same phone is refused with a link to the first', async ({ page }) => {
  const { data: first } = await admin.from('customers').insert({ display_name: 'คุณเดิม', phone: '0819998888' }).select('id').single();
  await signIn(page, 'reception@spa.test'); await page.goto('/th/calendar');
  await page.getByTestId('new-booking').click();
  await page.getByTestId('customer-new-name').fill('คุณใหม่'); await page.getByTestId('customer-new-phone').fill('081-999-8888');
  await page.getByTestId('customer-new-save').click();
  await expect(page.getByRole('alert').filter({ hasText: th.errors.DUPLICATE })).toBeVisible();
  await expect(page.getByTestId('duplicate-link')).toHaveAttribute('href', new RegExp(`/customers/${first!.id}$`));
});
test('a therapist sees treatment notes on their own booking and cannot open customer records', async ({ page }) => {
  await seedBookingNow({ customerName: 'คุณบริการ', therapistEmail: 'therapist@spa.test' });
  await admin.from('customers').update({ service_notes: 'แรงกดปานกลาง' }).eq('display_name', 'คุณบริการ');
  await signIn(page, 'therapist@spa.test');
  await expect(page.getByTestId('treatment-note').filter({ hasText: 'แรงกดปานกลาง' })).toBeVisible();
  await page.goto('/th/customers');
  await expect(page.getByTestId('forbidden')).toBeVisible();
});
test('the owner exports, then anonymises after typing the name; history and payments remain', async ({ page }) => {
  const k = await seedBookingNow({ customerName: 'คุณลบ' }); await setStatusAsReception(k.id, 'completed'); await payViaApi(k.id, 150000);
  await admin.from('customers').update({ phone: '0811112222', service_notes: 'ไม่ชอบกลิ่นแรง' }).eq('display_name', 'คุณลบ');
  const id = await customerId('คุณลบ');
  await signIn(page, 'owner@spa.test'); await page.goto(`/th/customers/${id}`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-json').click()]);
  const json = JSON.parse(readFileSync(await dl.path(), 'utf8'));
  expect(Object.keys(json).sort()).toEqual(['bookings', 'notes', 'payments', 'profile']);
  await page.getByTestId('anonymise-open').click();
  await page.getByTestId('anonymise-reason').fill('ลูกค้าขอลบข้อมูล');
  await page.getByTestId('anonymise-confirm-text').fill('ผิดชื่อ');
  await page.getByTestId('anonymise-submit').click();
  await expect(page.getByRole('alert').filter({ hasText: th.errors.INVALID_INPUT })).toBeVisible();
  await page.getByTestId('anonymise-confirm-text').fill('คุณลบ');
  await page.getByTestId('anonymise-submit').click();
  await expect(page.getByTestId('customer-name')).toHaveText('Removed');
  await expect(page.getByTestId('f-display-name')).toBeDisabled();
  await expect(page.getByTestId('history-row')).toHaveCount(1);
  const { data: c } = await admin.from('customers').select('phone, service_notes, anonymised_at').eq('id', id).single();
  expect([c!.phone, c!.service_notes, c!.anonymised_at === null]).toEqual([null, null, false]);
  expect((await admin.from('payments').select('id').eq('booking_id', k.id)).data).toHaveLength(1);
});
test('managers can add private notes but not anonymise; the retention tab is owner-only', async ({ page, browser }) => {
  await admin.from('customers').insert({ display_name: 'คุณเก่า', created_at: '2020-01-01T00:00:00Z' });
  const id = await customerId('คุณเก่า');
  await signIn(page, 'manager@spa.test'); await page.goto(`/th/customers/${id}`);
  await page.getByTestId('note-body').fill('ชอบห้องเงียบ'); await page.getByTestId('note-add').click();
  await expect(page.getByTestId('private-note')).toHaveCount(1);
  await expect(page.getByTestId('anonymise-open')).toHaveCount(0);
  await page.goto('/th/customers?tab=retention');
  await expect(page.getByTestId('forbidden')).toBeVisible();
  const p2 = await (await browser.newContext()).newPage();
  await signIn(p2, 'owner@spa.test'); await p2.goto('/th/customers?tab=retention');
  await expect(p2.getByTestId('retention-row').filter({ hasText: 'คุณเก่า' })).toBeVisible();
  await expect(p2.getByTestId('retention-months')).toContainText('24');
});
