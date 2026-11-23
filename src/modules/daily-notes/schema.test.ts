import { describe, expect, it, beforeEach } from 'vitest';
import {
  createDailyNoteSchema,
  isMissingDailyNotesTable,
  MAX_NOTE_LENGTH,
  removeDailyNoteSchema,
} from './schema';
import {
  addFallbackNote,
  listFallbackNotes,
  removeFallbackNote,
  resetFallbackNotesForTest,
} from './fallbackStore';

describe('daily notes schema', () => {
  it('trims valid body and defaults tone to note', () => {
    const parsed = createDailyNoteSchema.safeParse({
      body: '  VIP couple arriving at 14:00 — prepare lotus tea  ',
      tone: 'alert',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.body).toBe('VIP couple arriving at 14:00 — prepare lotus tea');
      expect(parsed.data.tone).toBe('alert');
    }
  });

  it('rejects empty, whitespace-only, or oversized bodies', () => {
    expect(createDailyNoteSchema.safeParse({ body: '   ', tone: 'note' }).success).toBe(false);
    expect(createDailyNoteSchema.safeParse({ body: 'a'.repeat(MAX_NOTE_LENGTH + 1), tone: 'note' }).success).toBe(false);
  });

  it('rejects invalid tones and non-uuid ids', () => {
    expect(createDailyNoteSchema.safeParse({ body: 'Hello', tone: 'urgent' }).success).toBe(false);
    expect(removeDailyNoteSchema.safeParse({ id: 'not-a-uuid' }).success).toBe(false);
    expect(removeDailyNoteSchema.safeParse({ id: '123e4567-e89b-12d3-a456-426614174000' }).success).toBe(true);
  });

  it('identifies missing table errors without swallowing auth errors', () => {
    expect(isMissingDailyNotesTable({ code: '42P01', message: 'relation "public.staff_daily_notes" does not exist' })).toBe(true);
    expect(isMissingDailyNotesTable({ code: 'PGRST205', message: "Could not find the table 'public.staff_daily_notes' in the schema cache" })).toBe(true);
    expect(isMissingDailyNotesTable({ code: '42501', message: 'permission denied for table staff_daily_notes' })).toBe(false);
    expect(isMissingDailyNotesTable(null)).toBe(false);
  });
});

describe('fallback daily notes store', () => {
  beforeEach(() => {
    resetFallbackNotesForTest();
  });

  it('adds, lists by day, and removes notes', () => {
    const first = addFallbackNote({
      day: '2026-11-23',
      body: 'Room 2 oil warmer replaced.',
      tone: 'note',
      authorName: 'Owner',
    });
    const second = addFallbackNote({
      day: '2026-11-23',
      body: 'Herbal compress stock low — alert desk before 16:00.',
      tone: 'alert',
      authorName: 'Owner',
    });

    const listed = listFallbackNotes('2026-11-23');
    expect(listed.map((n) => n.id)).toEqual([second.id, first.id]);
    expect(listFallbackNotes('2026-11-22')).toEqual([]);

    expect(removeFallbackNote(first.id)).toBe(true);
    expect(listFallbackNotes('2026-11-23').map((n) => n.id)).toEqual([second.id]);
  });
});
