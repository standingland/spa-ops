import { test, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { asUser, loadOnce, pool, type Ids } from './helpers';

let ids: Ids;
beforeAll(async () => { ids = await loadOnce(); });

// Each booking is its own transaction on its own pooled connection, like many desks at once.
async function bookAs(o: { room: number; therapist: number; dayOffset: number }) {
  const day = ids.addDays(ids.futureDay, o.dayOffset);
  return asUser(ids.reception, (c) => c.query(
    `select * from create_booking($1,$2,$3,$4,$5,'advance',$6,null,null)`,
    [ids.customer, ids.service, ids.therapists[o.therapist], ids.positions[o.room], ids.dayAt(day, '19:45'), randomUUID()]), true);
}

test('200 desks booking different slots all succeed; 50 fighting for one slot yield one winner; nothing deadlocks', async () => {
  expect(pool.options.max).toBeGreaterThanOrEqual(20);
  const spread = Array.from({ length: 200 }, (_, i) => bookAs({ room: i % 40, therapist: i % 40, dayOffset: Math.floor(i / 40) }));
  const fight = Array.from({ length: 50 }, () => bookAs({ room: 0, therapist: 0, dayOffset: 6 }));
  const t0 = Date.now();
  const [a, z] = await Promise.all([Promise.allSettled(spread), Promise.allSettled(fight)]);
  const elapsed = Date.now() - t0;
  expect(a.filter((r) => r.status === 'fulfilled')).toHaveLength(200);
  expect(z.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const errors = [...a, ...z].filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason as { code?: string; message: string });
  expect(errors.filter((e) => e.code === '40P01' || e.code === '40001')).toEqual([]);
  expect(errors.every((e) => ['THERAPIST_BUSY', 'POSITION_TAKEN'].includes(e.message))).toBe(true);
  expect(elapsed).toBeLessThan(20000);
  console.log(`storm: 250 concurrent bookings in ${elapsed} ms`);
});
