import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { admin, resetTestData, shiftsAroundNow } from './db';
import th from '../../messages/th.json';

const NIL = '00000000-0000-0000-0000-000000000000';
// A real 1x1 PNG: the browser decodes it and resizes it to a JPEG before upload.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function clearPhotos() {
  await admin.from('therapists').update({ photo_path: null }).neq('id', NIL);
  const { data } = await admin.storage.from('therapist-photos').list();
  if (data?.length) await admin.storage.from('therapist-photos').remove(data.map((o) => o.name));
}
async function firstTherapist() {
  const { data } = await admin.from('therapists').select('id, display_name').eq('active', true).order('sort_order').limit(1).single();
  return data!;
}

test.beforeEach(async () => { await resetTestData(); await clearPhotos(); });
test.afterAll(async () => { await clearPhotos(); await resetTestData(); });

test('the owner uploads a photo and sees it after a reload', async ({ page }) => {
  const t = await firstTherapist();
  await signIn(page, 'owner@spa.test');
  await page.goto('/th/admin/therapists');
  await expect(page.getByTestId(`therapist-photo-${t.id}`).locator('img')).toHaveCount(0);
  await page.getByTestId(`therapist-photo-input-${t.id}`).setInputFiles({ name: 'big-original.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId(`therapist-photo-${t.id}`).locator('img')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId(`therapist-photo-${t.id}`).locator('img')).toBeVisible();
});

test('the owner removes the photo and the initials come back', async ({ page }) => {
  const t = await firstTherapist();
  await signIn(page, 'owner@spa.test');
  await page.goto('/th/admin/therapists');
  await page.getByTestId(`therapist-photo-input-${t.id}`).setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByTestId(`therapist-photo-${t.id}`).locator('img')).toBeVisible();
  await page.getByTestId(`therapist-photo-remove-${t.id}`).click();
  await expect(page.getByTestId(`therapist-photo-${t.id}`).locator('img')).toHaveCount(0);
  const { data } = await admin.from('therapists').select('photo_path').eq('id', t.id).single();
  expect(data!.photo_path).toBeNull();
});

test('a file the browser cannot read shows the message and uploads nothing', async ({ page }) => {
  const t = await firstTherapist();
  await signIn(page, 'owner@spa.test');
  await page.goto('/th/admin/therapists');
  await page.getByTestId(`therapist-photo-input-${t.id}`).setInputFiles({ name: 'iphone.heic', mimeType: 'image/heic', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('alert')).toContainText(th.therapists.photo.unreadable);
  const { data } = await admin.from('therapists').select('photo_path').eq('id', t.id).single();
  expect(data!.photo_path).toBeNull();
});

test('the now strip lists a therapist who is on shift', async ({ page }) => {
  await shiftsAroundNow();
  const t = await firstTherapist();
  await signIn(page, 'owner@spa.test');
  await page.goto('/th/admin/therapists');
  await expect(page.getByTestId('now-strip')).toBeVisible();
  await expect(page.getByTestId(`now-${t.id}`)).toContainText(t.display_name);
});

test('a receptionist cannot open the Therapists page', async ({ page }) => {
  await signIn(page, 'reception@spa.test');
  await page.goto('/th/admin/therapists');
  await expect(page.getByTestId('forbidden')).toBeVisible();
});

test('no photo appears on Today, even with the shared screen on', async ({ page }) => {
  const t = await firstTherapist();
  const name = `${t.id}-1.jpg`;
  await admin.storage.from('therapist-photos').upload(name, PNG, { contentType: 'image/png' });
  await admin.from('therapists').update({ photo_path: name }).eq('id', t.id);
  await shiftsAroundNow();
  await signIn(page, 'reception@spa.test');
  await page.goto('/th/today');
  await expect(page.getByTestId('shared-toggle')).toBeVisible();
  await expect(page.locator(`img[alt="${t.display_name}"]`)).toHaveCount(0);
  await page.getByTestId('shared-toggle').dispatchEvent('click');
  await expect(page.locator(`img[alt="${t.display_name}"]`)).toHaveCount(0);
});
