import { test, expect } from 'vitest';
import { buildToday, type RoomState } from './today';
import type { BoardRow } from '@/modules/booking/actions';
import { errorMessageKey } from '@/lib/errors';
import th from '../../../messages/th.json';
import en from '../../../messages/en.json';

const NOW = '2030-01-15T05:00:00Z'; // 12:00 in Bangkok

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
const run = (i: Partial<Parameters<typeof buildToday>[0]>) => buildToday({ now: NOW, rows: [], rooms: [], shifts: [], timeOff: [], stranded: [], ...i });

test('arrivals include the next hour and late customers, not later ones', () => {
  const m = run({ rows: [row({ bookingId: 'late', startsAt: '2030-01-15T04:40:00Z' }), row({ bookingId: 'soon', startsAt: '2030-01-15T05:59:00Z' }), row({ bookingId: 'later', startsAt: '2030-01-15T07:00:00Z' })] });
  expect(m.arrivals.map((r) => r.bookingId)).toEqual(['late', 'soon']);
  expect(m.attention).toEqual([{ kind: 'late_arrival', bookingId: 'late', since: '2030-01-15T04:40:00Z' }]);
  expect(m.counts.reservations).toBe(3);
});
test('a treatment that began before midnight is still in progress the next day', () => {
  const m = buildToday({ now: '2030-01-15T17:20:00Z', rows: [row({ bookingId: 'x', status: 'in_treatment', startsAt: '2030-01-15T16:30:00Z', expectedEnd: '2030-01-15T17:30:00Z' })], rooms: [], shifts: [], timeOff: [], stranded: [] });
  expect(m.day).toBe('2030-01-16');
  expect(m.inTreatment.map((r) => r.bookingId)).toEqual(['x']);
  expect(m.endingSoon.map((r) => r.bookingId)).toEqual(['x']);
  expect(m.counts.reservations).toBe(0);
});
test('overrun, room not ready, overdue cleaning and reports are raised in priority order', () => {
  const m = run({
    rows: [row({ bookingId: 'o', status: 'in_treatment', expectedEnd: '2030-01-15T04:50:00Z' })],
    rooms: [room({ roomId: 'r1', status: 'occupied', nextStartsAt: '2030-01-15T05:10:00Z' }),
            room({ roomId: 'r2', status: 'cleaning', turnoverStartedAt: '2030-01-15T04:30:00Z', turnoverDueAt: '2030-01-15T04:45:00Z' }),
            room({ roomId: 'r3', openReports: 2 })],
    stranded: [{ bookingId: 's', reason: 'therapist_time_off' }],
  });
  expect(m.attention.map((a) => a.kind)).toEqual(['needs_reassignment', 'overrunning', 'room_not_ready', 'turnover_overdue', 'room_report']);
  expect(m.awaitingCleaning.map((r) => r.roomId)).toEqual(['r2']);
  expect([m.counts.occupied, m.counts.cleaning, m.counts.available]).toEqual([1, 1, 1]);
});
test('therapist states come from shifts, breaks and treatments', () => {
  const span = (t: string, s: string, e: string) => ({ therapistId: t, start: s, end: e });
  const m = run({
    rows: [row({ status: 'in_treatment', therapistId: 'a', expectedEnd: '2030-01-15T05:30:00Z' })],
    shifts: [span('a', '2030-01-15T03:00:00Z', '2030-01-15T15:00:00Z'), span('b', '2030-01-15T03:00:00Z', '2030-01-15T15:00:00Z'), span('c', '2030-01-15T03:00:00Z', '2030-01-15T15:00:00Z'), span('d', '2030-01-15T08:00:00Z', '2030-01-15T15:00:00Z')],
    timeOff: [span('b', '2030-01-15T04:30:00Z', '2030-01-15T05:30:00Z')],
  });
  expect(m.therapists).toEqual([{ therapistId: 'a', state: 'in_treatment' }, { therapistId: 'b', state: 'on_break' }, { therapistId: 'c', state: 'free' }]);
});
test('ROOM_NOT_READY is a known error with Thai and English text', () => {
  expect(errorMessageKey('ROOM_NOT_READY')).toBe('errors.ROOM_NOT_READY');
  expect(th.errors.ROOM_NOT_READY && en.errors.ROOM_NOT_READY).toBeTruthy();
});
