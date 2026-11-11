import { test, expect } from 'vitest';
import { formatTHB, parseTHB } from './money';

test('amounts parse to satang or not at all', () => {
  expect(['1,500', '1500.5', '0', '99.99', '-5', '1.234', 'x', ''].map(parseTHB)).toEqual([150000, 150050, 0, 9999, null, null, null, null]);
  expect(parseTHB('1,500.00')).toBe(150000);
});

test('formatTHB formats satang as baht', () => {
  expect(formatTHB(150000)).toBe('฿1,500.00');
  expect(formatTHB(0)).toBe('฿0.00');
  expect(formatTHB(5)).toBe('฿0.05');
});
