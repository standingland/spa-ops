'use server';

import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { bangkokDay, bangkokDayRange } from '@/lib/time';
import type { BoardRow } from '@/modules/booking/actions';
import type { BookingStatus } from '@/modules/booking/schema';
import { buildToday, type RoomState, type Span, type TodayModel } from './today';
import { toRoomState, type RoomDb } from './mapping';
import { ReportInput, RoomIdInput } from './schema';

type BoardDb = {
  booking_id: string; version: number; status: BookingStatus; source: 'advance' | 'walk_in'; starts_at: string; ends_at: string; room_free_at: string;
  therapist_id: string; room_id: string; position_id: string; party_id: string; service_id: string; customer_id: string | null; customer_display_name: string;
  checked_in_at: string | null; started_at: string | null; completed_at: string | null; expected_end: string | null;
};

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

  const [board, rooms, shifts, off, stranded] = await Promise.all([
    supabase.rpc('booking_board', { p_from: from, p_to: range.to }),
    supabase.rpc('room_status_board', { p_now: now }),
    supabase.from('therapist_shifts').select('therapist_id, during').filter('during', 'ov', instant),
    supabase.from('therapist_time_off').select('therapist_id, during').filter('during', 'ov', instant),
    session.role === 'therapist' ? Promise.resolve({ data: [], error: null }) : supabase.rpc('stranded_bookings'),
  ]);
  for (const r of [board, rooms, shifts, off, stranded]) if (r.error) return failFrom(r.error);

  const rows = ((board.data ?? []) as BoardDb[]).map((r): BoardRow => ({
    bookingId: r.booking_id, version: r.version, status: r.status, source: r.source,
    startsAt: r.starts_at, endsAt: r.ends_at, roomFreeAt: r.room_free_at,
    therapistId: r.therapist_id, roomId: r.room_id, positionId: r.position_id, partyId: r.party_id, serviceId: r.service_id,
    customerId: r.customer_id, customerDisplayName: r.customer_display_name,
    checkedInAt: r.checked_in_at, startedAt: r.started_at, completedAt: r.completed_at, expectedEnd: r.expected_end,
  }));
  const span = (x: { therapist_id: string; during: unknown }): Span => {
    const [a, b] = String(x.during).slice(1, -1).split(',').map((s) => new Date(s.replace(/"/g, '').trim().replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).toISOString());
    return { therapistId: x.therapist_id, start: a, end: b };
  };
  const model = buildToday({
    now, rows,
    rooms: ((rooms.data ?? []) as RoomDb[]).map(toRoomState),
    shifts: (shifts.data ?? []).map(span),
    timeOff: (off.data ?? []).map(span),
    stranded: ((stranded.data ?? []) as { booking_id: string; reason: string }[]).map((s) => ({ bookingId: s.booking_id, reason: s.reason })),
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
