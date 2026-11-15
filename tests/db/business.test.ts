import { beforeEach, expect, test } from 'vitest';
import { asAdmin, asRole, asStranger, resetDb, book, runTo, expectCode, pay, today, randomUUID, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });
const item = () => asRole(b, 'manager', async (c) => (await c.query(`select save_inventory_item(null,'Oil','ml',20,true) id`)).rows[0].id as string);
const stock = (id: string, qty: number, cost: number, kind = 'receipt', key = randomUUID()) => asRole(b, 'manager', (c) => c.query(`select record_stock_movement($1,$2,$3,$4,'counted',$5) id`, [id, kind, qty, cost, key]));
const recipe = (id: string, qty = 10) => asRole(b, 'manager', (c) => c.query(`select set_service_materials($1,$2)`, [b.svc60, JSON.stringify([{ item_id: id, quantity: qty }])]));
const rule = (rate = 2000, therapist: string | null = null, mode = 'percent', fixed = 0) => asRole(b, 'manager', (c) => c.query(`select save_commission_rule($1,$2,$3,$4,$5)`, [b.svc60, therapist, mode, rate, fixed]));
const report = async () => {
  const day = await today();
  return asRole(b, 'manager', async (c) => (await c.query(`select earnings_report($1,$1) r`, [day])).rows[0].r);
};
const balance = (id: string) => asAdmin(async (c) => (await c.query(`select on_hand::float8 qty,unit_cost_satang::float8 cost from inventory_items where id=$1`, [id])).rows[0]);
const complete = async (over = {}) => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b, over));
  await runTo(b, k.id, 'completed'); return k;
};

test('completion captures the therapist override once; later rules do not rewrite history', async () => {
  await rule(2000); await rule(3000, b.t1);
  const k = await complete();
  await rule(5000, b.t1);
  const r = await report();
  expect(r.entries).toHaveLength(1);
  expect(r.entries[0]).toMatchObject({ booking_id: k.id, rate_bps: 3000, net_satang: 150000, commission_satang: 45000 });
  await asAdmin((c) => c.query(`update bookings set status='completed' where id=$1`, [k.id]));
  expect((await report()).entry_count).toBe(1);
});

test('discounts and partial/full refunds reduce commissions; voiding a refund restores them', async () => {
  await rule(2000);
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'manager', (c) => c.query(`select adjust_booking_charge($1,30000,null,'promotion',$2)`, [k.id, k.version]));
  await runTo(b, k.id, 'completed');
  const p = await pay(b, 'manager', k.id, 120000);
  expect((await report()).entries[0].commission_satang).toBe(24000);
  const refund = await asRole(b, 'manager', async (c) => (await c.query(`select * from record_refund($1,30000,$2,'returned')`, [p.id, randomUUID()])).rows[0]);
  expect((await report()).entries[0].commission_satang).toBe(18000);
  await asRole(b, 'manager', (c) => c.query(`select void_payment($1,'wrong refund')`, [refund.id]));
  expect((await report()).entries[0].commission_satang).toBe(24000);
  await asRole(b, 'manager', (c) => c.query(`select record_refund($1,120000,$2,'full return')`, [p.id, randomUUID()]));
  expect((await report()).entries[0].commission_satang).toBe(0);
});

test('fixed commissions reduce proportionally with refunds; cancellation accrues nothing', async () => {
  await rule(0, null, 'fixed', 30000);
  const k = await complete(); const p = await pay(b, 'manager', k.id, 150000);
  await asRole(b, 'manager', (c) => c.query(`select record_refund($1,75000,$2,'partial')`, [p.id, randomUUID()]));
  expect((await report()).entries[0].commission_satang).toBe(15000);
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, position: b.pos[1] }));
  await asRole(b, 'manager', (c) => c.query(`select set_booking_status($1,'cancelled',$2)`, [z.id, z.version]));
  expect((await report()).entry_count).toBe(1);
});

test('weighted receipts, fractional recipe deduction and cost snapshots survive later purchases', async () => {
  const id = await item(); await stock(id, 100, 100); await stock(id, 100, 300); await recipe(id, 10.125);
  expect(await balance(id)).toEqual({ qty: 200, cost: 200 });
  const k = await complete();
  expect(await balance(id)).toEqual({ qty: 189.875, cost: 200 });
  await stock(id, 10, 500);
  const day = await today();
  const r = await asRole(b, 'manager', async (c) => (await c.query(`select inventory_report($1,$1) r`, [day])).rows[0].r);
  expect(r.materialCostSatang).toBe(2025);
  expect(r.costByService).toEqual([{ service_id: b.svc60, service_name: 'นวด 60', treatments: 1, cost_satang: 2025, average_satang: 2025 }]);
  expect(r.movements.find((m: { booking_id: string }) => m.booking_id === k.id)).toMatchObject({ quantity: -10.125, unit_cost_satang: 200 });
});

test('stock can go negative on completion; duplicate completion cannot consume twice', async () => {
  const id = await item(); await recipe(id, 30);
  const k = await complete(); expect((await balance(id)).qty).toBe(-30);
  await asAdmin((c) => c.query(`update bookings set status='completed' where id=$1`, [k.id]));
  expect((await balance(id)).qty).toBe(-30);
  await stock(id, 50, 50); expect(await balance(id)).toEqual({ qty: 20, cost: 50 });
});

