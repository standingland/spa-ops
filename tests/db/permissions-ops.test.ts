import { describe, test, expect, beforeEach } from 'vitest';
import type { PoolClient } from 'pg';
import { asRole, resetDb, bkk, book, runTo, type Actor, type Base } from './helpers';

const ACTORS: Actor[] = ['owner', 'manager', 'receptionist', 'therapist', 'customer', 'anon'];
type Out = number | 'rows' | 'ok' | string;
type Stmt = { name: string; run: (c: PoolClient, b: Base, reportId: string) => Promise<{ rowCount: number | null }>; expect: Out[] };

const NA = 'NOT_AUTHORIZED';
const STMTS: Stmt[] = [
  { name: 'select from room_turnovers', run: (c) => c.query(`select 1 from room_turnovers`), expect: ['rows', 'rows', 'rows', 'rows', 0, 0] },
  { name: 'select from room_reports', run: (c) => c.query(`select 1 from room_reports`), expect: ['rows', 'rows', 'rows', 'rows', 0, 0] },
  { name: 'select mark_room_ready(…)', run: (c, b) => c.query(`select mark_room_ready($1)`, [b.rooms[0]]), expect: ['ok', 'ok', 'ok', 'ok', NA, NA] },
  { name: 'select report_room_issue(…)', run: (c, b) => c.query(`select report_room_issue($1,'x')`, [b.rooms[1]]), expect: ['ok', 'ok', 'ok', 'ok', NA, NA] },
  { name: 'select resolve_room_report(…)', run: (c, _b, id) => c.query(`select resolve_room_report($1)`, [id]), expect: ['ok', 'ok', 'ok', NA, NA, NA] },
  { name: 'select stranded_bookings()', run: (c) => c.query(`select * from stranded_bookings()`), expect: ['ok', 'ok', 'ok', NA, NA, NA] },
  { name: 'select record_absence(…)', run: (c, b) => c.query(`select record_absence($1,$2,$3,'leave')`, [b.t2, bkk('09:00'), bkk('10:00')]), expect: ['ok', 'ok', NA, NA, NA, NA] },
  { name: 'select force_room_block(…)', run: (c, b) => c.query(`select force_room_block($1,$2,$3,'closed')`, [b.rooms[2], bkk('09:00'), bkk('10:00')]), expect: ['ok', 'ok', NA, NA, NA, NA] },
  { name: 'select room_status_board()', run: (c) => c.query(`select * from room_status_board()`), expect: ['rows', 'rows', 'rows', 'rows', NA, NA] },
  { name: 'select booking_day_counts(…)', run: (c) => c.query(`select * from booking_day_counts('2030-01-14','2030-01-16')`), expect: ['rows', 'rows', 'rows', 'rows', NA, NA] },
];

let b: Base;
let reportId: string;
beforeEach(async () => {
  b = await resetDb();
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await runTo(b, k.id, 'completed');                                   // opens a turnover in room 0
  reportId = (await asRole(b, 'therapist', (c) => c.query(`select id from report_room_issue($1,'ไฟเสีย')`, [b.rooms[3]]))).rows[0].id;
});

describe.each(STMTS)('$name', (s) => {
  test.each(ACTORS.map((a, i) => [a, s.expect[i]] as const))('%s -> %s', async (actor, want) => {
    const attempt = asRole(b, actor, (c) => s.run(c, b, reportId));
    if (typeof want === 'number' || want === 'rows' || want === 'ok') {
      const r = await attempt;
      if (want === 'rows') expect(r.rowCount).toBeGreaterThan(0);
      else if (typeof want === 'number') expect(r.rowCount).toBe(want);
    } else {
      await expect(attempt).rejects.toSatisfy((e: any) => e.code === want || e.message === want);
    }
  });
});
