import { describe, test, expect, beforeEach } from 'vitest';
import type { PoolClient } from 'pg';
import { asAdmin, asRole, resetDb, bkk, book, randomUUID, type Actor, type Base } from './helpers';

const ACTORS: Actor[] = ['owner', 'manager', 'receptionist', 'therapist', 'customer', 'anon'];
// number = exact row count, 'rows' = at least one row, 'ok' = no error, string = error code or message
type Out = number | 'rows' | 'ok' | string;
type Stmt = { name: string; run: (c: PoolClient, b: Base, i: number) => Promise<{ rowCount: number | null }>; expect: Out[] };

const day2 = '2030-02-01';
const STMTS: Stmt[] = [
  { name: 'select from rooms', run: (c) => c.query(`select 1 from rooms`), expect: ['rows', 'rows', 'rows', 'rows', 0, 0] },
  { name: "update rooms set zone='x'", run: (c) => c.query(`update rooms set zone='x'`), expect: ['rows', 'rows', 0, 0, 0, 0] },
  {
    name: 'insert into therapist_shifts',
    run: (c, b, i) => c.query(`insert into therapist_shifts(therapist_id, during) values ($1, tstzrange($2,$3))`,
      [b.t1, bkk(`${String(8 + i).padStart(2, '0')}:00`, day2), bkk(`${String(9 + i).padStart(2, '0')}:00`, day2)]),
    expect: ['ok', 'ok', '42501', '42501', '42501', '42501'],
  },
  { name: 'select from customers', run: (c) => c.query(`select 1 from customers`), expect: ['rows', 'rows', 'rows', 0, 1, 0] },
  { name: 'select from customer_private_notes', run: (c) => c.query(`select 1 from customer_private_notes`), expect: ['rows', 'rows', 0, 0, 0, 0] },
  { name: 'select from bookings', run: (c) => c.query(`select 1 from bookings`), expect: [2, 2, 2, 1, 1, 0] },
  {
    name: 'insert into bookings',
    run: (c, b) => c.query(
      `insert into bookings(customer_id, service_id, therapist_id, position_id, room_id, service_during, room_during, source, price_satang, idempotency_key)
       values ($1,$2,$3,$4,$5, tstzrange($6,$7), tstzrange($6,$8), 'advance', 1, $9)`,
      [b.c1, b.svc60, b.t1, b.pos[4], b.rooms[4], bkk('18:00'), bkk('19:00'), bkk('19:15'), randomUUID()]),
    expect: ['42501', '42501', '42501', '42501', '42501', '42501'],
  },
  {
    name: 'select create_booking(...)',
    run: (c, b, i) => book(c, b, { position: b.pos[5], start: bkk(`${String(12 + i * 2)}:00`) }).then(() => ({ rowCount: 1 })),
    expect: ['ok', 'ok', 'ok', 'NOT_AUTHORIZED', 'NOT_AUTHORIZED', 'NOT_AUTHORIZED'],
  },
  {
    name: 'select booking_board(...)',
    run: (c) => c.query(`select * from booking_board($1,$2)`, [bkk('00:00'), bkk('00:00', '2030-01-16')]),
    expect: [2, 2, 2, 1, 'NOT_AUTHORIZED', 'NOT_AUTHORIZED'],
  },
  { name: 'select from audit_log', run: (c) => c.query(`select 1 from audit_log`), expect: ['rows', 'rows', 0, 0, 0, 0] },
  { name: "update staff set role='owner'", run: (c) => c.query(`update staff set role='owner'`), expect: ['rows', 0, 0, 0, 0, 0] },
];

let b: Base;
beforeEach(async () => {
  b = await resetDb();
  // two bookings (one per therapist/customer) and a private note, for the row-visibility statements
  await asRole(b, 'owner', (c) => book(c, b));
  await asRole(b, 'owner', (c) => book(c, b, { therapist: b.t2, position: b.pos[1], customer: b.c2 }));
  await asAdmin((c) => c.query(`insert into customer_private_notes(customer_id, body) values ($1,'n')`, [b.c1]));
});

describe.each(STMTS)('$name', (s) => {
  test.each(ACTORS.map((a, i) => [a, i, s.expect[i]] as const))('%s -> %s', async (actor, i, want) => {
    const attempt = asRole(b, actor, (c) => s.run(c, b, i));
    if (typeof want === 'number' || want === 'rows' || want === 'ok') {
      const r = await attempt;
      if (typeof want === 'number') expect(r.rowCount).toBe(want);
      else if (want === 'rows') expect(r.rowCount).toBeGreaterThan(0);
    } else {
      await expect(attempt).rejects.toSatisfy((e: any) => e.code === want || e.message === want);
    }
  });
});
