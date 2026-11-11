import type { SupabaseClient } from '@supabase/supabase-js';
import { parseRange } from '@/lib/time';
import type { BoardRow } from '@/modules/booking/actions';
import type { BookingStatus } from '@/modules/booking/schema';
import type { RoomState, RoomStatus } from './today';

export type RoomDb = {
  room_id: string; status: RoomStatus; current_booking_id: string | null; current_therapist_id: string | null;
  current_customer_display_name: string | null; expected_end: string | null; next_booking_id: string | null; next_starts_at: string | null;
  turnover_started_at: string | null; turnover_due_at: string | null; block_kind: RoomState['blockKind']; block_note: string | null; open_reports: number;
};

export const toRoomState = (r: RoomDb): RoomState => ({
  roomId: r.room_id, status: r.status, currentBookingId: r.current_booking_id, currentTherapistId: r.current_therapist_id,
  currentCustomerDisplayName: r.current_customer_display_name, expectedEnd: r.expected_end,
  nextBookingId: r.next_booking_id, nextStartsAt: r.next_starts_at, turnoverStartedAt: r.turnover_started_at, turnoverDueAt: r.turnover_due_at,
  blockKind: r.block_kind, blockNote: r.block_note, openReports: r.open_reports,
});

export type BoardDb = {
  booking_id: string; version: number; status: BookingStatus; source: 'advance' | 'walk_in'; starts_at: string; ends_at: string; room_free_at: string;
  therapist_id: string; room_id: string; position_id: string; party_id: string; service_id: string; customer_id: string | null; customer_display_name: string;
  checked_in_at: string | null; started_at: string | null; completed_at: string | null; expected_end: string | null;
};

export const toBoardRow = (r: BoardDb): BoardRow => ({
  bookingId: r.booking_id, version: r.version, status: r.status, source: r.source,
  startsAt: r.starts_at, endsAt: r.ends_at, roomFreeAt: r.room_free_at,
  therapistId: r.therapist_id, roomId: r.room_id, positionId: r.position_id, partyId: r.party_id, serviceId: r.service_id,
  customerId: r.customer_id, customerDisplayName: r.customer_display_name,
  checkedInAt: r.checked_in_at, startedAt: r.started_at, completedAt: r.completed_at, expectedEnd: r.expected_end,
});

type BookingDb = {
  id: string; version: number; status: BookingStatus; source: 'advance' | 'walk_in'; service_during: string; room_during: string;
  therapist_id: string; room_id: string; position_id: string; party_id: string; service_id: string; customer_id: string;
  checked_in_at: string | null; started_at: string | null; completed_at: string | null; customers: { display_name: string } | null;
};

/** Stranded bookings can be on another day; fetch them so the attention list can name them (desk roles only). */
export async function addStrandedRows(supabase: SupabaseClient, rows: BoardRow[], stranded: { booking_id: string }[]) {
  const missing = stranded.map((s) => s.booking_id).filter((id) => !rows.some((r) => r.bookingId === id));
  if (!missing.length) return;
  const { data } = await supabase.from('bookings')
    .select('id, version, status, source, service_during, room_during, therapist_id, room_id, position_id, party_id, service_id, customer_id, checked_in_at, started_at, completed_at, customers(display_name)')
    .in('id', missing);
  for (const b of (data ?? []) as unknown as BookingDb[]) {
    const s = parseRange(b.service_during);
    rows.push({
      bookingId: b.id, version: b.version, status: b.status, source: b.source, startsAt: s.start, endsAt: s.end, roomFreeAt: parseRange(b.room_during).end,
      therapistId: b.therapist_id, roomId: b.room_id, positionId: b.position_id, partyId: b.party_id, serviceId: b.service_id,
      customerId: b.customer_id, customerDisplayName: b.customers?.display_name ?? '',
      checkedInAt: b.checked_in_at, startedAt: b.started_at, completedAt: b.completed_at, expectedEnd: null,
    });
  }
}
