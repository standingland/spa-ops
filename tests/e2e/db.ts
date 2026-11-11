import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { addDays, bangkokDay, bangkokInstant } from '../../src/lib/time';

try { process.loadEnvFile('.env.local'); } catch { /* env may already be set */ }

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY!;
export const admin = createClient(URL, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });

const NIL = '00000000-0000-0000-0000-000000000000';
/** The seeded price of the first service, and the price the money tests book it at (฿1,500.00). */
const SEED_PRICE = 80000;
export const TEST_PRICE = 150000;
export const SEED_ROOM_CODES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
export const SEED_SERVICE_NAMES = ['นวดไทย 60 นาที', 'นวดไทย 90 นาที', 'นวดน้ำมัน 60 นาที', 'นวดน้ำมัน 90 นาที', 'นวดเท้า 45 นาที'];
export const SEED_EMAILS = ['owner@spa.test', 'manager@spa.test', 'reception@spa.test', 'therapist@spa.test'];
const SEED_USER_IDS = ['1', '2', '3', '4'].map((n) => `00000000-0000-4000-8000-00000000000${n}`);

/** Restores the seeded state: removes everything the tests created. */
export async function resetTestData() {
  await admin.from('notification_outbox').delete().neq('id', NIL);
  await admin.from('room_turnovers').delete().neq('id', NIL);
  await admin.from('room_reports').delete().neq('id', NIL);
  await admin.from('payments').delete().not('refund_of', 'is', null);   // refunds point at payments
  await admin.from('payments').delete().neq('id', NIL);
  await admin.from('cash_closings').delete().neq('day', '1900-01-01');
  await admin.from('app_settings').delete().neq('key', '');
  await admin.from('booking_events').delete().neq('id', 0);
  await admin.from('bookings').delete().neq('id', NIL);
  await admin.from('customer_private_notes').delete().neq('id', NIL);
  await admin.from('customers').delete().neq('id', NIL);
  // payment methods: only the three seeded ones, all active
  await admin.from('payment_methods').delete().not('code', 'in', '(cash,bank_transfer,promptpay)');
  await admin.from('payment_methods').update({ active: true }).in('code', ['cash', 'bank_transfer', 'promptpay']);
  await admin.from('room_blocks').delete().neq('id', NIL);
  await admin.from('therapist_time_off').delete().neq('id', NIL);

  // rooms
  const { data: allRooms } = await admin.from('rooms').select('id,code');
  const extraRooms = (allRooms ?? []).filter((r) => !SEED_ROOM_CODES.includes(r.code)).map((r) => r.id);
  if (extraRooms.length) {
    await admin.from('room_positions').delete().in('room_id', extraRooms);
    await admin.from('rooms').delete().in('id', extraRooms);
  }
  await admin.from('room_positions').delete().neq('label', '1');
  await admin.from('room_positions').update({ active: true }).neq('label', '');
  await admin.from('rooms').update({ active: true }).in('code', SEED_ROOM_CODES);

  // services
  const { data: svcs } = await admin.from('services').select('id,name_th');
  const extraSvc = (svcs ?? []).filter((s) => !SEED_SERVICE_NAMES.includes(s.name_th)).map((s) => s.id);
  await admin.from('service_room_categories').delete().neq('service_id', NIL);
  if (extraSvc.length) {
    await admin.from('therapist_services').delete().in('service_id', extraSvc);
    await admin.from('services').delete().in('id', extraSvc);
  }
  await admin.from('services').update({ active: true }).in('name_th', SEED_SERVICE_NAMES);
  await admin.from('services').update({ price_satang: SEED_PRICE }).eq('name_th', SEED_SERVICE_NAMES[0]);

  // categories created by tests
  const { data: cats } = await admin.from('room_categories').select('id,name_en');
  const extraCats = (cats ?? []).filter((c) => !['Standard', 'VIP'].includes(c.name_en ?? '')).map((c) => c.id);
  if (extraCats.length) await admin.from('room_categories').delete().in('id', extraCats);

  // staff accounts created by tests
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const u of users?.users ?? []) {
    if (u.email && !SEED_EMAILS.includes(u.email)) {
      await admin.from('therapists').update({ staff_user_id: null }).eq('staff_user_id', u.id);
      await admin.from('staff').delete().eq('user_id', u.id);
      await admin.auth.admin.deleteUser(u.id);
    }
  }
  await admin.from('staff').update({ active: true }).in('user_id', SEED_USER_IDS);

  // therapists created by tests (the seed has the first four), and shifts beyond the seeded 14 days
  const { data: ths } = await admin.from('therapists').select('id').order('sort_order');
  const keep = (ths ?? []).slice(0, 4).map((t) => t.id);
  const extraTh = (ths ?? []).slice(4).map((t) => t.id);
  if (extraTh.length) {
    await admin.from('therapist_shifts').delete().in('therapist_id', extraTh);
    await admin.from('therapist_services').delete().in('therapist_id', extraTh);
    await admin.from('therapists').delete().in('id', extraTh);
  }
  await admin.from('therapists').update({ active: true }).in('id', keep);
  // restore the seeded shifts: 10:00-22:00 Bangkok for the next 14 days, for every remaining therapist
  await admin.from('therapist_shifts').delete().neq('id', NIL);
  const today = bangkokDay(new Date());
  const shiftRows = keep.flatMap((id) => Array.from({ length: 14 }, (_, n) => {
    const d = addDays(today, n);
    return { therapist_id: id, during: `[${bangkokInstant(d, '10:00')},${bangkokInstant(d, '22:00')})` };
  }));
  if (shiftRows.length) await admin.from('therapist_shifts').insert(shiftRows);
}

