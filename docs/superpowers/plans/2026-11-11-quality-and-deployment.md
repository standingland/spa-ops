# Spa Ops — Plan 4 of 4: Quality, Hardening and Deployment Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the platform is safe, fast and recoverable enough to run a real spa, and hand the owner everything needed to go live — without going live.

**Architecture:** No new product features. This plan adds proofs (catalog-driven security tests, load budgets on a year of data, a restore drill, a full-day journey), the small pieces production needs that features never asked for (first-owner bootstrap, password maintenance, structured logs, health check, security headers, environment validation, retention maintenance), and the runbooks. It ends at a go-live checklist; creating cloud projects, buying plans and deploying are the owner's decisions and are **not executed** here.

**Tech Stack:** As built — Next.js 16.4.6, React 19.3, Supabase (PostgreSQL, Auth, Realtime), Vitest 5 + `pg`, Playwright 1.65. One new dev dependency: `@axe-core/playwright`. Read `AGENTS.md` first; for instrumentation, headers and Content-Security-Policy follow the guides in `node_modules/next/dist/docs/` for this Next.js version rather than memory. For Supabase CLI flags, read `npx supabase <command> --help`.

**Spec:** `docs/spec/master-prompt.md` — section 15, Phase 5 of section 16, sections 17–19. Builds on `docs/architecture.md` and the three earlier plans in `docs/superpowers/plans/`.

## Global Constraints

- Everything in the Global Constraints of Plans 1–3 still applies.
- "You must request explicit authorization before destructive database operations, production deployment, purchasing services, or irreversible changes." This plan creates **no** cloud project, buys nothing, deploys nothing and touches no production data. Every such step is written into `docs/deployment.md` for the owner to approve and run.
- "Do not fabricate test results." Every number in the final reports is pasted from a real run on this machine, with the machine named. A budget that is missed is reported as missed.
- "All acceptance criteria must have demonstrable evidence." "Record unresolved risks and limitations transparently."
- "If tooling or permissions are unavailable, clearly identify the limitation rather than claiming work was completed."
- Logs never contain customer names, phone numbers, emails, notes, payment references, passwords or tokens.
- Performance budgets are the 95th percentile of 30 runs on the developer machine, against the dataset defined in Task 6. They are engineering targets chosen for this plan, not figures from the spec.
- New settings keys follow Plan 3's rules (owner-only, validated, audited). New error codes: none.
- Existing interfaces consumed as built: `tests/db/helpers.ts`, `tests/e2e/db.ts`, `tests/e2e/helpers.ts`, `src/lib/action.ts` (`fail`, `failFrom`, `ActionResult`), `src/lib/errors.ts`, `src/modules/identity/{session,actions,schema}.ts`, `src/lib/supabase/admin.ts` (importable only from the files its test lists), `get_settings` / `set_setting`, `POST /api/internal/dispatch`.

## Review Focus

1. **Someone who is not staff holds a valid session** — a person who signed up by themselves, or an employee deactivated five minutes ago: they can read nothing and do nothing. → Task 2, Task 5.
2. **Production is started with a missing secret, a placeholder, or the development password:** it refuses to start and says which value is wrong. → Task 3.
3. **An unexpected database error during a desk action:** staff see a short reference code, the log holds the detail under the same code, and the log line contains no customer data. → Task 4.
4. **A year of history and a busy hour:** Today, booking and reports stay inside their budgets, and many desks booking at once never deadlock. → Task 6, Task 7.
5. **A backup is only real if it restores:** the restored database signs staff in, keeps its row counts, and still refuses a double booking. → Task 9.

## File Structure

```
supabase/migrations/
  0019_hardening.sql        fixes found by the security catalog tests; customers column guard; health_ping
  0020_performance.sql      indexes found by the load budgets
  0021_maintenance.sql      two retention settings, run_maintenance
supabase/config.toml        sign-up off, password length 10
tests/db/security-catalog.test.ts, security-outsiders.test.ts, maintenance.test.ts
tests/perf/                 loadgen.sql, helpers.ts, budgets.test.ts, storm.test.ts   (vitest.perf.config.ts)
tests/e2e/                  global-setup.ts, account.spec.ts, errors.spec.ts, journey.spec.ts, a11y.spec.ts
tests/e2e-prod/             headers.spec.ts, scale.spec.ts                            (playwright.prod.config.ts)
src/lib/                    env.ts, log.ts (+tests); action.ts and errors.ts modified
src/instrumentation.ts      validates the environment at start
src/app/api/health/route.ts
src/app/api/internal/maintenance/route.ts
src/app/[locale]/(staff)/account/page.tsx
src/modules/identity/       bootstrap.ts, components/{PasswordForm,StaffPasswordReset}.tsx; actions.ts, schema.ts modified
scripts/                    bootstrap-owner.mjs, backup.mjs, restore-drill.mjs
.github/workflows/ci.yml
README.md                   replaced
docs/                       deployment.md, operations.md, security-report.md, acceptance.md
```

---

### Task 1: Close out Plan 3 and make the browser suite sign in once

At the time this plan was written, Plan 3's feature commits were all present but its close-out was not: `docs/architecture.md` and `tests/e2e/db.ts` were modified and uncommitted, and no Plan 3 "final verification run" was recorded. The uncommitted `tests/e2e/db.ts` change works around the local auth server's limit of 30 sign-ins per 5 minutes.

**Files:**
- Create: `tests/e2e/global-setup.ts`
- Modify: `playwright.config.ts`, `tests/e2e/helpers.ts`, `.gitignore`, `docs/architecture.md`

**Interfaces:**
- Produces:
  - `tests/e2e/global-setup.ts` — signs in through the login page once per seeded account (`owner`, `manager`, `reception`, `therapist` `@spa.test`) and saves each browser state to `tests/e2e/.auth/<local-part>.json` (git-ignored).
  - `signIn(page, email, password?)` keeps its signature. For a seeded account with a saved state it adds that state's cookies to the page's context and opens `/th/today`; for any other account, or when a password is passed explicitly, it signs in through the form as before.
  - `signInFresh(page, email, password)` — always uses the form (for tests about signing in).

- [ ] **Step 1: Review the uncommitted work.** `git diff` both files; confirm the `tests/e2e/db.ts` change is only the cached `publicClient`. Keep it.
- [ ] **Step 2: Write the failing test** — add to `tests/e2e/auth.spec.ts`:

```ts
test('forty page sign-ins in a row do not hit the sign-in rate limit', async ({ browser }) => {
  for (let i = 0; i < 40; i++) {
    const page = await (await browser.newContext()).newPage();
    await signIn(page, 'reception@spa.test');
    await expect(page).toHaveURL(/\/th\/today/);
    await page.context().close();
  }
});
```

