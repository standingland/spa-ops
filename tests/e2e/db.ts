import { createClient } from '@supabase/supabase-js';

try { process.loadEnvFile('.env.local'); } catch { /* env may already be set */ }

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY!;
export const admin = createClient(URL, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });

const NIL = '00000000-0000-0000-0000-000000000000';
export const SEED_ROOM_CODES = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
export const SEED_SERVICE_NAMES = ['นวดไทย 60 นาที', 'นวดไทย 90 นาที', 'นวดน้ำมัน 60 นาที', 'นวดน้ำมัน 90 นาที', 'นวดเท้า 45 นาที'];
export const SEED_EMAILS = ['owner@spa.test', 'manager@spa.test', 'reception@spa.test', 'therapist@spa.test'];
const SEED_USER_IDS = ['1', '2', '3', '4'].map((n) => `00000000-0000-4000-8000-00000000000${n}`);

/** Restores the seeded state: removes everything the tests created. */
export async function resetTestData() {
  await admin.from('booking_events').delete().neq('id', 0);
  await admin.from('bookings').delete().neq('id', NIL);
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
  const horizon = Date.now() + 15 * 86400000;
  const { data: shifts } = await admin.from('therapist_shifts').select('id,during');
  const far = (shifts ?? []).filter((s) => {
    const start = String(s.during).split(',')[0].replace(/[["]/g, '').replace(' ', 'T');
    return new Date(start).getTime() > horizon;
  }).map((s) => s.id);
  if (far.length) await admin.from('therapist_shifts').delete().in('id', far);
}

/** ISO instant for tomorrow (Bangkok) at HH:MM. */
export function tomorrowAt(hhmm: string): string {
  const bkk = new Date(Date.now() + 7 * 3600000); // Bangkok wall clock held in UTC fields
  const d = new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), bkk.getUTCDate() + 1));
  return new Date(`${d.toISOString().slice(0, 10)}T${hhmm}:00+07:00`).toISOString();
}

/** Signs in as reception with the public client and books through create_booking. */
export async function seedBooking(o: { roomCode?: string; at?: string; therapistEmail?: string; otherTherapist?: boolean; customerName?: string } = {}) {
  const client = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error: se } = await client.auth.signInWithPassword({ email: 'reception@spa.test', password: 'local-dev-only' });
  if (se) throw se;
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
