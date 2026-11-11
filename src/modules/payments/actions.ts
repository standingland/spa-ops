'use server';

import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { parseTHB } from '@/lib/money';
import { bangkokDayRange } from '@/lib/time';
import type { BookingStatus } from '@/modules/booking/schema';
import {
  AdjustChargeInput, CloseCashInput, MethodInput, RecordPaymentInput, RefundInput, VerifyInput, VoidInput, toMoney,
  type Money, type MoneyDb, type PaymentMethod, type PendingPayment,
} from './schema';

const DESK = ['owner', 'manager', 'receptionist'] as const;
const MANAGERS = ['owner', 'manager'] as const;

/** Owner, manager, receptionist. */
export async function getMoney(bookingIds: string[]): Promise<{ ok: true; money: Money[] } | { ok: false; code: string }> {
  if (!(await roleOrNull(...DESK))) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('booking_money', { p_booking_ids: bookingIds });
  if (error) return failFrom(error);
  return { ok: true, money: ((data ?? []) as MoneyDb[]).map(toMoney) };
}

export async function getPendingPayments(): Promise<{ ok: true; rows: PendingPayment[] } | { ok: false; code: string }> {
  if (!(await roleOrNull(...DESK))) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pending_payments');
  if (error) return failFrom(error);
  type Row = { booking_id: string; customer_display_name: string; starts_at: string; status: BookingStatus; charge_satang: number; due_satang: number; payment_status: PendingPayment['paymentStatus'] };
  return {
    ok: true,
    rows: ((data ?? []) as Row[]).map((r) => ({
      bookingId: r.booking_id, customerDisplayName: r.customer_display_name, startsAt: r.starts_at, status: r.status,
      chargeSatang: r.charge_satang, dueSatang: r.due_satang, paymentStatus: r.payment_status,
    })),
  };
}

/** Active methods only. */
export async function listPaymentMethods(): Promise<{ ok: true; methods: PaymentMethod[] } | { ok: false; code: string }> {
  if (!(await roleOrNull(...DESK))) return fail('NOT_AUTHORIZED');
  const supabase = await createClient();
  const { data, error } = await supabase.from('payment_methods').select('id, code, name_th, name_en, needs_verification').eq('active', true).order('sort_order').order('code');
  if (error) return failFrom(error);
  return { ok: true, methods: (data ?? []).map((m) => ({ id: m.id, code: m.code, nameTh: m.name_th, nameEn: m.name_en, needsVerification: m.needs_verification })) };
}

/** True when this viewer may record payments right now (the owner can switch reception off). */
export async function canRecordPayments(role: string): Promise<boolean> {
  if (role === 'owner' || role === 'manager') return true;
  if (role !== 'receptionist') return false;
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_settings');
  return (data as Record<string, unknown> | null)?.['payments.receptionist_can_record'] !== false;
}

/** Everything the booking panel needs in one call. Desk roles only; therapists get nothing. */
export async function getPaymentPanel(bookingId: string): Promise<
  { ok: true; money: Money | null; methods: PaymentMethod[]; canRecord: boolean; canAdjust: boolean } | { ok: false; code: string }> {
  const session = await roleOrNull(...DESK);
  if (!session) return fail('NOT_AUTHORIZED');
  const [m, methods, canRecord] = await Promise.all([getMoney([bookingId]), listPaymentMethods(), canRecordPayments(session.role)]);
  if (!m.ok) return m;
  if (!methods.ok) return methods;
  return { ok: true, money: m.money[0] ?? null, methods: methods.methods, canRecord, canAdjust: session.role !== 'receptionist' };
}

/** `amount` is what the person typed. A repeated idempotency key returns the first payment. */
export async function recordPayment(input: RecordPaymentInput): Promise<ActionResult> {
  if (!(await roleOrNull(...DESK))) return fail('NOT_AUTHORIZED');
  const p = RecordPaymentInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const satang = parseTHB(p.data.amount);
  if (satang === null || satang <= 0) return fail('INVALID_AMOUNT');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('record_payment', {
    p_booking_id: p.data.bookingId, p_method_id: p.data.methodId, p_amount_satang: satang,
    p_idempotency_key: p.data.idempotencyKey,
    ...(p.data.reference ? { p_reference: p.data.reference } : {}), ...(p.data.note ? { p_note: p.data.note } : {}),
  });
  if (error) return failFrom(error);
  return done(data.id);
}

