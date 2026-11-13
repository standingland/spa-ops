import { test, expect, beforeEach, afterEach, vi } from 'vitest';
import { signSession, verifySession, signCancelToken, verifyCancelToken, signState, verifyState } from './session';

const saved = { ...process.env };
beforeEach(() => { process.env.PUBLIC_TOKEN_SECRET = 'k'.repeat(32); });
afterEach(() => { process.env = { ...saved }; vi.useRealTimers(); });

test('a session round-trips', () => {
  expect(verifySession(signSession({ lineUserId: 'U1', name: 'Nok' }, 60))).toEqual({ lineUserId: 'U1', name: 'Nok' });
});
test('a tampered session is rejected', () => {
  const t = signSession({ lineUserId: 'U1', name: 'Nok' }, 60);
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ k: 'session', lineUserId: 'U2', name: 'Nok', exp: Date.now() / 1000 + 60 })).toString('base64url');
  expect(verifySession(`${forged}.${sig}`)).toBeNull();
  expect(verifySession(`${body}.${sig.slice(0, -2)}xx`)).toBeNull();
  expect(verifySession('garbage')).toBeNull();
  expect(verifySession('')).toBeNull();
});
test('an expired session is rejected', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  const t = signSession({ lineUserId: 'U1', name: 'Nok' }, 60);
  vi.setSystemTime(new Date('2030-01-01T00:01:01Z'));
  expect(verifySession(t)).toBeNull();
});
test('a session signed with another secret is rejected', () => {
  const t = signSession({ lineUserId: 'U1', name: 'Nok' }, 60);
  process.env.PUBLIC_TOKEN_SECRET = 'z'.repeat(32);
  expect(verifySession(t)).toBeNull();
});
test('a cancel token for booking A does not verify as booking B, and tokens of one kind never verify as another', () => {
  const a = signCancelToken('booking-a', 3600);
  expect(verifyCancelToken(a)).toBe('booking-a');
  const swapped = Buffer.from(JSON.stringify({ k: 'cancel', b: 'booking-b', exp: Date.now() / 1000 + 3600 })).toString('base64url') + '.' + a.split('.')[1];
  expect(verifyCancelToken(swapped)).toBeNull();
  expect(verifyCancelToken(signSession({ lineUserId: 'U1', name: 'Nok' }, 60))).toBeNull();
  expect(verifySession(a)).toBeNull();
});
test('the login state round-trips with its nonce, return path and selection, and expires', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
  const s = signState({ nonce: 'N', returnTo: '/th/book/abc', selection: { serviceId: 's', start: 'x' } }, 600);
  expect(verifyState(s)).toEqual({ nonce: 'N', returnTo: '/th/book/abc', selection: { serviceId: 's', start: 'x' } });
  vi.setSystemTime(new Date('2030-01-01T00:11:00Z'));
  expect(verifyState(s)).toBeNull();
});
