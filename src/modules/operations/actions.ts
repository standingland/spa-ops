'use server';

import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { bangkokDay, bangkokDayRange, parseRange } from '@/lib/time';
import type { BoardRow } from '@/modules/booking/actions';
import { rankAllocations, type Candidate } from '@/modules/booking/allocation';
import { buildToday, type RoomState, type Span, type TodayModel } from './today';
import { addStrandedRows, toBoardRow, toRoomState, type BoardDb, type RoomDb } from './mapping';
import { AbsenceInput, ForceBlockInput, ReportInput, RoomIdInput } from './schema';
import { opsConfigFrom, type Settings } from '@/modules/settings/schema';

/** Any staff role. */
export async function getRoomStates(): Promise<{ ok: true; rooms: RoomState[] } | { ok: false; code: string }> {
  if (!(await roleOrNull())) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('room_status_board', { p_now: new Date().toISOString() });
  if (error) return failFrom(error);
  return { ok: true, rooms: ((data ?? []) as RoomDb[]).map(toRoomState) };
}

/** Any staff role. `now` is the server's clock; the client never decides what "today" is. */
export async function getToday(): Promise<{ ok: true; now: string; model: TodayModel } | { ok: false; code: string }> {
  const session = await roleOrNull();
  if (!session) return fail('NOT_AUTHORIZED');
  const now = new Date().toISOString();
  const range = bangkokDayRange(bangkokDay(now));
  const from = new Date(new Date(range.from).getTime() - 12 * 3600000).toISOString();
  const instant = `[${now},${new Date(new Date(now).getTime() + 1000).toISOString()})`;
  const supabase = await createClient();

  const [board, rooms, shifts, off, stranded, cfg] = await Promise.all([
    supabase.rpc('booking_board', { p_from: from, p_to: range.to }),
    supabase.rpc('room_status_board', { p_now: now }),
    supabase.from('therapist_shifts').select('therapist_id, during').filter('during', 'ov', instant),
    supabase.from('therapist_time_off').select('therapist_id, during').filter('during', 'ov', instant),
    session.role === 'therapist' ? Promise.resolve({ data: [], error: null }) : supabase.rpc('stranded_bookings'),
    supabase.rpc('get_settings'),
  ]);
  for (const r of [board, rooms, shifts, off, stranded, cfg]) if (r.error) return failFrom(r.error);

  const rows = ((board.data ?? []) as BoardDb[]).map(toBoardRow);
  const strandedRows = (stranded.data ?? []) as { booking_id: string; reason: string }[];
  await addStrandedRows(supabase, rows, strandedRows);
  const span = (x: { therapist_id: string; during: unknown }): Span => {
    const r = parseRange(String(x.during));
    return { therapistId: x.therapist_id, start: r.start, end: r.end };
  };
  const model = buildToday({
    now, rows,
    rooms: ((rooms.data ?? []) as RoomDb[]).map(toRoomState),
    shifts: (shifts.data ?? []).map(span),
    timeOff: (off.data ?? []).map(span),
    stranded: strandedRows.map((s) => ({ bookingId: s.booking_id, reason: s.reason })),
    cfg: opsConfigFrom(cfg.data as Settings),
  });
  return { ok: true, now, model };
}

export async function markRoomReady(roomId: string): Promise<ActionResult> {
  if (!(await roleOrNull())) return fail('NOT_AUTHORIZED');
  if (!RoomIdInput.safeParse(roomId).success) return fail('INVALID_INPUT');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mark_room_ready', { p_room_id: roomId });
  if (error) return failFrom(error);
  return done(data.id);
}

export async function reportRoomIssue(input: ReportInput): Promise<ActionResult> {
  if (!(await roleOrNull())) return fail('NOT_AUTHORIZED');
  const p = ReportInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('report_room_issue', { p_room_id: p.data.roomId, p_note: p.data.note });
  if (error) return failFrom(error);
  return done(data.id);
}

