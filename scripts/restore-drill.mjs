// Usage: npm run test:restore   (LOCAL ONLY)
// Proves a backup restores: build a known state through the public API, back it up, wipe the database (no seed),
// restore, and check the row counts, the staff sign-in and the double-booking protection.
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

try { process.loadEnvFile('.env.local'); } catch { /* the environment may already be set */ }
const DB = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.NEXT_PUBLIC_SUPABASE_KEY, SERVICE = process.env.SUPABASE_SERVICE_KEY;
const host = new URL(DB).hostname;
if (!['127.0.0.1', 'localhost'].includes(host) || !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(URL_ ?? '')) {
  console.error('restore drill refuses to run against a non-local database');
  process.exit(1);
}
const CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_spa-ops';
const t0 = Date.now();
const fail = (m) => { console.error(`RESTORE DRILL FAILED: ${m}`); process.exit(1); };
const step = (m) => console.log(`- ${m}`);
const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] });
const query = async (sql, params = []) => { const c = new pg.Client({ connectionString: DB }); await c.connect(); try { return await c.query(sql, params); } finally { await c.end(); } };
const anon = () => createClient(URL_, KEY, { auth: { persistSession: false } });
const service = createClient(URL_, SERVICE, { auth: { persistSession: false } });

async function waitForApi() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: KEY } }); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  fail('the API did not come back');
}
async function counts() {
  const t = (await query(`select tablename from pg_tables where schemaname='public' order by 1`)).rows.map((r) => r.tablename);
  const out = {};
  for (const name of t) out[name] = (await query(`select count(*)::int n from public."${name}"`)).rows[0].n;
  out['auth.users'] = (await query(`select count(*)::int n from auth.users`)).rows[0].n;
  return out;
}

// 1. a known state, created through the same API the app uses
step('reset to the seeded state and create known data');
sh('npx supabase db reset');
await waitForApi();
const reception = anon();
const si = await reception.auth.signInWithPassword({ email: 'reception@spa.test', password: 'local-dev-only' });
if (si.error) fail(`could not sign in before the backup: ${si.error.message}`);
const { data: svc } = await service.from('services').select('id').order('sort_order').limit(1).single();
const { data: th } = await service.from('therapists').select('id').eq('active', true).order('sort_order').limit(1).single();
const { data: room } = await service.from('rooms').select('id').eq('code', 'R1').single();
const { data: pos } = await service.from('room_positions').select('id').eq('room_id', room.id).eq('label', '1').single();
const { data: cust } = await service.from('customers').insert({ display_name: 'Drill Customer', phone: '0891234567', comms_consent: true, consent_recorded_at: new Date().toISOString() }).select('id').single();
const tomorrow = (hh) => { const d = new Date(Date.now() + 7 * 3600000 + 86400000).toISOString().slice(0, 10); return new Date(`${d}T${hh}:00+07:00`).toISOString(); };
const book = (start) => reception.rpc('create_booking', { p_customer_id: cust.id, p_service_id: svc.id, p_therapist_id: th.id, p_position_id: pos.id, p_start: start, p_source: 'advance', p_idempotency_key: crypto.randomUUID() });
const b1 = await book(tomorrow('11:00'));
const b2 = await book(tomorrow('14:00'));
if (b1.error || b2.error) fail(`could not create bookings: ${(b1.error ?? b2.error).message}`);
const { data: cash } = await service.from('payment_methods').select('id').eq('code', 'cash').single();
const pay = await reception.rpc('record_payment', { p_booking_id: b1.data.id, p_method_id: cash.id, p_amount_satang: 10000, p_idempotency_key: crypto.randomUUID() });
if (pay.error) fail(`could not record a payment: ${pay.error.message}`);

// 2-3. counts, backup
step('count every table, then back up');
const before = await counts();
const out = execSync('node scripts/backup.mjs', { encoding: 'utf8' });
const dir = /backup written to (\S+)/.exec(out)?.[1];
if (!dir) fail(`backup script gave no folder: ${out}`);

// 4. wipe: schema only, no seed, no data
step('wipe the database (reset without seed)');
sh('npx supabase db reset --no-seed');
await waitForApi();
const wiped = await counts();
if (wiped['auth.users'] !== 0 || wiped.bookings !== 0) fail('the wipe left data behind');

// 5. restore the data into the freshly migrated schema
step(`restore from ${dir}`);
const tables = (await query(`select tablename from pg_tables where schemaname='public'`)).rows.map((r) => `public."${r.tablename}"`).join(', ');
await query(`truncate ${tables} restart identity cascade`);
const restore = spawnSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
  { input: fs.readFileSync(`${dir}/data.sql`), encoding: 'utf8' });
if (restore.status !== 0) fail(`psql restore failed: ${restore.stderr.slice(0, 500)}`);

// 6. assertions
step('check the restored database');
const after = await counts();
for (const [k, v] of Object.entries(before)) if (after[k] !== v) fail(`row count differs for ${k}: before ${v}, after ${after[k] ?? 'missing'}`);
const owner = anon();
const login = await owner.auth.signInWithPassword({ email: 'owner@spa.test', password: 'local-dev-only' });
if (login.error) fail(`owner@spa.test cannot sign in after the restore: ${login.error.message}`);
const rec = anon();
await rec.auth.signInWithPassword({ email: 'reception@spa.test', password: 'local-dev-only' });
const again = await rec.rpc('create_booking', { p_customer_id: cust.id, p_service_id: svc.id, p_therapist_id: th.id, p_position_id: pos.id, p_start: tomorrow('11:00'), p_source: 'advance', p_idempotency_key: crypto.randomUUID() });
if (again.error?.message !== 'THERAPIST_BUSY') fail(`a double booking was not refused after the restore (got ${again.error?.message ?? 'success'})`);
const cons = (await query(`select conname from pg_constraint where conrelid = 'public.bookings'::regclass and contype = 'x' order by 1`)).rows.map((r) => r.conname);
for (const c of ['bookings_position_no_overlap', 'bookings_room_single_party', 'bookings_therapist_no_overlap']) if (!cons.includes(c)) fail(`constraint ${c} is missing`);
if (!(await query(`select relrowsecurity from pg_class where oid = 'public.bookings'::regclass`)).rows[0].relrowsecurity) fail('row-level security is off on bookings');

console.log(`RESTORE DRILL PASSED in ${Math.round((Date.now() - t0) / 1000)} s (${Object.keys(before).length} tables compared)`);
void execFileSync;
