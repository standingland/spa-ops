import { bangkokDay, bangkokDayRange } from '@/lib/time';
import type { BoardRow } from '@/modules/booking/actions';

export type RoomStatus = 'available' | 'reserved' | 'occupied' | 'cleaning' | 'out_of_service';
export type RoomState = {
  roomId: string; status: RoomStatus;
  currentBookingId: string | null; currentTherapistId: string | null; currentCustomerDisplayName: string | null; expectedEnd: string | null;
  nextBookingId: string | null; nextStartsAt: string | null;
  turnoverStartedAt: string | null; turnoverDueAt: string | null;
  blockKind: 'maintenance' | 'cleaning' | 'closed' | null; blockNote: string | null; openReports: number;
};
export type Span = { therapistId: string; start: string; end: string };
export type OpsConfig = { arrivalWindowMin: number; lateArrivalMin: number; endingSoonMin: number; roomPrepWarnMin: number };
/** Constants for now; Plan 3 moves them into an owner-editable settings table. */
export const OPS_DEFAULTS: OpsConfig = { arrivalWindowMin: 60, lateArrivalMin: 10, endingSoonMin: 10, roomPrepWarnMin: 15 };
export type AttentionKind = 'needs_reassignment' | 'overrunning' | 'room_not_ready' | 'late_arrival' | 'turnover_overdue' | 'room_report';
export type Attention = { kind: AttentionKind; bookingId?: string; roomId?: string; since: string };
export type TodayModel = {
  day: string;
  counts: { reservations: number; cancelled: number; noShow: number } & Record<RoomStatus, number>;
  arrivals: BoardRow[]; waiting: BoardRow[]; inTreatment: BoardRow[]; endingSoon: BoardRow[];
  awaitingCleaning: RoomState[]; cancellations: BoardRow[];
  therapists: { therapistId: string; state: 'in_treatment' | 'on_break' | 'free' }[];
  attention: Attention[];
  /** The bookings the attention items refer to (they may start on another day). */
  attentionRows: BoardRow[];
};

const ms = (iso: string) => Date.parse(iso);
const KIND_ORDER: AttentionKind[] = ['needs_reassignment', 'overrunning', 'room_not_ready', 'late_arrival', 'turnover_overdue', 'room_report'];

/** A pure function of the read models and the server's clock (`now`); it never reads the system clock. */
export function buildToday(input: {
  now: string; rows: BoardRow[]; rooms: RoomState[]; shifts: Span[]; timeOff: Span[];
  stranded: { bookingId: string; reason: string }[]; cfg?: OpsConfig;
}): TodayModel {
  const cfg = input.cfg ?? OPS_DEFAULTS;
  const now = ms(input.now);
  const min = (n: number) => n * 60000;
  const day = bangkokDay(input.now);
  const range = bangkokDayRange(day);
  const todayStart = ms(range.from);
  const todayEnd = ms(range.to);
  const startsToday = (r: BoardRow) => ms(r.startsAt) >= todayStart && ms(r.startsAt) < todayEnd;
  const byStart = (a: BoardRow, b: BoardRow) => ms(a.startsAt) - ms(b.startsAt);
  const endOf = (r: BoardRow) => ms(r.expectedEnd ?? r.endsAt);

  const today = input.rows.filter(startsToday);
  const statusCounts: Record<RoomStatus, number> = { available: 0, reserved: 0, occupied: 0, cleaning: 0, out_of_service: 0 };
  for (const r of input.rooms) statusCounts[r.status]++;

  const upcoming = input.rows.filter((r) => r.status === 'requested' || r.status === 'confirmed');
  const arrivals = upcoming.filter((r) => ms(r.startsAt) <= now + min(cfg.arrivalWindowMin)).sort(byStart);
  const waiting = input.rows.filter((r) => r.status === 'checked_in')
    .sort((a, b) => ms(a.checkedInAt ?? a.startsAt) - ms(b.checkedInAt ?? b.startsAt));
  const inTreatment = input.rows.filter((r) => r.status === 'in_treatment').sort((a, b) => endOf(a) - endOf(b));
  const endingSoon = inTreatment.filter((r) => endOf(r) <= now + min(cfg.endingSoonMin));
  const awaitingCleaning = input.rooms.filter((r) => r.status === 'cleaning' && r.turnoverDueAt !== null)
    .sort((a, b) => ms(a.turnoverDueAt!) - ms(b.turnoverDueAt!));
  const cancellations = today.filter((r) => r.status === 'cancelled' || r.status === 'no_show');

  const contains = (s: Span) => ms(s.start) <= now && now < ms(s.end);
  const onShift = [...new Set(input.shifts.filter(contains).map((s) => s.therapistId))].sort();
  const therapists = onShift.map((id) => ({
    therapistId: id,
    state: (inTreatment.some((r) => r.therapistId === id) ? 'in_treatment'
      : input.timeOff.some((o) => o.therapistId === id && contains(o)) ? 'on_break' : 'free') as 'in_treatment' | 'on_break' | 'free',
  }));

  const attention: Attention[] = [];
  for (const s of input.stranded) {
    const r = input.rows.find((x) => x.bookingId === s.bookingId);
    attention.push({ kind: 'needs_reassignment', bookingId: s.bookingId, since: r ? r.startsAt : input.now });
  }
  for (const r of inTreatment) if (endOf(r) < now) attention.push({ kind: 'overrunning', bookingId: r.bookingId, since: r.expectedEnd ?? r.endsAt });
  for (const r of input.rooms) {
    if ((r.status === 'occupied' || r.status === 'cleaning' || r.status === 'out_of_service') && r.nextStartsAt && ms(r.nextStartsAt) <= now + min(cfg.roomPrepWarnMin))
      attention.push({ kind: 'room_not_ready', roomId: r.roomId, bookingId: r.nextBookingId ?? undefined, since: r.nextStartsAt });
  }
  for (const r of upcoming) if (ms(r.startsAt) < now - min(cfg.lateArrivalMin)) attention.push({ kind: 'late_arrival', bookingId: r.bookingId, since: r.startsAt });
  for (const r of input.rooms) if (r.status === 'cleaning' && r.turnoverDueAt && ms(r.turnoverDueAt) < now) attention.push({ kind: 'turnover_overdue', roomId: r.roomId, since: r.turnoverDueAt });
  for (const r of input.rooms) if (r.openReports > 0) attention.push({ kind: 'room_report', roomId: r.roomId, since: input.now });
  attention.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || ms(a.since) - ms(b.since));

  return {
    day,
    counts: {
      reservations: today.filter((r) => r.status !== 'cancelled' && r.status !== 'no_show').length,
      cancelled: today.filter((r) => r.status === 'cancelled').length,
      noShow: today.filter((r) => r.status === 'no_show').length,
      ...statusCounts,
    },
    arrivals, waiting, inTreatment, endingSoon, awaitingCleaning, cancellations, therapists, attention,
    attentionRows: input.rows.filter((r) => attention.some((x) => x.bookingId === r.bookingId)),
  };
}
