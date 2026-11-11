import { test, expect } from 'vitest';
import { asAdmin, bkk } from './helpers';

test('database is PostgreSQL 16+ with the auth shim', async () => {
  await asAdmin(async (c) => {
    const v = await c.query(`select current_setting('server_version_num')::int as n`);
    expect(v.rows[0].n).toBeGreaterThanOrEqual(160000);
    const u = await c.query(`select auth.uid() as uid`);
    expect(u.rows[0].uid).toBeNull();
  });
});
test('bkk() pins the Bangkok offset', () => {
  expect(bkk('10:00')).toBe('2030-01-15T10:00:00+07:00');
});
