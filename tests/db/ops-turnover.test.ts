import { test, expect, beforeEach } from 'vitest';
import type { PoolClient } from 'pg';
import { asAdmin, asRole, resetDb, bkk, book, expectCode, randomUUID, soon, shiftNow, runTo, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

const open = (room: string) => asAdmin((c) => c.query(`select * from room_turnovers where room_id=$1 and ready_at is null`, [room]));

test('each step stamps its time', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  expect((await runTo(b, k.id, 'checked_in')).checked_in_at).not.toBeNull();
  const s = await runTo(b, k.id, 'in_treatment');
  expect([s.started_at === null, s.completed_at]).toEqual([false, null]);
  expect((await runTo(b, k.id, 'completed')).completed_at).not.toBeNull();
});
test('completing opens one turnover; a therapist marks the room ready; a second tap is refused', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await runTo(b, k.id, 'completed');
  expect((await open(b.rooms[0])).rowCount).toBe(1);
  const t = await asRole(b, 'therapist', (c) => c.query(`select * from mark_room_ready($1)`, [b.rooms[0]]));
  expect(t.rows[0].ready_by).toBe(b.users.therapist);
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]])), 'INVALID_TRANSITION');
});
test('a shared room is cleaned only after the last partner finishes', async () => {
  await asAdmin((c) => c.query(`insert into room_positions(room_id, label) values ($1,'2')`, [b.rooms[0]]));
  const p2 = (await asAdmin((c) => c.query(`select id from room_positions where room_id=$1 and label='2'`, [b.rooms[0]]))).rows[0].id;
  const party = randomUUID();
  const a = await asRole(b, 'receptionist', (c) => book(c, b, { party }));
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { party, therapist: b.t2, position: p2, customer: b.c2 }));
  await runTo(b, a.id, 'in_treatment'); await runTo(b, z.id, 'in_treatment');
  await runTo(b, a.id, 'completed');
  expect((await open(b.rooms[0])).rowCount).toBe(0);
  await runTo(b, z.id, 'completed');
  expect((await open(b.rooms[0])).rowCount).toBe(1);
});
test('a treatment cannot start in a room that is being cleaned, or still occupied by someone else', async () => {
  const a = await asRole(b, 'receptionist', (c) => book(c, b));
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('12:15'), therapist: b.t2, customer: b.c2 }));
  await runTo(b, a.id, 'in_treatment'); await runTo(b, z.id, 'checked_in');
  const start = () => asRole(b, 'receptionist', async (c) => {
    const v = (await c.query(`select version from bookings where id=$1`, [z.id])).rows[0].version;
    return c.query(`select set_booking_status($1,'in_treatment',$2)`, [z.id, v]);
  });
  await expectCode(start(), 'ROOM_NOT_READY');                      // overrunning occupant
  await runTo(b, a.id, 'completed');
  await expectCode(start(), 'ROOM_NOT_READY');                      // cleaning
  await asRole(b, 'receptionist', (c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]]));
  await start();
  expect((await asAdmin((c) => c.query(`select status from bookings where id=$1`, [z.id]))).rows[0].status).toBe('in_treatment');
});
test('a therapist cannot run two treatments at once', async () => {
  const a = await asRole(b, 'receptionist', (c) => book(c, b));
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('11:00'), position: b.pos[1], customer: b.c2 }));
  await runTo(b, a.id, 'in_treatment');
  await expectCode(runTo(b, z.id, 'in_treatment'), 'THERAPIST_BUSY');
});
test('finishing early frees the therapist; the room is offered again only once marked ready', async () => {
  await shiftNow(b);
  const k = await asRole(b, 'receptionist', (c) => book(c, b, { start: soon(-4), source: 'walk_in' }));
  await runTo(b, k.id, 'completed');
  const r = await asAdmin((c) => c.query(`select upper(service_during) <= now() as freed, upper(room_during) <= now() + interval '15 minutes' as buf from bookings where id=$1`, [k.id]));
  expect(r.rows[0]).toEqual({ freed: true, buf: true });
  const rooms = (c: PoolClient) => c.query(`select distinct room_id from available_candidates($1,$2)`, [b.svc60, soon(1)]).then((x) => x.rows.map((y) => y.room_id));
  expect(await asRole(b, 'receptionist', rooms)).not.toContain(b.rooms[0]);
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { start: soon(1), customer: b.c2, source: 'walk_in' })), 'ROOM_NOT_READY');
  await asRole(b, 'receptionist', (c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]]));
  expect(await asRole(b, 'receptionist', rooms)).toContain(b.rooms[0]);
  await asRole(b, 'receptionist', (c) => book(c, b, { start: soon(1), customer: b.c2, source: 'walk_in' }));
});
