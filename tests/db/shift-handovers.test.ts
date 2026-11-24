import { beforeEach, expect, test } from 'vitest';
import { asRole, resetDb, type Actor, type Base } from './helpers';

let base: Base;
beforeEach(async () => { base = await resetDb(); });

const post = (actor: Actor, body = 'Cash counted, room 3 needs a new towel rack') =>
  asRole(base, actor, (client) => client.query('insert into shift_handovers (body) values ($1)', [body]));

const read = (actor: Actor) =>
  asRole(base, actor, (client) => client.query('select body, author_name from shift_handovers'));

test('the front desk and management post handovers and the database assigns the author', async () => {
  await post('receptionist');
  await post('manager', 'Checked the stock room');
  const { rows } = await read('owner');
  expect(rows.map((r) => r.author_name).sort()).toEqual(['manager', 'receptionist']);
  expect((await read('receptionist')).rows).toHaveLength(2);
  await expect(asRole(base, 'receptionist', (client) => client.query(
    `insert into shift_handovers (body, author_name) values ('Spoofed', 'owner')`,
  ))).rejects.toMatchObject({ code: '42501' });
  await expect(post('receptionist', ' \t\n ')).rejects.toMatchObject({ code: '23514' });
});

test('therapists, visitors and anonymous callers cannot read or post handovers', async () => {
  await post('receptionist');
  expect((await read('therapist')).rows).toEqual([]);
  expect((await read('customer')).rows).toEqual([]);
  for (const actor of ['therapist', 'customer'] as const) {
    await expect(post(actor)).rejects.toMatchObject({ code: '42501' });
  }
  await expect(read('anon')).rejects.toMatchObject({ code: '42501' });
  await expect(post('anon')).rejects.toMatchObject({ code: '42501' });
});

test('handovers are append-only', async () => {
  await post('receptionist');
  for (const sql of ['update shift_handovers set body = \'edited\'', 'delete from shift_handovers']) {
    await expect(asRole(base, 'owner', (client) => client.query(sql))).rejects.toMatchObject({ code: '42501' });
  }
});
