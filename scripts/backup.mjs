// Usage: node scripts/backup.mjs [--linked]
// Writes backups/<YYYYMMDD-HHmm>/{roles,schema,data}.sql using the Supabase CLI (which runs pg_dump in a container).
//   roles.sql   cluster roles
//   schema.sql  the public schema (structure, constraints, policies, functions)
//   data.sql    data of the public and auth schemas (COPY format), minus auth's own migration bookkeeping
// Default target is the local stack. --linked dumps the linked cloud project: that is for the owner to run
// (docs/deployment.md); this repository never runs it. A backup holds personal data: store it encrypted and off this machine.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const remote = process.argv.includes('--linked') ? ['--linked'] : [];
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
const dir = path.join('backups', stamp);
fs.mkdirSync(dir, { recursive: true });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const dump = (file, args) => execFileSync(npx, ['supabase', 'db', 'dump', ...remote, ...args, '-f', path.join(dir, file)], { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' });

dump('roles.sql', ['--role-only']);
dump('schema.sql', ['-s', 'public']);
dump('data.sql', ['--data-only', '--use-copy', '-s', 'public,auth', '-x', 'auth.schema_migrations']);

let total = 0;
for (const f of ['roles.sql', 'schema.sql', 'data.sql']) {
  const size = fs.statSync(path.join(dir, f)).size;
  if (size === 0) { console.error(`backup failed: ${f} is empty`); process.exit(1); }
  total += size;
}
console.log(`backup written to ${dir} (${(total / 1024).toFixed(0)} KB)`);
console.log('Reminder: this folder contains personal data. Store it encrypted and off this machine.');
