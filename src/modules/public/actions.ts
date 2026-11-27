'use server';

import { cookies } from 'next/headers';
import { after } from 'next/server';
import { z } from 'zod';
import { failFrom } from '@/lib/action';
import { dispatchNow } from '@/modules/notifications/now';
import { allow } from './rateLimit';
import { publicDb } from './db';
import { SESSION_COOKIE, cancelTtlSec } from './http';
import { getFreeTimes } from './queries';
import { signCancelToken, verifyCancelToken, verifySession } from './session';

const BookInput = z.object({
  therapistId: z.uuid(), serviceId: z.uuid(), start: z.iso.datetime({ offset: true }), idempotencyKey: z.uuid(),
});

/** Nobody is free at that time any more: the page shows "that time was just taken" and keeps the guest's choices. */
const TAKEN = new Set(['THERAPIST_BUSY', 'POSITION_TAKEN', 'ROOM_OTHER_PARTY', 'SLOT_TAKEN', 'SLOT_HELD']);
const PASS = new Set(['ONLINE_CLOSED', 'OUT_OF_WINDOW', 'TOO_MANY_BOOKINGS', 'THERAPIST_OFF_SHIFT', 'THERAPIST_NOT_QUALIFIED']);

export async function bookOnline(input: z.input<typeof BookInput>): Promise<{ ok: true; bookingId: string; cancelToken: string } | { ok: false; code: string }> {
  const guest = verifySession((await cookies()).get(SESSION_COOKIE)?.value ?? '');
  if (!guest) return { ok: false, code: 'NOT_SIGNED_IN' };
  const p = BookInput.safeParse(input);
  if (!p.success) return { ok: false, code: 'INVALID_INPUT' };
  if (!(await allow(`book:${guest.lineUserId}`, 10, 3600))) return { ok: false, code: 'RATE_LIMITED' };
  const { data, error } = await publicDb().rpc('public_book', {
    p_line_user_id: guest.lineUserId, p_line_name: guest.name, p_therapist_id: p.data.therapistId,
    p_service_id: p.data.serviceId, p_start: p.data.start, p_idempotency_key: p.data.idempotencyKey,
  });
  if (error) {
    if (TAKEN.has(error.message)) return { ok: false, code: 'SLOT_TAKEN' };
    if (PASS.has(error.message)) return { ok: false, code: error.message };
    const f = failFrom(error);
    return { ok: false, code: f.code };
  }
  const bookingId = (data as { booking_id: string }[])[0]?.booking_id;
  if (!bookingId) return { ok: false, code: 'UNKNOWN' };
  // Send the confirmation now instead of waiting up to a scheduler interval. A failure is left for the scheduler to retry.
  after(async () => { try { await dispatchNow(); } catch { /* stays queued */ } });
  return { ok: true, bookingId, cancelToken: signCancelToken(bookingId, cancelTtlSec(p.data.start)) };
}

/** Cancels with the signed link; the token is the guest's proof, so no login is needed. */
export async function cancelOnline(token: string): Promise<{ ok: true } | { ok: false; code: string }> {
  const id = verifyCancelToken(token);
  if (!id) return { ok: false, code: 'INVALID_LINK' };
  const { error } = await publicDb().rpc('public_cancel', { p_booking_id: id });
  if (!error) return { ok: true };
  if (['CANCEL_TOO_LATE', 'INVALID_TRANSITION'].includes(error.message)) return { ok: false, code: error.message };
  if (error.message === 'NOT_AUTHORIZED') return { ok: false, code: 'INVALID_LINK' };
  return { ok: false, code: failFrom(error).code };
}

/** Free 30-minute starts for the booking panel's date picker. Bad input, a closed page or rate limiting all give an empty list. */
export async function loadTimes(input: { therapistId: string; serviceId: string; day: string }): Promise<string[]> {
  return getFreeTimes(input);
}
