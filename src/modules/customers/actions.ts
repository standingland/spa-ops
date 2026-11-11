'use server';

import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { normalizePhone } from '@/lib/phone';
import { parseRange } from '@/lib/time';
import type { BookingStatus } from '@/modules/booking/schema';
import { toMoney, type Money, type MoneyDb } from '@/modules/payments/schema';
import {
  AnonymiseInput, CustomerInput, NoteInput, SaveCustomerInput,
  type CustomerProfile, type CustomerRow,
} from './schema';

export type CustomerHit = { id: string; displayName: string; phone: string | null };
const STAFF_DESK = ['owner', 'manager', 'receptionist'] as const;
const MANAGERS = ['owner', 'manager'] as const;
const PAGE = 50;

/** The PostgREST `or` filter for a free-text term: names, or the phone in whatever format it was typed. */
function termFilter(raw: string): string | null {
  const term = raw.trim().replace(/[%,()*]/g, ' ').slice(0, 60).trim();
  if (!term) return null;
  const parts = [`display_name.ilike.%${term}%`, `full_name.ilike.%${term}%`];
  const digits = term.replace(/[\s\-.()]/g, '');
  if (/^\+?\d{3,}$/.test(digits)) parts.push(`phone.ilike.%${normalizePhone(term) ?? digits}%`);
  return parts.join(',');
}

export async function searchCustomers(q: string): Promise<{ ok: true; customers: CustomerHit[] } | { ok: false; code: string }> {
  if (!(await roleOrNull(...STAFF_DESK))) return fail('NOT_AUTHORIZED');
  const filter = termFilter(q);
  const supabase = await createClient();
  let query = supabase.from('customers').select('id, display_name, phone').is('anonymised_at', null).order('display_name').limit(8);
  if (filter) query = query.or(filter);
  const { data, error } = await query;
  if (error) return failFrom(error);
  return { ok: true, customers: (data ?? []).map((c) => ({ id: c.id, displayName: c.display_name, phone: c.phone })) };
}

