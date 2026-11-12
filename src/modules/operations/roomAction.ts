import type { BoardRow } from '@/modules/booking/actions';
import type { RoomState, TodayModel } from './today';

export type RoomAction = { kind: 'start' | 'finish'; row: BoardRow } | { kind: 'ready' } | null;

/** The one thing a room row offers: Finish its treatment, Start the guest waiting for it, or Mark it ready. */
export function roomAction(room: RoomState, model: TodayModel): RoomAction {
  if (room.status === 'occupied') {
    const row = model.inTreatment.find((r) => r.bookingId === room.currentBookingId);
    return row ? { kind: 'finish', row } : null;
  }
  if (room.status === 'cleaning') return room.turnoverDueAt ? { kind: 'ready' } : null;
  if (room.status === 'out_of_service') return null;
  const row = model.waiting.find((r) => r.roomId === room.roomId && r.status === 'checked_in');
  return row ? { kind: 'start', row } : null;
}
