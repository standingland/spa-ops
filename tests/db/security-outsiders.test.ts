import { test, expect, beforeEach } from 'vitest';
import { asAdmin, asRole, asStranger, book, deactivate, expectCode, resetDb, type Base } from './helpers';

let b: Base;
beforeEach(async () => { b = await resetDb(); });

const mine = `and not exists (select 1 from pg_depend d where d.objid = o.oid and d.deptype = 'e')`;
const fns = () => asAdmin((c) => c.query(`select o.oid::regprocedure::text sig, o.proname, o.pronargs from pg_proc o join pg_namespace n on n.oid=o.pronamespace where n.nspname='public' and o.prokind='f' and o.prorettype <> 'trigger'::regtype and o.proname <> 'health_ping' ${mine} order by 1`)).then((r) => r.rows);
const callNull = (f: { proname: string; pronargs: number }) => `select public.${f.proname}(${Array(f.pronargs).fill('null').join(',')})`;
const denied = (e: unknown) => (e as { message?: string; code?: string })?.message === 'NOT_AUTHORIZED' || (e as { code?: string })?.code === '42501';

test.each(['anon', 'stranger', 'deactivated'] as const)('%s can call no function', async (who) => {
  if (who === 'deactivated') await deactivate(b, 'receptionist');
  const run = (sql: string) => who === 'anon' ? asRole(b, 'anon', (c) => c.query(sql)) : who === 'stranger' ? asStranger((c) => c.query(sql)) : asRole(b, 'receptionist', (c) => c.query(sql));
  const leaks: string[] = [];
  for (const f of await fns()) {
    try { await run(callNull(f)); leaks.push(f.sig); } catch (e) { if (!denied(e)) leaks.push(`${f.sig} → ${(e as Error).message}`); }
  }
  expect(leaks).toEqual([]);
}, 120000);

test.each(['stranger', 'deactivated'] as const)('%s reads no row from any table', async (who) => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  if (who === 'deactivated') await deactivate(b, 'receptionist');
  const tables = (await asAdmin((c) => c.query(`select tablename from pg_tables where schemaname='public'`))).rows.map((r) => r.tablename);
  const seen: string[] = [];
  for (const t of tables) {
    const q = `select 1 from public."${t}" limit 1`;
    const n = await (who === 'stranger' ? asStranger((c) => c.query(q)) : asRole(b, 'receptionist', (c) => c.query(q))).then((r) => r.rowCount, () => 0);
    if (n) seen.push(t);
  }
  expect(seen).toEqual([]);
}, 120000);

test('a receptionist cannot attach a login to a customer record or undo an anonymisation', async () => {
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`update customers set user_id=$1 where id=$2`, [b.users.receptionist, b.c2])), 'NOT_AUTHORIZED');
  await expectCode(asRole(b, 'manager', (c) => c.query(`update customers set anonymised_at=now() where id=$1`, [b.c2])), 'NOT_AUTHORIZED');
});

test('the health ping is the one thing an anonymous caller may run', async () => {
  expect((await asRole(b, 'anon', (c) => c.query(`select health_ping() ok`))).rows[0].ok).toBe(true);
});
