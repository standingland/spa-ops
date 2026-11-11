'use server';

import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { done, fail, failFrom, type ActionResult } from '@/lib/action';
import { parseTHB } from '@/lib/money';
import type { BookingStatus } from '@/modules/booking/schema';
import {
  AdjustChargeInput, RecordPaymentInput, toMoney,
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
