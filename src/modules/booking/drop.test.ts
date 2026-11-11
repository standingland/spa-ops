import { test, expect } from 'vitest';
import { moveFromDrop, isDraggable } from './drop';
import type { BoardRow } from './actions';

const blankRow: BoardRow = {
  bookingId: '', version: 1, status: 'confirmed', source: 'advance', startsAt: '2030-01-15T03:00:00Z', endsAt: '2030-01-15T04:00:00Z', roomFreeAt: '2030-01-15T04:15:00Z',
  therapistId: '', roomId: '', positionId: '', partyId: '', serviceId: '', customerId: null, customerDisplayName: '',
  checkedInAt: null, startedAt: null, completedAt: null, expectedEnd: null,
};
const rooms = [{ id: 'r1', code: 'R1', display_name: '', zone: null, room_positions: [{ id: 'p1', label: '1', active: true }] },
               { id: 'r2', code: 'R2', display_name: '', zone: null, room_positions: [{ id: 'p2b', label: '2', active: true }, { id: 'p2a', label: '1', active: false }] }];
const k = { ...blankRow, bookingId: 'k', version: 3, therapistId: 't1', roomId: 'r1', positionId: 'p1', status: 'confirmed' } as BoardRow;

test('dropping on a therapist column changes therapist and snaps to five minutes', () => {
  expect(moveFromDrop(k, { view: 'therapists', columnId: 't2', day: '2030-01-15', minutesFromMidnight: 843 }, rooms))
    .toEqual({ bookingId: 'k', start: '2030-01-15T07:05:00.000Z', therapistId: 't2', positionId: 'p1', expectedVersion: 3 });
});
test('dropping on another room picks its first active position; same room keeps the position', () => {
  expect(moveFromDrop(k, { view: 'rooms', columnId: 'r2', day: '2030-01-15', minutesFromMidnight: 600 }, rooms).positionId).toBe('p2b');
  expect(moveFromDrop(k, { view: 'rooms', columnId: 'r1', day: '2030-01-15', minutesFromMidnight: 600 }, rooms)).toMatchObject({ positionId: 'p1', therapistId: 't1' });
});
test('only desk roles drag, and only bookings that have not started', () => {
  expect(isDraggable(k, 'receptionist')).toBe(true);
  expect(isDraggable(k, 'therapist')).toBe(false);
  expect(isDraggable({ ...k, status: 'in_treatment' }, 'manager')).toBe(false);
});