- [ ] **Step 3: Run** `npx playwright test auth --project=desktop`. Expected: FAIL with a sign-in error after about 30 iterations.
- [ ] **Step 4: Implement** the global setup and the two helpers. Tests that assert the login form itself use `signInFresh`.
- [ ] **Step 5: Run the whole suite and record it:** `npm run test:db && npx vitest run src && npx playwright test && npm run build && npm run lint`. Expected: all pass. Paste the real summary lines into `docs/architecture.md` under "Final verification run (Plan 3)". If anything fails, fix the cause before continuing (use superpowers:systematic-debugging) and record what was fixed.
- [ ] **Step 6: Commit** `test(e2e): sign in once per account; docs: plan 3 verification run`.

---

### Task 2: Security validation in the database

**Files:**
- Create: `tests/db/security-catalog.test.ts`, `tests/db/security-outsiders.test.ts`, `supabase/migrations/0019_hardening.sql`
- Modify: `supabase/config.toml`, `tests/db/helpers.ts`, `src/modules/identity/schema.ts`

**Interfaces:**
- Produces:
  - `tests/db/helpers.ts`: `asStranger<T>(fn)` — an authenticated session whose user id exists in `auth.users` but has no `staff` row and no `customers` row; `deactivate(b, role)` — sets that seeded staff member inactive.
  - `0019_hardening.sql` contains exactly the fixes the two test files prove necessary, plus:
    - a trigger on `customers` that rejects a change to `user_id` or `anonymised_at` unless made by `service_role` or inside `anonymise_customer` (`NOT_AUTHORIZED`);
    - `health_ping() returns boolean` — returns true; executable by `anon` and `authenticated`. It is the **only** function an anonymous caller may run successfully.
  - `supabase/config.toml`: `enable_signup = false`; `minimum_password_length = 10`. `StaffInput.password` minimum becomes 10.
- The rules the catalog tests enforce (objects installed by extensions are excluded through `pg_depend`):
  1. Every table in schema `public` has row-level security enabled.
  2. Every `security definer` function in `public` and `private` sets `search_path`.
  3. No table in `public` grants `insert`, `update`, `delete` or `truncate` to `anon`.
  4. Schema `private` is not in the API's exposed schemas, and `anon` cannot execute any function in it that changes data.
  5. Every function in `public` except `health_ping`, called by `anon` with every argument null, fails with `NOT_AUTHORIZED` or SQLSTATE `42501` — the permission check comes before any other work.
  6. The same call made by a stranger and by a deactivated staff member fails the same way.

- [ ] **Step 1: Write the failing tests**

```ts
// security-catalog.test.ts
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

// security-outsiders.test.ts
const fns = () => asAdmin((c) => c.query(`select o.oid::regprocedure::text sig, o.proname, o.pronargs from pg_proc o join pg_namespace n on n.oid=o.pronamespace where n.nspname='public' and o.prokind='f' and o.prorettype <> 'trigger'::regtype and o.proname <> 'health_ping' ${mine} order by 1`)).then((r) => r.rows);
const callNull = (f: { proname: string; pronargs: number }) => `select public.${f.proname}(${Array(f.pronargs).fill('null').join(',')})`;
const denied = (e: any) => e?.message === 'NOT_AUTHORIZED' || e?.code === '42501';

test.each(['anon', 'stranger', 'deactivated'] as const)('%s can call no function', async (who) => {
  if (who === 'deactivated') await deactivate(b, 'receptionist');
  const run = (sql: string) => who === 'anon' ? asRole(b, 'anon', (c) => c.query(sql)) : who === 'stranger' ? asStranger((c) => c.query(sql)) : asRole(b, 'receptionist', (c) => c.query(sql));
  const leaks: string[] = [];
  for (const f of await fns()) {
    try { await run(callNull(f)); leaks.push(f.sig); } catch (e) { if (!denied(e)) leaks.push(`${f.sig} → ${(e as Error).message}`); }
  }
  expect(leaks).toEqual([]);
});
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
});
test('a receptionist cannot attach a login to a customer record or undo an anonymisation', async () => {
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`update customers set user_id=$1 where id=$2`, [b.users.receptionist, b.c2])), 'NOT_AUTHORIZED');
  await expectCode(asRole(b, 'manager', (c) => c.query(`update customers set anonymised_at=now() where id=$1`, [b.c2])), 'NOT_AUTHORIZED');
});
test('the health ping is the one thing an anonymous caller may run', async () => {
  expect((await asRole(b, 'anon', (c) => c.query(`select health_ping() ok`))).rows[0].ok).toBe(true);
});
```

- [ ] **Step 2: Run** `npm run test:db -- security`. Expected: FAIL. Record the list of leaking functions in the commit message body.
- [ ] **Step 3: Write `0019_hardening.sql`.** For each leaking function, `create or replace` it with the role check as its first statement; do not change any other behaviour. Tables that staff legitimately read while deactivated do not exist — an inactive member's `private.current_role()` is null.
- [ ] **Step 4: Run** `npm run test:db`, then `npx supabase db reset && npx playwright test admin-staff auth`. Expected: all pass (staff creation still works with sign-up disabled, because it uses the admin API).
- [ ] **Step 5: Commit** `fix(db): security hardening proved by catalog and outsider tests`.

---

### Task 3: Environment validation and security headers

**Files:**
- Create: `src/lib/env.ts`, `src/lib/env.test.ts`, `src/instrumentation.ts`, `playwright.prod.config.ts`, `tests/e2e-prod/headers.spec.ts`
- Modify: `next.config.ts`, `src/proxy.ts` (only if the Next.js CSP guide requires a nonce there), `src/app/api/internal/dispatch/route.ts`, `src/app/api/reports/[name]/csv/route.ts`, `src/app/api/customers/[id]/export/route.ts`, `.env.example`, `package.json` (`"test:prod": "playwright test -c playwright.prod.config.ts"`)

**Interfaces:**
- Produces:

```ts
export type Env = { supabaseUrl: string; supabaseKey: string; serviceKey: string; cronSecret: string | null; senderName: string; appEnv: 'development' | 'production' };
export function parseEnv(source: Record<string, string | undefined>): Env;   // throws Error('ENV: <name>: <reason>; …') listing every problem
export function bearerMatches(header: string | null, secret: string): boolean;   // constant-time comparison
```

  - Always required: `NEXT_PUBLIC_SUPABASE_URL` (a URL), `NEXT_PUBLIC_SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`. `APP_ENV` is `development` unless set to `production`.
  - When `APP_ENV=production`, additionally: the URL must be `https` and must not name `localhost` or `127.0.0.1`; `CRON_SECRET` is required, at least 32 characters, and not `local-dev-only`; the service key must differ from the public key.
  - `src/instrumentation.ts` calls `parseEnv(process.env)` at server start; a failure stops the server with the message.
  - Both internal routes and nothing else use `bearerMatches`.
  - Response headers on every page and API response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `X-Robots-Tag: noindex, nofollow`, and a `Content-Security-Policy` containing at least `default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`, and a `connect-src` naming `'self'` and the Supabase origin in both its `https` and `wss` forms; script and style directives as the Next.js guide for this version prescribes, with no `'unsafe-eval'` in a production build. `Strict-Transport-Security: max-age=63072000; includeSubDomains` when `APP_ENV=production`.
  - Authenticated pages, the CSV route and the JSON export respond with `Cache-Control: no-store`.
  - `playwright.prod.config.ts`: `testDir: 'tests/e2e-prod'`; web server `npm run build && npm run start -- -p 3200`; one desktop project; reuses the saved sign-in states.

