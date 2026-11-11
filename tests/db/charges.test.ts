import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, book, soon, shiftNow, expectCode, type Actor, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

const policy = (k: string, v: number) => asRole(b, 'owner', (c) => c.query(`select set_setting($1, $2::jsonb)`, [k, String(v)]));
const cancel = (id: string, to = 'cancelled') => asRole(b, 'receptionist', (c) => c.query(`select * from set_booking_status($1,$2,1)`, [id, to])).then((r) => r.rows[0]);

test('cancelling well ahead is free; cancelling late charges the policy percentage', async () => {
  await policy('policy.cancel_fee_percent', 50); await shiftNow(b);
  const far = await asRole(b, 'receptionist', (c) => book(c, b));                                   // 2030
  const near = await asRole(b, 'receptionist', (c) => book(c, b, { start: soon(30), customer: b.c2, position: b.pos[1] }));
  expect((await cancel(far.id)).fee_satang).toBe(0);
  expect((await cancel(near.id)).fee_satang).toBe(75000);
});
test('a no-show is charged the no-show percentage of the discounted price', async () => {
  await policy('policy.no_show_fee_percent', 100);
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'manager', (c) => c.query(`select adjust_booking_charge($1, 30000, null, 'สมาชิก', 1)`, [k.id]));
  const r = await asRole(b, 'receptionist', (c) => c.query(`select * from set_booking_status($1,'no_show',2)`, [k.id]));
  expect([r.rows[0].discount_satang, r.rows[0].fee_satang]).toEqual([30000, 120000]);
});
test('a fee already charged does not change when the policy changes, and a manager can waive it', async () => {
  await policy('policy.no_show_fee_percent', 100);
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await cancel(k.id, 'no_show');
  await policy('policy.no_show_fee_percent', 10);
  expect((await asAdmin((c) => c.query(`select fee_satang from bookings where id=$1`, [k.id]))).rows[0].fee_satang).toBe(150000);
  const w = await asRole(b, 'manager', (c) => c.query(`select * from adjust_booking_charge($1, null, 0, 'ลูกค้าแจ้งล่วงหน้า', 2)`, [k.id]));
  expect([w.rows[0].fee_satang, w.rows[0].charge_reason, w.rows[0].version]).toEqual([0, 'ลูกค้าแจ้งล่วงหน้า', 3]);
  const ev = await asAdmin((c) => c.query(`select kind from booking_events where booking_id=$1 order by id desc limit 1`, [k.id]));
  expect(ev.rows[0].kind).toBe('charge_adjusted');
});
test('adjustments are limited to managers, need a reason and sane amounts', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const adj = (a: Actor, d: number | null, f: number | null, why: string, v = 1) => asRole(b, a, (c) => c.query(`select adjust_booking_charge($1,$2,$3,$4,$5)`, [k.id, d, f, why, v]));
  await expectCode(adj('receptionist', 1000, null, 'x'), 'NOT_AUTHORIZED');
  await expectCode(adj('manager', 1000, null, '  '), 'REASON_REQUIRED');
  await expectCode(adj('manager', 150001, null, 'x'), 'INVALID_AMOUNT');
  await expectCode(adj('manager', -1, null, 'x'), 'INVALID_AMOUNT');
  await expectCode(adj('manager', null, 150001, 'x'), 'INVALID_AMOUNT');
  await expectCode(adj('manager', 1000, null, 'x', 9), 'STALE_VERSION');
});
