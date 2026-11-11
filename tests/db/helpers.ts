import { expect } from 'vitest';
import pg, { type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

export type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';
export type Actor = Role | 'customer' | 'anon';
export type Base = {
  users: Record<Role | 'customer', string>;
  cat: { standard: string; couple: string };
  rooms: string[];
  pos: string[];
  couple: { room: string; pos: [string, string] };
  svc60: string;
  t1: string; t2: string;
  c1: string; c2: string;
};
export const TEST_DAY = '2030-01-15';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:54329/spa_test';
const pool = new pg.Pool({ connectionString: url, max: 30, options: '-c timezone=UTC' });

/** bkk('10:00') === '2030-01-15T10:00:00+07:00' */
export function bkk(hhmm: string, day: string = TEST_DAY): string {
  return `${day}T${hhmm}:00+07:00`;
}

export async function asAdmin<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function asRole<T>(b: Base, a: Actor, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    if (a === 'anon') {
      await c.query('set local role anon');
    } else {
      await c.query('set local role authenticated');
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: b.users[a], role: 'authenticated' }),
      ]);
    }
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toMatchObject({ message: code });
}

async function tableExists(c: PoolClient, name: string): Promise<boolean> {
  const r = await c.query(`select to_regclass($1) as t`, [`public.${name}`]);
  return r.rows[0].t !== null;
}

/** Truncate all business tables and reseed the Base fixture. Tables that do not exist yet are skipped. */
export async function resetDb(): Promise<Base> {
  return asAdmin(async (c) => {
    const t = await c.query(`select tablename from pg_tables where schemaname='public'`);
    if (t.rowCount) {
      await c.query(`truncate ${t.rows.map((r) => `public."${r.tablename}"`).join(', ')}, auth.users restart identity cascade`);
    } else {
      await c.query(`truncate auth.users cascade`);
    }
    const b = {
      users: {} as Base['users'], cat: {} as Base['cat'], rooms: [] as string[], pos: [] as string[],
      couple: {} as Base['couple'],
    } as Base;
    // SEED-BEGIN (each migration task adds its section below)
    // identity (Task 2)
    for (const k of ['owner', 'manager', 'receptionist', 'therapist', 'customer'] as const) {
      b.users[k] = randomUUID();
      await c.query('insert into auth.users(id, email) values ($1,$2)', [b.users[k], k + '@spa.test']);
    }
    if (await tableExists(c, 'staff'))
     for (const r of ['owner', 'manager', 'receptionist', 'therapist'] as const)
      await c.query('insert into staff(user_id, role, display_name) values ($1,$2,$3)', [b.users[r], r, r]);
    // catalog and rooms (Task 3)
    if (await tableExists(c, 'rooms')) {
      const cat = async (name: string, i: number) =>
        (await c.query('insert into room_categories(name_th, name_en, sort_order) values ($1,$1,$2) returning id', [name, i])).rows[0].id;
      b.cat = { standard: await cat('standard', 1), couple: await cat('couple', 2) };
      for (let i = 1; i <= 6; i++) {
        const r = await c.query(
          `insert into rooms(code, display_name, category_id, turnover_min, sort_order) values ($1,$1,$2,15,$3) returning id`,
          ['R' + i, b.cat.standard, i]);
        b.rooms.push(r.rows[0].id);
        b.pos.push((await c.query('select id from room_positions where room_id=$1 and label=$2', [r.rows[0].id, '1'])).rows[0].id);
      }
      const cr = (await c.query(
        `insert into rooms(code, display_name, category_id, turnover_min, sort_order) values ('C1','C1',$1,15,7) returning id`, [b.cat.couple])).rows[0].id;
      const p1 = (await c.query('select id from room_positions where room_id=$1 and label=$2', [cr, '1'])).rows[0].id;
      const p2 = (await c.query(`insert into room_positions(room_id, label) values ($1,'2') returning id`, [cr])).rows[0].id;
      b.couple = { room: cr, pos: [p1, p2] };
      b.svc60 = (await c.query(
        `insert into services(name_th, name_en, duration_min, price_satang) values ('นวด 60','Massage 60',60,150000) returning id`)).rows[0].id;
      await c.query('insert into service_room_categories(service_id, room_category_id) values ($1,$2)', [b.svc60, b.cat.standard]);
    }
    // therapists (Task 4)
    if (await tableExists(c, 'therapists')) {
      const th = async (name: string, staff: string | null, i: number) =>
        (await c.query(
          `insert into therapists(staff_user_id, display_name, employment_type, sort_order) values ($1,$2,'employee',$3) returning id`,
          [staff, name, i])).rows[0].id;
      b.t1 = await th('T1', b.users.therapist, 1);
      b.t2 = await th('T2', null, 2);
      for (const t of [b.t1, b.t2]) {
        await c.query('insert into therapist_services(therapist_id, service_id) values ($1,$2)', [t, b.svc60]);
        await c.query('insert into therapist_shifts(therapist_id, during) values ($1, tstzrange($2,$3))', [t, bkk('10:00'), bkk('22:00')]);
      }
    }
    // customers (Task 5)
    if (await tableExists(c, 'customers')) {
      b.c1 = (await c.query(`insert into customers(user_id, display_name, full_name, phone) values ($1,'C1','Customer One','0800000001') returning id`, [b.users.customer])).rows[0].id;
      b.c2 = (await c.query(`insert into customers(display_name, full_name, phone) values ('C2','Customer Two','0800000002') returning id`)).rows[0].id;
    }
    // payment methods (Plan 3)
    if (await tableExists(c, 'payment_methods')) {
      await c.query(`insert into payment_methods(code, name_th, name_en, needs_verification, sort_order) values
        ('cash','เงินสด','Cash',false,1), ('bank_transfer','โอนเงิน','Bank transfer',true,2), ('promptpay','พร้อมเพย์','PromptPay',true,3)`);
    }
    // SEED-END
    return b;
  });
}

