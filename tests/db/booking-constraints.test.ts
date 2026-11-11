import { test, expect, beforeEach } from 'vitest';
import type { PoolClient } from 'pg';
import { asAdmin, asRole, resetDb, bkk, randomUUID, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

type Raw = { therapist: string; position: string; room: string; party?: string; from: string; to: string; roomTo: string; status?: string };
function raw(c: PoolClient, o: Raw) {
  return c.query(
    `insert into bookings(customer_id, service_id, therapist_id, position_id, room_id, party_id,
       service_during, room_during, status, source, price_satang, idempotency_key)
     values ($1,$2,$3,$4,$5,$6, tstzrange($7,$8), tstzrange($7,$9), $10, 'advance', 150000, $11)`,
    [b.c1, b.svc60, o.therapist, o.position, o.room, o.party ?? randomUUID(),
     bkk(o.from), bkk(o.to), bkk(o.roomTo), o.status ?? 'confirmed', randomUUID()]);
}

test('therapist overlap is rejected by the database', async () => {
  await asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[0], room: b.rooms[0], from: '10:00', to: '11:00', roomTo: '11:15' }));
  await expect(asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[1], room: b.rooms[1], from: '10:30', to: '11:30', roomTo: '11:45' })))
    .rejects.toMatchObject({ code: '23P01', constraint: 'bookings_therapist_no_overlap' });
});
test('position overlap includes the turnover buffer', async () => {
  await asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[0], room: b.rooms[0], from: '10:00', to: '11:00', roomTo: '11:15' }));
  await expect(asAdmin((c) => raw(c, { therapist: b.t2, position: b.pos[0], room: b.rooms[0], from: '11:00', to: '12:00', roomTo: '12:15' })))
    .rejects.toMatchObject({ constraint: 'bookings_position_no_overlap' });
});
test('a two-position room takes one party, not two strangers', async () => {
  const party = randomUUID();
  await asAdmin((c) => raw(c, { therapist: b.t1, position: b.couple.pos[0], room: b.couple.room, party, from: '10:00', to: '11:00', roomTo: '11:15' }));
  await expect(asAdmin((c) => raw(c, { therapist: b.t2, position: b.couple.pos[1], room: b.couple.room, from: '10:00', to: '11:00', roomTo: '11:15' })))
    .rejects.toMatchObject({ constraint: 'bookings_room_single_party' });
  await asAdmin((c) => raw(c, { therapist: b.t2, position: b.couple.pos[1], room: b.couple.room, party, from: '10:00', to: '11:00', roomTo: '11:15' }));
});
test('cancelled and no-show bookings free their slot', async () => {
  for (const status of ['cancelled', 'no_show'])
    await asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[0], room: b.rooms[0], from: '10:00', to: '11:00', roomTo: '11:15', status }));
  await asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[0], room: b.rooms[0], from: '10:00', to: '11:00', roomTo: '11:15' }));
});
test('room_id must match the position', async () => {
  await expect(asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[0], room: b.rooms[1], from: '10:00', to: '11:00', roomTo: '11:15' }))).rejects.toThrow();
});
test('no signed-in role can write bookings directly', async () => {
  await asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[0], room: b.rooms[0], from: '10:00', to: '11:00', roomTo: '11:15' }));
  expect((await asRole(b, 'owner', (c) => c.query(`update bookings set note='x' returning id`))).rowCount).toBe(0);
});