- [ ] **Step 1: Write the failing unit tests**

```ts
const dev = { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_KEY: 'pk', SUPABASE_SERVICE_KEY: 'sk' };
test('development accepts local values', () => {
  expect(parseEnv(dev)).toMatchObject({ appEnv: 'development', cronSecret: null, senderName: 'Studio' });
});
test('every missing value is named at once', () => {
  expect(() => parseEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL.*NEXT_PUBLIC_SUPABASE_KEY.*SUPABASE_SERVICE_KEY/s);
});
test.each([
  [{ ...dev, APP_ENV: 'production', CRON_SECRET: 'x'.repeat(32) }, /NEXT_PUBLIC_SUPABASE_URL/],
  [{ ...dev, APP_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://a.supabase.co' }, /CRON_SECRET/],
  [{ ...dev, APP_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://a.supabase.co', CRON_SECRET: 'local-dev-only' }, /CRON_SECRET/],
  [{ ...dev, APP_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://a.supabase.co', CRON_SECRET: 'x'.repeat(32), SUPABASE_SERVICE_KEY: 'pk' }, /SUPABASE_SERVICE_KEY/],
])('production refuses unsafe configuration %#', (env, problem) => { expect(() => parseEnv(env)).toThrow(problem); });
test('production accepts a complete configuration', () => {
  expect(parseEnv({ ...dev, APP_ENV: 'production', NEXT_PUBLIC_SUPABASE_URL: 'https://a.supabase.co', CRON_SECRET: 'x'.repeat(32) }).appEnv).toBe('production');
});
test('bearer comparison accepts only the exact secret', () => {
  expect([bearerMatches('Bearer s3cret', 's3cret'), bearerMatches('Bearer s3cre', 's3cret'), bearerMatches('s3cret', 's3cret'), bearerMatches(null, 's3cret')]).toEqual([true, false, false, false]);
});
```

- [ ] **Step 2: Write the failing browser tests** (`tests/e2e-prod/headers.spec.ts`)

```ts
test('pages carry the security headers and are never cached or indexed', async ({ page }) => {
  await signIn(page, 'reception@spa.test');
  const r = await page.goto('/th/today'); const h = r!.headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-robots-tag']).toContain('noindex');
  expect(h['cache-control']).toContain('no-store');
  for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"]) expect(h['content-security-policy']).toContain(d);
  expect(h['content-security-policy']).not.toContain("'unsafe-eval'");
});
test('the policy does not break the app: sign-in, live status and a booking panel work with no CSP violation', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await signIn(page, 'reception@spa.test');
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-state', 'live');
  await page.goto('/th/calendar'); await page.goto('/th/rooms');
  expect(violations).toEqual([]);
});
test('downloads are not cacheable', async ({ page }) => {
  await signIn(page, 'owner@spa.test');
  const day = new Date().toISOString().slice(0, 10);
  const r = await page.request.get(`/api/reports/revenue/csv?from=${day}&to=${day}&grain=day`);
  expect([r.status(), r.headers()['cache-control']]).toEqual([200, expect.stringContaining('no-store')]);
});
```

- [ ] **Step 3: Run** `npx vitest run src/lib/env.test.ts` and `npm run test:prod -- headers`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** `npx vitest run src && npm run test:prod -- headers && npx playwright test live notifications`. Expected: pass (the dev server must still work with the headers in place).
- [ ] **Step 6: Commit** `feat(app): environment validation and security headers`.

---

### Task 4: Structured logs, error references and a health check

**Files:**
- Create: `src/lib/log.ts`, `src/lib/log.test.ts`, `src/app/api/health/route.ts`, `src/app/global-error.tsx`, `tests/e2e/errors.spec.ts`
- Modify: `src/lib/action.ts`, `src/lib/action.test.ts` (create if absent), `src/modules/notifications/outbox.ts` (use `log`), every component that renders `uiErrorKey(...)` (find with `grep -rn "uiErrorKey(" src`), `tests/e2e/db.ts`, `messages/{th,en}.json`

**Interfaces:**
- Produces:

```ts
export type LogFields = Record<string, string | number | boolean | null | undefined>;
export function log(level: 'info' | 'warn' | 'error', event: string, fields?: LogFields): void;   // one JSON line on stdout
export function redact(fields: LogFields): LogFields;
export function newErrorRef(): string;                                                             // 8 characters, A–Z and 2–9
```

  - A log line is `{"ts": <ISO time>, "level", "event", …fields}`. `redact` removes any field whose key is, or ends with, one of `name`, `phone`, `email`, `note`, `notes`, `reference`, `password`, `token`, `authorization`, `secret`, `key`; and replaces any remaining string value that looks like an email address or contains seven or more consecutive digits with `"[redacted]"`. `log` always applies `redact`.
  - `ActionResult` failures gain an optional `ref?: string`. `failFrom(err)` — when the code resolves to `UNKNOWN`: creates a ref, logs `error` / `action.unknown_error` with `ref`, the Postgres `code` and the message, and returns `{ ok: false, code: 'UNKNOWN', ref }`. Known codes are neither logged nor given a ref.
  - Every place that shows an action error also shows the reference when present [`error-ref`], with a translated line "tell your manager this code".
  - `GET /api/health` — no sign-in; calls `health_ping` with the public key; `200 {"ok": true}` or `503 {"ok": false}`; `Cache-Control: no-store`; no version, environment or error detail in the body.
  - `src/app/global-error.tsx` — a last-resort page in both languages with a reload button; logs nothing in the browser.
  - `tests/e2e/db.ts`: `sql(text: string, params?: unknown[])` — runs SQL on the local database (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, overridable with `E2E_DATABASE_URL`) using `pg`.

- [ ] **Step 1: Write the failing unit tests**

```ts
test('a log line is one JSON object with time, level and event', () => {
  const out = capture(() => log('info', 'booking.created', { bookingId: 'b1', ms: 12 }));
  expect(JSON.parse(out)).toMatchObject({ level: 'info', event: 'booking.created', bookingId: 'b1', ms: 12 });
  expect(out.endsWith('\n') && out.trim().includes('\n') === false).toBe(true);
});
test('personal data never reaches the log', () => {
  const r = redact({ customer_display_name: 'คุณเอ', phone: '0810000000', to: 'a@b.co', message: 'duplicate key 0810000000', paymentReference: 'TXN', bookingId: 'b1', count: 3 });
  expect(r).toEqual({ to: '[redacted]', message: '[redacted]', bookingId: 'b1', count: 3 });
});
test('an unknown database error gets a reference and a log line; a known one gets neither', () => {
  const out = capture(() => {
    const f = failFrom({ code: 'XX000', message: 'boom' });
    expect(f).toMatchObject({ ok: false, code: 'UNKNOWN' }); expect((f as any).ref).toMatch(/^[A-Z2-9]{8}$/);
  });
  expect(JSON.parse(out)).toMatchObject({ level: 'error', event: 'action.unknown_error', code: 'XX000' });
  expect(capture(() => expect(failFrom({ message: 'THERAPIST_BUSY' })).toEqual({ ok: false, code: 'THERAPIST_BUSY' }))).toBe('');
});
```

  `capture(fn)` is a local helper that spies on `process.stdout.write` and returns what was written.

