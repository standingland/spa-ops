import { test, expect } from 'vitest';
import { errorMessageKey, ERROR_CODES } from './errors';
import th from '../../messages/th.json';
import en from '../../messages/en.json';

test('known codes map to errors.<CODE>; unknown input maps to errors.UNKNOWN', () => {
  expect(errorMessageKey('THERAPIST_BUSY')).toBe('errors.THERAPIST_BUSY');
  expect(errorMessageKey('whatever')).toBe('errors.UNKNOWN');
  expect(errorMessageKey('')).toBe('errors.UNKNOWN');
});
test('every new error code has Thai and English text', () => {
  for (const c of ['INVALID_SETTING', 'INVALID_AMOUNT', 'OVERPAYMENT', 'REFUND_EXCEEDS_PAYMENT', 'CARD_DATA_REFUSED', 'REASON_REQUIRED']) {
    expect(errorMessageKey(c)).toBe(`errors.${c}`);
    expect((th.errors as any)[c] && (en.errors as any)[c]).toBeTruthy();
  }
});
test('all 21 database codes plus UNKNOWN exist in both message files', () => {
  expect(ERROR_CODES).toHaveLength(21);
  for (const code of [...ERROR_CODES, 'UNKNOWN']) {
    expect((th.errors as Record<string, string>)[code], `th ${code}`).toBeTruthy();
    expect((en.errors as Record<string, string>)[code], `en ${code}`).toBeTruthy();
  }
});
