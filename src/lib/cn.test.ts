import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('lets the later conflicting utility win', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });
});

describe('cn with custom type-scale classes', () => {
  it('keeps a type-scale size next to a text colour', () => {
    expect(cn('text-caption', 'text-ink')).toBe('text-caption text-ink');
    expect(cn('text-body', 'text-ink-muted')).toBe('text-body text-ink-muted');
  });
  it('still resolves two font sizes to the last one', () => {
    expect(cn('text-body', 'text-title')).toBe('text-title');
  });
});
