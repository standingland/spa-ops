import pg, { type PoolClient } from 'pg';
import fs from 'node:fs';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:54329/spa_test';
export const pool = new pg.Pool({ connectionString: url, max: 20, options: '-c timezone=UTC' });

export type Ids = {
  owner: string; reception: string; service: string; customer: string; today: string;
  futureDay: string; rooms: string[]; positions: string[]; therapists: string[]; cashMethod: string;
  todayAt: (hhmm: string) => string; dayAt: (day: string, hhmm: string) => string; todayRange: [string, string];
  addDays: (day: string, n: number) => string;
};

export async function admin<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { return await fn(c); } finally { c.release(); }
}

/** Fills the database once (idempotent: a database that already holds the dataset is left alone). Returns sample ids. */
export async function loadOnce(): Promise<Ids> {
  const loaded = await admin((c) => c.query(`select count(*)::int n from rooms where code like 'R-%'`));
  if (loaded.rows[0].n < 40) await admin((c) => c.query(fs.readFileSync('tests/perf/loadgen.sql', 'utf8')));
  return admin(async (c) => {
    const one = async (sql: string) => (await c.query(sql)).rows[0];
    const today: string = (await one(`select ((now() at time zone 'Asia/Bangkok')::date)::text d`)).d;
    const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    const dayAt = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+07:00`).toISOString();
    const rooms = (await c.query(`select r.id, (select p.id from room_positions p where p.room_id = r.id and p.label = '1') pos from rooms r where r.code like 'R-%' order by r.code`)).rows;
    return {
      owner: (await one(`select user_id from staff where role = 'owner' and active order by created_at limit 1`)).user_id,
      reception: (await one(`select user_id from staff where role = 'receptionist' and active order by created_at limit 1`)).user_id,
      service: (await one(`select id from services where name_en = 'perf service 2'`)).id,
      customer: (await one(`select id from customers where display_name = 'Perf C77'`)).id,
      today, futureDay: addDays(today, 20),
      rooms: rooms.map((r) => r.id), positions: rooms.map((r) => r.pos),
      therapists: (await c.query(`select id from therapists where display_name like 'Perf T%' order by display_name`)).rows.map((r) => r.id),
      cashMethod: (await one(`select id from payment_methods where code = 'cash'`)).id,
      todayAt: (hhmm) => dayAt(today, hhmm), dayAt, addDays,
      todayRange: [dayAt(today, '00:00'), dayAt(addDays(today, 1), '00:00')],
    };
  });
}

/** Runs `fn` as an authenticated user (their JWT subject); the transaction is rolled back unless `commit`. */
export async function asUser<T>(userId: string, fn: (c: PoolClient) => Promise<T>, commit = false): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role authenticated');
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    const out = await fn(c);
    await c.query(commit ? 'commit' : 'rollback');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** 95th percentile in milliseconds of `n` runs, after 3 unmeasured warm-up runs. */
export async function p95(run: (i: number) => Promise<unknown>, n = 30): Promise<number> {
  for (let i = 0; i < 3; i++) await run(-1 - i);
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await run(i);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return Math.round(times[Math.ceil(0.95 * n) - 1] * 10) / 10;
}