export type BookingRow = Record<string, any>;

/** Calls create_booking with sensible defaults; returns the booking row. */
export async function book(
  c: PoolClient, b: Base,
  over: Partial<{ customer: string; service: string; therapist: string; position: string; start: string; source: string; key: string; party: string | null; note: string | null }> = {},
): Promise<BookingRow> {
  const o = {
    customer: b.c1, service: b.svc60, therapist: b.t1, position: b.pos[0], start: bkk('10:00'),
    source: 'advance', key: randomUUID(), party: null, note: null, ...over,
  };
  const r = await c.query(
    'select * from create_booking($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [o.customer, o.service, o.therapist, o.position, o.start, o.source, o.key, o.party, o.note]);
  return r.rows[0];
}

export const soon = (minutes: number): string => new Date(Date.now() + minutes * 60000).toISOString();

/** t1 and t2 each get a shift [now - 2h, now + 10h). */
export async function shiftNow(b: Base): Promise<void> {
  await asAdmin(async (c) => {
    for (const t of [b.t1, b.t2])
      await c.query('insert into therapist_shifts(therapist_id, during) values ($1, tstzrange($2,$3))', [t, soon(-120), soon(600)]);
  });
}

/** As receptionist, walks the booking confirmed -> ... -> to, reading the version at each step. */
export async function runTo(b: Base, bookingId: string, to: 'checked_in' | 'in_treatment' | 'completed'): Promise<BookingRow> {
  const order = ['confirmed', 'checked_in', 'in_treatment', 'completed'];
  return asRole(b, 'receptionist', async (c) => {
    let row = (await c.query('select * from bookings where id=$1', [bookingId])).rows[0];
    for (let i = order.indexOf(row.status) + 1; i <= order.indexOf(to); i++) {
      row = (await c.query('select * from set_booking_status($1,$2,$3)', [bookingId, order[i], row.version])).rows[0];
    }
    return row;
  });
}

/** Runs as service_role (what the message sender uses); committed. */
export async function asService<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role service_role');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export type MethodCode = 'cash' | 'bank_transfer' | 'promptpay';

export async function methodId(code: MethodCode): Promise<string> {
  return asAdmin(async (c) => (await c.query(`select id from payment_methods where code=$1`, [code])).rows[0].id);
}

/** Records a payment through record_payment as the given actor; returns the payments row. */
export async function pay(
  b: Base, a: Actor, bookingId: string, amount: number,
  over: Partial<{ method: MethodCode; key: string; reference: string | null; note: string | null }> = {},
): Promise<Record<string, any>> {
  const o = { method: 'cash' as MethodCode, key: randomUUID(), reference: null, note: null, ...over };
  const m = await methodId(o.method);
  return asRole(b, a, async (c) =>
    (await c.query(`select * from record_payment($1,$2,$3,$4,$5,$6)`, [bookingId, m, amount, o.key, o.reference, o.note])).rows[0]);
}

/** The booking_money row for one booking, read as manager. */
export async function money(b: Base, bookingId: string): Promise<Record<string, any>> {
  return asRole(b, 'manager', async (c) => (await c.query(`select * from booking_money(array[$1::uuid])`, [bookingId])).rows[0]);
}

/** Bangkok calendar date of now(), 'YYYY-MM-DD'. */
export async function today(): Promise<string> {
  return asAdmin(async (c) => (await c.query(`select ((now() at time zone 'Asia/Bangkok')::date)::text d`)).rows[0].d);
}

export { randomUUID };
