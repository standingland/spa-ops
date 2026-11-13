import { test, expect } from 'vitest';
import { cancelTtlSec, clientIp, stateCookieName } from './http';

const h = (o: Record<string, string>) => new Headers(o);

test('clientIp prefers the platform headers a client cannot set, then the LAST forwarded address, then unknown', () => {
  expect(clientIp(h({ 'x-vercel-forwarded-for': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('9.9.9.9');
  expect(clientIp(h({ 'x-real-ip': '8.8.8.8', 'x-forwarded-for': '1.1.1.1' }))).toBe('8.8.8.8');
  // a client can prepend anything to x-forwarded-for; the proxy appends the real peer last
  expect(clientIp(h({ 'x-forwarded-for': 'spoofed, 3.3.3.3' }))).toBe('3.3.3.3');
  expect(clientIp(h({}))).toBe('unknown');
});

test('a cancel link lasts until a day after the booking, never less than 45 days', () => {
  const now = Date.parse('2030-01-01T00:00:00Z');
  expect(cancelTtlSec('2030-01-10T05:00:00Z', now)).toBe(45 * 86400);
  const far = cancelTtlSec('2030-12-01T05:00:00Z', now);
  expect(far).toBeGreaterThan(45 * 86400);
  expect(far).toBe(Math.ceil((Date.parse('2030-12-01T05:00:00Z') - now) / 1000) + 86400);
  expect(cancelTtlSec('garbage', now)).toBe(45 * 86400);
});

test('the state cookie name carries a short form of the nonce, so sign-ins in two tabs never share one cookie', () => {
  expect(stateCookieName('abcdefghijklmnopqrstuvwxyz')).toBe('line_state_abcdefghijkl');
  expect(stateCookieName('a')).not.toBe(stateCookieName('b'));
});
