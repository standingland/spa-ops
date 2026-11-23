import { z } from 'zod';

export const NOTE_TONES = ['note', 'alert', 'reminder'] as const;
export type NoteTone = (typeof NOTE_TONES)[number];

export const MAX_NOTE_LENGTH = 400;
export const MAX_ACTIVE_NOTES = 20;

export type DailyNote = {
  id: string;
  day: string;
  body: string;
  tone: NoteTone;
  authorName: string;
  createdAt: string;
};

export const createDailyNoteSchema = z.object({
  body: z
    .string()
    .transform((s) => s.replace(/\r\n/g, '\n').trim())
    .refine((s) => s.length >= 1 && s.length <= MAX_NOTE_LENGTH, {
      message: 'INVALID_INPUT',
    }),
  tone: z.enum(NOTE_TONES).default('note'),
});

export const removeDailyNoteSchema = z.object({
  id: z.string().uuid(),
});

export type CreateDailyNoteInput = {
  body: string;
  tone: NoteTone;
};

/**
 * Returns true only when Postgres/PostgREST reports that the staff_daily_notes table
 * has not been migrated yet on the connected Supabase project. Never matches RLS/auth errors.
 */
export function isMissingDailyNotesTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === '42P01' || err.code === 'PGRST205') return true;
  const msg = (err.message ?? '').toLowerCase();
  return msg.includes('staff_daily_notes') && (msg.includes('does not exist') || msg.includes('schema cache'));
}
