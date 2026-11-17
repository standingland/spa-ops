import { z } from 'zod';

export const PreferencesInput = z.object({ customerId: z.uuid(), pressure: z.enum(['', 'light', 'medium', 'firm']), oil: z.string().trim().max(120), room: z.string().trim().max(200), notes: z.string().trim().max(500) });
export type Preferences = { pressure?: '' | 'light' | 'medium' | 'firm'; oil?: string; room?: string; notes?: string };
export const WaitlistInput = z.object({ therapistId: z.uuid(), serviceId: z.uuid(), from: z.iso.datetime({ offset: true }), to: z.iso.datetime({ offset: true }), notifyConsent: z.literal(true) }).refine((v) => Date.parse(v.to) >= Date.parse(v.from));
export type Appointment = { id: string; source: string; status: string; starts_at: string; ends_at: string; therapist_id: string; service_id: string; therapist_name: string; service_name_th: string; service_name_en: string | null; repeatable: boolean; cancelToken?: string };
export type WaitlistEntry = { id: string; status: string; window_from: string; window_to: string; offered_start: string | null; offer_expires_at: string | null; therapist_name: string; service_name_th: string; service_name_en: string | null; customer_name?: string };
export type MyAppointments = { upcoming: Appointment[]; history: Appointment[]; history_count: number; waitlist: WaitlistEntry[] };
export type SettlementTherapist = { therapist_id: string; therapist_name: string; amount_satang: number; paid_at: string | null; reference: string | null };
export type Settlement = { revision: string; count: number; total_satang: number; summary: SettlementTherapist[]; batches: { id: string; from_day: string; to_day: string; approved_at: string; therapists: SettlementTherapist[] }[] };
