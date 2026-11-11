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
    // SEED-END
    return b;
  });
}

export { randomUUID };
