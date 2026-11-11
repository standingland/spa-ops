import { bangkokDayRange } from '@/lib/time';
import type { BoardRow } from './actions';
import type { MoveBookingInput } from './schema';
import type { Role, RoomOpt } from './components/types';

export type Drop = { view: 'therapists' | 'rooms'; columnId: string; day: string; minutesFromMidnight: number };

/** Turns a drop on a calendar column into the arguments of moveBooking. Times snap to five minutes (Bangkok). */
export function moveFromDrop(row: BoardRow, drop: Drop, rooms: RoomOpt[]): MoveBookingInput {
  const snapped = Math.round(drop.minutesFromMidnight / 5) * 5;
  const start = new Date(new Date(bangkokDayRange(drop.day).from).getTime() + snapped * 60000).toISOString();
  let therapistId = row.therapistId;
  let positionId = row.positionId;
  if (drop.view === 'therapists') {
    therapistId = drop.columnId;
  } else if (row.roomId !== drop.columnId) {
    const room = rooms.find((r) => r.id === drop.columnId);
    const first = room?.room_positions.filter((p) => p.active).sort((a, b) => a.label.localeCompare(b.label))[0];
    if (first) positionId = first.id;
  }
  return { bookingId: row.bookingId, start, therapistId, positionId, expectedVersion: row.version };
}

/** Desk roles only, and only bookings that have not started treatment. */
export function isDraggable(row: BoardRow, role: Role): boolean {
  return role !== 'therapist' && (row.status === 'requested' || row.status === 'confirmed' || row.status === 'checked_in');
}
