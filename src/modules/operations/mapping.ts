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
