import { z } from 'zod';
import type { BookingStatus } from '@/modules/booking/schema';

export type PaymentStatus = 'not_due' | 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'refunded';
export type Money = {
  bookingId: string; chargeSatang: number; paidSatang: number; refundedSatang: number; dueSatang: number;
  paymentStatus: PaymentStatus; hasUnverified: boolean;
};
export type PendingPayment = {
  bookingId: string; customerDisplayName: string; startsAt: string; status: BookingStatus;
  chargeSatang: number; dueSatang: number; paymentStatus: PaymentStatus;
};
export type PaymentMethod = { id: string; code: string; nameTh: string; nameEn: string | null; needsVerification: boolean };

export type MoneyDb = {
  booking_id: string; charge_satang: number; paid_satang: number; refunded_satang: number; due_satang: number;
  payment_status: PaymentStatus; has_unverified: boolean;
};
export const toMoney = (r: MoneyDb): Money => ({
  bookingId: r.booking_id, chargeSatang: r.charge_satang, paidSatang: r.paid_satang, refundedSatang: r.refunded_satang,
  dueSatang: r.due_satang, paymentStatus: r.payment_status, hasUnverified: r.has_unverified,
});

const text = z.string().trim().max(300).optional().transform((v) => (v ? v : undefined));

export const RecordPaymentInput = z.object({
  bookingId: z.uuid(), methodId: z.uuid(), amount: z.string().trim().min(1).max(20),
  reference: text, note: text, idempotencyKey: z.string().min(8).max(100),
});
export type RecordPaymentInput = z.input<typeof RecordPaymentInput>;

export const AdjustChargeInput = z.object({
  bookingId: z.uuid(), discount: text, fee: text, reason: z.string().trim().max(300), expectedVersion: z.number().int().positive(),
});
export type AdjustChargeInput = z.input<typeof AdjustChargeInput>;

export const VerifyInput = z.uuid();
export const VoidInput = z.object({ id: z.uuid(), reason: z.string().trim().max(300) });
export type VoidInput = z.input<typeof VoidInput>;
export const RefundInput = z.object({
  paymentId: z.uuid(), amount: z.string().trim().min(1).max(20), reason: z.string().trim().max(300), idempotencyKey: z.string().min(8).max(100),
});
export type RefundInput = z.input<typeof RefundInput>;
export const CloseCashInput = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), counted: z.string().trim().min(1).max(20), note: text });
export type CloseCashInput = z.input<typeof CloseCashInput>;
export const MethodInput = z.object({
  id: z.uuid().optional(), code: z.string().trim().regex(/^[a-z0-9_]{2,30}$/), nameTh: z.string().trim().min(1).max(60),
  nameEn: text, needsVerification: z.boolean(),
});
export type MethodInput = z.input<typeof MethodInput>;