/** Owner, manager. Empty discount or fee leaves that field unchanged. */
export async function adjustCharge(input: AdjustChargeInput): Promise<ActionResult> {
  if (!(await roleOrNull(...MANAGERS))) return fail('NOT_AUTHORIZED');
  const p = AdjustChargeInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const conv = (v: string | undefined): number | null | 'bad' => {
    if (v === undefined) return null;
    const n = parseTHB(v);
    return n === null ? 'bad' : n;
  };
  const discount = conv(p.data.discount);
  const fee = conv(p.data.fee);
  if (discount === 'bad' || fee === 'bad') return fail('INVALID_AMOUNT');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('adjust_booking_charge', {
    p_booking_id: p.data.bookingId, p_discount_satang: discount, p_fee_satang: fee,
    p_reason: p.data.reason, p_expected_version: p.data.expectedVersion,
  });
  if (error) return failFrom(error);
  return done(data.id);
}

// ---- reconciliation (owner, manager) --------------------------------------------------------------------------

export type LedgerEntry = {
  id: string; bookingId: string; customerDisplayName: string; kind: 'payment' | 'refund'; methodCode: string;
  amountSatang: number; reference: string | null; receivedAt: string; verified: boolean; voided: boolean; voidReason: string | null;
};
export type LedgerSummaryRow = {
  methodId: string; code: string; name: string; payments: number; recordedSatang: number; verifiedSatang: number;
  unverifiedSatang: number; refundedSatang: number; voidedSatang: number;
};
export type Closing = { expectedSatang: number; countedSatang: number; note: string | null; closedAt: string; expectedNowSatang: number };

export async function getDayLedger(day: string): Promise<
  { ok: true; summary: LedgerSummaryRow[]; entries: LedgerEntry[]; closing: Closing | null } | { ok: false; code: string }> {
  if (!(await roleOrNull(...MANAGERS))) return fail('NOT_AUTHORIZED');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail('INVALID_INPUT');
  const range = bangkokDayRange(day);
  const supabase = await createClient();
  const [sum, methods, rows, closing] = await Promise.all([
    supabase.rpc('payment_day_summary', { p_day: day }),
    supabase.from('payment_methods').select('id, code, name_th'),
    supabase.from('payments')
      .select('id, booking_id, kind, amount_satang, reference, received_at, verified_at, voided_at, void_reason, payment_methods(code), bookings(customers(display_name))')
      .gte('received_at', range.from).lt('received_at', range.to).order('received_at').order('id'),
    supabase.from('cash_closings').select('expected_satang, counted_satang, note, closed_at').eq('day', day).maybeSingle(),
  ]);
  for (const r of [sum, methods, rows, closing]) if (r.error) return failFrom(r.error);

  const byId = new Map((methods.data ?? []).map((m) => [m.id, m]));
  const summary = ((sum.data ?? []) as Record<string, number | string>[]).map((s) => ({
    methodId: String(s.method_id), code: byId.get(String(s.method_id))?.code ?? '', name: byId.get(String(s.method_id))?.name_th ?? '',
    payments: Number(s.payments), recordedSatang: Number(s.recorded_satang), verifiedSatang: Number(s.verified_satang),
    unverifiedSatang: Number(s.unverified_satang), refundedSatang: Number(s.refunded_satang), voidedSatang: Number(s.voided_satang),
  }));
  type Row = {
    id: string; booking_id: string; kind: 'payment' | 'refund'; amount_satang: number; reference: string | null; received_at: string;
    verified_at: string | null; voided_at: string | null; void_reason: string | null;
    payment_methods: { code: string } | null; bookings: { customers: { display_name: string } | null } | null;
  };
  const entries: LedgerEntry[] = ((rows.data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id, bookingId: r.booking_id, customerDisplayName: r.bookings?.customers?.display_name ?? '', kind: r.kind,
    methodCode: r.payment_methods?.code ?? '', amountSatang: r.amount_satang, reference: r.reference, receivedAt: r.received_at,
    verified: r.verified_at !== null, voided: r.voided_at !== null, voidReason: r.void_reason,
  }));
  const expectedNow = entries.filter((e) => e.methodCode === 'cash' && !e.voided)
    .reduce((t, e) => t + (e.kind === 'payment' ? e.amountSatang : -e.amountSatang), 0);
  const c = closing.data;
  return {
    ok: true, summary, entries,
    closing: c ? { expectedSatang: Number(c.expected_satang), countedSatang: Number(c.counted_satang), note: c.note, closedAt: c.closed_at, expectedNowSatang: expectedNow } : null,
  };
}

