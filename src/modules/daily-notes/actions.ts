'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { bangkokDay } from '@/lib/time';
import { fail, failFrom, type Failure } from '@/lib/action';
import { roleOrNull } from '@/modules/identity/session';
import {
  createDailyNoteSchema,
  isMissingDailyNotesTable,
  MAX_ACTIVE_NOTES,
  removeDailyNoteSchema,
  type CreateDailyNoteInput,
  type DailyNote,
  type NoteTone,
} from './schema';
import { addFallbackNote, listFallbackNotes, removeFallbackNote } from './fallbackStore';

type DailyNoteRow = {
  id: string;
  day: string;
  body: string;
  tone: string;
  author_name: string;
  created_at: string;
};

function mapRow(row: DailyNoteRow): DailyNote {
  const tone: NoteTone = row.tone === 'alert' || row.tone === 'reminder' ? row.tone : 'note';
  return {
    id: row.id,
    day: row.day,
    body: row.body,
    tone,
    authorName: row.author_name,
    createdAt: row.created_at,
  };
}

function revalidateDailyViews() {
  revalidatePath('/[locale]/admin', 'page');
  revalidatePath('/[locale]/today', 'page');
}

/** Any active staff role can read today's posted notes. */
export async function listDailyNotes(day?: string): Promise<
  { ok: true; day: string; notes: DailyNote[] } | Failure
> {
  const session = await roleOrNull();
  if (!session) return fail('NOT_AUTHORIZED');

  const targetDay = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : bangkokDay(new Date());
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('staff_daily_notes')
    .select('id, day, body, tone, author_name, created_at')
    .eq('day', targetDay)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_ACTIVE_NOTES);

  if (error) {
    if (isMissingDailyNotesTable(error)) {
      return { ok: true, day: targetDay, notes: listFallbackNotes(targetDay) };
    }
    return failFrom(error);
  }

  return {
    ok: true,
    day: targetDay,
    notes: ((data ?? []) as DailyNoteRow[]).map(mapRow),
  };
}

/** Owner only: post a sticky-note update or alert for today's shift. */
export async function postDailyNote(input: CreateDailyNoteInput): Promise<
  { ok: true; note: DailyNote } | Failure
> {
  const session = await roleOrNull('owner');
  if (!session) return fail('NOT_AUTHORIZED');

  const parsed = createDailyNoteSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT');

  const day = bangkokDay(new Date());
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from('staff')
    .select('display_name')
    .eq('user_id', session.userId)
    .maybeSingle();

  const authorName = staff?.display_name?.trim() || 'Owner';

  const { data, error } = await supabase
    .from('staff_daily_notes')
    .insert({
      day,
      body: parsed.data.body,
      tone: parsed.data.tone,
      author_name: authorName,
    })
    .select('id, day, body, tone, author_name, created_at')
    .single();

  if (error) {
    if (isMissingDailyNotesTable(error)) {
      const note = addFallbackNote({
        day,
        body: parsed.data.body,
        tone: parsed.data.tone,
        authorName,
      });
      revalidateDailyViews();
      return { ok: true, note };
    }
    return failFrom(error);
  }

  revalidateDailyViews();
  return { ok: true, note: mapRow(data as DailyNoteRow) };
}

/** Owner only: remove/archive a posted daily note. */
export async function removeDailyNote(id: string): Promise<
  { ok: true; id: string } | Failure
> {
  const session = await roleOrNull('owner');
  if (!session) return fail('NOT_AUTHORIZED');

  const parsed = removeDailyNoteSchema.safeParse({ id });
  if (!parsed.success) return fail('INVALID_INPUT');

  const supabase = await createClient();
  const { error } = await supabase
    .from('staff_daily_notes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .is('archived_at', null);

  if (error) {
    if (isMissingDailyNotesTable(error)) {
      removeFallbackNote(parsed.data.id);
      revalidateDailyViews();
      return { ok: true, id: parsed.data.id };
    }
    return failFrom(error);
  }

  revalidateDailyViews();
  return { ok: true, id: parsed.data.id };
}
