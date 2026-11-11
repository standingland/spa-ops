import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { signIn } from './helpers';
import { admin, resetTestData, seedBooking, tomorrowAt } from './db';
import { bangkokDay, formatTime } from '../../src/lib/time';
import th from '../../messages/th.json';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

const local = (iso: string) => `${bangkokDay(iso)}T${formatTime(iso)}`;

async function addTimeOff(page: Page, o: { therapist: string; from: string; to: string; kind: string }) {
  await page.getByTestId('timeoff-add').click();
  await page.getByTestId('timeoff-therapist').selectOption({ label: o.therapist });
  await page.getByTestId('timeoff-start').fill(local(o.from));
  await page.getByTestId('timeoff-end').fill(local(o.to));
  await page.getByTestId('timeoff-kind').selectOption(o.kind);
  await page.getByTestId('timeoff-save').click();
}

async function reportViaApi(room: string, note: string) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_KEY!, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email: 'therapist@spa.test', password: 'local-dev-only' });
  const { data: r } = await admin.from('rooms').select('id').eq('code', room).single();
  const { error } = await client.rpc('report_room_issue', { p_room_id: r!.id, p_note: note });
  if (error) throw new Error(error.message);
}

test('a manager records a sick day over a booking and reception reassigns it', async ({ page, browser }) => {
  const k = await seedBooking({ at: tomorrowAt('14:00'), customerName: 'คุณรอ' });
  await signIn(page, 'manager@spa.test'); await page.goto('/th/admin/therapists');
  await addTimeOff(page, { therapist: k.therapistName, from: tomorrowAt('09:00'), to: tomorrowAt('20:00'), kind: 'absence' });
  await expect(page.getByRole('alert').filter({ hasText: th.errors.CONFLICTS_WITH_BOOKINGS })).toBeVisible();
  await page.getByTestId('force-confirm').click();
  await expect(page.getByRole('status').filter({ hasText: '1' })).toBeVisible();
  const p2 = await (await browser.newContext()).newPage();
  await signIn(p2, 'reception@spa.test');
  const item = p2.getByTestId('attention-item').filter({ hasText: 'คุณรอ' });
  await expect(item).toHaveAttribute('data-kind', 'needs_reassignment');
  await item.click();
  await p2.getByTestId('reassign-option').first().click();
  await expect(p2.getByTestId('attention-item').filter({ hasText: 'คุณรอ' })).toHaveCount(0);
});

test('a forced room closure queues its bookings', async ({ page }) => {
  await seedBooking({ at: tomorrowAt('11:00'), roomCode: 'R1', customerName: 'คุณห้อง' });
  await signIn(page, 'manager@spa.test'); await page.goto('/th/admin/rooms');
  const row = page.getByTestId('room-row').filter({ hasText: 'R1' });
  await row.locator('summary').click();
  await row.getByTestId('block-start').fill(local(tomorrowAt('09:00')));
  await row.getByTestId('block-end').fill(local(tomorrowAt('18:00')));
  await row.getByTestId('block-add').click();
  await expect(page.getByRole('alert').filter({ hasText: th.errors.CONFLICTS_WITH_BOOKINGS })).toBeVisible();
  await row.getByTestId('force-confirm').click();
  await expect(page.getByRole('status').filter({ hasText: '1' })).toBeVisible();
  await page.goto('/th/today');
  await expect(page.getByTestId('attention-item').filter({ hasText: 'คุณห้อง' })).toHaveAttribute('data-kind', 'needs_reassignment');
});

test('a receptionist is not offered the force option', async ({ page }) => {
  await signIn(page, 'reception@spa.test');
  await page.goto('/th/admin/therapists');
  await expect(page.getByTestId('forbidden')).toBeVisible();
});

test('a room report reaches the desk and can be resolved', async ({ page }) => {
  await reportViaApi('R2', 'ก๊อกน้ำรั่ว');
  await signIn(page, 'reception@spa.test');
  const item = page.getByTestId('attention-item').filter({ hasText: 'ก๊อกน้ำรั่ว' });
  await expect(item).toHaveAttribute('data-kind', 'room_report');
  await item.getByTestId('report-resolve').click();
  await expect(page.getByTestId('attention-item').filter({ hasText: 'ก๊อกน้ำรั่ว' })).toHaveCount(0);
});
