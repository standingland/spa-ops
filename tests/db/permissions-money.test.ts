import { describe, test, expect, beforeEach } from 'vitest';
import type { PoolClient } from 'pg';
import { asRole, resetDb, book, expectCode, methodId, pay, randomUUID, today, type Actor, type Base } from './helpers';

const ACTORS: Actor[] = ['owner', 'manager', 'receptionist', 'therapist', 'customer', 'anon'];
type Out = number | 'rows' | 'ok' | string;
type Ids = { booking: string; cash: string; transfer: string; method: string; day: string };
type Stmt = { name: string; run: (c: PoolClient, b: Base, i: Ids) => Promise<{ rowCount: number | null }>; expect: Out[] };

const NA = 'NOT_AUTHORIZED';
const DESK_OK: Out[] = ['ok', 'ok', 'ok', NA, NA, NA];
const MANAGERS_OK: Out[] = ['ok', 'ok', NA, NA, NA, NA];
const STMTS: Stmt[] = [
  { name: 'select from app_settings', run: (c) => c.query(`select 1 from app_settings`), expect: ['rows', 'rows', 'rows', 'rows', 0, 0] },
  { name: 'select get_settings()', run: (c) => c.query(`select get_settings()`), expect: ['ok', 'ok', 'ok', 'ok', NA, NA] },
  { name: 'select set_setting(…)', run: (c) => c.query(`select set_setting('ops.late_arrival_min','5')`), expect: ['ok', NA, NA, NA, NA, NA] },
  { name: 'select from payments', run: (c) => c.query(`select 1 from payments`), expect: ['rows', 'rows', 'rows', 0, 0, 0] },
  { name: 'select from cash_closings', run: (c) => c.query(`select 1 from cash_closings`), expect: ['rows', 'rows', 0, 0, 0, 0] },
  { name: 'select from payment_methods', run: (c) => c.query(`select 1 from payment_methods`), expect: ['rows', 'rows', 'rows', 'rows', 0, 0] },
  { name: 'select record_payment(…)', run: (c, _b, i) => c.query(`select record_payment($1,$2,1000,$3)`, [i.booking, i.method, randomUUID()]), expect: DESK_OK },
  { name: 'select verify_payment(…)', run: (c, _b, i) => c.query(`select verify_payment($1)`, [i.transfer]), expect: MANAGERS_OK },
  { name: 'select void_payment(…)', run: (c, _b, i) => c.query(`select void_payment($1,'x')`, [i.cash]), expect: MANAGERS_OK },
  { name: 'select record_refund(…)', run: (c, _b, i) => c.query(`select record_refund($1,1000,$2,'x')`, [i.cash, randomUUID()]), expect: MANAGERS_OK },
  { name: 'select payment_day_summary(…)', run: (c, _b, i) => c.query(`select * from payment_day_summary($1)`, [i.day]), expect: MANAGERS_OK },
  { name: 'select close_cash_day(…)', run: (c, _b, i) => c.query(`select close_cash_day($1, 1000)`, [i.day]), expect: MANAGERS_OK },
  { name: 'select adjust_booking_charge(…)', run: (c, _b, i) => c.query(`select adjust_booking_charge($1, 1000, null, 'x', 1)`, [i.booking]), expect: MANAGERS_OK },
  { name: 'select booking_money(…)', run: (c, _b, i) => c.query(`select * from booking_money(array[$1::uuid])`, [i.booking]), expect: DESK_OK },
  { name: 'select pending_payments()', run: (c) => c.query(`select * from pending_payments()`), expect: DESK_OK },
  { name: 'select customer_summary(…)', run: (c, b) => c.query(`select * from customer_summary($1)`, [b.c1]), expect: DESK_OK },
  { name: 'select booking_detail(…)', run: (c, _b, i) => c.query(`select * from booking_detail($1)`, [i.booking]), expect: ['ok', 'ok', 'ok', 'ok', NA, NA] },
  { name: 'select export_customer(…)', run: (c, b) => c.query(`select export_customer($1)`, [b.c1]), expect: MANAGERS_OK },
  { name: 'select anonymise_customer(…)', run: (c, b) => c.query(`select anonymise_customer($1,'x')`, [b.c2]), expect: ['ok', NA, NA, NA, NA, NA] },
  { name: 'select retention_candidates()', run: (c) => c.query(`select * from retention_candidates()`), expect: ['ok', NA, NA, NA, NA, NA] },
  { name: 'select report_summary(…)', run: (c) => c.query(`select * from report_summary('2030-01-15','2030-01-15')`), expect: ['ok', 'ok', NA, NA, NA, NA] },
  { name: 'select report_revenue(…)', run: (c) => c.query(`select * from report_revenue('2030-01-15','2030-01-15')`), expect: ['ok', 'ok', NA, NA, NA, NA] },
  { name: 'select report_room_utilization(…)', run: (c) => c.query(`select * from report_room_utilization('2030-01-15','2030-01-15')`), expect: ['ok', 'ok', NA, NA, NA, NA] },
  { name: 'select report_therapist_utilization(…)', run: (c) => c.query(`select * from report_therapist_utilization('2030-01-15','2030-01-15')`), expect: ['ok', 'ok', NA, NA, NA, NA] },
  { name: 'select report_peak_periods(…)', run: (c) => c.query(`select * from report_peak_periods('2030-01-15','2030-01-15')`), expect: ['ok', 'ok', NA, NA, NA, NA] },
];

let b: Base;
let ids: Ids;
beforeEach(async () => {
  b = await resetDb();
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const cash = await pay(b, 'manager', k.id, 50000);
  const transfer = await pay(b, 'manager', k.id, 50000, { method: 'bank_transfer', reference: 'TXN-1' });
  const day = await today();
  await asRole(b, 'owner', (c) => c.query(`select set_setting('ops.ending_soon_min', '12')`));      // so app_settings has a row to read
  await asRole(b, 'manager', (c) => c.query(`select close_cash_day($1, 50000)`, [day]));
  ids = { booking: k.id, cash: cash.id, transfer: transfer.id, method: await methodId('cash'), day };
});

describe.each(STMTS)('$name', (s) => {
  test.each(ACTORS.map((a, i) => [a, s.expect[i]] as const))('%s -> %s', async (actor, want) => {
    const attempt = asRole(b, actor, (c) => s.run(c, b, ids));
    if (typeof want === 'number' || want === 'rows' || want === 'ok') {
      const r = await attempt;
      if (want === 'rows') expect(r.rowCount).toBeGreaterThan(0);
      else if (typeof want === 'number') expect(r.rowCount).toBe(want);
    } else {
      await expectCode(attempt, want);
    }
  });
});