export async function verifyPayment(id: string): Promise<ActionResult> {
  if (!(await roleOrNull(...MANAGERS))) return fail('NOT_AUTHORIZED');
  if (!VerifyInput.safeParse(id).success) return fail('INVALID_INPUT');
  const { data, error } = await (await createClient()).rpc('verify_payment', { p_payment_id: id });
  if (error) return failFrom(error);
  return done(data.id);
}

export async function voidPayment(input: VoidInput): Promise<ActionResult> {
  if (!(await roleOrNull(...MANAGERS))) return fail('NOT_AUTHORIZED');
  const p = VoidInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const { data, error } = await (await createClient()).rpc('void_payment', { p_payment_id: p.data.id, p_reason: p.data.reason });
  if (error) return failFrom(error);
  return done(data.id);
}

export async function refundPayment(input: RefundInput): Promise<ActionResult> {
  if (!(await roleOrNull(...MANAGERS))) return fail('NOT_AUTHORIZED');
  const p = RefundInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const satang = parseTHB(p.data.amount);
  if (satang === null || satang <= 0) return fail('INVALID_AMOUNT');
  const { data, error } = await (await createClient()).rpc('record_refund', {
    p_payment_id: p.data.paymentId, p_amount_satang: satang, p_idempotency_key: p.data.idempotencyKey, p_reason: p.data.reason,
  });
  if (error) return failFrom(error);
  return done(data.id);
}

export async function closeCashDay(input: CloseCashInput): Promise<ActionResult> {
  if (!(await roleOrNull(...MANAGERS))) return fail('NOT_AUTHORIZED');
  const p = CloseCashInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const satang = parseTHB(p.data.counted);
  if (satang === null) return fail('INVALID_AMOUNT');
  const { error } = await (await createClient()).rpc('close_cash_day', {
    p_day: p.data.day, p_counted_satang: satang, ...(p.data.note ? { p_note: p.data.note } : {}),
  });
  if (error) return failFrom(error);
  return done(p.data.day);
}

// ---- payment methods (owner) ---------------------------------------------------------------------------------

export type MethodRow = PaymentMethod & { active: boolean };

export async function listAllPaymentMethods(): Promise<{ ok: true; methods: MethodRow[] } | { ok: false; code: string }> {
  if (!(await roleOrNull('owner'))) return fail('NOT_AUTHORIZED');
  const { data, error } = await (await createClient()).from('payment_methods').select('id, code, name_th, name_en, needs_verification, active').order('sort_order').order('code');
  if (error) return failFrom(error);
  return { ok: true, methods: (data ?? []).map((m) => ({ id: m.id, code: m.code, nameTh: m.name_th, nameEn: m.name_en, needsVerification: m.needs_verification, active: m.active })) };
}

/** Adds a method, or renames / re-flags an existing one (its code never changes). Nothing is deleted. */
export async function savePaymentMethod(input: MethodInput): Promise<ActionResult> {
  if (!(await roleOrNull('owner'))) return fail('NOT_AUTHORIZED');
  const p = MethodInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const supabase = await createClient();
  if (v.id) {
    const { error } = await supabase.from('payment_methods').update({ name_th: v.nameTh, name_en: v.nameEn ?? null, needs_verification: v.needsVerification }).eq('id', v.id);
    if (error) return failFrom(error);
    return done(v.id);
  }
  const { data: last } = await supabase.from('payment_methods').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase.from('payment_methods')
    .insert({ code: v.code, name_th: v.nameTh, name_en: v.nameEn ?? null, needs_verification: v.needsVerification, sort_order: (last?.sort_order ?? 0) + 1 })
    .select('id').single();
  if (error) return failFrom(error);
  return done(data.id);
}

export async function setPaymentMethodActive(id: string, active: boolean): Promise<ActionResult> {
  if (!(await roleOrNull('owner'))) return fail('NOT_AUTHORIZED');
  if (!VerifyInput.safeParse(id).success) return fail('INVALID_INPUT');
  const { error } = await (await createClient()).from('payment_methods').update({ active }).eq('id', id);
  if (error) return failFrom(error);
  return done(id);
}
