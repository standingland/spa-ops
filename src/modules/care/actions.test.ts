import { beforeEach, expect, test, vi } from 'vitest';

const rpc = vi.fn(); const role = vi.fn(); const allow = vi.fn(); const jar = new Map<string, string>();
vi.mock('@/modules/public/db', () => ({ publicDb: () => ({ rpc }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }));
vi.mock('@/modules/identity/session', () => ({ roleOrNull: (...args: unknown[]) => role(...args) }));
vi.mock('@/modules/public/rateLimit', () => ({ allow: (...args: unknown[]) => allow(...args) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined }) }));

import { getMyAppointments, joinWaitlist, acceptWaitlist, cancelWaitlist, savePreferences, closeCommission, recordPayout } from './actions';
import { signSession, verifyCancelToken } from '@/modules/public/session';
const id = '11111111-1111-4111-8111-111111111111';
const input = { therapistId: id, serviceId: id, from: '2030-01-15T10:00:00+07:00', to: '2030-01-15T12:00:00+07:00', notifyConsent: true as const };
beforeEach(() => { vi.clearAllMocks(); jar.clear(); role.mockResolvedValue(null); allow.mockResolvedValue(true); process.env.PUBLIC_TOKEN_SECRET = 'care-tests-secret'.padEnd(32, 'x'); });
const signIn = () => jar.set('guest_session', signSession({ lineUserId: 'U-real', name: 'Real guest' }, 60));

test('all guest mutations and appointment lookup require a verified session before touching the database', async () => {
  jar.set('guest_session', 'forged.bad');
  for (const task of [() => getMyAppointments(), () => joinWaitlist(input), () => acceptWaitlist(id), () => cancelWaitlist(id)]) expect(await task()).toMatchObject({ ok: false, code: 'NOT_SIGNED_IN' });
  expect(rpc).not.toHaveBeenCalled();
});
test('appointment lookup uses the signed LINE owner and issues cancellation tokens only for online confirmed bookings', async () => {
  signIn(); rpc.mockResolvedValue({ error: null, data: { upcoming: [{ id, source: 'online', status: 'confirmed', starts_at: input.from }, { id: 'staff', source: 'advance', status: 'confirmed', starts_at: input.from }], history: [], history_count: 0, waitlist: [] } });
  const r = await getMyAppointments(2); expect(rpc).toHaveBeenCalledWith('public_my_appointments', { p_line_user_id: 'U-real', p_page: 2 });
  expect(r.ok).toBe(true); if (!r.ok) return;
  expect(verifyCancelToken(r.appointments.upcoming[0].cancelToken!)).toBe(id); expect(r.appointments.upcoming[1]).not.toHaveProperty('cancelToken');
});
test('invalid pagination and reversed waitlist windows cannot reach privileged RPCs', async () => {
  signIn(); expect(await getMyAppointments(-1)).toMatchObject({ code: 'INVALID_INPUT' }); expect(await joinWaitlist({ ...input, to: '2030-01-14T12:00:00+07:00' })).toMatchObject({ code: 'INVALID_INPUT' }); expect(rpc).not.toHaveBeenCalled();
});
test('waitlist submission and acceptance use only the identity from the signed cookie', async () => {
  signIn(); rpc.mockResolvedValueOnce({ data: id, error: null }); expect(await joinWaitlist(input)).toMatchObject({ ok: true });
  expect(rpc).toHaveBeenCalledWith('public_join_waitlist', { p_line_user_id: 'U-real', p_line_name: 'Real guest', p_therapist_id: id, p_service_id: id, p_from: input.from, p_to: input.to, p_notify_consent: true });
  rpc.mockResolvedValueOnce({ data: [{ booking_id: id, starts_at: input.from }], error: null }); const accepted = await acceptWaitlist(id);
  expect(rpc).toHaveBeenLastCalledWith('public_accept_waitlist', { p_line_user_id: 'U-real', p_line_name: 'Real guest', p_id: id });
  expect(accepted.ok).toBe(true); if (accepted.ok) expect(verifyCancelToken(accepted.cancelToken)).toBe(id);
});
test('rate limiting stops a guest operation before its service-role RPC', async () => { signIn(); allow.mockResolvedValue(false); expect(await joinWaitlist(input)).toMatchObject({ code: 'RATE_LIMITED' }); expect(rpc).not.toHaveBeenCalled(); });
test('staff preferences and settlement writes require an active authorised role', async () => {
  expect(await savePreferences({ customerId: id, pressure: 'firm', oil: '', room: '', notes: '' })).toMatchObject({ code: 'NOT_AUTHORIZED' });
  expect(await closeCommission({ from: '2026-11-01', to: '2026-11-17', revision: 'a'.repeat(32), key: id })).toMatchObject({ code: 'NOT_AUTHORIZED' });
  expect(await recordPayout({ batchId: id, therapistId: id, reference: 'paid', paidAt: input.from })).toMatchObject({ code: 'NOT_AUTHORIZED' }); expect(rpc).not.toHaveBeenCalled();
});
test('preferences validate lengths and payouts validate dates before executing checked staff RPCs', async () => {
  role.mockResolvedValue({ role: 'manager' });
  expect(await savePreferences({ customerId: id, pressure: 'firm', oil: 'x'.repeat(121), room: '', notes: '' })).toMatchObject({ code: 'INVALID_INPUT' });
  expect(await recordPayout({ batchId: id, therapistId: id, reference: 'paid', paidAt: 'yesterday' })).toMatchObject({ code: 'INVALID_INPUT' }); expect(rpc).not.toHaveBeenCalled();
});
