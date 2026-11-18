import { headers } from 'next/headers';
import { z } from 'zod';
import { parseEnv } from '@/lib/env';
import { allow } from './rateLimit';
import { clientIp } from './http';
import { publicDb } from './db';
import { verifyCancelToken } from './session';

export type PublicTherapist = { id: string; name: string; bioTh: string | null; bioEn: string | null; specialties: string[]; hasPhoto: boolean };
export type PublicService = { id: string; nameTh: string; nameEn: string | null; durationMin: number; priceSatang: number };
export type PublicBooking = { startsAt: string; endsAt: string; status: string; serviceNameTh: string; serviceNameEn: string | null; therapistName: string };

/** The page is open only when every LINE variable is set AND the owner has turned online booking on. */
export async function isOpen(): Promise<boolean> {
  if (!parseEnv(process.env).line) return false;
  const { data } = await publicDb().from('app_settings').select('value').eq('key', 'online.enabled').maybeSingle();
  return data?.value === true;
}

export async function listTherapists(): Promise<PublicTherapist[]> {
  const { data } = await publicDb().rpc('public_therapists');
  return ((data ?? []) as { id: string; display_name: string; bio_th: string | null; bio_en: string | null; specialties: string[]; has_photo: boolean }[])
    .map((r) => ({ id: r.id, name: r.display_name, bioTh: r.bio_th, bioEn: r.bio_en, specialties: r.specialties, hasPhoto: r.has_photo }));
}

export async function getTherapist(id: string): Promise<{ therapist: PublicTherapist; services: PublicService[] } | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const therapist = (await listTherapists()).find((t) => t.id === id);
  if (!therapist) return null;
  return { therapist, services: await getTherapistServices(id) };
}

/** Only the public, online-bookable treatments returned by the public RPC. */
export async function getTherapistServices(id: string): Promise<PublicService[]> {
  const { data } = await publicDb().rpc('public_therapist_services', { p_therapist_id: id });
  const services = ((data ?? []) as { service_id: string; name_th: string; name_en: string | null; duration_min: number; price_satang: number }[])
    .map((s) => ({ id: s.service_id, nameTh: s.name_th, nameEn: s.name_en, durationMin: s.duration_min, priceSatang: s.price_satang }));
  return services;
}

const FreeTimesInput = z.object({ therapistId: z.uuid(), serviceId: z.uuid(), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/** ISO start times (30-minute steps) on a Bangkok day. Empty when the input is bad, the page is closed, or the caller is rate limited. */
export async function getFreeTimes(input: z.input<typeof FreeTimesInput>): Promise<string[]> {
  const p = FreeTimesInput.safeParse(input);
  if (!p.success) return [];
  if (!(await allow(`times:${clientIp(await headers())}`, 60, 60))) return [];
  const { data, error } = await publicDb().rpc('public_free_times', { p_therapist_id: p.data.therapistId, p_service_id: p.data.serviceId, p_day: p.data.day });
  if (error) return [];
  return ((data ?? []) as { starts_at: string }[]).map((r) => new Date(r.starts_at).toISOString());
}

/** The confirmation and cancel pages: what the guest may see about their own booking, found by the signed link. */
export async function getBookingView(token: string): Promise<(PublicBooking & { id: string }) | null> {
  const id = verifyCancelToken(token);
  if (!id) return null;
  const { data } = await publicDb().rpc('public_booking_view', { p_booking_id: id });
  const r = ((data ?? []) as { starts_at: string; ends_at: string; status: string; service_name_th: string; service_name_en: string | null; therapist_name: string }[])[0];
  return r ? { id, startsAt: r.starts_at, endsAt: r.ends_at, status: r.status, serviceNameTh: r.service_name_th, serviceNameEn: r.service_name_en, therapistName: r.therapist_name } : null;
}
