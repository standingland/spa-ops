import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, asService, resetDb, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });
const hit = (key: string, win = 60, max = 3) => asService((c) => c.query(`select public_rate_hit($1,$2,$3) ok`, [key, win, max])).then((r) => r.rows[0].ok as boolean);

test('the max+1th hit inside the window is refused, other keys are unaffected, and the window resets', async () => {
  expect([await hit('ip:1'), await hit('ip:1'), await hit('ip:1'), await hit('ip:1')]).toEqual([true, true, true, false]);
  expect(await hit('ip:2')).toBe(true);
  await asAdmin((c) => c.query(`update public_rate_hits set at = now() - interval '2 minutes' where key='ip:1'`));
  expect(await hit('ip:1')).toBe(true);
});
test('concurrent hits never exceed the maximum', async () => {
  const r = await Promise.all(Array.from({ length: 10 }, () => hit('ip:race', 60, 3)));
  expect(r.filter(Boolean)).toHaveLength(3);
});
test('anon and authenticated cannot call public_rate_hit or read the table', async () => {
  for (const a of ['anon', 'owner'] as const) {
    await expect(asRole(b, a, (c) => c.query(`select public_rate_hit('k', 60, 3)`))).rejects.toMatchObject({ message: expect.stringContaining('permission denied') });
    await expect(asRole(b, a, (c) => c.query(`select * from public_rate_hits`))).rejects.toMatchObject({ message: expect.stringContaining('permission denied') });
  }
});
