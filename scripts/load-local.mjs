// Fills the LOCAL Supabase database with the year-sized dataset (tests/perf/loadgen.sql) so the browser sees it.
// It resets the local database first, so the four seeded logins are intact. `npx supabase db reset` restores the small seed afterwards.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import pg from 'pg';

const url = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const host = new URL(url).hostname;
if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
  console.error(`refusing to load test data into a non-local database (${host})`);
  process.exit(1);
}
execSync('npx supabase db reset', { stdio: 'inherit' });
const c = new pg.Client({ connectionString: url });
await c.connect();
const t0 = Date.now();
await c.query(fs.readFileSync('tests/perf/loadgen.sql', 'utf8'));
const n = (await c.query('select (select count(*) from bookings)::int bookings, (select count(*) from rooms)::int rooms, (select count(*) from customers)::int customers')).rows[0];
await c.end();
console.log(`loaded in ${Math.round((Date.now() - t0) / 1000)} s:`, n);
console.log('Remember: `npx supabase db reset` restores the small seed (needed before the normal browser suite).');
