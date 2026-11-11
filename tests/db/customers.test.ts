import { test, expect, beforeEach } from 'vitest';
import { asRole, resetDb, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

test('receptionist can create and find a customer', async () => {
  const r = await asRole(b, 'receptionist', (c) => c.query(
    `insert into customers(display_name, phone) values ('คุณเอ','0810000000') returning id`));
  expect(r.rowCount).toBe(1);
});
test('therapists cannot read the customer table', async () => {
  expect((await asRole(b, 'therapist', (c) => c.query(`select 1 from customers`))).rowCount).toBe(0);
});
test('private notes are hidden from receptionist and therapist', async () => {
  await asRole(b, 'manager', (c) => c.query(`insert into customer_private_notes(customer_id, body) values ($1,'n')`, [b.c1]));
  for (const r of ['receptionist','therapist'] as const)
    expect((await asRole(b, r, (c) => c.query(`select 1 from customer_private_notes`))).rowCount).toBe(0);
  expect((await asRole(b, 'owner', (c) => c.query(`select 1 from customer_private_notes`))).rowCount).toBe(1);
});
test('a customer sees only their own record', async () => {
  const r = await asRole(b, 'customer', (c) => c.query(`select id from customers`));
  expect(r.rows).toEqual([{ id: b.c1 }]);
});