/** On a duplicate phone the failure carries the existing customer's id, so the screen can link to it. */
export async function createCustomer(input: CustomerInput): Promise<
  { ok: true; id: string; customer: CustomerHit } | { ok: false; code: string; existingId?: string }> {
  if (!(await roleOrNull(...STAFF_DESK))) return fail('NOT_AUTHORIZED');
  const p = CustomerInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  let phone: string | null = null;
  if (p.data.phone) {
    phone = normalizePhone(p.data.phone);
    if (!phone) return fail('INVALID_INPUT');
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from('customers').insert({ display_name: p.data.displayName, phone }).select('id, display_name, phone').single();
  if (error) {
    const failure = failFrom(error);
    if (failure.code === 'DUPLICATE' && phone) {
      const { data: existing } = await supabase.from('customers').select('id').eq('phone', phone).maybeSingle();
      return { ...failure, ...(existing ? { existingId: existing.id } : {}) };
    }
    return failure;
  }
  return { ok: true, id: data.id, customer: { id: data.id, displayName: data.display_name, phone: data.phone } };
}

/** 50 per page. */
export async function listCustomers(input: { q?: string; page?: number }): Promise<
  { ok: true; rows: CustomerRow[]; total: number } | { ok: false; code: string }> {
  if (!(await roleOrNull(...STAFF_DESK))) return fail('NOT_AUTHORIZED');
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const supabase = await createClient();
  let query = supabase.from('customers').select('id, display_name, phone, anonymised_at', { count: 'exact' })
    .order('display_name').order('id').range((page - 1) * PAGE, page * PAGE - 1);
  const filter = termFilter(input.q ?? '');
  if (filter) query = query.or(filter);
  const { data, error, count } = await query;
  if (error) return failFrom(error);
  const ids = (data ?? []).map((c) => c.id);
  const last = new Map<string, string>();
  if (ids.length) {
    const { data: b, error: be } = await supabase.from('bookings').select('customer_id, service_during').in('customer_id', ids).eq('status', 'completed');
    if (be) return failFrom(be);
    for (const x of b ?? []) {
      const start = parseRange(String(x.service_during)).start;
      if (!last.has(x.customer_id) || start > last.get(x.customer_id)!) last.set(x.customer_id, start);
    }
  }
  return {
    ok: true, total: count ?? 0,
    rows: (data ?? []).map((c) => ({ id: c.id, displayName: c.display_name, phone: c.phone, lastVisit: last.get(c.id) ?? null, anonymised: c.anonymised_at !== null })),
  };
}

export async function getCustomer(id: string): Promise<{ ok: true; customer: CustomerProfile } | { ok: false; code: string }> {
  const session = await roleOrNull(...STAFF_DESK);
  if (!session) return fail('NOT_AUTHORIZED');
  if (!SaveCustomerInput.shape.id.safeParse(id).success) return fail('INVALID_INPUT');
  const supabase = await createClient();
  const isManager = session.role === 'owner' || session.role === 'manager';
  const [c, sum, bk, notes] = await Promise.all([
    supabase.from('customers').select('*').eq('id', id).maybeSingle(),
    supabase.rpc('customer_summary', { p_customer_id: id }),
    supabase.from('bookings').select('id, service_during, status, service_id, therapist_id, room_id, note').eq('customer_id', id).order('service_during', { ascending: false }).limit(50),
    isManager ? supabase.from('customer_private_notes').select('id, body, created_at').eq('customer_id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [c, sum, bk, notes]) if (r.error) return failFrom(r.error);
  if (!c.data) return fail('NOT_AUTHORIZED');
  const s = ((sum.data ?? []) as Record<string, unknown>[])[0] ?? {};
  const bookings = bk.data ?? [];
  const m = bookings.length ? await supabase.rpc('booking_money', { p_booking_ids: bookings.map((b) => b.id) }) : { data: [], error: null };
  if (m.error) return failFrom(m.error);
  const money = new Map<string, Money>(((m.data ?? []) as MoneyDb[]).map((x) => [x.booking_id, toMoney(x)]));
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    ok: true,
    customer: {
      id: c.data.id, displayName: c.data.display_name, fullName: c.data.full_name, phone: c.data.phone, email: c.data.email,
      preferredTherapistId: c.data.preferred_therapist_id, serviceNotes: c.data.service_notes, commsConsent: c.data.comms_consent,
      consentRecordedAt: c.data.consent_recorded_at, anonymisedAt: c.data.anonymised_at,
      summary: {
        visits: Number(s.visits ?? 0), cancelled: Number(s.cancelled ?? 0), noShows: Number(s.no_shows ?? 0),
        firstVisit: (s.first_visit as string) ?? null, lastVisit: (s.last_visit as string) ?? null,
        avgDaysBetween: n(s.avg_days_between), topServiceId: (s.top_service_id as string) ?? null, upcoming: Number(s.upcoming ?? 0),
      },
      history: bookings.map((b) => {
        const r = parseRange(String(b.service_during));
        return {
          bookingId: b.id, startsAt: r.start, endsAt: r.end, status: b.status as BookingStatus, serviceId: b.service_id,
          therapistId: b.therapist_id, roomId: b.room_id, note: b.note, money: money.get(b.id) ?? null,
        };
      }),
      privateNotes: (notes.data ?? []).map((x) => ({ id: x.id, body: x.body, createdAt: x.created_at })),
    },
  };
}

/** Normalises the phone; sets consent_recorded_at whenever the consent changes. */
export async function saveCustomer(input: SaveCustomerInput): Promise<ActionResult> {
  if (!(await roleOrNull(...STAFF_DESK))) return fail('NOT_AUTHORIZED');
  const p = SaveCustomerInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  let phone: string | null = null;
  if (v.phone) {
    phone = normalizePhone(v.phone);
    if (!phone) return fail('INVALID_INPUT');
  }
  const supabase = await createClient();
  const { data: cur, error: ce } = await supabase.from('customers').select('comms_consent').eq('id', v.id).maybeSingle();
  if (ce) return failFrom(ce);
  if (!cur) return fail('NOT_AUTHORIZED');
  const { error } = await supabase.from('customers').update({
    display_name: v.displayName, full_name: v.fullName ?? null, phone, email: v.email ?? null,
    preferred_therapist_id: v.preferredTherapistId ?? null, service_notes: v.serviceNotes ?? null, comms_consent: v.commsConsent,
    ...(cur.comms_consent !== v.commsConsent ? { consent_recorded_at: new Date().toISOString() } : {}),
  }).eq('id', v.id);
  if (error) return failFrom(error);
  return done(v.id);
}

export async function addPrivateNote(input: NoteInput): Promise<ActionResult> {
  if (!(await roleOrNull(...MANAGERS))) return fail('NOT_AUTHORIZED');
  const p = NoteInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const { data, error } = await (await createClient()).from('customer_private_notes').insert({ customer_id: p.data.customerId, body: p.data.body }).select('id').single();
  if (error) return failFrom(error);
  return done(data.id);
}

/** What a treatment needs (booking note, treatment preferences). Any staff role; the database decides. */
export async function getBookingDetail(bookingId: string): Promise<{ ok: true; note: string | null; serviceNotes: string | null } | { ok: false; code: string }> {
  if (!(await roleOrNull())) return fail('NOT_AUTHORIZED');
  if (!SaveCustomerInput.shape.id.safeParse(bookingId).success) return fail('INVALID_INPUT');
  const { data, error } = await (await createClient()).rpc('booking_detail', { p_booking_id: bookingId });
  if (error) return failFrom(error);
  const row = ((data ?? []) as { note: string | null; service_notes: string | null }[])[0];
  return { ok: true, note: row?.note ?? null, serviceNotes: row?.service_notes ?? null };
}

/** Owner only. The typed name must equal the customer's current display name. Irreversible. */
export async function anonymiseCustomer(input: AnonymiseInput): Promise<ActionResult> {
  if (!(await roleOrNull('owner'))) return fail('NOT_AUTHORIZED');
  const p = AnonymiseInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const supabase = await createClient();
  const { data: c, error: ce } = await supabase.from('customers').select('display_name').eq('id', p.data.id).maybeSingle();
  if (ce) return failFrom(ce);
  if (!c) return fail('NOT_AUTHORIZED');
  if (p.data.confirmText !== c.display_name) return fail('INVALID_INPUT');
  const { data, error } = await supabase.rpc('anonymise_customer', { p_customer_id: p.data.id, p_reason: p.data.reason });
  if (error) return failFrom(error);
  return done(data.id);
}

export type RetentionRow = { customerId: string; displayName: string; lastActivity: string };

/** Owner only. A list for review; nothing is anonymised by it. */
export async function getRetentionCandidates(): Promise<{ ok: true; rows: RetentionRow[]; months: number } | { ok: false; code: string }> {
  if (!(await roleOrNull('owner'))) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const [r, s] = await Promise.all([supabase.rpc('retention_candidates'), supabase.rpc('get_settings')]);
  if (r.error) return failFrom(r.error);
  if (s.error) return failFrom(s.error);
  const rows = ((r.data ?? []) as { customer_id: string; display_name: string; last_activity: string }[])
    .map((x) => ({ customerId: x.customer_id, displayName: x.display_name, lastActivity: x.last_activity }));
  return { ok: true, rows, months: Number((s.data as Record<string, unknown>)['retention.inactive_months']) };
}
