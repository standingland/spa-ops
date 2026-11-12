import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Avatar, initialsOf } from './avatar';

it('shows initials when there is no photo', () => {
  const html = renderToStaticMarkup(<Avatar name="Somchai Jaidee" />);
  expect(html).toContain('SJ');
  expect(html).toContain('aria-label="Somchai Jaidee"');
  expect(html).not.toContain('<img');
});
it('shows the photo with the name as its text alternative', () => {
  const html = renderToStaticMarkup(<Avatar name="Somchai" src="https://x/y.jpg" />);
  expect(html).toContain('<img');
  expect(html).toContain('alt="Somchai"');
});
it('initials of a Thai name keep whole letters, never a lone vowel mark', () => {
  expect(initialsOf('สมชาย ใจดี')).toBe('สใ');
  expect(initialsOf('  ')).toBe('?');
  expect(initialsOf('Nok')).toBe('N');
});
