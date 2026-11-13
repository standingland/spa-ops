import { test, expect } from 'vitest';
import { boardWindow } from './window';

test('the window starts 12 hours before the Bangkok day so a treatment that runs past midnight is still in it', () => {
  // 00:15 Bangkok on the 16th = 17:15Z on the 15th; the Bangkok day starts 2030-01-15T17:00Z
  const w = boardWindow('2030-01-15T17:15:00Z');
  expect(w.from).toBe('2030-01-15T05:00:00.000Z');
  expect(Date.parse(w.to)).toBeGreaterThan(Date.parse('2030-01-15T17:15:00Z'));
});
test('a 22:00-23:00 booking that overran is inside the window at 00:15', () => {
  const w = boardWindow('2030-01-15T17:15:00Z');
  const start = Date.parse('2030-01-15T15:00:00Z'); // 22:00 Bangkok on the 15th
  expect(start).toBeGreaterThanOrEqual(Date.parse(w.from));
});
