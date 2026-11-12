import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('is decorative: hidden from assistive technology', () => {
    expect(renderToStaticMarkup(<Skeleton />)).toContain('aria-hidden="true"');
  });
  it('forwards className', () => {
    expect(renderToStaticMarkup(<Skeleton className="h-8 w-40" />)).toContain('h-8 w-40');
  });
  it('renders no text', () => {
    expect(renderToStaticMarkup(<Skeleton />).replace(/<[^>]*>/g, '')).toBe('');
  });
});
