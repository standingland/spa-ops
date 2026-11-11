import { test, expect } from 'vitest';
import { monthGrid } from './month';

test('January 2030 is five Monday-first weeks from 31 Dec to 3 Feb', () => {
  const g = monthGrid('2030-01');
  expect(g).toHaveLength(5);
  expect(g[0]).toEqual(['2029-12-31','2030-01-01','2030-01-02','2030-01-03','2030-01-04','2030-01-05','2030-01-06']);
  expect(g[4][6]).toBe('2030-02-03');
});
test('a month starting on Monday has no leading padding', () => {
  expect(monthGrid('2030-04')[0][0]).toBe('2030-04-01');
});
test('December rolls into the next year without breaking', () => {
  const g = monthGrid('2030-12');
  expect(g[0][0]).toBe('2030-11-25');
  expect(g[g.length - 1][6]).toBe('2031-01-05');
});
