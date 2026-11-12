import { describe, expect, it } from 'vitest';
import { getBrand } from './brand';

describe('getBrand', () => {
  it('uses defaults', () => {
    expect(getBrand({})).toEqual({ name: 'BANYAN', tagline: "Men's Spa · Thailand" });
  });
  it('trims values', () => {
    expect(getBrand({ BRAND_NAME: '  Lotus  ' }).name).toBe('Lotus');
  });
  it('falls back when blank', () => {
    expect(getBrand({ BRAND_NAME: '   ', BRAND_TAGLINE: '' })).toEqual({ name: 'BANYAN', tagline: "Men's Spa · Thailand" });
  });
});
