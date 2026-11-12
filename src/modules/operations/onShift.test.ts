import { test, expect } from 'vitest';
import { therapistsNow } from './onShift';
import type { BoardRow } from '@/modules/booking/actions';

const NOW = '2030-01-15T05:00:00Z';
const span = (therapistId: string, start: string, end: string) => ({ therapistId, start, end });
const SHIFT = (id: string) => span(id, '2030-01-15T02:00:00Z', '2030-01-15T10:00:00Z');
const treat = (therapistId: string, roomId: string): BoardRow => ({
  bookingId: `b-${therapistId}`, version: 1, status: 'in_treatment', source: 'advance',
  startsAt: '2030-01-15T04:30:00Z', endsAt: '2030-01-15T05:30:00Z', roomFreeAt: '2030-01-15T05:45:00Z',
  therapistId, roomId, positionId: 'p', partyId: 'x', serviceId: 's', customerId: 'c', customerDisplayName: 'C',
  checkedInAt: null, startedAt: '2030-01-15T04:30:00Z', completedAt: null, expectedEnd: '2030-01-15T05:30:00Z',
});

test('a therapist with an in-treatment booking is in_treatment with that room', () => {
  expect(therapistsNow({ now: NOW, shifts: [SHIFT('a')], timeOff: [], rows: [treat('a', 'r1')] }))
    .toEqual([{ therapistId: 'a', state: 'in_treatment', roomId: 'r1' }]);
});
test('on a break (time off covering now) is on_break with no room', () => {
  expect(therapistsNow({ now: NOW, shifts: [SHIFT('a')], timeOff: [span('a', '2030-01-15T04:50:00Z', '2030-01-15T05:10:00Z')], rows: [] }))
    .toEqual([{ therapistId: 'a', state: 'on_break', roomId: null }]);
});
test('on shift with nothing else is free', () => {
  expect(therapistsNow({ now: NOW, shifts: [SHIFT('a')], timeOff: [], rows: [] }))
    .toEqual([{ therapistId: 'a', state: 'free', roomId: null }]);
});
test('a shift that has ended or not started is not listed', () => {
  expect(therapistsNow({ now: NOW, shifts: [span('a', '2030-01-14T02:00:00Z', '2030-01-14T10:00:00Z'), span('b', '2030-01-15T06:00:00Z', '2030-01-15T10:00:00Z')], timeOff: [], rows: [] })).toEqual([]);
});
test('nobody on shift returns an empty array', () => {
  expect(therapistsNow({ now: NOW, shifts: [], timeOff: [], rows: [treat('a', 'r1')] })).toEqual([]);
});
