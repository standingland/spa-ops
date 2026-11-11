import { test, expect } from 'vitest';
import { errorMessageKey, ERROR_CODES } from './errors';
import th from '../../messages/th.json';
import en from '../../messages/en.json';

test('known codes map to errors.<CODE>; unknown input maps to errors.UNKNOWN', () => {
  expect(errorMessageKey('THERAPIST_BUSY')).toBe('errors.THERAPIST_BUSY');
  expect(errorMessageKey('whatever')).toBe('errors.UNKNOWN');
  expect(errorMessageKey('')).toBe('errors.UNKNOWN');
});
test('all 14 database codes plus UNKNOWN exist in both message files', () => {
  expect(ERROR_CODES).toHaveLength(14);
  for (const code of [...ERROR_CODES, 'UNKNOWN']) {
    expect((th.errors as Record<string, string>)[code], `th ${code}`).toBeTruthy();
    expect((en.errors as Record<string, string>)[code], `en ${code}`).toBeTruthy();
  }
});
