import { test, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { admin, asUser, loadOnce, p95, type Ids } from './helpers';

let ids: Ids;
const results: { name: string; budgetMs: number; p95Ms: number }[] = [];
beforeAll(async () => { ids = await loadOnce(); });

const budget = (name: string, ms: number, run: (i: number) => Promise<unknown>) =>
  test(`${name} ≤ ${ms} ms`, async () => {
    const got = await p95(run);
    results.push({ name, budgetMs: ms, p95Ms: got });
    expect(got).toBeLessThanOrEqual(ms);
  });
const asReception = (fn: Parameters<typeof asUser>[1]) => asUser(ids.reception, fn);
const asOwner = (fn: Parameters<typeof asUser>[1]) => asUser(ids.owner, fn);

test('the dataset is the size the budgets assume', async () => {
  const n = await admin((c) => c.query(`select (select count(*) from rooms where code like 'R-%')::int rooms,
    (select count(*) from therapists where display_name like 'Perf T%')::int therapists, (select count(*) from bookings)::int bookings,
    (select count(*) from payments)::int payments, (select count(*) from customers)::int customers`));
  expect(n.rows[0]).toMatchObject({ rooms: 40, therapists: 60, customers: 5000 });
  expect(n.rows[0].bookings).toBeGreaterThan(25000);
  expect(n.rows[0].payments).toBeGreaterThan(20000);
});

budget('available_candidates', 250, () => asReception((c) => c.query(`select * from available_candidates($1,$2)`, [ids.service, ids.todayAt('14:00')])));
budget('booking_board day', 150, () => asReception((c) => c.query(`select * from booking_board($1,$2)`, ids.todayRange)));
budget('booking_board week', 500, () => asReception((c) => c.query(`select * from booking_board($1,$2)`, [ids.todayRange[0], ids.dayAt(ids.addDays(ids.today, 7), '00:00')])));
budget('room_status_board', 250, () => asReception((c) => c.query(`select * from room_status_board()`)));
budget('pending_payments', 300, () => asReception((c) => c.query(`select * from pending_payments()`)));
budget('stranded_bookings', 300, () => asReception((c) => c.query(`select * from stranded_bookings()`)));
budget('booking_day_counts month', 300, () => asReception((c) => c.query(`select * from booking_day_counts($1::date,$2::date)`, [ids.today, ids.addDays(ids.today, 30)])));
budget('customer search by phone', 150, () => asReception((c) => c.query(`select id, display_name, phone from customers where phone ilike $1 limit 8`, ['%0800012%'])));
budget('customer search by name prefix', 150, () => asReception((c) => c.query(`select id, display_name, phone from customers where display_name ilike $1 or full_name ilike $1 limit 8`, ['%Perf C12%'])));
budget('customer_summary', 150, () => asReception((c) => c.query(`select * from customer_summary($1)`, [ids.customer])));

// create_booking and cancel: 36 distinct rooms (and their therapists) on one far day, so nothing conflicts.
const created: { id: string }[] = [];
const slotDay = () => ids.addDays(ids.today, 24);
budget('create_booking', 250, async (i) => {
  const k = 3 + i;                                    // warm-up runs use i = -1..-3 → indexes 0..2
  const r = await asUser(ids.reception, (c) => c.query(`select * from create_booking($1,$2,$3,$4,$5,'advance',gen_random_uuid()::text,null,null)`,
    [ids.customer, ids.service, ids.therapists[k], ids.positions[k], ids.dayAt(slotDay(), '20:30')]), true);
  created.push({ id: r.rows[0].id });
});
budget('cancel (set_booking_status)', 250, async (i) => {
  const b = created[3 + i];
  await asUser(ids.reception, (c) => c.query(`select * from set_booking_status($1,'cancelled',1)`, [b.id]), true);
});

const range = (days: number) => [ids.addDays(ids.today, -days + 1), ids.today] as const;
for (const [label, days] of [['one year', 365], ['one month', 30]] as const) {
  const lim = (year_ms: number, month_ms: number) => (days === 365 ? year_ms : month_ms);
  budget(`report_summary ${label}`, 2500, () => asOwner((c) => c.query(`select * from report_summary($1::date,$2::date)`, [...range(days)])));
  budget(`report_revenue ${label} (month grain)`, 2500, () => asOwner((c) => c.query(`select * from report_revenue($1::date,$2::date,'month')`, [...range(days)])));
  budget(`report_by_service ${label}`, 2500, () => asOwner((c) => c.query(`select * from report_by_service($1::date,$2::date)`, [...range(days)])));
  budget(`report_by_therapist ${label}`, 2500, () => asOwner((c) => c.query(`select * from report_by_therapist($1::date,$2::date)`, [...range(days)])));
  budget(`report_room_utilization ${label}`, lim(8000, 2500), () => asOwner((c) => c.query(`select * from report_room_utilization($1::date,$2::date)`, [...range(days)])));
  budget(`report_therapist_utilization ${label}`, lim(8000, 2500), () => asOwner((c) => c.query(`select * from report_therapist_utilization($1::date,$2::date)`, [...range(days)])));
  budget(`report_peak_periods ${label}`, lim(8000, 2500), () => asOwner((c) => c.query(`select * from report_peak_periods($1::date,$2::date)`, [...range(days)])));
}

afterAll(() => {
  mkdirSync('.testdb', { recursive: true });
  const cpus = os.cpus();
  writeFileSync('.testdb/perf-results.json', JSON.stringify({
    machine: `${cpus[0]?.model} × ${cpus.length}, ${Math.round(os.totalmem() / 2 ** 30)} GB, ${os.platform()}`,
    date: new Date().toISOString(), results,
  }, null, 2));
});
