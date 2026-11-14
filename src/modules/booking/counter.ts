import type { BoardRow } from './actions';

/** Clip cross-midnight bookings to this Bangkok day without widening short slots. */
export function counterSlot(row: Pick<BoardRow, 'startsAt' | 'endsAt'>, day: string) {
  const origin = Date.parse(`${day}T00:00:00+07:00`);
  const start = Math.max(0, (Date.parse(row.startsAt) - origin) / 60000);
  const end = Math.min(1440, (Date.parse(row.endsAt) - origin) / 60000);
  return { start, end, visible: end > start };
}

export const counterVisible = (r: Pick<BoardRow, 'status'>) => r.status !== 'cancelled' && r.status !== 'no_show';
