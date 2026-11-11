import { test, expect } from 'vitest';
import { asAdmin } from './helpers';

// Objects installed by extensions are not ours to judge.
const mine = `and not exists (select 1 from pg_depend d where d.objid = o.oid and d.deptype = 'e')`;

test('every public table has row-level security', async () => {
  const r = await asAdmin((c) => c.query(`select o.relname from pg_class o join pg_namespace n on n.oid=o.relnamespace where n.nspname='public' and o.relkind='r' and not o.relrowsecurity ${mine}`));
  expect(r.rows).toEqual([]);
});
test('every security-definer function pins its search_path', async () => {
  const r = await asAdmin((c) => c.query(`select n.nspname||'.'||o.proname f from pg_proc o join pg_namespace n on n.oid=o.pronamespace where n.nspname in ('public','private') and o.prosecdef and not exists (select 1 from unnest(coalesce(o.proconfig,'{}')) x where x like 'search_path=%') ${mine}`));
  expect(r.rows).toEqual([]);
});
test('anonymous visitors hold no write privilege on any table', async () => {
  const r = await asAdmin((c) => c.query(`select table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and grantee='anon' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')`));
  expect(r.rows).toEqual([]);
});
test('anonymous visitors can execute no function in the private schema that changes data', async () => {
  const r = await asAdmin((c) => c.query(`select o.oid::regprocedure::text f from pg_proc o join pg_namespace n on n.oid=o.pronamespace
    where n.nspname='private' and o.provolatile='v' and has_function_privilege('anon', o.oid, 'execute') and o.prorettype <> 'trigger'::regtype ${mine}`));
  expect(r.rows).toEqual([]);
});
