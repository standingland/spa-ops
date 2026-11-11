import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates the first owner on an empty system (a production database has no seed data). Does nothing when an
 * active owner already exists. If the staff row cannot be written, the new login is removed again.
 * The client must be a service-key client. No path aliases here, so scripts/bootstrap-owner.mjs can import it.
 */
export async function bootstrapOwner(
  admin: SupabaseClient,
  input: { email: string; password: string; displayName: string },
): Promise<'created' | 'owner_exists'> {
  const existing = await admin.from('staff').select('user_id').eq('role', 'owner').eq('active', true).limit(1);
  if (existing.error) throw new Error(`bootstrap: ${existing.error.message}`);
  if (existing.data.length > 0) return 'owner_exists';

  const created = await admin.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`bootstrap: ${created.error?.message ?? 'no user returned'}`);
  const id = created.data.user.id;
  const ins = await admin.from('staff').insert({ user_id: id, role: 'owner', display_name: input.displayName });
  if (ins.error) {
    await admin.auth.admin.deleteUser(id);
    throw new Error(`bootstrap: ${ins.error.message}`);
  }
  return 'created';
}
