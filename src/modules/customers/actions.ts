'use server';

import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { fail, failFrom } from '@/lib/action';
import { CustomerInput } from './schema';

export type CustomerHit = { id: string; displayName: string; phone: string | null };
const STAFF_DESK = ['owner', 'manager', 'receptionist'] as const;

export async function searchCustomers(q: string): Promise<{ ok: true; customers: CustomerHit[] } | { ok: false; code: string }> {
  if (!(await roleOrNull(...STAFF_DESK))) return fail('NOT_AUTHORIZED');
  const term = q.trim().replace(/[%,()]/g, ' ').slice(0, 60);
  const supabase = await createClient();
  let query = supabase.from('customers').select('id, display_name, phone').order('display_name').limit(8);
  if (term) query = query.or(`display_name.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) return failFrom(error);
  return { ok: true, customers: (data ?? []).map((c) => ({ id: c.id, displayName: c.display_name, phone: c.phone })) };
}

export async function createCustomer(input: CustomerInput): Promise<{ ok: true; id: string; customer: CustomerHit } | { ok: false; code: string }> {
  if (!(await roleOrNull(...STAFF_DESK))) return fail('NOT_AUTHORIZED');
  const p = CustomerInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const supabase = await createClient();
  const { data, error } = await supabase.from('customers')
    .insert({ display_name: p.data.displayName, phone: p.data.phone ?? null }).select('id, display_name, phone').single();
  if (error) return failFrom(error);
  return { ok: true, id: data.id, customer: { id: data.id, displayName: data.display_name, phone: data.phone } };
}
