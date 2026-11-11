import { test, expect } from 'vitest';
import { formatTHB } from './money';

test('formatTHB formats satang as baht', () => {
  expect(formatTHB(150000)).toBe('฿1,500.00');
  expect(formatTHB(0)).toBe('฿0.00');
  expect(formatTHB(5)).toBe('฿0.05');
});
