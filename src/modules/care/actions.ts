'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { roleOrNull } from '@/modules/identity/session';
import { publicDb } from '@/modules/public/db';
import { SESSION_COOKIE, cancelTtlSec } from '@/modules/public/http';
import { signCancelToken, verifySession } from '@/modules/public/session';
import { allow } from '@/modules/public/rateLimit';
import { PeriodInput } from '@/modules/business/schema';
import { PreferencesInput, WaitlistInput, type Preferences, type MyAppointments, type Settlement, type WaitlistEntry } from './schema';

async function guest() { return verifySession((await cookies()).get(SESSION_COOKIE)?.value ?? ''); }
const desk = () => roleOrNull('owner', 'manager', 'receptionist');

export async function getPreferences(customerId: string): Promise<Preferences> {
  if (!(await desk()) || !z.uuid().safeParse(customerId).success) throw new Error('NOT_AUTHORIZED');
  const { data, error } = await (await createClient()).from('customer_preferences').select('pressure,oil,room,notes').eq('customer_id', customerId).maybeSingle();
  if (error) throw new Error('PREFERENCES_LOAD_FAILED');
  return (data ?? {}) as Preferences;
}
export async function savePreferences(input: z.input<typeof PreferencesInput>): Promise<ActionResult> {
  if (!(await desk())) return fail('NOT_AUTHORIZED');
  const p = PreferencesInput.safeParse(input); if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const { data, error } = await (await createClient()).rpc('save_customer_preferences', { p_customer_id: v.customerId, p_pressure: v.pressure, p_oil: v.oil, p_room: v.room, p_notes: v.notes });
  return error ? failFrom(error) : done(data);
}
export async function getBookingPreferences(bookingId: string): Promise<Preferences> {
  if (!(await roleOrNull()) || !z.uuid().safeParse(bookingId).success) return {};
  const { data, error } = await (await createClient()).rpc('booking_preferences', { p_booking_id: bookingId });
  return error ? {} : data as Preferences;
}

