import { test, expect } from 'vitest';
import { PHOTO_MAX_BYTES, checkPhoto, photoObjectName } from './photo';

test('accepts jpeg and png under the limit', () => {
  expect(checkPhoto({ type: 'image/jpeg', size: 20_000 })).toBe('ok');
  expect(checkPhoto({ type: 'image/png', size: 20_000 })).toBe('ok');
});
test('rejects gif', () => { expect(checkPhoto({ type: 'image/gif', size: 1000 })).toBe('INVALID_INPUT'); });
test('rejects 0 bytes', () => { expect(checkPhoto({ type: 'image/jpeg', size: 0 })).toBe('INVALID_INPUT'); });
test('rejects 512 KB + 1', () => { expect(checkPhoto({ type: 'image/jpeg', size: PHOTO_MAX_BYTES + 1 })).toBe('INVALID_INPUT'); });
test('accepts exactly 512 KB', () => { expect(checkPhoto({ type: 'image/jpeg', size: PHOTO_MAX_BYTES })).toBe('ok'); });
test('object names differ for two stamps of the same therapist', () => {
  expect(photoObjectName('t1', 1)).toBe('t1-1.jpg');
  expect(photoObjectName('t1', 1)).not.toBe(photoObjectName('t1', 2));
});
