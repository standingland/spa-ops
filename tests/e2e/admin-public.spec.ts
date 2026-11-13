import { test, expect } from '@playwright/test';
import { signIn } from './helpers';
import { resetTestData } from './db';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

test('a manager makes a therapist public with a bio and tags, and marks a service bookable online', async ({ page }) => {
  await signIn(page, 'manager@spa.test');
  await page.goto('/en/admin/therapists');
  await page.getByTestId('therapist-edit').first().click();
  await expect(page.getByTestId('therapist-public-help')).toContainText('visible to anyone');
  await page.getByTestId('therapist-public').check();
  await page.getByTestId('therapist-bio-en').fill('Ten years of Thai massage');
  await page.getByTestId('therapist-specialties').fill('Thai, Aroma');
  await page.getByTestId('therapist-save').click();
  await page.reload();
  await page.getByTestId('therapist-edit').first().click();
  await expect(page.getByTestId('therapist-public')).toBeChecked();
  await expect(page.getByTestId('therapist-specialties')).toHaveValue('Thai, Aroma');

  await page.goto('/en/admin/services');
  await page.getByTestId('service-edit').first().click();
  await page.getByTestId('service-bookable-online').check();
  await page.getByTestId('service-save').click();
  await page.reload();
  await expect(page.getByTestId('service-row').first()).toContainText('Online');
});
