import { test, expect, type Page } from '@playwright/test';
import { signIn, signInFresh } from './helpers';
import { admin, resetTestData, sql } from './db';
import { bootstrapOwner } from '../../src/modules/identity/bootstrap';
import th from '../../messages/th.json';

test.beforeEach(async () => { await resetTestData(); });
test.afterAll(async () => { await resetTestData(); });

const idOf = async (email: string) => (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === email)!.id;
const setPasswordViaAdmin = async (email: string, password: string) => { await admin.auth.admin.updateUserById(await idOf(email), { password }); };
const deleteUserViaAdmin = async (email: string) => { const u = (await admin.auth.admin.listUsers({ perPage: 200 })).data.users.find((x) => x.email === email); if (u) await admin.auth.admin.deleteUser(u.id); };

async function resetPassword(page: Page, email: string, password: string) {
  const row = page.locator(`[data-testid=staff-row][data-email="${email}"]`);
  await row.getByTestId('staff-reset-password').click();
  await row.getByTestId('staff-new-password').fill(password);
  await row.getByTestId('staff-reset-confirm').click();
  await expect(row.getByTestId('staff-reset-password')).toBeVisible();
}

test('a deactivated employee is locked out on their next click, not at their next sign-in', async ({ page }) => {
  await signIn(page, 'reception@spa.test');
  try {
    await sql(`update staff set active=false where user_id=(select id from auth.users where email='reception@spa.test')`);
    await page.goto('/th/customers');
    await expect(page).toHaveURL(/\/th\/login/);
  } finally {
    await sql(`update staff set active=true where user_id=(select id from auth.users where email='reception@spa.test')`);
  }
});
test('the owner resets a password and the employee signs in with the new one only', async ({ page, browser }) => {
  await signIn(page, 'owner@spa.test'); await page.goto('/th/admin/staff');
  await resetPassword(page, 'therapist@spa.test', 'brand-new-pass-1');
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  try {
    await signInFresh(p2, 'therapist@spa.test', 'brand-new-pass-1');
    await expect(p2).toHaveURL(/\/th\/today/);
    const p3 = await (await browser.newContext()).newPage();
    await p3.goto('/th/login');
    await p3.getByTestId('login-email').fill('therapist@spa.test');
    await p3.getByTestId('login-password').fill('local-dev-only');
    await p3.getByTestId('login-submit').click();
    await expect(p3.getByTestId('login-error')).toBeVisible();
  } finally { await setPasswordViaAdmin('therapist@spa.test', 'local-dev-only'); await ctx.close(); }
});
test('staff change their own password; a wrong current password or a short new one is refused', async ({ page }) => {
  await admin.auth.admin.createUser({ email: 'temp@spa.test', password: 'temp-pass-0001', email_confirm: true });
  const id = await idOf('temp@spa.test');
  await admin.from('staff').insert({ user_id: id, role: 'receptionist', display_name: 'Temp' });
  try {
    await signInFresh(page, 'temp@spa.test', 'temp-pass-0001');
    await page.goto('/th/account');
    await page.getByTestId('pw-current').fill('not-the-password'); await page.getByTestId('pw-next').fill('another-pass-123');
    await page.getByTestId('pw-submit').click();
    await expect(page.getByRole('alert').filter({ hasText: th.errors.NOT_AUTHORIZED })).toBeVisible();
    await page.getByTestId('pw-current').fill('temp-pass-0001'); await page.getByTestId('pw-next').fill('short');
    await page.getByTestId('pw-submit').click();
    await expect(page.getByRole('alert').filter({ hasText: th.errors.INVALID_INPUT })).toBeVisible();
    await page.getByTestId('pw-next').fill('another-pass-123');
    await page.getByTestId('pw-submit').click();
    await expect(page.getByTestId('pw-changed')).toBeVisible();
    await page.context().clearCookies();
    await signInFresh(page, 'temp@spa.test', 'another-pass-123');
  } finally { await admin.from('staff').delete().eq('user_id', id); await deleteUserViaAdmin('temp@spa.test'); }
});
test('the first owner can be created only while no owner exists', async () => {
  expect(await bootstrapOwner(admin, { email: 'first@spa.test', password: 'first-owner-pass', displayName: 'First' })).toBe('owner_exists');
  await sql(`update staff set active=false where role='owner'`);
  try {
    expect(await bootstrapOwner(admin, { email: 'first@spa.test', password: 'first-owner-pass', displayName: 'First' })).toBe('created');
    expect((await sql(`select s.role, s.active from staff s join auth.users u on u.id=s.user_id where u.email='first@spa.test'`)).rows).toEqual([{ role: 'owner', active: true }]);
  } finally {
    await sql(`delete from staff where user_id in (select id from auth.users where email='first@spa.test'); update staff set active=true where role='owner'`);
    await deleteUserViaAdmin('first@spa.test');
  }
});
