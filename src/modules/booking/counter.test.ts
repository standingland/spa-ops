import { expect, test } from 'vitest';
import { counterSlot, counterVisible } from './counter';

test('clips a booking across midnight to the displayed Bangkok day', () => {
  expect(counterSlot({ startsAt: '2026-11-14T23:00:00+07:00', endsAt: '2026-11-15T01:00:00+07:00' }, '2026-11-15')).toEqual({ start: 0, end: 60, visible: true });
  expect(counterSlot({ startsAt: '2026-11-15T23:00:00+07:00', endsAt: '2026-11-16T02:00:00+07:00' }, '2026-11-15')).toEqual({ start: 1380, end: 1440, visible: true });
});
test('hides cancelled and no-show bookings but preserves completed bookings', () => {
  expect(counterVisible({ status: 'cancelled' })).toBe(false);
  expect(counterVisible({ status: 'no_show' })).toBe(false);
  expect(counterVisible({ status: 'completed' })).toBe(true);
});
