import { test, expect } from 'vitest';
import { formatTime, bangkokDayRange } from './time';

test('formatTime gives 24-hour Bangkok time', () => {
  expect(formatTime('2030-01-15T03:00:00Z')).toBe('10:00');
  expect(formatTime('2030-01-15T17:05:00Z')).toBe('00:05');
});
test('bangkokDayRange spans one Bangkok calendar day', () => {
  expect(bangkokDayRange('2030-01-15')).toEqual({ from: '2030-01-14T17:00:00.000Z', to: '2030-01-15T17:00:00.000Z' });
});

test('parseRange reads a PostgREST tstzrange', async () => {
  const { parseRange } = await import('./time');
  expect(parseRange('["2030-01-15 03:00:00+00","2030-01-15 04:00:00+00")')).toEqual({ start: '2030-01-15T03:00:00.000Z', end: '2030-01-15T04:00:00.000Z' });
});
