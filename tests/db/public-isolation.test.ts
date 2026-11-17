import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, asService, resetDb, type Base } from './helpers';

let b: Base;
let lineCustomer: string;
beforeEach(async () => {
  b = await resetDb();
  // a guest who booked online: a LINE-only customer with a booking, and a queued message
  lineCustomer = (await asAdmin((c) => c.query(
    `insert into customers(display_name, line_user_id, comms_consent) values ('LINE guest','U-iso',true) returning id`))).rows[0].id;
});

const publicFns = () => asAdmin((c) => c.query(
  `select p.oid, p.proname, pg_get_function_result(p.oid) as result, p.prosecdef, p.proconfig
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'public\\_%' order by p.proname`)).then((r) => r.rows);

/** What the public page's functions may return. Adding a column to a public function means changing this list on purpose. */
const ALLOWED_RESULTS: Record<string, string> = {
  public_my_appointments: 'jsonb',
  public_join_waitlist: 'uuid',
  public_cancel_waitlist: 'void',
  public_accept_waitlist: 'TABLE(booking_id uuid, starts_at timestamp with time zone)',
  public_book: 'TABLE(booking_id uuid, starts_at timestamp with time zone)',
  public_booking_view: 'TABLE(starts_at timestamp with time zone, ends_at timestamp with time zone, status booking_status, service_name_th text, service_name_en text, therapist_name text)',
  public_cancel: 'void',
  public_free_times: 'TABLE(starts_at timestamp with time zone)',
  public_rate_hit: 'boolean',
  public_therapist_photo_path: 'text',
  public_therapist_services: 'TABLE(service_id uuid, name_th text, name_en text, duration_min integer, price_satang integer)',
  public_therapists: 'TABLE(id uuid, display_name text, bio_th text, bio_en text, specialties text[], has_photo boolean)',
};

test('no public_ function returns anything that is not on the documented list, and none is missing from it', async () => {
  const fns = await publicFns();
  expect(Object.fromEntries(fns.map((f) => [f.proname, f.result]))).toEqual(ALLOWED_RESULTS);
});

test('every public_ function is security definer with a pinned search_path, and only service_role may run it', async () => {
  for (const f of await publicFns()) {
    expect(f.prosecdef, `${f.proname} security definer`).toBe(true);
    expect((f.proconfig ?? []).some((x: string) => x.startsWith('search_path=')), `${f.proname} search_path`).toBe(true);
    const can = (await asAdmin((c) => c.query(
      `select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth,
              has_function_privilege('service_role', $1, 'execute') as svc`, [f.oid]))).rows[0];
    expect(can, f.proname).toEqual({ anon: false, auth: false, svc: true });
  }
});

test('the private cores behind the public functions are not executable by anon or authenticated either', async () => {
  const r = await asAdmin((c) => c.query(
    `select p.proname, has_function_privilege('anon', p.oid, 'execute') as anon, has_function_privilege('authenticated', p.oid, 'execute') as auth
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname in ('available_candidates_core', 'create_booking_core')`));
  expect(r.rows).toHaveLength(2);
  for (const row of r.rows) expect(row, row.proname).toMatchObject({ anon: false, auth: false });
});

test('anon sees nothing of the guest, their booking or their messages, and cannot read the rate-limit table', async () => {
  for (const table of ['customers', 'bookings', 'booking_events', 'payments', 'rooms', 'room_positions', 'notification_outbox', 'public_rate_hits', 'app_settings']) {
    const r = await asRole(b, 'anon', (c) => c.query(`select * from ${table}`)).then((x) => ({ rows: x.rowCount }), (e) => ({ denied: String(e.message).includes('permission denied') }));
    expect(r, table).toSatisfy((x: { rows?: number; denied?: boolean }) => x.denied === true || x.rows === 0);
  }
});

test('a signed-in customer (a different role) cannot see the LINE guest record', async () => {
  const seen = (await asRole(b, 'customer', (c) => c.query(`select id from customers`))).rows.map((r) => r.id);
  expect(seen).not.toContain(lineCustomer);
  expect(seen).toContain(b.c1);       // their own record, as before
});

test('the guest record reaches only the service role among the API roles, never through bookings or the outbox', async () => {
  for (const role of ['receptionist', 'therapist', 'customer'] as const) {
    const out = (await asRole(b, role, (c) => c.query(`select count(*)::int n from notification_outbox`).then((x) => x.rows[0].n, () => 0)));
    expect(out, role).toBe(0);
  }
  const svc = await asService((c) => c.query(`select count(*)::int n from customers where line_user_id = 'U-iso'`));
  expect(svc.rows[0].n).toBe(1);
});

test('anonymising a customer also removes their LINE id', async () => {
  await asRole(b, 'owner', (c) => c.query(`select anonymise_customer($1, 'guest asked')`, [lineCustomer]));
  const r = await asAdmin((c) => c.query(`select line_user_id, display_name from customers where id = $1`, [lineCustomer]));
  expect(r.rows[0]).toEqual({ line_user_id: null, display_name: 'Removed' });
});
