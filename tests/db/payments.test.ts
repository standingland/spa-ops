import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, book, runTo, expectCode, randomUUID, pay, money, today, type Actor, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

test('cash settles a completed booking and is verified at once', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b)); await runTo(b, k.id, 'completed');
  const p = await pay(b, 'receptionist', k.id, 150000);
  expect(p.verified_at).not.toBeNull();
  expect(await money(b, k.id)).toMatchObject({ charge_satang: 150000, paid_satang: 150000, due_satang: 0, payment_status: 'paid', has_unverified: false });
});
test('partial payments add up; paying more than is due is refused', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await pay(b, 'receptionist', k.id, 50000);
  expect(await money(b, k.id)).toMatchObject({ due_satang: 100000, payment_status: 'partial' });
  await expectCode(pay(b, 'receptionist', k.id, 100001), 'OVERPAYMENT');
  await pay(b, 'receptionist', k.id, 100000);
  expect((await money(b, k.id)).payment_status).toBe('paid');
});
test('a transfer is recorded but not trusted until a manager verifies it', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const p = await pay(b, 'receptionist', k.id, 150000, { method: 'bank_transfer', reference: 'TXN-88A1' });
  expect(p.verified_at).toBeNull();
  expect((await money(b, k.id)).has_unverified).toBe(true);
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select verify_payment($1)`, [p.id])), 'NOT_AUTHORIZED');
  await asRole(b, 'manager', (c) => c.query(`select verify_payment($1)`, [p.id]));
  expect((await money(b, k.id)).has_unverified).toBe(false);
  await expectCode(asRole(b, 'manager', (c) => c.query(`select verify_payment($1)`, [p.id])), 'INVALID_TRANSITION');
});
test('the same key twice is one payment', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b)); const key = randomUUID();
  const a = await pay(b, 'receptionist', k.id, 150000, { key });
  expect((await pay(b, 'receptionist', k.id, 150000, { key })).id).toBe(a.id);
  expect((await asAdmin((c) => c.query(`select 1 from payments`))).rowCount).toBe(1);
});
test('two taps at the same moment are still one payment', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b)); const key = randomUUID();
  const rows = await Promise.all([1, 2, 3].map(() => pay(b, 'receptionist', k.id, 150000, { key })));
  expect(new Set(rows.map((r) => r.id)).size).toBe(1);
  expect((await asAdmin((c) => c.query(`select 1 from payments`))).rowCount).toBe(1);
});
test('card numbers are refused; ordinary references are kept', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await expectCode(pay(b, 'receptionist', k.id, 1000, { reference: '4111 1111 1111 1111' }), 'CARD_DATA_REFUSED');
  await expectCode(pay(b, 'receptionist', k.id, 1000, { note: '4111-1111-1111-1111' }), 'CARD_DATA_REFUSED');
  await expectCode(pay(b, 'receptionist', k.id, 1000, { note: 'บัตร 4111111111111111 ครับ' }), 'CARD_DATA_REFUSED');
  await pay(b, 'receptionist', k.id, 1000, { reference: '1234567890123456' });            // 16 digits, fails Luhn
  expect((await asAdmin((c) => c.query(`select 1 from payments`))).rowCount).toBe(1);
});
test('paid, then cancelled: overpaid until refunded, then refunded', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const p = await pay(b, 'receptionist', k.id, 150000);
  await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'cancelled',1)`, [k.id]));
  expect(await money(b, k.id)).toMatchObject({ charge_satang: 0, due_satang: -150000, payment_status: 'overpaid' });
  const pend = await asRole(b, 'manager', (c) => c.query(`select booking_id, due_satang from pending_payments()`));
  expect(pend.rows).toEqual([{ booking_id: k.id, due_satang: -150000 }]);
  const refund = (a: Actor, amt: number, why = 'ยกเลิก') => asRole(b, a, (c) => c.query(`select * from record_refund($1,$2,$3,$4)`, [p.id, amt, randomUUID(), why]));
  await expectCode(refund('receptionist', 150000), 'NOT_AUTHORIZED');
  await expectCode(refund('manager', 150001), 'REFUND_EXCEEDS_PAYMENT');
  await expectCode(refund('manager', 1000, ''), 'REASON_REQUIRED');
  await refund('manager', 100000); await expectCode(refund('manager', 50001), 'REFUND_EXCEEDS_PAYMENT'); await refund('owner', 50000);
  expect(await money(b, k.id)).toMatchObject({ refunded_satang: 150000, due_satang: 0, payment_status: 'refunded' });
  expect((await asRole(b, 'manager', (c) => c.query(`select 1 from pending_payments()`))).rowCount).toBe(0);
});
test('a mistake is voided with a reason, never edited or deleted', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const p = await pay(b, 'receptionist', k.id, 150000);
  for (const sql of [`update payments set amount_satang=1 returning id`, `delete from payments returning id`])
    expect((await asRole(b, 'owner', (c) => c.query(sql))).rowCount).toBe(0);
  await expectCode(asRole(b, 'manager', (c) => c.query(`select void_payment($1,' ')`, [p.id])), 'REASON_REQUIRED');
  await asRole(b, 'manager', (c) => c.query(`select void_payment($1,'บันทึกผิดรายการ')`, [p.id]));
  expect(await money(b, k.id)).toMatchObject({ paid_satang: 0, payment_status: 'unpaid' });
  await expectCode(asRole(b, 'manager', (c) => c.query(`select void_payment($1,'x')`, [p.id])), 'INVALID_TRANSITION');
});
test('therapists see no money; reception can be switched off', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b)); await pay(b, 'receptionist', k.id, 1000);
  expect((await asRole(b, 'therapist', (c) => c.query(`select 1 from payments`))).rowCount).toBe(0);
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select booking_money($1)`, [[k.id]])), 'NOT_AUTHORIZED');
  await asRole(b, 'owner', (c) => c.query(`select set_setting('payments.receptionist_can_record','false')`));
  await expectCode(pay(b, 'receptionist', k.id, 1000), 'NOT_AUTHORIZED');
  await pay(b, 'manager', k.id, 1000);
});
test('the day summary separates verified from unverified, and cash is closed against a count', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, position: b.pos[1], customer: b.c2 }));
  await pay(b, 'receptionist', k.id, 150000); await pay(b, 'receptionist', z.id, 100000, { method: 'promptpay' });
  const day = await today();
  const s = await asRole(b, 'manager', (c) => c.query(`select m.code, s.recorded_satang::int r, s.verified_satang::int v, s.unverified_satang::int u from payment_day_summary($1) s join payment_methods m on m.id=s.method_id order by m.code`, [day]));
  expect(s.rows).toEqual([{ code: 'cash', r: 150000, v: 150000, u: 0 }, { code: 'promptpay', r: 100000, v: 0, u: 100000 }]);
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select close_cash_day($1, 140000)`, [day])), 'NOT_AUTHORIZED');
  const c1 = await asRole(b, 'manager', (c) => c.query(`select expected_satang::int e, counted_satang::int n from close_cash_day($1, 140000, 'ขาด 100 บาท')`, [day]));
  expect(c1.rows[0]).toEqual({ e: 150000, n: 140000 });
});
