import { test, expect, vi, beforeEach, afterEach } from 'vitest';

const rpc = vi.fn();
const jar = new Map<string, string>();
vi.mock('./db', () => ({ publicDb: () => ({ rpc }) }));
vi.mock('./rateLimit', () => ({ allow: async () => true }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined) }),
  headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4' }),
}));

const saved = { ...process.env };
beforeEach(() => { rpc.mockReset(); jar.clear(); process.env.PUBLIC_TOKEN_SECRET = 'k'.repeat(32); });
afterEach(() => { process.env = { ...saved }; });

const input = { therapistId: '11111111-1111-4111-8111-111111111111', serviceId: '22222222-2222-4222-8222-222222222222', start: '2030-01-15T05:00:00.000Z', idempotencyKey: '33333333-3333-4333-8333-333333333333' };

test('bookOnline without a session returns NOT_SIGNED_IN and never calls the database', async () => {
  const { bookOnline } = await import('./actions');
  expect(await bookOnline(input)).toEqual({ ok: false, code: 'NOT_SIGNED_IN' });
  expect(rpc).not.toHaveBeenCalled();
});

test('bookOnline with a forged session cookie is NOT_SIGNED_IN', async () => {
  const { bookOnline } = await import('./actions');
  jar.set('guest_session', 'eyJmb3JnZWQiOnRydWV9.AAAA');
  expect((await bookOnline(input)).ok).toBe(false);
  expect(rpc).not.toHaveBeenCalled();
});

test('bookOnline books for the signed-in guest and returns a cancel token', async () => {
  const { bookOnline } = await import('./actions');
  const { signSession, verifyCancelToken } = await import('./session');
  jar.set('guest_session', signSession({ lineUserId: 'U1', name: 'Nok' }, 60));
  rpc.mockResolvedValue({ data: [{ booking_id: 'b-1', starts_at: input.start }], error: null });
  const r = await bookOnline(input);
  expect(r).toMatchObject({ ok: true, bookingId: 'b-1' });
  expect(verifyCancelToken((r as { cancelToken: string }).cancelToken)).toBe('b-1');
  expect(rpc).toHaveBeenCalledWith('public_book', {
    p_line_user_id: 'U1', p_line_name: 'Nok', p_therapist_id: input.therapistId, p_service_id: input.serviceId, p_start: input.start, p_idempotency_key: input.idempotencyKey,
  });
});

test.each([
  ['THERAPIST_BUSY', 'SLOT_TAKEN'], ['POSITION_TAKEN', 'SLOT_TAKEN'], ['ROOM_OTHER_PARTY', 'SLOT_TAKEN'], ['SLOT_TAKEN', 'SLOT_TAKEN'],
  ['ONLINE_CLOSED', 'ONLINE_CLOSED'], ['OUT_OF_WINDOW', 'OUT_OF_WINDOW'], ['TOO_MANY_BOOKINGS', 'TOO_MANY_BOOKINGS'],
])('bookOnline maps the database error %s to %s', async (db, want) => {
  const { bookOnline } = await import('./actions');
  const { signSession } = await import('./session');
  jar.set('guest_session', signSession({ lineUserId: 'U1', name: 'Nok' }, 60));
  rpc.mockResolvedValue({ data: null, error: { message: db } });
  expect(await bookOnline(input)).toEqual({ ok: false, code: want });
});

test('bookOnline rejects malformed input before touching the database', async () => {
  const { bookOnline } = await import('./actions');
  const { signSession } = await import('./session');
  jar.set('guest_session', signSession({ lineUserId: 'U1', name: 'Nok' }, 60));
  expect(await bookOnline({ ...input, start: 'tomorrow' })).toEqual({ ok: false, code: 'INVALID_INPUT' });
  expect(rpc).not.toHaveBeenCalled();
});

test('cancelOnline with a tampered token changes nothing', async () => {
  const { cancelOnline } = await import('./actions');
  const { signCancelToken } = await import('./session');
  const t = signCancelToken('b-1', 60);
  expect(await cancelOnline(t.slice(0, -3) + 'xxx')).toEqual({ ok: false, code: 'INVALID_LINK' });
  expect(await cancelOnline('')).toEqual({ ok: false, code: 'INVALID_LINK' });
  expect(rpc).not.toHaveBeenCalled();
});

test('cancelOnline cancels with a valid token and maps CANCEL_TOO_LATE', async () => {
  const { cancelOnline } = await import('./actions');
  const { signCancelToken } = await import('./session');
  rpc.mockResolvedValueOnce({ data: null, error: null });
  expect(await cancelOnline(signCancelToken('b-1', 60))).toEqual({ ok: true });
  expect(rpc).toHaveBeenCalledWith('public_cancel', { p_booking_id: 'b-1' });
  rpc.mockResolvedValueOnce({ data: null, error: { message: 'CANCEL_TOO_LATE' } });
  expect(await cancelOnline(signCancelToken('b-1', 60))).toEqual({ ok: false, code: 'CANCEL_TOO_LATE' });
});
