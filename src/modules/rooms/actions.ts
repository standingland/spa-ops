'use server';

import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { PositionLabel, RoomBlockInput, RoomInput } from './schema';

const allowed = () => roleOrNull('owner', 'manager');

export async function saveRoom(input: RoomInput): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const p = RoomInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const supabase = await createClient();
  const row = {
    code: v.code, display_name: v.displayName, category_id: v.categoryId, floor: v.floor ?? null, zone: v.zone ?? null,
    turnover_min: v.turnoverMin, equipment: v.equipment, notes: v.notes ?? null,
  };
  if (v.id) {
    const { data, error } = await supabase.from('rooms').update(row).eq('id', v.id).select('id');
    if (error) return failFrom(error);
    return data?.length ? done(v.id) : fail('NOT_AUTHORIZED');
  }
  const { data: last } = await supabase.from('rooms').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const { data, error } = await supabase.from('rooms').insert({ ...row, sort_order: (last?.[0]?.sort_order ?? 0) + 1 }).select('id').single();
  if (error) return failFrom(error);
  return done(data.id);
}

export async function setRoomActive(id: string, active: boolean): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.from('rooms').update({ active }).eq('id', id).select('id');
  if (error) return failFrom(error);
  return data?.length ? done(id) : fail('NOT_AUTHORIZED');
}

export async function reorderRooms(ids: string[]): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await supabase.from('rooms').update({ sort_order: i + 1 }).eq('id', ids[i]);
    if (error) return failFrom(error);
  }
  return done('reordered');
}

export async function addPosition(roomId: string, label: string): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const l = PositionLabel.safeParse(label);
  if (!l.success) return fail('INVALID_INPUT');
  const supabase = await createClient();
  const { data, error } = await supabase.from('room_positions').insert({ room_id: roomId, label: l.data }).select('id').single();
  if (error) return failFrom(error);
  return done(data.id);
}

export async function setPositionActive(id: string, active: boolean): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.from('room_positions').update({ active }).eq('id', id).select('id');
  if (error) return failFrom(error);
  return data?.length ? done(id) : fail('NOT_AUTHORIZED');
}

export async function addRoomBlock(input: RoomBlockInput): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const p = RoomBlockInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.from('room_blocks')
    .insert({ room_id: v.roomId, during: `[${v.start},${v.end})`, kind: v.kind, note: v.note ?? null }).select('id').single();
  if (error) return failFrom(error);
  return done(data.id);
}

export async function removeRoomBlock(id: string): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.from('room_blocks').delete().eq('id', id).select('id');
  if (error) return failFrom(error);
  return data?.length ? done(id) : fail('NOT_AUTHORIZED');
}
