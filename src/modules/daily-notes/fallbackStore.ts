import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAX_ACTIVE_NOTES, type DailyNote, type NoteTone } from './schema';

const STORE_PATH = path.join(os.tmpdir(), 'banyan-spa-staff-daily-notes.json');

type GlobalStore = typeof globalThis & {
  __banyanDailyNotes?: DailyNote[];
};

function readDisk(): DailyNote[] {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is DailyNote =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        typeof item.day === 'string' &&
        typeof item.body === 'string' &&
        (item.tone === 'note' || item.tone === 'alert' || item.tone === 'reminder') &&
        typeof item.authorName === 'string' &&
        typeof item.createdAt === 'string',
    );
  } catch {
    return [];
  }
}

function writeDisk(notes: DailyNote[]): void {
  try {
    const tmp = `${STORE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(notes), 'utf8');
    fs.renameSync(tmp, STORE_PATH);
  } catch {
    // In-memory store remains authoritative if tmpdir is read-only.
  }
}

function loadAll(): DailyNote[] {
  const g = globalThis as GlobalStore;
  if (!g.__banyanDailyNotes) {
    g.__banyanDailyNotes = readDisk();
  }
  return g.__banyanDailyNotes;
}

function saveAll(notes: DailyNote[]): void {
  const g = globalThis as GlobalStore;
  g.__banyanDailyNotes = notes;
  writeDisk(notes);
}

/** Fallback reads when staff_daily_notes migration has not yet been pushed to remote Supabase. */
export function listFallbackNotes(day: string): DailyNote[] {
  return loadAll()
    .filter((n) => n.day === day)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_ACTIVE_NOTES);
}

export function addFallbackNote(params: {
  day: string;
  body: string;
  tone: NoteTone;
  authorName: string;
}): DailyNote {
  const note: DailyNote = {
    id: crypto.randomUUID(),
    day: params.day,
    body: params.body,
    tone: params.tone,
    authorName: params.authorName,
    createdAt: new Date().toISOString(),
  };
  const existing = loadAll().filter((n) => n.day === params.day);
  const next = [note, ...existing].slice(0, MAX_ACTIVE_NOTES);
  saveAll(next);
  return note;
}

export function removeFallbackNote(id: string): boolean {
  const all = loadAll();
  const next = all.filter((n) => n.id !== id);
  if (next.length === all.length) return false;
  saveAll(next);
  return true;
}

export function resetFallbackNotesForTest(): void {
  const g = globalThis as GlobalStore;
  g.__banyanDailyNotes = [];
  try {
    fs.unlinkSync(STORE_PATH);
  } catch {
    // Ignore when file does not exist.
  }
}
