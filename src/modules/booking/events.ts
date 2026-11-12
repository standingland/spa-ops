import { BOOKING_STATUSES, type BookingStatus } from './schema';

export type BookingEventView = {
  at: string;
  kind: 'created' | 'status_changed' | 'rescheduled' | 'reassigned';
  from?: BookingStatus;
  to?: BookingStatus;
};

const KINDS: BookingEventView['kind'][] = ['created', 'status_changed', 'rescheduled', 'reassigned'];

/** The status in a booking_events before/after snapshot. This is the ONLY key read: the snapshot also carries the booking note. */
function statusOf(snapshot: unknown): BookingStatus | undefined {
  if (typeof snapshot !== 'object' || snapshot === null) return undefined;
  const s = (snapshot as { status?: unknown }).status;
  return BOOKING_STATUSES.find((x) => x === s);
}

/** A booking_events row reduced to what the screen may show. Runs on the server so no snapshot reaches the client. */
export function describeEvent(e: { at: string; kind: string; before: unknown; after: unknown }): BookingEventView {
  const kind = KINDS.find((k) => k === e.kind);
  if (!kind) throw new Error(`unknown booking event kind: ${e.kind}`);
  const view: BookingEventView = { at: e.at, kind };
  if (kind === 'status_changed') {
    const from = statusOf(e.before);
    if (from) view.from = from;
  }
  if (kind === 'status_changed' || kind === 'created') {
    const to = statusOf(e.after);
    if (to) view.to = to;
  }
  return view;
}