- [ ] **Step 2: Write the failing browser tests**

```ts
test('an unexpected failure shows a reference code and leaves the form filled', async ({ page }) => {
  await sql(`create function public._e2e_boom() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
             create trigger _e2e_boom before insert on public.bookings for each row execute function public._e2e_boom();`);
  try {
    await signIn(page, 'reception@spa.test');
    await bookManually(page, { room: 'R1', at: tomorrowAt('13:00') });
    await expect(page.getByRole('alert')).toContainText(th.errors.UNKNOWN);
    await expect(page.getByTestId('error-ref')).toHaveText(/[A-Z2-9]{8}/);
    await expect(page.getByTestId('confirm-booking')).toBeVisible();
  } finally { await sql(`drop trigger _e2e_boom on public.bookings; drop function public._e2e_boom();`); }
});
test('the health check answers without sign-in and says nothing else', async ({ request }) => {
  const r = await request.get('/api/health');
  expect([r.status(), await r.json()]).toEqual([200, { ok: true }]);
});
```

- [ ] **Step 3: Run** `npx vitest run src/lib` and `npx playwright test errors`. Expected: FAIL.
- [ ] **Step 4: Implement.** Replace the one existing `console.log` in `outbox.ts` with `log('info', 'notification.send', …)`; `grep -rn "console\." src --include=*.ts --include=*.tsx | grep -v test` must return nothing.
- [ ] **Step 5: Run** `npx vitest run src && npx playwright test errors booking notifications` on both projects. Expected: pass.
- [ ] **Step 6: Commit** `feat(app): structured logs, error references and health check`.

---

### Task 5: Accounts in real life — first owner, password changes, and lock-out

**Files:**
- Create: `src/modules/identity/bootstrap.ts`, `scripts/bootstrap-owner.mjs`, `src/modules/identity/components/{PasswordForm,StaffPasswordReset}.tsx`, `src/app/[locale]/(staff)/account/page.tsx`, `tests/e2e/account.spec.ts`
- Modify: `src/modules/identity/{actions.ts,schema.ts}`, `src/modules/identity/components/StaffAdmin.tsx`, `src/app/[locale]/(staff)/layout.tsx` (link to `/account` for every role), `src/lib/supabase/admin.test.ts` (allow `src/modules/identity/bootstrap.ts`), `messages/{th,en}.json`

**Interfaces:**
- Produces:
  - `bootstrapOwner(admin: SupabaseClient, input: { email: string; password: string; displayName: string }): Promise<'created' | 'owner_exists'>` — returns `'owner_exists'` and changes nothing when any active owner exists; otherwise creates the auth user and the `staff` row with role `owner`, removing the auth user if the second step fails.
  - `scripts/bootstrap-owner.mjs` — `node scripts/bootstrap-owner.mjs --email <email> --name <name>`; reads the password from the `OWNER_PASSWORD` environment variable (never from an argument); prints `created` or `owner_exists`; exit code 0 for created, 1 otherwise. A production database has no seed data, so this is the only way the first account comes to exist.
  - `Password = z.string().min(10).max(72)` in `schema.ts`, used by `StaffInput` and both actions below.
  - `setStaffPassword(input: { userId: string; password: string }): Promise<ActionResult>` — owner only; service client.
  - `changeMyPassword(input: { current: string; next: string }): Promise<ActionResult>` — any signed-in staff member; verifies `current` by signing in with it, then updates; `NOT_AUTHORIZED` when `current` is wrong; `INVALID_INPUT` when `next` fails `Password` or equals `current`.
  - `/account` — the signed-in person's name, role and a change-password form [`pw-current`, `pw-next`, `pw-submit`]. Staff admin gains a reset control per row [`staff-reset-password`] that asks for confirmation.

- [ ] **Step 1: Write the failing browser tests**

```ts
test('a deactivated employee is locked out on their next click, not at their next sign-in', async ({ page }) => {
  await signIn(page, 'reception@spa.test');
  try {
    await sql(`update staff set active=false where user_id=(select id from auth.users where email='reception@spa.test')`);
    await page.goto('/th/customers');
    await expect(page).toHaveURL(/\/th\/login/);
  } finally { await sql(`update staff set active=true where user_id=(select id from auth.users where email='reception@spa.test')`); }
});
test('the owner resets a password and the employee signs in with the new one only', async ({ page, browser }) => {
  await signIn(page, 'owner@spa.test'); await page.goto('/th/admin/staff');
  await resetPassword(page, 'therapist@spa.test', 'brand-new-pass-1');
  const p2 = await (await browser.newContext()).newPage();
  try {
    await signInFresh(p2, 'therapist@spa.test', 'brand-new-pass-1');
    await expect(p2).toHaveURL(/\/th\/today/);
  } finally { await setPasswordViaAdmin('therapist@spa.test', 'local-dev-only'); }
});
test('staff change their own password; a wrong current password or a short new one is refused', async ({ page }) => {
  /* createStaff temp@spa.test via the service client; signInFresh; /th/account:
     wrong current → th.errors.NOT_AUTHORIZED; next "short" → th.errors.INVALID_INPUT; valid → status message; signInFresh with the new password works */
});
test('the first owner can be created only while no owner exists', async () => {
  expect(await bootstrapOwner(admin, { email: 'first@spa.test', password: 'first-owner-pass', displayName: 'First' })).toBe('owner_exists');
  await sql(`update staff set active=false where role='owner'`);
  try {
    expect(await bootstrapOwner(admin, { email: 'first@spa.test', password: 'first-owner-pass', displayName: 'First' })).toBe('created');
    expect((await sql(`select role, active from staff s join auth.users u on u.id=s.user_id where u.email='first@spa.test'`)).rows).toEqual([{ role: 'owner', active: true }]);
  } finally {
    await sql(`delete from staff where user_id in (select id from auth.users where email='first@spa.test'); update staff set active=true where role='owner'`);
    await deleteUserViaAdmin('first@spa.test');
  }
});
```

- [ ] **Step 2: Run** `npx playwright test account`. Expected: FAIL.
- [ ] **Step 3: Implement.** `resetPassword`, `setPasswordViaAdmin` and `deleteUserViaAdmin` are local test helpers.
- [ ] **Step 4: Run** `npx playwright test account admin-staff auth` on both projects and `npx vitest run src`. Expected: pass.
- [ ] **Step 5: Commit** `feat(identity): first-owner bootstrap, password maintenance and lock-out proof`.