test('simultaneous completions deduct shared stock without losing a movement', async () => {
  const id = await item(); await stock(id, 100, 100); await recipe(id, 10);
  const a = await asRole(b, 'receptionist', (c) => book(c, b));
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, position: b.pos[1], customer: b.c2 }));
  await Promise.all([runTo(b, a.id, 'completed'), runTo(b, z.id, 'completed')]);
  expect((await balance(id)).qty).toBe(80);
  expect((await asAdmin((c) => c.query(`select id from stock_movements where kind='usage'`))).rowCount).toBe(2);
});

test('stock retries are idempotent and conflicting payloads are rejected', async () => {
  const id = await item(); const key = randomUUID();
  await Promise.all([stock(id, 100, 100, 'receipt', key), stock(id, 100, 100, 'receipt', key)]);
  expect((await balance(id)).qty).toBe(100);
  await expectCode(stock(id, 200, 100, 'receipt', key), 'INVALID_INPUT');
});

test('tip recording is removed; retained historical rows never enter commission results', async () => {
  await rule(2000); const k = await complete();
  await asAdmin((c) => c.query(`insert into staff_tips(booking_id,therapist_id,amount_satang,note,idempotency_key) values($1,$2,20000,'historical',$3)`, [k.id, b.t1, randomUUID()]));
  const r = await report();
  expect(r).not.toHaveProperty('tips'); expect(r).not.toHaveProperty('tip_count');
  expect(r.summary[0]).toEqual({ therapist_id: b.t1, therapist_name: 'T1', commission_satang: 30000, treatments: 1 });
  for (const role of ['owner', 'manager', 'receptionist', 'therapist', 'customer', 'anon'] as const) {
    await expect(asRole(b, role, (c) => c.query('select * from staff_tips'))).rejects.toMatchObject({ code: '42501' });
    await expect(asRole(b, role, (c) => c.query(`select record_staff_tip($1,20000,'tip',$2)`, [k.id, randomUUID()]))).rejects.toMatchObject({ code: '42883' });
  }
  expect((await asAdmin((c) => c.query('select id from staff_tips'))).rowCount).toBe(1);
  expect((await asAdmin((c) => c.query("select to_regprocedure('public.void_staff_tip(uuid,text)') f"))).rows[0].f).toBeNull();
});

test('recipes replace atomically, reject duplicates and precision loss, and unit cannot be changed', async () => {
  const id = await item(); await recipe(id);
  await expectCode(recipe(id, 1.0001), 'INVALID_INPUT');
  await expectCode(asRole(b, 'manager', (c) => c.query(`select set_service_materials($1,$2)`, [b.svc60, JSON.stringify([{ item_id: id, quantity: 1 }, { item_id: id, quantity: 2 }])])), 'DUPLICATE');
  expect((await asAdmin((c) => c.query('select quantity::float8 qty from service_materials'))).rows).toEqual([{ qty: 10 }]);
  await expectCode(asRole(b, 'manager', (c) => c.query(`select save_inventory_item($1,'Oil','bottle',0,true)`, [id])), 'INVALID_INPUT');
  await asRole(b, 'manager', (c) => c.query(`select set_service_materials($1,'[]')`, [b.svc60]));
  expect((await asAdmin((c) => c.query('select id from service_materials'))).rowCount).toBe(0);
});

test('business data and mutations are inaccessible to reception, therapists, customers and strangers', async () => {
  const id = await item(); await stock(id, 100, 100); await rule(); await recipe(id);
  await complete();
  for (const role of ['receptionist', 'therapist', 'customer'] as const) {
    for (const table of ['commission_rules', 'booking_commissions', 'inventory_items', 'service_materials', 'stock_movements']) {
      expect((await asRole(b, role, (c) => c.query(`select * from ${table}`))).rowCount).toBe(0);
    }
    await expectCode(asRole(b, role, (c) => c.query(`select earnings_report(current_date,current_date)`)), 'NOT_AUTHORIZED');
    await expectCode(asRole(b, role, (c) => c.query(`select record_stock_movement($1,'adjustment',1,0,'x',$2)`, [id, randomUUID()])), 'NOT_AUTHORIZED');
  }
  expect((await asStranger((c) => c.query('select * from inventory_items'))).rowCount).toBe(0);
  await expectCode(asStranger((c) => c.query(`select inventory_report(current_date,current_date)`)), 'NOT_AUTHORIZED');
  await expect(asRole(b, 'manager', (c) => c.query(`update inventory_items set on_hand=9999 where id=$1`, [id]))).rejects.toMatchObject({ code: '42501' });
  await expect(asRole(b, 'anon', (c) => c.query(`select inventory_report(current_date,current_date)`))).rejects.toMatchObject({ code: '42501' });
});

test('reports enforce valid bounded periods and Bangkok date boundaries', async () => {
  const k = await complete();
  await asAdmin((c) => c.query(`update booking_commissions set completed_at='2030-01-14T17:00:00Z' where booking_id=$1`, [k.id]));
  const query = (from: string, to: string) => asRole(b, 'manager', async (c) => (await c.query(`select earnings_report($1,$2) r`, [from, to])).rows[0].r);
  expect((await query('2030-01-15', '2030-01-15')).entry_count).toBe(1);
  expect((await query('2030-01-14', '2030-01-14')).entry_count).toBe(0);
  await expectCode(query('2030-01-16', '2030-01-15'), 'INVALID_INPUT');
  await expectCode(query('2030-01-01', '2032-01-01'), 'INVALID_INPUT');
});
