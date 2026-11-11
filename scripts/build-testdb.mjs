// Recreates (throwaway cluster) and migrates the test database. Called by scripts/testdb.sh.
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const url = new URL(process.env.TEST_DATABASE_URL);
const dbName = url.pathname.slice(1);

if (process.env.TESTDB_RECREATE) {
  const admin = new URL(url); admin.pathname = '/postgres';
  const c = new pg.Client({ connectionString: admin.toString() });
  await c.connect();
  await c.query(`drop database if exists ${dbName} with (force)`);
  await c.query(`create database ${dbName}`);
  await c.end();
}

const c = new pg.Client({ connectionString: url.toString() });
await c.connect();
const hasAuth = (await c.query(`select 1 from pg_namespace where nspname='auth'`)).rowCount > 0;
if (!hasAuth) await c.query(fs.readFileSync('tests/db/shim.sql', 'utf8'));
const dir = 'supabase/migrations';
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : [];
for (const f of files) {
  try { await c.query(fs.readFileSync(path.join(dir, f), 'utf8')); }
  catch (e) { console.error(`migration ${f} failed: ${e.message}`); process.exit(1); }
}
await c.end();
console.log(`test database ready (${files.length} migrations)`);
