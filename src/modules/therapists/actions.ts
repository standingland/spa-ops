'use server';

import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { addDays, bangkokDayRange, parseRange } from '@/lib/time';
import { z } from 'zod';
import { Monday, ShiftInput, TherapistInput, TimeOffInput } from './schema';
import { PHOTO_BUCKET, checkPhoto, photoObjectName } from './photo';

const allowed = () => roleOrNull('owner', 'manager');

export async function saveTherapist(input: TherapistInput): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const p = TherapistInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const supabase = await createClient();
  const row = { display_name: v.displayName, employment_type: v.employmentType, staff_user_id: v.staffUserId ?? null };
  let id = v.id;
  if (id) {
    const { data, error } = await supabase.from('therapists').update(row).eq('id', id).select('id');
    if (error) return failFrom(error);
    if (!data?.length) return fail('NOT_AUTHORIZED');
  } else {
    const { data: last } = await supabase.from('therapists').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const { data, error } = await supabase.from('therapists').insert({ ...row, sort_order: (last?.[0]?.sort_order ?? 0) + 1 }).select('id').single();
    if (error) return failFrom(error);
    id = data.id;
  }
  // replace the qualified services; removing one that a live booking uses is refused by the database
  const { data: current } = await supabase.from('therapist_services').select('service_id').eq('therapist_id', id);
  const have = new Set((current ?? []).map((r) => r.service_id));
  const want = new Set(v.serviceIds);
  for (const s of have) {
    if (!want.has(s)) {
      const del = await supabase.from('therapist_services').delete().eq('therapist_id', id).eq('service_id', s);
      if (del.error) return failFrom(del.error);
    }
  }
  const add = [...want].filter((s) => !have.has(s)).map((s) => ({ therapist_id: id!, service_id: s }));
  if (add.length) {
    const ins = await supabase.from('therapist_services').insert(add);
    if (ins.error) return failFrom(ins.error);
  }
  return done(id!);
}

export async function setTherapistActive(id: string, active: boolean): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.from('therapists').update({ active }).eq('id', id).select('id');
  if (error) return failFrom(error);
  return data?.length ? done(id) : fail('NOT_AUTHORIZED');
}

export async function saveShift(input: ShiftInput): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const p = ShiftInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const supabase = await createClient();
  const row = { therapist_id: v.therapistId, during: `[${v.start},${v.end})` };
  if (v.id) {
    const { data, error } = await supabase.from('therapist_shifts').update(row).eq('id', v.id).select('id');
    if (error) return failFrom(error);
    return data?.length ? done(v.id) : fail('NOT_AUTHORIZED');
  }
  const { data, error } = await supabase.from('therapist_shifts').insert(row).select('id').single();
  if (error) return failFrom(error);
  return done(data.id);
}

export async function deleteShift(id: string): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.from('therapist_shifts').delete().eq('id', id).select('id');
  if (error) return failFrom(error);
  return data?.length ? done(id) : fail('NOT_AUTHORIZED');
}

/** Copies every shift of the week starting fromMonday to the week starting toMonday (Bangkok dates). */
export async function copyWeekShifts(fromMonday: string, toMonday: string): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  if (!Monday.safeParse(fromMonday).success || !Monday.safeParse(toMonday).success) return fail('INVALID_INPUT');
  const supabase = await createClient();
  const from = bangkokDayRange(fromMonday).from;
  const to = bangkokDayRange(addDays(fromMonday, 6)).to;
  const { data, error } = await supabase.from('therapist_shifts').select('therapist_id, during')
    .filter('during', 'ov', `[${from},${to})`);
  if (error) return failFrom(error);
  const shiftMs = (new Date(`${toMonday}T00:00:00+07:00`).getTime() - new Date(`${fromMonday}T00:00:00+07:00`).getTime());
  const rows = (data ?? []).map((s) => {
    const r = parseRange(s.during as string);
    return {
      therapist_id: s.therapist_id,
      during: `[${new Date(new Date(r.start).getTime() + shiftMs).toISOString()},${new Date(new Date(r.end).getTime() + shiftMs).toISOString()})`,
    };
  });
  if (rows.length) {
    const ins = await supabase.from('therapist_shifts').insert(rows);
    if (ins.error) return failFrom(ins.error);
  }
  return done(`copied:${rows.length}`);
}

export async function saveTimeOff(input: TimeOffInput): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const p = TimeOffInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const supabase = await createClient();
  const row = { therapist_id: v.therapistId, during: `[${v.start},${v.end})`, kind: v.kind, note: v.note ?? null };
  if (v.id) {
    const { data, error } = await supabase.from('therapist_time_off').update(row).eq('id', v.id).select('id');
    if (error) return failFrom(error);
    return data?.length ? done(v.id) : fail('NOT_AUTHORIZED');
  }
  const { data, error } = await supabase.from('therapist_time_off').insert(row).select('id').single();
  if (error) return failFrom(error);
  return done(data.id);
}

export async function deleteTimeOff(id: string): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.from('therapist_time_off').delete().eq('id', id).select('id');
  if (error) return failFrom(error);
  return data?.length ? done(id) : fail('NOT_AUTHORIZED');
}

/** Store a therapist's photo (already resized by the browser). Owner and manager only. */
export async function uploadTherapistPhoto(form: FormData): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const id = z.uuid().safeParse(form.get('therapistId'));
  const file = form.get('file');
  if (!id.success || !(file instanceof File) || checkPhoto(file) !== 'ok') return fail('INVALID_INPUT');
  const supabase = await createClient();
  const { data: row, error } = await supabase.from('therapists').select('photo_path').eq('id', id.data).maybeSingle();
  if (error) return failFrom(error);
  if (!row) return fail('NOT_AUTHORIZED');
  const name = photoObjectName(id.data, Date.now());
  const up = await supabase.storage.from(PHOTO_BUCKET).upload(name, file, { contentType: file.type, upsert: false });
  if (up.error) return failFrom(up.error);
  const set = await supabase.from('therapists').update({ photo_path: name }).eq('id', id.data).select('id');
  if (set.error || !set.data?.length) {
    await supabase.storage.from(PHOTO_BUCKET).remove([name]);
    return set.error ? failFrom(set.error) : fail('NOT_AUTHORIZED');
  }
  if (row.photo_path) await supabase.storage.from(PHOTO_BUCKET).remove([row.photo_path]);
  return done(id.data);
}

export async function removeTherapistPhoto(therapistId: string): Promise<ActionResult> {
  if (!(await allowed())) return fail('NOT_AUTHORIZED');
  const id = z.uuid().safeParse(therapistId);
  if (!id.success) return fail('INVALID_INPUT');
  const supabase = await createClient();
  const { data: row, error } = await supabase.from('therapists').select('photo_path').eq('id', id.data).maybeSingle();
  if (error) return failFrom(error);
  if (!row) return fail('NOT_AUTHORIZED');
  const set = await supabase.from('therapists').update({ photo_path: null }).eq('id', id.data).select('id');
  if (set.error) return failFrom(set.error);
  if (row.photo_path) await supabase.storage.from(PHOTO_BUCKET).remove([row.photo_path]);
  return done(id.data);
}

/** Short-lived signed links (one hour) for the given photo paths; empty for anyone but owner and manager. */
export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length || !(await allowed())) return {};
  const supabase = await createClient();
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
  return out;
}