---

### Task 6: A year of data — load generator and database budgets

**Files:**
- Create: `tests/perf/loadgen.sql`, `tests/perf/helpers.ts`, `tests/perf/budgets.test.ts`, `vitest.perf.config.ts`, `supabase/migrations/0020_performance.sql`
- Modify: `package.json` (`"test:perf": "bash scripts/testdb.sh && vitest run -c vitest.perf.config.ts"`), `vitest.config.ts` (exclude `tests/perf`)

**Interfaces:**
- Produces:
  - `tests/perf/loadgen.sql` — fills an empty migrated database, deterministically, with: 4 zones; 3 room categories; **40 rooms** (two of them with 2 positions); **60 therapists** each qualified for all services; 8 services (45–120 minutes); 5,000 customers; shifts 10:00–22:00 Bangkok for every therapist on every day from 365 days ago to 30 days ahead; and bookings on four fixed slots per room per day (10:00, 12:30, 15:00, 17:30), with room *n* always served by therapist *n* so nothing can overlap, and about half the slots filled by a hash of (room, day, slot) — roughly 80 bookings a day, 31,000 in all. Nothing is generated at or after 19:45, which the storm test in Task 7 uses. Past bookings: 85% `completed` with one cash payment each, 8% `cancelled`, 4% `no_show`, 3% completed and unpaid. Future bookings: `confirmed`. One `booking_events` row per booking. It disables the audit triggers while loading and re-enables them, and ends with `analyze`.
  - `tests/perf/helpers.ts`: `loadOnce(): Promise<Ids>` (runs the generator once per process; returns sample ids: an owner, a receptionist, a service, a room, a customer, "today"), `p95(run: () => Promise<unknown>, n = 30): Promise<number>` (milliseconds; 3 unmeasured warm-up runs first), `asUser(userId, fn)`.
  - `0020_performance.sql` — these indexes from the start: `payments (booking_id)`, `payments (received_at)`, `bookings (customer_id)`, `bookings (lower(service_during))`, `booking_events (booking_id)`, `audit_log (at)`, `notification_outbox (status, next_attempt_at)`, `room_turnovers (booking_id)` if not already unique-indexed, `therapist_time_off using gist (therapist_id, during)`, `room_blocks using gist (room_id, during)`; plus whatever Step 4 proves necessary. Each added index gets a one-line comment naming the budget it serves.
- Budgets (milliseconds, 95th percentile):

| Operation | Budget |
|---|---|
| `available_candidates` for today | 250 |
| `create_booking` + `set_booking_status` cancel (one round trip each) | 250 each |
| `booking_board` one day / one week | 150 / 500 |
| `room_status_board` | 250 |
| `pending_payments` | 300 |
| `stranded_bookings` | 300 |
| `booking_day_counts` one month | 300 |
| customer search by phone, and by name prefix | 150 |
| `customer_summary` | 150 |
| `report_summary`, `report_revenue` (month grain), `report_by_service`, `report_by_therapist` — one year | 2500 each |
| `report_room_utilization`, `report_therapist_utilization`, `report_peak_periods` — one month / one year | 2500 / 8000 |

- [ ] **Step 1: Write the generator and the failing test**

