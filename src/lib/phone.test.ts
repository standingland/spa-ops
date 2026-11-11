import { test, expect } from 'vitest';
import { normalizePhone } from './phone';

test('phones normalise to one stored form', () => {
  expect(['081-000-0000', '+66 81 000 0000', '66810000000', '(02) 123 4567', '+1 415 555 0100', 'abc', '12'].map(normalizePhone))
    .toEqual(['0810000000', '0810000000', '0810000000', '021234567', '+14155550100', null, null]);
});
