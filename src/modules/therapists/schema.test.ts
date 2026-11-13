import { test, expect } from 'vitest';
import { TherapistInput } from './schema';

const base = { displayName: 'Dolly', employmentType: 'employee' as const, serviceIds: [] };

test('specialties: trims, drops empties, caps at 6 tags of 24 chars', () => {
  const ok = TherapistInput.safeParse({ ...base, specialties: ['  Thai  ', '', 'Aroma'] });
  expect(ok.success && ok.data.specialties).toEqual(['Thai', 'Aroma']);
  expect(TherapistInput.safeParse({ ...base, specialties: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }).success).toBe(false);
  expect(TherapistInput.safeParse({ ...base, specialties: ['x'.repeat(25)] }).success).toBe(false);
});
test('bio over 500 characters is rejected, empty bio becomes undefined', () => {
  expect(TherapistInput.safeParse({ ...base, bioTh: 'ก'.repeat(501) }).success).toBe(false);
  expect(TherapistInput.safeParse({ ...base, bioEn: 'x'.repeat(501) }).success).toBe(false);
  const ok = TherapistInput.safeParse({ ...base, bioEn: '   ' });
  expect(ok.success && ok.data.bioEn).toBeUndefined();
});
test('public defaults to false', () => {
  const ok = TherapistInput.safeParse(base);
  expect(ok.success && ok.data.public).toBe(false);
});
