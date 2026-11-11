import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, resetDb, bkk, book, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

test('20 simultaneous attempts on one slot yield exactly one booking', async () => {
  const res = await Promise.allSettled(Array.from({ length: 20 }, () => asRole(b, 'receptionist', (c) => book(c, b))));
  expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  for (const r of res.filter((r) => r.status === 'rejected'))
    expect(['THERAPIST_BUSY', 'POSITION_TAKEN']).toContain((r as PromiseRejectedResult).reason.message);
  expect((await asAdmin((c) => c.query(`select 1 from bookings`))).rowCount).toBe(1);
});
test('one therapist raced into six rooms gets one booking', async () => {
  const res = await Promise.allSettled(b.pos.map((p) => asRole(b, 'receptionist', (c) => book(c, b, { position: p }))));
  expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});
test('a booking raced against a room block never leaves both', async () => {
  const block = asRole(b, 'manager', (c) => c.query(`insert into room_blocks(room_id, during, kind) values ($1, tstzrange($2,$3), 'maintenance')`, [b.rooms[0], bkk('09:00'), bkk('12:00')]));
  const res = await Promise.allSettled([block, asRole(b, 'receptionist', (c) => book(c, b))]);
  expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});
