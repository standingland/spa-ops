'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { roleOrNull, type Role } from './session';
import { ROLES, StaffInput } from './schema';

const ownerOnly = () => roleOrNull('owner');

export type StaffListRow = { userId: string; email: string; displayName: string; role: Role; active: boolean };

/** Owner only: staff with their login emails (emails live in auth.users, reachable only with the service key). */
export async function listStaff(): Promise<StaffListRow[]> {
  if (!(await ownerOnly())) return [];
  const supabase = await createClient();
  const { data: staff } = await supabase.from('staff').select('user_id, role, display_name, active').order('created_at');
  const { data: users } = await createAdminClient().auth.admin.listUsers({ perPage: 200 });
  const email = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? '']));
  return (staff ?? []).map((s) => ({
    userId: s.user_id, email: email.get(s.user_id) ?? '', displayName: s.display_name, role: s.role as Role, active: s.active,
  }));
}

/** Creates the auth user, then the staff row; if the second step fails the auth user is removed. */
export async function createStaff(input: StaffInput): Promise<ActionResult> {
  if (!(await ownerOnly())) return fail('NOT_AUTHORIZED');
  const p = StaffInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const admin = createAdminClient();
  const created = await admin.auth.admin.createUser({ email: v.email, password: v.password, email_confirm: true });
  if (created.error || !created.data.user) return fail(created.error?.status === 422 ? 'DUPLICATE' : 'UNKNOWN');
  const id = created.data.user.id;
  const ins = await admin.from('staff').insert({ user_id: id, role: v.role, display_name: v.displayName });
  if (ins.error) {
    await admin.auth.admin.deleteUser(id);
    return failFrom(ins.error);
  }
  return done(id);
}

async function updateStaff(userId: string, patch: { active?: boolean; role?: Role }): Promise<ActionResult> {
  const me = await ownerOnly();
  if (!me) return fail('NOT_AUTHORIZED');
  if (userId === me.userId) return fail('INVALID_INPUT'); // the owner cannot lock themselves out
  const supabase = await createClient();
  const { data, error } = await supabase.from('staff').update(patch).eq('user_id', userId).select('user_id');
  if (error) return failFrom(error);
  return data?.length ? done(userId) : fail('NOT_AUTHORIZED');
}

export async function setStaffActive(userId: string, active: boolean): Promise<ActionResult> {
  return updateStaff(userId, { active });
}

export async function setStaffRole(userId: string, role: Role): Promise<ActionResult> {
  if (!(ROLES as readonly string[]).includes(role)) return fail('INVALID_INPUT');
  return updateStaff(userId, { role });
}
