import { expect, it } from 'vitest';
import { buildCsp } from './csp';

const directive = (csp: string, name: string) => csp.split('; ').find((d) => d.startsWith(`${name} `));

it('img-src allows the Supabase origin so private photos can load', () => {
  expect(directive(buildCsp('n', 'https://abc.supabase.co', false), 'img-src')).toBe("img-src 'self' blob: data: https://abc.supabase.co");
});
it('an invalid Supabase URL leaves img-src as it was', () => {
  expect(directive(buildCsp('n', 'not a url', false), 'img-src')).toBe("img-src 'self' blob: data:");
});
it('other directives are unchanged', () => {
  const csp = buildCsp('n', 'https://abc.supabase.co', false);
  expect(directive(csp, 'connect-src')).toBe("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
  expect(directive(csp, 'default-src')).toBe("default-src 'self'");
});
