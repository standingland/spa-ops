'use server';

import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { CategoryInput, ServiceInput } from './schema';

const allowed = () => roleOrNull('owner', 'manager');

export async function saveCategory(input: CategoryInput): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const p = CategoryInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const supabase = await createClient();
  const row = { name_th: v.nameTh, name_en: v.nameEn ?? null, ...(v.sortOrder !== undefined ? { sort_order: v.sortOrder } : {}) };
  if (v.id) {
    const { data, error } = await supabase.from('room_categories').update(row).eq('id', v.id).select('id');
    if (error) return failFrom(error);
    return data?.length ? done(v.id) : fail('NOT_AUTHORIZED');
  }
  const { data, error } = await supabase.from('room_categories').insert(row).select('id').single();
  if (error) return failFrom(error);
  return done(data.id);
}

export async function saveService(input: ServiceInput): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const p = ServiceInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const supabase = await createClient();
  const row = {
    name_th: v.nameTh, name_en: v.nameEn ?? null, duration_min: v.durationMin,
    price_satang: v.priceSatang, required_equipment: v.requiredEquipment,
  };
  let id = v.id;
  if (id) {
    const { data, error } = await supabase.from('services').update(row).eq('id', id).select('id');
    if (error) return failFrom(error);
    if (!data?.length) return fail('NOT_AUTHORIZED');
  } else {
    const { data: last } = await supabase.from('services').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const { data, error } = await supabase.from('services').insert({ ...row, sort_order: (last?.[0]?.sort_order ?? 0) + 1 }).select('id').single();
    if (error) return failFrom(error);
    id = data.id;
  }
  // replace the allowed categories (none = any category)
  const del = await supabase.from('service_room_categories').delete().eq('service_id', id);
  if (del.error) return failFrom(del.error);
  if (v.categoryIds.length) {
    const ins = await supabase.from('service_room_categories')
      .insert(v.categoryIds.map((c) => ({ service_id: id!, room_category_id: c })));
    if (ins.error) return failFrom(ins.error);
  }
  return done(id!);
}

export async function setServiceActive(id: string, active: boolean): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.from('services').update({ active }).eq('id', id).select('id');
  if (error) return failFrom(error);
  return data?.length ? done(id) : fail('NOT_AUTHORIZED');
}
