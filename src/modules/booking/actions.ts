'use server';

import { createClient } from '@/lib/supabase/server';
import { roleOrNull } from '@/modules/identity/session';
import { fail, failFrom } from '@/lib/action';
import { bangkokDayRange } from '@/lib/time';
import { rankAllocations, type Candidate } from './allocation';
import { CreateBookingInput, DayInput, MoveBookingInput, SetStatusInput, SuggestInput, type BookingStatus } from './schema';

const DESK = ['owner', 'manager', 'receptionist'] as const;

export type BoardRow = {
  bookingId: string; version: number; status: BookingStatus; source: 'advance' | 'walk_in';
  startsAt: string; endsAt: string; roomFreeAt: string;
  therapistId: string; roomId: string; positionId: string; partyId: string; serviceId: string;
  customerId: string | null; customerDisplayName: string;
};

type BoardDb = {
  booking_id: string; version: number; status: BookingStatus; source: 'advance' | 'walk_in'; starts_at: string; ends_at: string; room_free_at: string;
  therapist_id: string; room_id: string; position_id: string; party_id: string; service_id: string; customer_id: string | null; customer_display_name: string;
};
type CandidateDb = { therapist_id: string; position_id: string; room_id: string; therapist_minutes_today: number; room_sort: number };

/** Any staff role; therapists receive only their own rows from the database. */
export async function getBoard(day: string): Promise<{ ok: true; rows: BoardRow[] } | { ok: false; code: string }> {
  if (!(await roleOrNull())) return fail('NOT_AUTHORIZED');
  if (!DayInput.safeParse(day).success) return fail('INVALID_INPUT');
  const { from, to } = bangkokDayRange(day);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('booking_board', { p_from: from, p_to: to });
  if (error) return failFrom(error);
  const rows = ((data ?? []) as BoardDb[]).map((r): BoardRow => ({
    bookingId: r.booking_id, version: r.version, status: r.status, source: r.source,
    startsAt: r.starts_at, endsAt: r.ends_at, roomFreeAt: r.room_free_at,
    therapistId: r.therapist_id, roomId: r.room_id, positionId: r.position_id, partyId: r.party_id, serviceId: r.service_id,
    customerId: r.customer_id, customerDisplayName: r.customer_display_name,
  }));
  return { ok: true, rows };
}

/** available_candidates, ranked with the customer's preferred therapist first. */
export async function suggestAllocations(input: SuggestInput): Promise<{ ok: true; candidates: Candidate[] } | { ok: false; code: string }> {
  if (!(await roleOrNull(...DESK))) return fail('NOT_AUTHORIZED');
  const p = SuggestInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('available_candidates', { p_service_id: p.data.serviceId, p_start: p.data.start });
  if (error) return failFrom(error);
  let preferred: string | undefined;
  if (p.data.customerId) {
    const { data: c } = await supabase.from('customers').select('preferred_therapist_id').eq('id', p.data.customerId).maybeSingle();
    preferred = c?.preferred_therapist_id ?? undefined;
  }
  const candidates: Candidate[] = ((data ?? []) as CandidateDb[]).map((r) => ({
    therapistId: r.therapist_id, positionId: r.position_id, roomId: r.room_id,
    therapistMinutesToday: r.therapist_minutes_today, roomSort: r.room_sort,
  }));
  return { ok: true, candidates: rankAllocations(candidates, { preferredTherapistId: preferred }) };
}

export async function createBooking(input: CreateBookingInput): Promise<{ ok: true; id: string; start: string } | { ok: false; code: string }> {
  if (!(await roleOrNull(...DESK))) return fail('NOT_AUTHORIZED');
  const p = CreateBookingInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_booking', {
    p_customer_id: v.customerId, p_service_id: v.serviceId, p_therapist_id: v.therapistId, p_position_id: v.positionId,
    p_start: v.start, p_source: v.source, p_idempotency_key: v.idempotencyKey,
    ...(v.partyId ? { p_party_id: v.partyId } : {}), ...(v.note ? { p_note: v.note } : {}),
  });
  if (error) return failFrom(error);
  return { ok: true, id: data.id, start: v.start };
}

export async function moveBooking(input: MoveBookingInput): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  if (!(await roleOrNull(...DESK))) return fail('NOT_AUTHORIZED');
  const p = MoveBookingInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const v = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('move_booking', {
    p_booking_id: v.bookingId, p_start: v.start, p_therapist_id: v.therapistId, p_position_id: v.positionId, p_expected_version: v.expectedVersion,
  });
  if (error) return failFrom(error);
  return { ok: true, id: data.id };
}

/** Therapists may call it; the database enforces which transitions they may make. */
export async function setBookingStatus(input: SetStatusInput): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  if (!(await roleOrNull())) return fail('NOT_AUTHORIZED');
  const p = SetStatusInput.safeParse(input);
  if (!p.success) return fail('INVALID_INPUT');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_booking_status', {
    p_booking_id: p.data.bookingId, p_to: p.data.to, p_expected_version: p.data.expectedVersion,
  });
  if (error) return failFrom(error);
  return { ok: true, id: data.id };
}
