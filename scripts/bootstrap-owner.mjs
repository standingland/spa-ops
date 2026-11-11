// Usage: OWNER_PASSWORD=... node scripts/bootstrap-owner.mjs --email <email> --name <display name>
// Creates the first owner when no active owner exists. The password comes from the environment, never from an argument.
import { createClient } from '@supabase/supabase-js';
import { bootstrapOwner } from '../src/modules/identity/bootstrap.ts';

try { process.loadEnvFile('.env.local'); } catch { /* the environment may already be set */ }
const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : undefined; };
const email = arg('email'), name = arg('name'), password = process.env.OWNER_PASSWORD;
if (!email || !name || !password) {
  console.error('usage: OWNER_PASSWORD=... node scripts/bootstrap-owner.mjs --email <email> --name <name>');
  process.exit(2);
}
if (password.length < 10) { console.error('OWNER_PASSWORD must be at least 10 characters'); process.exit(2); }
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required'); process.exit(2); }
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
try {
  const result = await bootstrapOwner(admin, { email, password, displayName: name });
  console.log(result);
  process.exit(result === 'created' ? 0 : 1);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
