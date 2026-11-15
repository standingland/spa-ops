import { z } from 'zod';

export const PeriodInput = z.object({ from: z.iso.date(), to: z.iso.date() }).refine(
  ({ from, to }) => to >= from && Date.parse(to) - Date.parse(from) <= 366 * 86400000,
);
const quantity = z.number().finite().min(-1000000000).max(1000000000).refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 0.0001);
const amount = z.number().int().min(0).max(100000000);
export const RuleInput = z.object({ serviceId: z.uuid(), therapistId: z.uuid().nullable(), mode: z.enum(['percent', 'fixed']), rateBps: z.number().int().min(0).max(10000), fixedSatang: amount });
export const ItemInput = z.object({ id: z.uuid().nullable(), name: z.string().trim().min(1).max(100), unit: z.string().trim().min(1).max(20), reorderLevel: quantity.refine((n) => n >= 0), active: z.boolean() });
export const MovementInput = z.object({ itemId: z.uuid(), kind: z.enum(['receipt', 'adjustment']), quantity: quantity.refine((n) => n !== 0), unitCostSatang: amount, reason: z.string().trim().min(1).max(300), key: z.string().min(8).max(100) }).refine((v) => v.kind !== 'receipt' || v.quantity > 0);
export const RecipeInput = z.object({ serviceId: z.uuid(), materials: z.array(z.object({ itemId: z.uuid(), quantity: quantity.refine((n) => n > 0) })).max(100) }).refine((v) => new Set(v.materials.map((m) => m.itemId)).size === v.materials.length);

export type Option = { id: string; name: string; active: boolean };
export type Rule = { id: string; service_id: string; therapist_id: string | null; mode: 'percent' | 'fixed'; rate_bps: number; fixed_satang: number };
export type Item = { id: string; name: string; unit: string; on_hand: number; reorder_level: number; unit_cost_satang: number; active: boolean };
export type Material = { id: string; service_id: string; item_id: string; quantity: number };
export type Movement = { id: string; item_id: string; booking_id: string | null; kind: 'receipt' | 'adjustment' | 'usage'; quantity: number; unit_cost_satang: number; reason: string; occurred_at: string };
export type Earnings = {
  summary: { therapist_id: string; therapist_name: string; commission_satang: number; treatments: number }[];
  entries: { id: string; booking_id: string; therapist_id: string; therapist_name: string; service_id: string; service_name: string; completed_at: string; mode: 'percent' | 'fixed'; rate_bps: number; fixed_satang: number; net_satang: number; commission_satang: number }[];
  entry_count: number;
};
export type Inventory = {
  items: Item[]; materials: Material[]; movements: Movement[]; materialCostSatang: number; movementCount: number;
  costByService: { service_id: string; service_name: string; treatments: number; cost_satang: number; average_satang: number }[];
};