/** ISO instant for tomorrow (Bangkok) at HH:MM. */
export function tomorrowAt(hhmm: string): string {
  const bkk = new Date(Date.now() + 7 * 3600000); // Bangkok wall clock held in UTC fields
  const d = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate() + 1));
  return new Date(`${d.toISOString().slice(0, 10)}T${hhmm}:00+07:00`).toISOString();
}

/** Signs in as reception with the public client and books through create_booking. */
export async function seedBooking(o: { roomCode?: string; at?: string; therapistEmail?: string; otherTherapist?: boolean; customerName?: string } = {}) {
  const client = await publicClient('reception@spa.test');
  const { data: ths } = await admin.from('therapists').select('id,display_name,staff_user_id').eq('active', true).order('sort_order');
  let th = ths![0];
  if (o.therapistEmail) {
    const { data: u } = await admin.auth.admin.listUsers({ perPage: 200 });
    const id = u!.users.find((x) => x.email === o.therapistEmail)!.id;
    th = ths!.find((t) => t.staff_user_id === id)!;
  } else if (o.otherTherapist) {
    th = ths!.find((t) => t.staff_user_id === null)!;
  }
  const roomCode = o.roomCode ?? 'R1';
  const { data: room } = await admin.from('rooms').select('id').eq('code', roomCode).single();
  const { data: pos } = await admin.from('room_positions').select('id').eq('room_id', room!.id).eq('label', '1').single();
  const { data: svc } = await admin.from('services').select('id').eq('name_th', SEED_SERVICE_NAMES[0]).single();
  await admin.from('services').update({ price_satang: TEST_PRICE }).eq('id', svc!.id);
  const name = o.customerName ?? 'E2E Customer';
  let { data: cust } = await admin.from('customers').select('id').eq('display_name', name).maybeSingle();
  if (!cust) ({ data: cust } = await admin.from('customers').insert({ display_name: name }).select('id').single());
  const at = o.at ?? tomorrowAt('11:00');
  const { data, error } = await client.rpc('create_booking', {
    p_customer_id: cust!.id, p_service_id: svc!.id, p_therapist_id: th.id, p_position_id: pos!.id,
    p_start: at, p_source: 'advance', p_idempotency_key: crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  return { id: data.id as string, therapistName: th.display_name as string, roomCode, at };
}

/** Books a walk-in one minute from now (as reception) and gives that therapist a shift around now. */
export async function seedBookingNow(o: { roomCode?: string; therapistEmail?: string; otherTherapist?: boolean; customerName?: string; consent?: boolean; inMinutes?: number } = {}) {
  const client = await publicClient('reception@spa.test');
  const { data: ths } = await admin.from('therapists').select('id,display_name,staff_user_id').eq('active', true).order('sort_order');
  let th = ths![0];
  if (o.therapistEmail) {
    const { data: u } = await admin.auth.admin.listUsers({ perPage: 200 });
    const id = u!.users.find((x) => x.email === o.therapistEmail)!.id;
    th = ths!.find((t) => t.staff_user_id === id)!;
  } else if (o.otherTherapist) {
    th = ths!.find((t) => t.staff_user_id === null)!;
  }
  const from = new Date(Date.now() - 3600000).toISOString();
  const to = new Date(Date.now() + 3 * 3600000).toISOString();
  const { data: over } = await admin.from('therapist_shifts').select('id').eq('therapist_id', th.id).filter('during', 'ov', `[${from},${to})`);
  if (over?.length) await admin.from('therapist_shifts').delete().in('id', over.map((x) => x.id));
  await admin.from('therapist_shifts').insert({ therapist_id: th.id, during: `[${from},${to})` });

  const roomCode = o.roomCode ?? 'R1';
  const { data: room } = await admin.from('rooms').select('id').eq('code', roomCode).single();
  const { data: pos } = await admin.from('room_positions').select('id').eq('room_id', room!.id).eq('label', '1').single();
  const { data: svc } = await admin.from('services').select('id').eq('name_th', SEED_SERVICE_NAMES[0]).single();
  await admin.from('services').update({ price_satang: TEST_PRICE }).eq('id', svc!.id);
  const name = o.customerName ?? 'E2E Customer';
  let { data: cust } = await admin.from('customers').select('id').eq('display_name', name).maybeSingle();
  if (!cust) ({ data: cust } = await admin.from('customers').insert({ display_name: name }).select('id').single());
  if (o.consent) await admin.from('customers').update({ comms_consent: true, phone: '0810000000' }).eq('id', cust!.id);
  const at = new Date(Date.now() + (o.inMinutes ?? 1) * 60000).toISOString();
  const { data, error } = await client.rpc('create_booking', {
    p_customer_id: cust!.id, p_service_id: svc!.id, p_therapist_id: th.id, p_position_id: pos!.id,
    p_start: at, p_source: 'walk_in', p_idempotency_key: crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
  return { id: data.id as string, therapistName: th.display_name as string, roomCode, at };
}

/** Moves a booking to a status as reception, using the public client. */
export async function setStatusAsReception(bookingId: string, to: 'checked_in' | 'in_treatment' | 'completed') {
  const client = await publicClient('reception@spa.test');
  const order = ['confirmed', 'checked_in', 'in_treatment', 'completed'];
  for (;;) {
    const { data: row } = await admin.from('bookings').select('status,version').eq('id', bookingId).single();
    const next = order[order.indexOf(row!.status) + 1];
    if (!next || order.indexOf(row!.status) >= order.indexOf(to)) return;
    const { error } = await client.rpc('set_booking_status', { p_booking_id: bookingId, p_to: next, p_expected_version: row!.version });
    if (error) throw new Error(error.message);
  }
}

/** Adds n rooms (codes X01..), spread over the given zones, in the first room category. */
export async function addRooms(n: number, o: { zones: string[] }) {
  const { data: cat } = await admin.from('room_categories').select('id').order('sort_order').limit(1).single();
  const rows = Array.from({ length: n }, (_, i) => {
    const code = `X${String(i + 1).padStart(2, '0')}`;
    return { code, display_name: `Room ${code}`, category_id: cat!.id, zone: o.zones[i % o.zones.length], sort_order: 100 + i };
  });
  const { error } = await admin.from('rooms').insert(rows);
  if (error) throw new Error(error.message);
}

/** One signed-in client per account for the whole run: the local auth server allows only 30 sign-ins per 5 minutes. */
const clients = new Map<string, SupabaseClient>();
async function publicClient(email: string) {
  const cached = clients.get(email);
  if (cached) return cached;
  const client = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: 'local-dev-only' });
  if (error) throw error;
  clients.set(email, client);
  return client;
}

/** Records a payment as reception through record_payment. */
export async function payViaApi(bookingId: string, satang: number, method: 'cash' | 'bank_transfer' | 'promptpay' = 'cash', reference?: string) {
  const client = await publicClient('reception@spa.test');
  const { data: m } = await admin.from('payment_methods').select('id').eq('code', method).single();
  const { data, error } = await client.rpc('record_payment', {
    p_booking_id: bookingId, p_method_id: m!.id, p_amount_satang: satang, p_idempotency_key: crypto.randomUUID(),
    ...(reference ? { p_reference: reference } : {}),
  });
  if (error) throw new Error(error.message);
  return data as { id: string };
}

/** Voids a payment as manager. */
export async function voidViaApi(paymentId: string, reason = 'บันทึกผิด') {
  const client = await publicClient('manager@spa.test');
  const { error } = await client.rpc('void_payment', { p_payment_id: paymentId, p_reason: reason });
  if (error) throw new Error(error.message);
}

/** Cancels a confirmed booking as reception. */
export async function cancelAsReception(bookingId: string) {
  const client = await publicClient('reception@spa.test');
  const { data: row } = await admin.from('bookings').select('version').eq('id', bookingId).single();
  const { error } = await client.rpc('set_booking_status', { p_booking_id: bookingId, p_to: 'cancelled', p_expected_version: row!.version });
  if (error) throw new Error(error.message);
}
