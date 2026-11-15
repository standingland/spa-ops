'use server';

import { z } from 'zod';
import { getLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { roleOrNull } from '@/modules/identity/session';
import { ItemInput, MovementInput, PeriodInput, RecipeInput, RuleInput, type Earnings, type Inventory, type Option, type Rule } from './schema';

const allowed = () => roleOrNull('owner', 'manager');

export async function getBusinessOptions(): Promise<{ ok: true; services: Option[]; therapists: Option[] } | { ok: false; code: string }> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const db = await createClient();
  const locale = await getLocale();
  const [s, t] = await Promise.all([db.from('services').select('id,name_th,name_en,active').order('sort_order'), db.from('therapists').select('id,display_name,active').order('sort_order')]);
  if (s.error) return failFrom(s.error);
  if (t.error) return failFrom(t.error);
  return { ok: true, services: (s.data ?? []).map((v) => ({ id: v.id, name: locale === 'en' && v.name_en ? v.name_en : v.name_th, active: v.active })), therapists: (t.data ?? []).map((v) => ({ id: v.id, name: v.display_name, active: v.active })) };
}

export async function getEarnings(from: string, to: string): Promise<{ ok: true; report: Earnings; rules: Rule[] } | { ok: false; code: string }> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  if (!PeriodInput.safeParse({ from, to }).success) return fail('INVALID_INPUT');
  const db = await createClient();
  const [report, rules] = await Promise.all([db.rpc('earnings_report', { p_from: from, p_to: to }), db.from('commission_rules').select('*').order('id')]);
  if (report.error) return failFrom(report.error);
  if (rules.error) return failFrom(rules.error);
  return { ok: true, report: report.data as Earnings, rules: (rules.data ?? []) as Rule[] };
}

export async function saveRule(input: z.input<typeof RuleInput>): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const p = RuleInput.safeParse(input); if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const { data, error } = await (await createClient()).rpc('save_commission_rule', { p_service_id: v.serviceId, p_therapist_id: v.therapistId, p_mode: v.mode, p_rate_bps: v.rateBps, p_fixed_satang: v.fixedSatang });
  return error ? failFrom(error) : done(data);
}
export async function removeRule(id: string): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  if (!z.uuid().safeParse(id).success) return fail('INVALID_INPUT');
  const { error } = await (await createClient()).rpc('remove_commission_rule', { p_id: id });
  return error ? failFrom(error) : done(id);
}
export async function getInventory(from: string, to: string): Promise<{ ok: true; inventory: Inventory } | { ok: false; code: string }> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  if (!PeriodInput.safeParse({ from, to }).success) return fail('INVALID_INPUT');
  const { data, error } = await (await createClient()).rpc('inventory_report', { p_from: from, p_to: to });
  return error ? failFrom(error) : { ok: true, inventory: data as Inventory };
}
export async function saveItem(input: z.input<typeof ItemInput>): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const p = ItemInput.safeParse(input); if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const { data, error } = await (await createClient()).rpc('save_inventory_item', { p_id: v.id, p_name: v.name, p_unit: v.unit, p_reorder_level: v.reorderLevel, p_active: v.active });
  return error ? failFrom(error) : done(data);
}
export async function recordMovement(input: z.input<typeof MovementInput>): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const p = MovementInput.safeParse(input); if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const { data, error } = await (await createClient()).rpc('record_stock_movement', { p_item_id: v.itemId, p_kind: v.kind, p_quantity: v.quantity, p_unit_cost_satang: v.unitCostSatang, p_reason: v.reason, p_key: v.key });
  return error ? failFrom(error) : done(data);
}
export async function saveRecipe(input: z.input<typeof RecipeInput>): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const p = RecipeInput.safeParse(input); if (!p.success) return fail('INVALID_INPUT');
  const { error } = await (await createClient()).rpc('set_service_materials', { p_service_id: p.data.serviceId, p_materials: p.data.materials.map((m) => ({ item_id: m.itemId, quantity: m.quantity })) });
  return error ? failFrom(error) : done(p.data.serviceId);
}