```ts
const budget = (name: string, ms: number, run: () => Promise<unknown>) =>
  test(`${name} ≤ ${ms} ms`, async () => { const got = await p95(run); results.push({ name, ms, got }); expect(got).toBeLessThanOrEqual(ms); });

test('the dataset is the size the budgets assume', async () => {
  const n = await asAdmin((c) => c.query(`select (select count(*) from rooms)::int rooms, (select count(*) from therapists)::int therapists, (select count(*) from bookings)::int bookings, (select count(*) from payments)::int payments, (select count(*) from customers)::int customers`));
  expect(n.rows[0]).toMatchObject({ rooms: 40, therapists: 60, customers: 5000 });
  expect(n.rows[0].bookings).toBeGreaterThan(25000); expect(n.rows[0].payments).toBeGreaterThan(20000);
});
budget('available_candidates', 250, () => asUser(ids.reception, (c) => c.query(`select * from available_candidates($1,$2)`, [ids.service, ids.todayAt('14:00')])));
budget('booking_board day', 150, () => asUser(ids.reception, (c) => c.query(`select * from booking_board($1,$2)`, ids.todayRange)));
// … one `budget(...)` line per row of the table above, each calling the function as the role that uses it …
afterAll(() => writeFileSync('.testdb/perf-results.json', JSON.stringify({ machine: `${os.cpus()[0].model} × ${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GB`, results }, null, 2)));
```

- [ ] **Step 2: Run** `npm run test:perf`. Expected: FAIL (`loadOnce` missing); once it exists, some budgets may fail — that is the point.
- [ ] **Step 3: Implement** the helpers and the starting indexes.
- [ ] **Step 4: For each missed budget**, read `explain (analyze, buffers)` for that call, fix the cause (an index in `0020_performance.sql`, or a rewrite of that function's query that leaves its results unchanged), and re-run. A function body change must keep `npm run test:db` green. If a budget cannot be met after a real attempt, do not raise it silently: leave the test failing-with-reason via `test.fails` and write the measured figure and the cause into `docs/security-report.md` under "Performance limits".
- [ ] **Step 5: Run** `npm run test:perf && npm run test:db`. Expected: pass (or documented `test.fails`). Keep `.testdb/perf-results.json` for Task 12.
- [ ] **Step 6: Commit** `perf(db): indexes and budgets proved on a year of data`.

---

### Task 7: The busy hour, and the screens at full size

**Files:**
- Create: `tests/perf/storm.test.ts`, `tests/e2e-prod/scale.spec.ts`, `scripts/load-local.mjs`
- Modify: `package.json` (`"test:scale": "node scripts/load-local.mjs && playwright test -c playwright.prod.config.ts scale"`)

**Interfaces:**
- Produces:
  - `scripts/load-local.mjs` — runs `npx supabase db reset`, then `tests/perf/loadgen.sql` against the local Supabase database, so the browser sees the year-sized dataset with the four seeded logins intact. It prints a reminder that `npx supabase db reset` restores the small seed afterwards. It refuses to run unless the database host is `127.0.0.1` or `localhost`.
- Screen budgets on the production build (navigation start to the named element visible):

| Screen | Element | Budget |
|---|---|---|
| `/th/today` | first status count | 3.0 s |
| `/th/rooms` | 40 room tiles | 3.0 s; a search keystroke re-filters within 0.5 s |
| `/th/calendar?view=rooms` | 40 columns | 4.0 s |
| `/th/calendar?span=week` | 7 day columns | 4.0 s |
| `/th/customers` | first 50 rows | 3.0 s |
| `/th/reports`, last 12 months | headline figures | 8.0 s |

- [ ] **Step 1: Write the failing storm test** (`tests/perf/storm.test.ts`, 20 pooled connections)

```ts
test('200 desks booking different slots all succeed; 50 fighting for one slot yield one winner; nothing deadlocks', async () => {
  const day = ids.futureDay;                                       // a generated day 20 days ahead, all 19:45 slots free
  const spread = Array.from({ length: 200 }, (_, i) => bookAs(ids.reception, { room: i % 40, therapist: i % 40, start: at(day, '19:45'), dayOffset: Math.floor(i / 40) }));
  const fight = Array.from({ length: 50 }, () => bookAs(ids.reception, { room: 0, therapist: 0, start: at(day, '19:45'), dayOffset: 6 }));
  const t0 = Date.now();
  const [a, z] = await Promise.all([Promise.allSettled(spread), Promise.allSettled(fight)]);
  expect(a.filter((r) => r.status === 'fulfilled')).toHaveLength(200);
  expect(z.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const errors = [...a, ...z].filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason);
  expect(errors.filter((e) => e.code === '40P01' || e.code === '40001')).toEqual([]);
  expect(errors.every((e) => ['THERAPIST_BUSY', 'POSITION_TAKEN'].includes(e.message))).toBe(true);
  expect(Date.now() - t0).toBeLessThan(20000);
});
```

  `bookAs` and `at` are local helpers; `dayOffset` adds days to `day`. The generator leaves every 19:45 slot free and inside the 10:00–22:00 shifts (use a service of 120 minutes or less).

- [ ] **Step 2: Write the failing screen tests** (`tests/e2e-prod/scale.spec.ts`)

```ts
const timed = async (page: Page, url: string, ready: Locator, budgetMs: number) => {
  const t0 = Date.now(); await page.goto(url); await expect(ready).toBeVisible({ timeout: budgetMs }); return Date.now() - t0;
};
test('today, rooms, calendar, customers and reports open within budget at full size', async ({ page }) => {
  await signIn(page, 'owner@spa.test');
  const got = {
    today: await timed(page, '/th/today', page.getByTestId('count-available'), 3000),
    rooms: await timed(page, '/th/rooms', page.getByTestId('room-tile').nth(39), 3000),
    calendarRooms: await timed(page, '/th/calendar?view=rooms', page.getByTestId('calendar-column').nth(39), 4000),
    week: await timed(page, '/th/calendar?span=week', page.getByTestId('week-day').nth(6), 4000),
    customers: await timed(page, '/th/customers', page.getByTestId('customer-row').nth(49), 3000),
    reports: await timed(page, `/th/reports?from=${yearAgo()}&to=${todayStr()}&grain=month`, page.getByTestId('kpi-booked'), 8000),
  };
  writeFileSync('.testdb/scale-results.json', JSON.stringify(got, null, 2));
});
test('forty rooms stay usable: filter responds, columns scroll, the time axis stays in view', async ({ page }) => {
  await signIn(page, 'manager@spa.test'); await page.goto('/th/rooms');
  const t0 = Date.now(); await page.getByTestId('room-search').fill('R-01');
  await expect(page.getByTestId('room-tile')).toHaveCount(1); expect(Date.now() - t0).toBeLessThan(500);
  await page.goto('/th/calendar?view=rooms');
  await page.getByTestId('calendar-scroll').evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await expect(page.getByTestId('calendar-column').nth(39)).toBeInViewport();
  await expect(page.getByTestId('time-axis')).toBeInViewport();
});
test('the phone layout shows today at full size without horizontal page scroll', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await signIn(page, 'reception@spa.test');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
```

  The generator names rooms `R-01` … `R-40`. If the calendar has no element marked `time-axis`, add that `data-testid` to the existing sticky time column.

- [ ] **Step 3: Run** `npm run test:perf -- storm` and `npm run test:scale`. Expected: FAIL first (missing helpers), then real results.
- [ ] **Step 4: Fix what misses its budget** — for a screen: remove a repeated query, select fewer columns, or page a list; rendering changes must keep the Plan 1–3 browser tests green. Same honesty rule as Task 6 for any budget that cannot be met.
- [ ] **Step 5: Run** `npm run test:perf && npm run test:scale`, then `npx supabase db reset && npx playwright test`. Expected: pass; the small seed is restored and the normal suite is green.
- [ ] **Step 6: Commit** `perf: concurrency storm and full-size screen budgets`.

---

### Task 8: Retention maintenance

**Files:**
- Create: `supabase/migrations/0021_maintenance.sql`, `tests/db/maintenance.test.ts`, `src/app/api/internal/maintenance/route.ts`
- Modify: `tests/db/settings.test.ts` (key count 11 → 13), `src/modules/settings/{schema.ts,components/SettingsForm.tsx}`, `messages/{th,en}.json`, `tests/e2e/notifications.spec.ts` (one route test)

**Interfaces:**
- Produces:
  - Two settings keys: `retention.audit_months` (default 24, integer 12–120) and `retention.prune_enabled` (default **false**, boolean). Nothing is ever deleted until the owner turns the second one on.
  - `run_maintenance() returns jsonb` — executable by `service_role` only. When `retention.prune_enabled` is false it returns `{"enabled": false}` and deletes nothing. When true it deletes `audit_log` rows older than `retention.audit_months` months and `notification_outbox` rows with status `sent` older than 90 days, and returns `{"enabled": true, "audit_deleted": n, "outbox_deleted": n}`. It never touches bookings, payments, customers or `booking_events`.
  - `POST /api/internal/maintenance` — same bearer rule as dispatch (`bearerMatches`); returns the function's result and logs `maintenance.run` with the counts.
  - The settings screen shows both keys under Data retention, with a sentence stating exactly what is deleted and that it cannot be undone.

- [ ] **Step 1: Write the failing tests**

```ts
const old = () => asAdmin((c) => c.query(`
  insert into audit_log(at, table_name, action) values (now() - interval '30 months', 'rooms', 'UPDATE'), (now() - interval '2 months', 'rooms', 'UPDATE');
  update notification_outbox set status='sent', sent_at = now() - interval '100 days', created_at = now() - interval '100 days'`));
const counts = () => asAdmin((c) => c.query(`select (select count(*)::int from audit_log where table_name='rooms' and action='UPDATE') audit, (select count(*)::int from notification_outbox) outbox, (select count(*)::int from bookings) bookings`)).then((r) => r.rows[0]);

test('nothing is deleted until the owner enables pruning', async () => {
  await asAdmin((c) => c.query(`update customers set comms_consent=true, phone='0810000000' where id=$1`, [b.c1]));
  await asRole(b, 'receptionist', (c) => book(c, b)); await old();
  const before = await counts();
  expect((await asService((c) => c.query(`select run_maintenance() r`))).rows[0].r).toEqual({ enabled: false });
  expect(await counts()).toEqual(before);
  await asRole(b, 'owner', (c) => c.query(`select set_setting('retention.prune_enabled','true')`));
  expect((await asService((c) => c.query(`select run_maintenance() r`))).rows[0].r).toMatchObject({ enabled: true, audit_deleted: 1, outbox_deleted: 1 });
  expect(await counts()).toEqual({ audit: before.audit - 1, outbox: 0, bookings: 1 });
});
test('only the scheduler role may run maintenance', async () => {
  await expect(asRole(b, 'owner', (c) => c.query(`select run_maintenance()`))).rejects.toMatchObject({ code: '42501' });
});
```

- [ ] **Step 2: Run** `npm run test:db -- maintenance settings`. Expected: FAIL.
- [ ] **Step 3: Implement.** The route test: without the secret `401`; with it `200` and `{ enabled: false }`.
- [ ] **Step 4: Run** `npm run test:db && npx vitest run src && npx playwright test settings notifications`. Expected: pass. `security-outsiders` still passes with the new function.
- [ ] **Step 5: Commit** `feat(db): owner-controlled retention maintenance`.

---

### Task 9: Backup and a restore that is actually tried

**Files:**
- Create: `scripts/backup.mjs`, `scripts/restore-drill.mjs`, `docs/operations.md`
- Modify: `package.json` (`"backup": "node scripts/backup.mjs"`, `"test:restore": "node scripts/restore-drill.mjs"`), `.gitignore` (`backups/`)

**Interfaces:**
- Produces:
  - `scripts/backup.mjs [--linked]` — writes a timestamped set of files under `backups/<YYYYMMDD-HHmm>/` using the Supabase CLI's dump command: the roles, the schema, and the data for schemas `public` and `auth`. Default target is the local stack; `--linked` targets the linked cloud project and is documented for the owner, not run here. It prints the folder and the total size, and exits non-zero if any file is empty. Backups contain personal data: the script prints a one-line reminder to store them encrypted and off the machine.
  - `scripts/restore-drill.mjs` — local only (refuses any non-local database host). Steps: (1) reset the local database and create a known state through the public API — two staff-made bookings, one payment, one customer with consent; (2) record the row count of every `public` table and of `auth.users`; (3) run the backup; (4) wipe by resetting the local database **without** the seed; (5) restore the backup's data; (6) assert: every recorded row count matches; `owner@spa.test` can sign in with the seeded password; calling `create_booking` for the slot one of the restored bookings holds fails with `THERAPIST_BUSY`; the three exclusion constraints and RLS on `bookings` exist. Prints `RESTORE DRILL PASSED` with the elapsed seconds, or the first failed assertion, and exits accordingly.
  - `docs/operations.md` — written from what the drill actually did: how to back up (manual command, and what the hosting provider's own backups cover and do not cover — to be confirmed against the plan the owner chooses); how to restore, step by step, with the measured duration; **rollback**: application = redeploy the previous build; database = migrations only go forward, so a bad migration is corrected by a new migration, and data loss is recovered from backup; the dispatch and maintenance schedules; reading the logs by error reference; what to do when the live indicator shows offline, when messages go `dead`, when cash does not match; and the monthly checklist (restore drill, review of `dead` messages, review of the retention list).

- [ ] **Step 1: Write `scripts/restore-drill.mjs`** with its six assertions before `scripts/backup.mjs` exists.
- [ ] **Step 2: Run** `npm run test:restore`. Expected: FAIL at step 3 (no backup script).
- [ ] **Step 3: Implement `scripts/backup.mjs`.** Choose the dump and restore flags from `npx supabase db dump --help`; restore with whatever client the drill can rely on on this machine (the `pg` package, or `psql` inside the local database container via `docker exec`). Record the choice and why in `docs/operations.md`.
- [ ] **Step 4: Run** `npm run test:restore`. Expected: `RESTORE DRILL PASSED`. If the Supabase CLI cannot dump or restore `auth` data on this machine, say so in `docs/operations.md`, make the drill prove what it can, and list the gap under unresolved risks in Task 12 — do not weaken the assertion silently.
- [ ] **Step 5: Run** `npx supabase db reset && npx playwright test auth`. Expected: the local stack is back to its seeded state.
- [ ] **Step 6: Commit** `ops: backup script, restore drill and operations runbook`.

---

### Task 10: A whole day, accessibility and language completeness

**Files:**
- Create: `tests/e2e/journey.spec.ts`, `tests/e2e/a11y.spec.ts`, `src/i18n/messages.test.ts`
- Modify: components only as the accessibility test requires; `package.json` (`@axe-core/playwright`)

**Interfaces:**
- Produces: no new application interfaces. `journey.spec.ts` is one test per Playwright project (desktop and mobile) that walks the acceptance criteria in order with fresh data and no test-only shortcuts except sign-in:
  1. **Owner** creates a manager account; adds room `R7` in a new zone; adds a second position to it.
  2. **Manager** creates a service limited to one room category; gives a therapist a shift for today; tries to shrink a shift under a booking later in the test and is refused.
  3. **Receptionist** creates a customer and books them with a suggested therapist and room; books a walk-in for now; tries the same slot again and is refused.
  4. **Manager** reschedules the first booking to tomorrow; the calendar shows it once.
  5. **Receptionist** checks the walk-in in. **Therapist** (phone) starts and completes the treatment and marks the room ready; the room dashboard shows cleaning, then available, without a reload on the receptionist's screen.
  6. **Receptionist** takes part payment in cash and the rest by transfer. **Manager** verifies the transfer and closes the cash day.
  7. **Owner** opens reports for today: booked revenue and collected revenue both equal the walk-in's price, and the booking count is 1 (the rescheduled booking now belongs to tomorrow); exports the revenue CSV.
  8. **Owner** deactivates room `R7`: refused while tomorrow's booking is in it; after moving that booking, accepted; yesterday-style history (the completed walk-in, if it was in `R7`) still shows the room code.
  9. **Therapist** cannot open customers, payments, reports or settings; **receptionist** cannot open reports or settings.
- `a11y.spec.ts`: for `/th/login`, `/th/today`, `/th/rooms`, `/th/calendar`, `/th/customers`, `/th/payments`, `/th/reports`, `/th/admin/settings` (each as the least-privileged role that may open it), axe reports no `serious` or `critical` violation; and every action error is announced (`role="alert"`), every status confirmation is `role="status"`.
- `messages.test.ts`: `th.json` and `en.json` have exactly the same set of key paths, no empty strings, and identical `{placeholder}` names per key.

- [ ] **Step 1: Write the three test files.** In `journey.spec.ts`, write every numbered step as `await test.step('<n>. <who> <does what>', async () => { … })` so the report reads as the acceptance walkthrough.
- [ ] **Step 2: Run** `npx vitest run src/i18n` and `npx playwright test journey a11y`. Expected: the journey should pass on working software — if a step fails, that is a defect: fix the cause (superpowers:systematic-debugging) and note it for Task 12. Accessibility and message tests are expected to FAIL first.
- [ ] **Step 3: Fix** every serious or critical accessibility finding (labels, contrast against `--ivory`, focus order, names for icon-only buttons) and every missing translation.
- [ ] **Step 4: Run** `npx vitest run src && npx playwright test`, then `npx playwright test journey --repeat-each=5`. Expected: all pass; the journey passes 5 of 5 on both projects.
- [ ] **Step 5: Commit** `test: full-day journey, accessibility and message completeness`.

---

### Task 11: Continuous checks, setup guide and deployment runbook

**Files:**
- Create: `.github/workflows/ci.yml`, `docs/deployment.md`
- Modify: `README.md` (replace the generated text), `.env.example`

**Interfaces:**
- Produces:
  - `ci.yml` — on push and pull request, Node 22. Job `check`: `npm ci`, `npm run lint`, `npm run build`, `npx vitest run src`, `npm run test:db`, `npm audit --omit=dev --audit-level=high`. Job `browser`: `npx supabase start`, write `.env.local` from `npx supabase status -o env`, `npx playwright install --with-deps chromium`, `npx playwright test`; uploads the Playwright report on failure. Performance, scale and restore suites are not run in CI. The workflow runs only once the repository is pushed to GitHub, which is the owner's choice.
  - `README.md` — what the system is (one paragraph); requirements (Node 22, Docker Desktop); first run in six commands; the seeded logins and that they are local only; every `npm run` script with one line each; where the plans, architecture, operations and deployment documents are.
  - `docs/deployment.md` — the go-live runbook, each step marked **[owner decision]** where it costs money, creates something outside this machine, or cannot be undone:
    1. Choose hosting **[owner decision]**: a Supabase cloud project in the Singapore region and a Node host for the app (Vercel is the default assumption). State what must be checked on the providers' current pricing pages before choosing a plan: whether the plan pauses inactive projects, how many days of backups it keeps, whether point-in-time recovery is included, and how often scheduled jobs may run.
    2. Create the project; `npx supabase link`; `npx supabase db push` (migrations only — the seed is never applied to production).
    3. Auth settings to set in the dashboard: sign-up disabled, minimum password length 10, site URL, and (recommended) two-step sign-in for the owner.
    4. Environment variables, by name, with where each value comes from; `APP_ENV=production`; a freshly generated `CRON_SECRET` (32+ characters).
    5. `OWNER_PASSWORD=… node scripts/bootstrap-owner.mjs --email … --name …` against production, once.
    6. Schedules: `POST /api/internal/dispatch` every minute or as often as the host allows; `POST /api/internal/maintenance` daily. Give both options: the host's scheduler, or database scheduling that calls the endpoint.
    7. Smoke test after deploy: `/api/health`; sign in; create and cancel one booking; confirm the security headers; confirm the live indicator.
    8. First backup and a restore drill against a scratch project **[owner decision]**.
    9. Rollback: redeploy the previous build; database per `docs/operations.md`.
    10. Before real customer data: PDPA legal review; decide the message provider or leave messages off; set the cancellation policy and retention months; replace the header name "Spa Ops" and the sender name with the business name.

- [ ] **Step 1: Write the failing check** — a unit test `src/docs.test.ts`:

```ts
test('the setup guide names every npm script and every environment variable', () => {
  const readme = readFileSync('README.md', 'utf8'), dep = readFileSync('docs/deployment.md', 'utf8');
  for (const s of Object.keys(JSON.parse(readFileSync('package.json', 'utf8')).scripts)) expect(readme).toContain(`npm run ${s}`);
  for (const v of readFileSync('.env.example', 'utf8').match(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)!.map((l) => l.replace(/[#\s=]/g, ''))) expect(dep).toContain(v);
  expect(readme).not.toContain('create-next-app');
});
```

- [ ] **Step 2: Run** `npx vitest run src/docs.test.ts`. Expected: FAIL.
- [ ] **Step 3: Write** the three files; add `APP_ENV` and `E2E_DATABASE_URL` to `.env.example` with comments.
- [ ] **Step 4: Run** `npx vitest run src && npm run lint`, and validate the workflow file parses (`node -e "require('yaml')"` is not available by default — use `npx --yes yaml-lint .github/workflows/ci.yml` or an equivalent one-off check, and say which was used). Expected: pass.
- [ ] **Step 5: Commit** `docs: setup guide, deployment runbook and CI workflow`.

---

### Task 12: Final verification, acceptance evidence and the readiness report

**Files:**
- Create: `docs/acceptance.md`, `docs/security-report.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Produces:
  - `docs/acceptance.md` — a table with one row for **each of the 19 criteria in spec section 18**, in the spec's order and wording: the criterion; the tests that prove it (file and test name); and the result of the final run. Then the journey test's step list as the end-to-end walkthrough. A criterion with partial evidence says so.
  - `docs/security-report.md` — "Security and production-readiness report": scope and date; what was verified and how (catalog rules, outsider tests, permission matrices, headers, environment validation, card-data refusal, privacy tools, dependency audit result); performance results (the tables from `.testdb/perf-results.json` and `.testdb/scale-results.json`, with the machine); restore-drill result and duration; **unresolved risks and limitations**, each with its consequence and a suggested next step — at minimum: PDPA legal review outstanding; no real message provider; no payment-provider integration; no appointment reminders; no customer self-service portal; no audit-log viewer; staff sign in with a password only (two-step sign-in available but not enforced by the app); budgets measured on a developer machine, not on production hardware; hosting plan, backups and scheduler limits unconfirmed until the owner chooses; anything recorded as `test.fails` or as a gap in Tasks 6, 7 and 9; and any item the final review raises. Close with a plain statement of what "ready" means here: ready for the owner's go-live decision, not live.
  - `docs/architecture.md` — add the Plan 4 section (new migrations, routes, scripts) and the final verification run.

- [ ] **Step 1: Run everything, in this order, and keep the output:**

```
npm run lint
npm run build
npx vitest run src
npm run test:db
npm run test:perf
npx playwright test
npm run test:prod
npm run test:scale        # then: npx supabase db reset
npm run test:restore
npm audit --omit=dev --audit-level=high
git grep -nE "eyJ[A-Za-z0-9_-]{20,}\.|service_role.{0,20}[A-Za-z0-9]{30,}" -- . ':!package-lock.json'
```

  Expected: every command exits 0; the last prints nothing (no secret committed). `git status` shows no tracked `.env` file.

- [ ] **Step 2: Write `docs/acceptance.md` and `docs/security-report.md`** from that output. Paste real summary lines; do not round or improve them.
- [ ] **Step 3: Check the documents against the spec** — sections 15, 18 and 19: every listed item is either evidenced or listed as a limitation. Fix gaps in the documents; if a gap is a missing behaviour rather than missing words, stop and report it rather than papering over it.
- [ ] **Step 4: Commit** `docs: acceptance evidence and security and readiness report`.
- [ ] **Step 5: Stop.** Report to the owner: the readiness summary, the unresolved risks, and the decisions in `docs/deployment.md` that are theirs to make. Do not create a cloud project, deploy, or run anything against a non-local database.
