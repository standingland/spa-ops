import { test, expect } from 'vitest';
import { buildToday, type RoomState } from './today';
import { roomAction } from './roomAction';
import type { BoardRow } from '@/modules/booking/actions';

const NOW = '2030-01-15T05:00:00Z';
const row = (over: Partial<BoardRow> = {}): BoardRow => ({
  bookingId: 'b', version: 1, status: 'confirmed', source: 'advance',
  startsAt: '2030-01-15T06:00:00Z', endsAt: '2030-01-15T07:00:00Z', roomFreeAt: '2030-01-15T07:15:00Z',
  therapistId: 't', roomId: 'r', positionId: 'p', partyId: 'x', serviceId: 's', customerId: null, customerDisplayName: 'C',
  checkedInAt: null, startedAt: null, completedAt: null, expectedEnd: null, ...over,
});
const room = (over: Partial<RoomState> = {}): RoomState => ({
  roomId: 'r', status: 'available', currentBookingId: null, currentTherapistId: null, currentCustomerDisplayName: null, expectedEnd: null,
  nextBookingId: null, nextStartsAt: null, turnoverStartedAt: null, turnoverDueAt: null, blockKind: null, blockNote: null, openReports: 0, ...over,
});
const model = (rows: BoardRow[], rooms: RoomState[]) => buildToday({ now: NOW, rows, rooms, shifts: [], timeOff: [], stranded: [] });

test('an occupied room whose booking is in treatment offers Finish', () => {
  const r = row({ bookingId: 'x', status: 'in_treatment', expectedEnd: '2030-01-15T05:30:00Z' });
  const rm = room({ status: 'occupied', currentBookingId: 'x' });
  expect(roomAction(rm, model([r], [rm]))).toEqual({ kind: 'finish', row: r });
});
test('a room with a checked-in booking waiting for it offers Start', () => {
  const w = row({ bookingId: 'w', status: 'checked_in', roomId: 'r', checkedInAt: '2030-01-15T04:55:00Z' });
  const other = row({ bookingId: 'o', status: 'checked_in', roomId: 'other' });
  const rm = room({ status: 'reserved' });
  expect(roomAction(rm, model([other, w], [rm]))).toEqual({ kind: 'start', row: w });
});
test('a cleaning room with a due time offers Mark ready', () => {
  const rm = room({ status: 'cleaning', turnoverStartedAt: '2030-01-15T04:50:00Z', turnoverDueAt: '2030-01-15T05:05:00Z' });
  expect(roomAction(rm, model([], [rm]))).toEqual({ kind: 'ready' });
});
test('an available room with nothing waiting has no action', () => {
  const rm = room();
  expect(roomAction(rm, model([row({ status: 'confirmed' })], [rm]))).toBeNull();
});
test('an out-of-service room has no action even with someone waiting', () => {
  const rm = room({ status: 'out_of_service', blockKind: 'maintenance' });
  expect(roomAction(rm, model([row({ bookingId: 'w', status: 'checked_in' })], [rm]))).toBeNull();
});
