import { z } from 'zod';
import type { BookingStatus } from '@/modules/booking/schema';
import type { Money } from '@/modules/payments/schema';

export const CustomerInput = z.object({
  displayName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional().transform((v) => (v ? v : undefined)),
});
export type CustomerInput = z.input<typeof CustomerInput>;

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const SaveCustomerInput = z.object({
  id: z.uuid(), displayName: z.string().trim().min(1).max(80), fullName: opt(120), phone: opt(30),
  email: z.string().trim().max(120).optional().transform((v) => (v ? v : undefined)).pipe(z.email().optional()),
  preferredTherapistId: z.uuid().nullable().optional(), serviceNotes: opt(500), commsConsent: z.boolean(),
});
export type SaveCustomerInput = z.input<typeof SaveCustomerInput>;

export const NoteInput = z.object({ customerId: z.uuid(), body: z.string().trim().min(1).max(1000) });
export type NoteInput = z.input<typeof NoteInput>;

export const AnonymiseInput = z.object({ id: z.uuid(), reason: z.string().trim().max(300), confirmText: z.string() });
export type AnonymiseInput = z.input<typeof AnonymiseInput>;

export type CustomerRow = { id: string; displayName: string; phone: string | null; lastVisit: string | null; anonymised: boolean };

export type CustomerProfile = {
  id: string; displayName: string; fullName: string | null; phone: string | null; email: string | null;
  preferredTherapistId: string | null; serviceNotes: string | null; commsConsent: boolean; consentRecordedAt: string | null;
  anonymisedAt: string | null;
  summary: {
    visits: number; cancelled: number; noShows: number; firstVisit: string | null; lastVisit: string | null;
    avgDaysBetween: number | null; topServiceId: string | null; upcoming: number;
  };
  history: {
    bookingId: string; startsAt: string; endsAt: string; status: BookingStatus; serviceId: string; therapistId: string; roomId: string;
    note: string | null; money: Money | null;
  }[];
  /** Empty unless the viewer is an owner or manager. */
  privateNotes: { id: string; body: string; createdAt: string }[];
};