export async function resolveRoomReport(id: string): Promise<ActionResult> {
  if (!(await roleOrNull('owner', 'manager', 'receptionist'))) return fail('NOT_AUTHORIZED');
  if (!RoomIdInput.safeParse(id).success) return fail('INVALID_INPUT');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('resolve_room_report', { p_id: id });
  if (error) return failFrom(error);
  return done(data.id);
}

/** Open room reports (id, room, note) for the attention list; any staff role. */
export async function getOpenReports(): Promise<{ ok: true; reports: { id: string; roomId: string; note: string }[] } | { ok: false; code: string }> {
  if (!(await roleOrNull())) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.from('room_reports').select('id, room_id, note').is('resolved_at', null).order('created_at');
  if (error) return failFrom(error);
  return { ok: true, reports: (data ?? []).map((r) => ({ id: r.id, roomId: r.room_id, note: r.note })) };
}

const MANAGERS = ['owner', 'manager'] as const;

/** Records time off even when live bookings overlap; those bookings join the reassignment queue. */
export async function recordAbsence(input: AbsenceInput): Promise<{ ok: true; affected: string[] } | { ok: false; code: string }> {
  if (!(await roleOrNull(...MANAGERS))) return fail('NOT_AUTHORIZED');
  const p = AbsenceInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('record_absence', {
    p_therapist_id: v.therapistId, p_from: v.start, p_to: v.end, p_kind: v.kind, ...(v.note ? { p_note: v.note } : {}),
  });
  if (error) return failFrom(error);
  return { ok: true, affected: (data ?? []) as string[] };
}

export async function forceRoomBlock(input: ForceBlockInput): Promise<{ ok: true; affected: string[] } | { ok: false; code: string }> {
  if (!(await roleOrNull(...MANAGERS))) return fail('NOT_AUTHORIZED');
  const p = ForceBlockInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('force_room_block', {
    p_room_id: v.roomId, p_from: v.start, p_to: v.end, p_kind: v.kind, ...(v.note ? { p_note: v.note } : {}),
  });
  if (error) return failFrom(error);
  return { ok: true, affected: (data ?? []) as string[] };
}

/** Ranked alternatives for a stranded booking at its original time. */
export async function suggestReassign(bookingId: string): Promise<{ ok: true; booking: BoardRow; candidates: Candidate[] } | { ok: false; code: string }> {
  if (!(await roleOrNull('owner', 'manager', 'receptionist'))) return fail('NOT_AUTHORIZED');
  if (!RoomIdInput.safeParse(bookingId).success) return fail('INVALID_INPUT');
  const supabase = await createClient();
  const { data: b, error } = await supabase.from('bookings').select('id, service_id, service_during, customer_id').eq('id', bookingId).maybeSingle();
  if (error) return failFrom(error);
  if (!b) return fail('NOT_AUTHORIZED');
  const start = parseRange(b.service_during as string).start;
  const [board, cand, cust] = await Promise.all([
    supabase.rpc('booking_board', { p_from: start, p_to: new Date(new Date(start).getTime() + 60000).toISOString() }),
    supabase.rpc('available_candidates', { p_service_id: b.service_id, p_start: start, p_exclude_booking: b.id }),
    supabase.from('customers').select('preferred_therapist_id').eq('id', b.customer_id).maybeSingle(),
  ]);
  if (board.error) return failFrom(board.error);
  if (cand.error) return failFrom(cand.error);
  const row = ((board.data ?? []) as BoardDb[]).find((r) => r.booking_id === bookingId);
  if (!row) return fail('NOT_AUTHORIZED');
  const candidates = ((cand.data ?? []) as { therapist_id: string; position_id: string; room_id: string; therapist_minutes_today: number; room_sort: number }[]).map((r): Candidate => ({
    therapistId: r.therapist_id, positionId: r.position_id, roomId: r.room_id, therapistMinutesToday: r.therapist_minutes_today, roomSort: r.room_sort,
  }));
  return { ok: true, booking: toBoardRow(row), candidates: rankAllocations(candidates, { preferredTherapistId: cust.data?.preferred_therapist_id ?? undefined }) };
}