export async function getMyAppointments(page = 0): Promise<{ ok: true; appointments: MyAppointments } | { ok: false; code: string }> {
  const g = await guest(); if (!g) return fail('NOT_SIGNED_IN');
  if (!Number.isInteger(page) || page < 0 || page > 100000) return fail('INVALID_INPUT');
  if (!(await allow(`mine:${g.lineUserId}`, 60, 60))) return fail('RATE_LIMITED');
  const { data, error } = await publicDb().rpc('public_my_appointments', { p_line_user_id: g.lineUserId, p_page: page });
  if (error) return failFrom(error);
  const result = data as MyAppointments;
  // A signed cancellation link is issued only after ownership was checked against the LINE session.
  result.upcoming = result.upcoming.map((b) => ({ ...b, ...(b.source === 'online' && b.status === 'confirmed' ? { cancelToken: signCancelToken(b.id, cancelTtlSec(b.starts_at)) } : {}) }));
  return { ok: true, appointments: result };
}
export async function joinWaitlist(input: z.input<typeof WaitlistInput>): Promise<ActionResult> {
  const g = await guest(); if (!g) return fail('NOT_SIGNED_IN');
  const p = WaitlistInput.safeParse(input); if (!p.success) return fail('INVALID_INPUT');
  if (!(await allow(`waitlist:${g.lineUserId}`, 10, 3600))) return fail('RATE_LIMITED');
  const { data, error } = await publicDb().rpc('public_join_waitlist', { p_line_user_id: g.lineUserId, p_line_name: g.name, p_therapist_id: p.data.therapistId, p_service_id: p.data.serviceId, p_from: p.data.from, p_to: p.data.to, p_notify_consent: p.data.notifyConsent });
  return error ? failFrom(error) : done(data);
}
export async function cancelWaitlist(id: string): Promise<ActionResult> {
  const g = await guest(); if (!g) return fail('NOT_SIGNED_IN');
  if (!z.uuid().safeParse(id).success) return fail('INVALID_INPUT');
  if (!(await allow(`leave-waitlist:${g.lineUserId}`, 20, 60))) return fail('RATE_LIMITED');
  const { error } = await publicDb().rpc('public_cancel_waitlist', { p_line_user_id: g.lineUserId, p_id: id });
  return error ? failFrom(error) : done(id);
}
export async function acceptWaitlist(id: string): Promise<{ ok: true; cancelToken: string } | { ok: false; code: string }> {
  const g = await guest(); if (!g) return fail('NOT_SIGNED_IN');
  if (!z.uuid().safeParse(id).success) return fail('INVALID_INPUT');
  if (!(await allow(`accept:${g.lineUserId}`, 20, 60))) return fail('RATE_LIMITED');
  const { data, error } = await publicDb().rpc('public_accept_waitlist', { p_line_user_id: g.lineUserId, p_line_name: g.name, p_id: id });
  if (error) return failFrom(error);
  const b = (data as { booking_id: string; starts_at: string }[])[0];
  return b ? { ok: true, cancelToken: signCancelToken(b.booking_id, cancelTtlSec(b.starts_at)) } : fail('UNKNOWN');
}
export async function listWaitlist(): Promise<{ ok: true; rows: WaitlistEntry[] } | { ok: false; code: string }> {
  if (!(await desk())) return fail('NOT_AUTHORIZED');
  const { data, error } = await (await createClient()).from('waitlist_entries').select('id,status,starts_window,offered_start,offer_expires_at,customers(display_name),therapists(display_name),services(name_th,name_en)').in('status', ['waiting', 'offered']).order('created_at').limit(200);
  if (error) return failFrom(error);
  // Supabase returns joined many-to-one records as objects. Normalise its inferred relation type here.
  const { parseRange } = await import('@/lib/time');
  const rows = (data ?? []) as unknown as { id: string; status: string; starts_window: string; offered_start: string | null; offer_expires_at: string | null; customers: { display_name: string }; therapists: { display_name: string }; services: { name_th: string; name_en: string | null } }[];
  return { ok: true, rows: rows.map((r) => { const range = parseRange(r.starts_window); return { id: r.id, status: r.status, window_from: range.start, window_to: new Date(Date.parse(range.end) - 1000).toISOString(), offered_start: r.offered_start, offer_expires_at: r.offer_expires_at, customer_name: r.customers.display_name, therapist_name: r.therapists.display_name, service_name_th: r.services.name_th, service_name_en: r.services.name_en }; }) };
}
export async function staffCancelWaitlist(id: string): Promise<ActionResult> {
  if (!(await desk())) return fail('NOT_AUTHORIZED');
  if (!z.uuid().safeParse(id).success) return fail('INVALID_INPUT');
  const { error } = await (await createClient()).rpc('cancel_waitlist', { p_id: id });
  return error ? failFrom(error) : done(id);
}

export async function getSettlement(from: string, to: string): Promise<{ ok: true; settlement: Settlement } | { ok: false; code: string }> {
  if (!(await roleOrNull('owner', 'manager'))) return fail('NOT_AUTHORIZED');
  if (!PeriodInput.safeParse({ from, to }).success) return fail('INVALID_INPUT');
  const { data, error } = await (await createClient()).rpc('commission_settlement_report', { p_from: from, p_to: to });
  return error ? failFrom(error) : { ok: true, settlement: data as Settlement };
}
export async function closeCommission(input: { from: string; to: string; revision: string; key: string }): Promise<ActionResult> {
  if (!(await roleOrNull('owner', 'manager'))) return fail('NOT_AUTHORIZED');
  if (!PeriodInput.safeParse(input).success || !z.uuid().safeParse(input.key).success || !/^[a-f0-9]{32}$/.test(input.revision)) return fail('INVALID_INPUT');
  const { data, error } = await (await createClient()).rpc('close_commission_period', { p_from: input.from, p_to: input.to, p_revision: input.revision, p_key: input.key });
  return error ? failFrom(error) : done(data);
}
export async function recordPayout(input: { batchId: string; therapistId: string; reference: string; paidAt: string }): Promise<ActionResult> {
  if (!(await roleOrNull('owner', 'manager'))) return fail('NOT_AUTHORIZED');
  const p = z.object({ batchId: z.uuid(), therapistId: z.uuid(), reference: z.string().trim().min(1).max(200), paidAt: z.iso.datetime({ offset: true }) }).safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const { data, error } = await (await createClient()).rpc('record_commission_payout', { p_batch_id: p.data.batchId, p_therapist_id: p.data.therapistId, p_reference: p.data.reference, p_paid_at: p.data.paidAt });
  return error ? failFrom(error) : done(data);
}
