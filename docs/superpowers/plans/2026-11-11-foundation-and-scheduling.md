# Spa Ops — Plan 1 of 4: Foundation and Scheduling Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff member can sign in, configure rooms, services and therapist shifts, and create, move and cancel bookings that the database itself refuses to double-book.

**Architecture:** Modular monolith. Every hard scheduling rule lives in PostgreSQL (exclusion constraints, `security definer` RPCs, row-level security); the Next.js app is a thin, role-gated client of those RPCs. Room capacity is modelled as rows in `room_positions`, so adding a room or a bed is a data change, never a code or schema change.

**Tech Stack:** Next.js (App Router, TypeScript, version pinned to whatever `create-next-app@latest` installs), React, Tailwind CSS, next-intl, Supabase (PostgreSQL 16, Auth, Realtime), `@supabase/ssr`, Zod, Vitest + `pg` for database tests, Playwright for browser tests.

**Spec:** `docs/spec/master-prompt.md` (sections 4–7, 10, 13–15, and Phases 1–2 of section 16).

## Plan series

The spec covers several subsystems, so it is split into four plans. Each ends with working, tested software. Plans 2–4 are written after Plan 1 lands, against its real interfaces.

| Plan | Spec phases | Delivers |
|---|---|---|
| **1. Foundation and scheduling core** (this file) | 1–2 | Schema, auth, roles, rooms, services, therapists, booking engine, booking screens |
| 2. Daily operations | 3 | Room turnover and derived room status, Today dashboard, check-in flow, drag-and-drop, week/month calendar, realtime, notification outbox |
| 3. Business management | 4 | Customer records UI, payments and reconciliation, reports and CSV export, policy settings, PDPA retention and anonymisation |
| 4. Quality and deployment | 5 | Load test with dozens of rooms, security validation, full end-to-end suite, backup/rollback runbook, production configuration |

Deferred past the MVP: customer self-service portal (the `customer` role and its RLS exist from Plan 1; no customer screens), payroll and commission, payment-provider integrations.

## Global Constraints

- Greenfield and independent: "Use separate databases, authentication, credentials, branding, configuration, and deployment environments." Never read from or reference another business's system.
- "Never hardcode room names, room counts, or room identifiers into the application interface." The same applies to therapists and services.
- "Do not permanently delete rooms that have historical bookings." In this plan no role can `DELETE` rooms, positions, therapists, services or customers; they are deactivated.
- "Booking conflict prevention must be enforced through backend transactions and database-level safeguards, not only frontend checks."
- "Enforce permissions on the server and database. Hiding frontend buttons is not sufficient security."
- "Primary interface language: Thai. Prepare the application for English localization."
- "Use Thai baht (THB), 24-hour time, and the `Asia/Bangkok` timezone." Money is stored as integer satang; instants as `timestamptz`; all ranges are `[start, end)`.
- "Do not store card numbers or sensitive payment credentials."
- "Request explicit authorization before destructive database operations, production deployment, purchasing services, or irreversible changes." This plan uses only local databases; it creates no cloud project and deploys nothing.
- "Do not fabricate test results." If a tool is unavailable, stop and report it.
- Every RPC fails with one of these exact error messages (SQLSTATE `P0001`): `NOT_AUTHORIZED`, `THERAPIST_BUSY`, `POSITION_TAKEN`, `ROOM_OTHER_PARTY`, `THERAPIST_OFF_SHIFT`, `THERAPIST_TIME_OFF`, `THERAPIST_NOT_QUALIFIED`, `ROOM_BLOCKED`, `ROOM_INCOMPATIBLE`, `RESOURCE_INACTIVE`, `PAST_START`, `INVALID_TRANSITION`, `STALE_VERSION`, `CONFLICTS_WITH_BOOKINGS`.

## Review Focus

Conditions the spec implies but does not spell out. Each has a pinned test in the task named.

1. **Bookings and shifts that cross midnight** (late-opening spa): a 23:30–00:30 booking inside an 18:00–02:00 shift succeeds and appears on the board of the day it starts. → Task 7, Task 9.
2. **Back-to-back bookings:** a therapist may start at the minute the previous treatment ends; the room may not, until its turnover buffer passes. → Task 7.
3. **Double-tap or network retry on submit:** the same idempotency key returns the same booking and creates no second row. → Task 7.
4. **Two staff editing the same booking from stale screens:** the second save fails with `STALE_VERSION`; nothing is silently overwritten. → Task 8.
5. **Service duration or room buffer edited after bookings exist:** existing bookings keep their stored times and do not start conflicting. → Task 7.

## File Structure

```
spa-ops/
  docs/spec/master-prompt.md          the spec
  docs/architecture.md                stack, module map, ERD, acceptance evidence (grown per task)
  supabase/config.toml
  supabase/migrations/
    0001_identity.sql                 extensions, enums, staff, role helpers, audit log
    0002_catalog_rooms.sql            services, room categories, rooms, positions, blocks
    0003_therapists.sql               therapists, skills, shifts, time off
    0004_customers.sql                customers, private notes
    0005_bookings.sql                 bookings, booking_events, exclusion constraints
    0006_booking_create.sql           available_candidates, create_booking
    0007_booking_change.sql           move_booking, set_booking_status, resource-change guards
    0008_booking_board.sql            booking_board
  supabase/seed.sql                   demo data: 6 rooms, 4 therapists, 5 services
  scripts/testdb.sh                   builds the database the DB tests run against
  tests/db/shim.sql                   Supabase roles + auth schema for plain PostgreSQL
  tests/db/helpers.ts                 resetDb, asRole, asAdmin, book, bkk, expectCode
  tests/db/*.test.ts                  one file per migration
  tests/e2e/*.spec.ts                 Playwright
  src/lib/supabase/{server,browser,admin}.ts
  src/lib/{time,money,errors}.ts
  src/i18n/{routing,request}.ts
  messages/{th,en}.json
  src/modules/<module>/{schema.ts,actions.ts,components/}
      identity, catalog, rooms, therapists, customers, booking
  src/app/[locale]/login/page.tsx
  src/app/[locale]/(staff)/layout.tsx
  src/app/[locale]/(staff)/calendar/page.tsx
  src/app/[locale]/(staff)/admin/{rooms,services,therapists,staff}/page.tsx
```

RLS policies live in the migration that creates their table. Each `src/modules/<module>` owns its Zod schemas (`schema.ts`), its server actions (`actions.ts`) and its components; pages only compose them.

---

### Task 1: Project scaffold and database test harness

**Files:**
- Create: project via `create-next-app`, `vitest.config.ts`, `scripts/testdb.sh`, `tests/db/shim.sql`, `tests/db/helpers.ts`, `tests/db/harness.test.ts`, `docs/architecture.md`, `.env.example`

**Interfaces:**
- Produces (`tests/db/helpers.ts`), used by every later DB test:

```ts
export type Role = 'owner' | 'manager' | 'receptionist' | 'therapist';
export type Actor = Role | 'customer' | 'anon';
export type Base = {
  users: Record<Role | 'customer', string>;        // auth.users ids
  cat: { standard: string; couple: string };
  rooms: string[];                                   // R1..R6, category standard, turnover_min 15
  pos: string[];                                     // position '1' of R1..R6, same order
  couple: { room: string; pos: [string, string] };   // room C1, category couple
  svc60: string;                                     // 60 min, 150000 satang, allowed category: standard
  t1: string; t2: string;                            // both qualified for svc60, shift 10:00–22:00 on TEST_DAY
  c1: string; c2: string;                            // customers
};
export const TEST_DAY = '2030-01-15';
export function bkk(hhmm: string, day?: string): string;        // bkk('10:00') === '2030-01-15T10:00:00+07:00'
export function resetDb(): Promise<Base>;                        // truncate all business tables, reseed Base
export function asAdmin<T>(fn: (c: PoolClient) => Promise<T>): Promise<T>;           // superuser, committed
export function asRole<T>(b: Base, a: Actor, fn: (c: PoolClient) => Promise<T>): Promise<T>;
export function expectCode(p: Promise<unknown>, code: string): Promise<void>;        // rejects with message === code
```

`asRole` opens a transaction, runs `set local role authenticated` (or `anon`) and `select set_config('request.jwt.claims', '{"sub":"<user id>","role":"authenticated"}', true)`, runs `fn`, commits. `users.therapist` is linked to `t1`; `users.customer` is linked to `c1`. Every DB test file starts with `let b: Base; beforeEach(async () => { b = await resetDb(); });` and test files run serially (`fileParallelism: false`), because tests commit real rows. `resetDb` seeds through `asAdmin`; tables that do not exist yet are skipped, so the helper grows with each migration task.

- [ ] **Step 1: Scaffold.** `npx create-next-app@latest spa-ops --typescript --tailwind --app --src-dir --eslint`; add `@supabase/supabase-js @supabase/ssr next-intl zod`; dev: `vitest pg @types/pg @playwright/test supabase`. `git init`. Record the installed Next.js, React, Tailwind and Supabase CLI versions in `docs/architecture.md`.

- [ ] **Step 2: Write `scripts/testdb.sh`.** If `TEST_DATABASE_URL` is set, use it. Otherwise `initdb` a throwaway PostgreSQL 16 cluster under `.testdb/` on port 54329 and export `TEST_DATABASE_URL`. Then: apply `tests/db/shim.sql` only when schema `auth` is absent, then every file in `supabase/migrations/` in name order. `shim.sql` creates roles `anon`, `authenticated`, `service_role`, table `auth.users(id uuid primary key, email text)` and `auth.uid()` returning `(current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid`.

- [ ] **Step 3: Write the failing test** (`tests/db/harness.test.ts`)

```ts
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
```

- [ ] **Step 4: Run** `npm run test:db` (script: `bash scripts/testdb.sh && vitest run tests/db`). Expected: FAIL, `helpers` not found.
- [ ] **Step 5: Implement `tests/db/helpers.ts`** per the Interfaces block (only `asAdmin`, `bkk`, `expectCode` have bodies that can pass yet; `resetDb` truncates nothing so far).
- [ ] **Step 6: Run** `npm run test:db`. Expected: 2 passed.
- [ ] **Step 7: Check the full Supabase stack.** Run `npx supabase init && npx supabase start`. Record the result in `docs/architecture.md`. If Docker is unavailable, DB tests (Tasks 2–9) still run on the throwaway cluster, but Tasks 11–14 are blocked: report this to the human partner before starting Task 11.
- [ ] **Step 8: Commit** `chore: scaffold app and database test harness`.

---

### Task 2: Identity, roles and audit log

**Files:**
- Create: `supabase/migrations/0001_identity.sql`, `tests/db/identity.test.ts`
- Modify: `tests/db/helpers.ts` (seed `users` and `staff`)

**Interfaces:**
- Produces:
  - Extensions `btree_gist`, `pgcrypto`. Schema `private` (not exposed through the API).
  - Enums: `app_role ('owner','manager','receptionist','therapist')`.
  - `staff(user_id uuid pk → auth.users, role app_role not null, display_name text not null, active boolean not null default true, created_at timestamptz not null default now())`
  - `private.current_role() returns app_role` — `security definer`, `stable`; the caller's role if they are an active staff member, otherwise `null`.
  - `private.require_role(variadic allowed app_role[]) returns void` — raises `NOT_AUTHORIZED` unless `private.current_role() = any(allowed)`.
  - `audit_log(id bigint identity pk, at timestamptz default now(), actor uuid, table_name text, row_id uuid, action text, old jsonb, new jsonb)` and trigger function `private.audit()`; later migrations attach it with `after insert or update or delete ... for each row`.
  - RLS: `staff` — a member selects their own row; owner and manager select all; only owner inserts/updates. `audit_log` — owner and manager select; nobody inserts, updates or deletes directly.

- [ ] **Step 1: Write the failing tests**

```ts
test('current_role reflects the signed-in staff member', async () => {
  for (const r of ['owner','manager','receptionist','therapist'] as const) {
    const got = await asRole(b, r, (c) => c.query(`select private.current_role() as r`));
    expect(got.rows[0].r).toBe(r);
  }
});
test('deactivated staff lose their role', async () => {
  await asAdmin((c) => c.query(`update staff set active=false where user_id=$1`, [b.users.receptionist]));
  const got = await asRole(b, 'receptionist', (c) => c.query(`select private.current_role() as r`));
  expect(got.rows[0].r).toBeNull();
});
test('only the owner can change roles', async () => {
  const sql = `update staff set role='owner' where user_id=$1 returning user_id`;
  expect((await asRole(b, 'manager', (c) => c.query(sql, [b.users.manager]))).rowCount).toBe(0);
  expect((await asRole(b, 'owner', (c) => c.query(sql, [b.users.manager]))).rowCount).toBe(1);
});
test('staff changes are audited with the actor', async () => {
  await asRole(b, 'owner', (c) => c.query(`update staff set display_name='X' where user_id=$1`, [b.users.manager]));
  const a = await asAdmin((c) => c.query(`select actor, action from audit_log where table_name='staff' and row_id=$1 order by id desc limit 1`, [b.users.manager]));
  expect(a.rows[0]).toEqual({ actor: b.users.owner, action: 'UPDATE' });
});
test('receptionist cannot read the audit log', async () => {
  expect((await asRole(b, 'receptionist', (c) => c.query(`select 1 from audit_log`))).rowCount).toBe(0);
});
```

- [ ] **Step 2: Run** `npm run test:db -- identity`. Expected: FAIL, relation `staff` does not exist.
- [ ] **Step 3: Write `0001_identity.sql`** per Interfaces. `private.audit()` reads the row id from `id` or, for `staff`, `user_id`.
- [ ] **Step 4: Run** `npm run test:db -- identity`. Expected: 5 passed.
- [ ] **Step 5: Commit** `feat(db): staff roles and audit log`.

---

### Task 3: Service catalog and dynamic rooms

**Files:**
- Create: `supabase/migrations/0002_catalog_rooms.sql`, `tests/db/rooms.test.ts`
- Modify: `tests/db/helpers.ts` (seed `cat`, `rooms`, `pos`, `couple`, `svc60`)

**Interfaces:**
- Consumes: `private.current_role()`, `private.audit()`.
- Produces:
  - Enum `block_kind ('maintenance','cleaning','closed')`.
  - `room_categories(id uuid pk, name_th text not null, name_en text, sort_order int not null default 0)`
  - `services(id, name_th not null, name_en, duration_min int not null check (> 0), price_satang int not null check (>= 0), required_equipment text[] not null default '{}', active boolean not null default true, sort_order int not null default 0)`
  - `service_room_categories(service_id, room_category_id, primary key (service_id, room_category_id))` — **no rows for a service means any category is allowed.**
  - `rooms(id, code text not null unique, display_name text not null, category_id → room_categories not null, floor text, zone text, turnover_min int not null default 15 check (>= 0), equipment text[] not null default '{}', notes text, sort_order int not null default 0, active boolean not null default true)`
  - `room_positions(id, room_id → rooms not null, label text not null, active boolean not null default true, unique (room_id, label))` — a room's capacity is its count of active positions. An `after insert` trigger on `rooms` creates position `'1'`.
  - `room_blocks(id, room_id → rooms not null, during tstzrange not null check (not isempty(during)), kind block_kind not null, note text, created_by uuid default auth.uid())`
  - RLS on all six: any active staff member selects; owner and manager insert and update; **no delete policy for any role** except on `room_blocks` and `service_room_categories` (owner, manager).
  - A room is compatible with a service when its category is allowed and `rooms.equipment @> services.required_equipment`.

- [ ] **Step 1: Write the failing tests**

```ts
test('a seventh room needs no schema change and gets one position', async () => {
  const r = await asRole(b, 'manager', (c) => c.query(
    `insert into rooms(code, display_name, category_id) values ('R7','ห้อง 7',$1) returning id`, [b.cat.standard]));
  const p = await asAdmin((c) => c.query(`select label from room_positions where room_id=$1`, [r.rows[0].id]));
  expect(p.rows).toEqual([{ label: '1' }]);
});
test('rooms cannot be deleted by anyone signed in', async () => {
  for (const r of ['owner','manager'] as const)
    expect((await asRole(b, r, (c) => c.query(`delete from rooms where id=$1`, [b.rooms[0]]))).rowCount).toBe(0);
});
test('receptionist can read rooms but not edit them', async () => {
  expect((await asRole(b, 'receptionist', (c) => c.query(`select 1 from rooms`))).rowCount).toBe(7);
  expect((await asRole(b, 'receptionist', (c) => c.query(`update rooms set zone='A' returning id`))).rowCount).toBe(0);
});
test('room codes are unique', async () => {
  await expect(asRole(b, 'owner', (c) => c.query(
    `insert into rooms(code, display_name, category_id) values ('R1','dup',$1)`, [b.cat.standard]))).rejects.toMatchObject({ code: '23505' });
});
test('anonymous visitors see nothing', async () => {
  expect((await asRole(b, 'anon', (c) => c.query(`select 1 from rooms`))).rowCount).toBe(0);
});
```

- [ ] **Step 2: Run** `npm run test:db -- rooms`. Expected: FAIL, relation `rooms` does not exist.
- [ ] **Step 3: Write `0002_catalog_rooms.sql`** per Interfaces; attach `private.audit()` to all six tables.
- [ ] **Step 4: Run** `npm run test:db -- rooms`. Expected: 5 passed.
- [ ] **Step 5: Commit** `feat(db): service catalog and configurable rooms`.

---

### Task 4: Therapists, skills, shifts and time off

**Files:**
- Create: `supabase/migrations/0003_therapists.sql`, `tests/db/therapists.test.ts`
- Modify: `tests/db/helpers.ts` (seed `t1`, `t2`)

**Interfaces:**
- Produces:
  - Enum `time_off_kind ('break','leave','absence')`.
  - `therapists(id, staff_user_id uuid unique → staff, display_name text not null, employment_type text not null check (employment_type in ('employee','freelance')), active boolean not null default true, sort_order int not null default 0)`
  - `therapist_services(therapist_id, service_id, primary key (therapist_id, service_id))`
  - `therapist_shifts(id, therapist_id not null, during tstzrange not null check (not isempty(during)), constraint therapist_shifts_no_overlap exclude using gist (therapist_id with =, during with &&))` — concrete dated shifts, not recurring rules; a shift may cross midnight.
  - `therapist_time_off(id, therapist_id not null, during tstzrange not null check (not isempty(during)), kind time_off_kind not null, note text)`
  - RLS: any active staff member selects all four; owner and manager write; no delete on `therapists`.

- [ ] **Step 1: Write the failing tests**

```ts
test('a therapist cannot hold two overlapping shifts', async () => {
  await expect(asRole(b, 'manager', (c) => c.query(
    `insert into therapist_shifts(therapist_id, during) values ($1, tstzrange($2,$3))`,
    [b.t1, bkk('21:00'), bkk('23:00')]))).rejects.toMatchObject({ code: '23P01' });
});
test('a shift may cross midnight', async () => {
  const r = await asRole(b, 'manager', (c) => c.query(
    `insert into therapist_shifts(therapist_id, during) values ($1, tstzrange($2,$3)) returning id`,
    [b.t1, bkk('22:00'), bkk('02:00', '2030-01-16')]));
  expect(r.rowCount).toBe(1);
});
test('receptionist cannot edit shifts; therapist can read their own', async () => {
  expect((await asRole(b, 'receptionist', (c) => c.query(`delete from therapist_shifts returning id`))).rowCount).toBe(0);
  expect((await asRole(b, 'therapist', (c) => c.query(`select 1 from therapist_shifts where therapist_id=$1`, [b.t1]))).rowCount).toBe(1);
});
```

- [ ] **Step 2: Run** `npm run test:db -- therapists`. Expected: FAIL.
- [ ] **Step 3: Write `0003_therapists.sql`**; attach `private.audit()`.
- [ ] **Step 4: Run.** Expected: 3 passed.
- [ ] **Step 5: Commit** `feat(db): therapists, skills, shifts and time off`.

---

### Task 5: Customers with protected notes

**Files:**
- Create: `supabase/migrations/0004_customers.sql`, `tests/db/customers.test.ts`
- Modify: `tests/db/helpers.ts` (seed `c1`, `c2`)

**Interfaces:**
- Produces:
  - `customers(id, user_id uuid unique → auth.users, display_name text not null, full_name text, phone text, email text, preferred_therapist_id → therapists, comms_consent boolean not null default false, consent_recorded_at timestamptz, created_at timestamptz not null default now())`
  - `customer_private_notes(id, customer_id not null, body text not null, created_by uuid default auth.uid(), created_at timestamptz default now())`
  - RLS `customers`: owner, manager, receptionist select, insert, update; a customer selects the row where `user_id = auth.uid()`; **therapists get no access** (they see only the display name, through `booking_board` in Task 9); no delete.
  - RLS `customer_private_notes`: owner and manager only.

- [ ] **Step 1: Write the failing tests**

```ts
test('receptionist can create and find a customer', async () => {
  const r = await asRole(b, 'receptionist', (c) => c.query(
    `insert into customers(display_name, phone) values ('คุณเอ','0810000000') returning id`));
  expect(r.rowCount).toBe(1);
});
test('therapists cannot read the customer table', async () => {
  expect((await asRole(b, 'therapist', (c) => c.query(`select 1 from customers`))).rowCount).toBe(0);
});
test('private notes are hidden from receptionist and therapist', async () => {
  await asRole(b, 'manager', (c) => c.query(`insert into customer_private_notes(customer_id, body) values ($1,'n')`, [b.c1]));
  for (const r of ['receptionist','therapist'] as const)
    expect((await asRole(b, r, (c) => c.query(`select 1 from customer_private_notes`))).rowCount).toBe(0);
  expect((await asRole(b, 'owner', (c) => c.query(`select 1 from customer_private_notes`))).rowCount).toBe(1);
});
test('a customer sees only their own record', async () => {
  const r = await asRole(b, 'customer', (c) => c.query(`select id from customers`));
  expect(r.rows).toEqual([{ id: b.c1 }]);
});
```

- [ ] **Step 2: Run** `npm run test:db -- customers`. Expected: FAIL.
- [ ] **Step 3: Write `0004_customers.sql`**; attach `private.audit()` to both tables.
- [ ] **Step 4: Run.** Expected: 4 passed.
- [ ] **Step 5: Commit** `feat(db): customers and protected notes`.

---

### Task 6: Bookings table and database-level conflict constraints

**Files:**
- Create: `supabase/migrations/0005_bookings.sql`, `tests/db/booking-constraints.test.ts`

**Interfaces:**
- Produces:
  - Enums `booking_status ('requested','confirmed','checked_in','in_treatment','completed','cancelled','no_show')`, `booking_source ('advance','walk_in')`.
  - `bookings`:

```sql
create table bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers,
  service_id uuid not null references services,
  therapist_id uuid not null references therapists,
  position_id uuid not null references room_positions,
  room_id uuid not null references rooms,          -- trigger rejects a row whose room is not the position's room
  party_id uuid not null default gen_random_uuid(),-- bookings sharing a room at once must share a party
  service_during tstzrange not null,               -- therapist is busy
  room_during tstzrange not null,                  -- service time plus the room's turnover buffer
  status booking_status not null default 'confirmed',
  source booking_source not null,
  price_satang int not null check (price_satang >= 0),
  discount_satang int not null default 0 check (discount_satang between 0 and price_satang),
  note text,
  idempotency_key text not null unique,
  version int not null default 1,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not isempty(service_during) and room_during @> service_during),
  constraint bookings_therapist_no_overlap exclude using gist
    (therapist_id with =, service_during with &&) where (status not in ('cancelled','no_show')),
  constraint bookings_position_no_overlap exclude using gist
    (position_id with =, room_during with &&) where (status not in ('cancelled','no_show')),
  constraint bookings_room_single_party exclude using gist
    (room_id with =, party_id with <>, room_during with &&) where (status not in ('cancelled','no_show'))
);
```

  - `booking_events(id bigint identity pk, booking_id not null, at timestamptz default now(), actor uuid default auth.uid(), kind text not null check (kind in ('created','status_changed','rescheduled','reassigned')), before jsonb, after jsonb)` — a reschedule edits the booking in place and adds an event, so reports never count it twice.
  - RLS `bookings`: owner, manager, receptionist select all; a therapist selects rows whose `therapist_id` is their own; a customer selects rows whose customer is theirs. **No insert, update or delete policy for any role** — all writes go through the RPCs in Tasks 7–8. `booking_events`: owner, manager, receptionist select.

- [ ] **Step 1: Write the failing tests.** All inserts run through `asAdmin` with a local helper `raw(c, {therapist, position, room, party?, from, to, roomTo, status?})` so the constraints are proven without any RPC.

```ts
test('therapist overlap is rejected by the database', async () => {
  await asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[0], room: b.rooms[0], from: '10:00', to: '11:00', roomTo: '11:15' }));
  await expect(asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[1], room: b.rooms[1], from: '10:30', to: '11:30', roomTo: '11:45' })))
    .rejects.toMatchObject({ code: '23P01', constraint: 'bookings_therapist_no_overlap' });
});
test('position overlap includes the turnover buffer', async () => {
  await asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[0], room: b.rooms[0], from: '10:00', to: '11:00', roomTo: '11:15' }));
  await expect(asAdmin((c) => raw(c, { therapist: b.t2, position: b.pos[0], room: b.rooms[0], from: '11:00', to: '12:00', roomTo: '12:15' })))
    .rejects.toMatchObject({ constraint: 'bookings_position_no_overlap' });
});
test('a two-position room takes one party, not two strangers', async () => {
  const party = randomUUID();
  await asAdmin((c) => raw(c, { therapist: b.t1, position: b.couple.pos[0], room: b.couple.room, party, from: '10:00', to: '11:00', roomTo: '11:15' }));
  await expect(asAdmin((c) => raw(c, { therapist: b.t2, position: b.couple.pos[1], room: b.couple.room, from: '10:00', to: '11:00', roomTo: '11:15' })))
    .rejects.toMatchObject({ constraint: 'bookings_room_single_party' });
  await asAdmin((c) => raw(c, { therapist: b.t2, position: b.couple.pos[1], room: b.couple.room, party, from: '10:00', to: '11:00', roomTo: '11:15' }));
});
test('cancelled and no-show bookings free their slot', async () => {
  for (const status of ['cancelled', 'no_show'])
    await asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[0], room: b.rooms[0], from: '10:00', to: '11:00', roomTo: '11:15', status }));
  await asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[0], room: b.rooms[0], from: '10:00', to: '11:00', roomTo: '11:15' }));
});
test('room_id must match the position', async () => {
  await expect(asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[0], room: b.rooms[1], from: '10:00', to: '11:00', roomTo: '11:15' }))).rejects.toThrow();
});
test('no signed-in role can write bookings directly', async () => {
  await asAdmin((c) => raw(c, { therapist: b.t1, position: b.pos[0], room: b.rooms[0], from: '10:00', to: '11:00', roomTo: '11:15' }));
  expect((await asRole(b, 'owner', (c) => c.query(`update bookings set note='x' returning id`))).rowCount).toBe(0);
});
```

- [ ] **Step 2: Run** `npm run test:db -- booking-constraints`. Expected: FAIL.
- [ ] **Step 3: Write `0005_bookings.sql`**; add `create index on bookings using gist (service_during)`; attach `private.audit()`.
- [ ] **Step 4: Run.** Expected: 6 passed.
- [ ] **Step 5: Commit** `feat(db): bookings with exclusion constraints`.

---

### Task 7: Availability and `create_booking`

**Files:**
- Create: `supabase/migrations/0006_booking_create.sql`, `tests/db/booking-create.test.ts`
- Modify: `tests/db/helpers.ts` (add `book`)

**Interfaces:**
- Consumes: all tables above; `private.require_role`.
- Produces:

```sql
available_candidates(p_service_id uuid, p_start timestamptz, p_exclude_booking uuid default null)
  returns table (therapist_id uuid, position_id uuid, room_id uuid, therapist_minutes_today int, room_sort int)
create_booking(p_customer_id uuid, p_service_id uuid, p_therapist_id uuid, p_position_id uuid,
               p_start timestamptz, p_source booking_source, p_idempotency_key text,
               p_party_id uuid default null, p_note text default null) returns bookings
```

  Both are `security definer`, callable by owner, manager and receptionist only.
  - `available_candidates` returns every (active qualified therapist on shift, not on time off, not busy) × (active position in an active compatible room, not blocked, not taken, not held by another party) for `[p_start, p_start + duration)` and room range `[p_start, p_start + duration + turnover)`. `therapist_minutes_today` is the therapist's booked minutes (active statuses) on the Bangkok calendar day of `p_start`. `p_exclude_booking` ignores one booking, for moves.
  - `create_booking` order of work: require role → if `p_idempotency_key` exists, return that row → reject `PAST_START` when `p_start < now() - interval '5 minutes'` → take `pg_advisory_xact_lock(hashtextextended(id::text, 0))` on the therapist id and the room id, **lowest uuid first** → validate in this order, raising the first failure: `RESOURCE_INACTIVE`, `THERAPIST_NOT_QUALIFIED`, `ROOM_INCOMPATIBLE`, `THERAPIST_OFF_SHIFT` (no single shift contains the service range), `THERAPIST_TIME_OFF`, `ROOM_BLOCKED` → insert with `status 'confirmed'`, price copied from the service → on `23P01` re-raise by constraint name as `THERAPIST_BUSY`, `POSITION_TAKEN` or `ROOM_OTHER_PARTY` → insert a `booking_events` row of kind `created`.
  - `tests/db/helpers.ts`: `book(c, b, over?: Partial<{ customer, service, therapist, position, start, source, key, party }>): Promise<BookingRow>` — defaults `c1, svc60, t1, pos[0], bkk('10:00'), 'advance', randomUUID(), null`.

- [ ] **Step 1: Write the failing tests** (each runs as `receptionist` unless stated)

```ts
test('creates a confirmed booking with service and room ranges', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  expect(k.status).toBe('confirmed');
  expect(k.price_satang).toBe(150000);
  expect(k.service_during).toBe(`["2030-01-15 03:00:00+00","2030-01-15 04:00:00+00")`);
  expect(k.room_during).toBe(`["2030-01-15 03:00:00+00","2030-01-15 04:15:00+00")`);
});
test('back to back: the therapist may continue at once, the room may not', async () => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('11:00'), position: b.pos[1], customer: b.c2 }));           // same therapist, other room
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('12:00'), therapist: b.t2, position: b.pos[1] })), 'POSITION_TAKEN'); // 12:00 < 12:15
  await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('12:15'), therapist: b.t2, position: b.pos[1] }));
});
test.each([
  ['THERAPIST_BUSY',          (b) => ({ position: b.pos[1], start: bkk('10:30') })],
  ['THERAPIST_OFF_SHIFT',     () => ({ start: bkk('21:30') })],
  ['ROOM_INCOMPATIBLE',       (b) => ({ position: b.couple.pos[0], start: bkk('15:00') })],
])('%s', async (code, over) => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { customer: b.c2, ...over(b) })), code);
});
test('THERAPIST_TIME_OFF, ROOM_BLOCKED, THERAPIST_NOT_QUALIFIED, RESOURCE_INACTIVE', async () => {
  await asAdmin((c) => c.query(`insert into therapist_time_off(therapist_id, during, kind) values ($1, tstzrange($2,$3), 'break')`, [b.t1, bkk('13:00'), bkk('14:00')]));
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('12:30') })), 'THERAPIST_TIME_OFF');
  await asAdmin((c) => c.query(`insert into room_blocks(room_id, during, kind) values ($1, tstzrange($2,$3), 'maintenance')`, [b.rooms[2], bkk('15:00'), bkk('17:00')]));
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('16:00'), position: b.pos[2] })), 'ROOM_BLOCKED');
  await asAdmin((c) => c.query(`delete from therapist_services where therapist_id=$1`, [b.t2]));
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2 })), 'THERAPIST_NOT_QUALIFIED');
  await asAdmin((c) => c.query(`update rooms set active=false where id=$1`, [b.rooms[3]]));
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { position: b.pos[3] })), 'RESOURCE_INACTIVE');
});
test('therapists cannot create bookings', async () => {
  await expectCode(asRole(b, 'therapist', (c) => book(c, b)), 'NOT_AUTHORIZED');
});
test('the same idempotency key returns the same booking', async () => {
  const key = randomUUID();
  const a = await asRole(b, 'receptionist', (c) => book(c, b, { key }));
  const again = await asRole(b, 'receptionist', (c) => book(c, b, { key }));
  expect(again.id).toBe(a.id);
  expect((await asAdmin((c) => c.query(`select 1 from bookings`))).rowCount).toBe(1);
});
test('a booking may cross midnight inside a late shift', async () => {
  await asAdmin((c) => c.query(`update therapist_shifts set during = tstzrange($2,$3) where therapist_id=$1`, [b.t1, bkk('18:00'), bkk('02:00','2030-01-16')]));
  const k = await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('23:30') }));
  expect(k.status).toBe('confirmed');
});
test('editing duration or buffer later leaves existing bookings untouched', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asAdmin((c) => c.query(`update services set duration_min=90; update rooms set turnover_min=30`));
  const after = await asAdmin((c) => c.query(`select service_during, room_during from bookings where id=$1`, [k.id]));
  expect(after.rows[0]).toEqual({ service_during: k.service_during, room_during: k.room_during });
});
test('candidates follow the configured rooms with no code change', async () => {
  const n = (c) => c.query(`select count(*)::int n from available_candidates($1,$2)`, [b.svc60, bkk('10:00')]).then((r) => r.rows[0].n);
  expect(await asRole(b, 'receptionist', n)).toBe(12);                       // 2 therapists × 6 standard positions
  await asRole(b, 'manager', (c) => c.query(`insert into rooms(code, display_name, category_id) values ('R7','ห้อง 7',$1)`, [b.cat.standard]));
  expect(await asRole(b, 'receptionist', n)).toBe(14);
  await asRole(b, 'receptionist', (c) => book(c, b));                        // t1 in R1 at 10:00
  const at1030 = await asRole(b, 'receptionist', (c) => c.query(`select distinct therapist_id from available_candidates($1,$2)`, [b.svc60, bkk('10:30')]));
  expect(at1030.rows).toEqual([{ therapist_id: b.t2 }]);
});
```

- [ ] **Step 2: Run** `npm run test:db -- booking-create`. Expected: FAIL, function does not exist.
- [ ] **Step 3: Write `0006_booking_create.sql`** per Interfaces.
- [ ] **Step 4: Run.** Expected: all passed.
- [ ] **Step 5: Commit** `feat(db): availability search and create_booking`.

---

### Task 8: Moving, status changes, resource-change guards, concurrency

**Files:**
- Create: `supabase/migrations/0007_booking_change.sql`, `tests/db/booking-change.test.ts`, `tests/db/booking-concurrency.test.ts`

**Interfaces:**
- Produces:

```sql
move_booking(p_booking_id uuid, p_start timestamptz, p_therapist_id uuid, p_position_id uuid,
             p_expected_version int) returns bookings          -- owner, manager, receptionist
set_booking_status(p_booking_id uuid, p_to booking_status, p_expected_version int) returns bookings
```

  - `move_booking`: lock the row `for update`; `STALE_VERSION` if `version <> p_expected_version`; `INVALID_TRANSITION` unless status is `requested`, `confirmed` or `checked_in`; then the same locks and validations as `create_booking` using the **current** service duration and room buffer; update in place, `version + 1`, `updated_at = now()`; event kind `rescheduled` when the start changed, otherwise `reassigned`. The caller passes current values for anything unchanged.
  - `set_booking_status` allowed transitions: `requested → confirmed | cancelled`; `confirmed → checked_in | cancelled | no_show`; `checked_in → in_treatment | cancelled`; `in_treatment → completed`. Anything else: `INVALID_TRANSITION`, checked before the caller's role (after `STALE_VERSION`). Owner, manager, receptionist may make any allowed transition; a therapist may make only `checked_in → in_treatment` and `in_treatment → completed` on their own bookings. Bumps `version`; event kind `status_changed`.
  - Guard triggers, each taking the same advisory lock as bookings on the resource and raising `CONFLICTS_WITH_BOOKINGS` when an active booking that has not ended would be stranded: setting `active = false` on a room, position, therapist or service; inserting or widening a `room_blocks` row; inserting or widening `therapist_time_off`; shrinking or deleting a `therapist_shifts` row; deleting a `therapist_services` row. "Active" means status in `requested, confirmed, checked_in, in_treatment`.
  - Known limitation, resolved in Plan 2: a same-day absence must be handled by moving the affected bookings first; Plan 2 adds an affected-bookings queue.

- [ ] **Step 1: Write the failing tests** (`booking-change.test.ts`)

```ts
test('move updates in place and records a reschedule', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const m = await asRole(b, 'manager', (c) => c.query(`select * from move_booking($1,$2,$3,$4,$5)`, [k.id, bkk('14:00'), b.t2, b.pos[1], 1])).then((r) => r.rows[0]);
  expect([m.id, m.version, m.therapist_id]).toEqual([k.id, 2, b.t2]);
  const ev = await asAdmin((c) => c.query(`select kind from booking_events where booking_id=$1 order by id`, [k.id]));
  expect(ev.rows.map((r) => r.kind)).toEqual(['created', 'rescheduled']);
  expect((await asAdmin((c) => c.query(`select 1 from bookings`))).rowCount).toBe(1);
});
test('a booking can shift into time it already occupies', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [k.id, bkk('10:30'), b.t1, b.pos[0]]));
});
test('a conflicting move fails and changes nothing', async () => {
  const a = await asRole(b, 'receptionist', (c) => book(c, b));
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('14:00'), customer: b.c2 }));
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [z.id, bkk('10:30'), b.t1, b.pos[1]])), 'THERAPIST_BUSY');
  const still = await asAdmin((c) => c.query(`select service_during, version from bookings where id=$1`, [z.id]));
  expect(still.rows[0]).toEqual({ service_during: z.service_during, version: 1 });
  expect(a.version).toBe(1);
});
test('the second save from a stale screen is refused', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [k.id, bkk('12:00'), b.t1, b.pos[0]]));
  await expectCode(asRole(b, 'manager', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [k.id, bkk('16:00'), b.t1, b.pos[0]])), 'STALE_VERSION');
});
test('lifecycle transitions are validated', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'completed',1)`, [k.id])), 'INVALID_TRANSITION');
  await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'checked_in',1)`, [k.id]));
  await asRole(b, 'therapist', (c) => c.query(`select set_booking_status($1,'in_treatment',2)`, [k.id]));
  await asRole(b, 'therapist', (c) => c.query(`select set_booking_status($1,'completed',3)`, [k.id]));
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select set_booking_status($1,'cancelled',4)`, [k.id])), 'INVALID_TRANSITION');
});
test('cancelling frees the slot', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'cancelled',1)`, [k.id]));
  await asRole(b, 'receptionist', (c) => book(c, b, { customer: b.c2 }));
});
test.each([
  ['deactivate room',     (b) => [`update rooms set active=false where id=$1`, [b.rooms[0]]]],
  ['deactivate position', (b) => [`update room_positions set active=false where id=$1`, [b.pos[0]]]],
  ['deactivate therapist',(b) => [`update therapists set active=false where id=$1`, [b.t1]]],
  ['block room',          (b) => [`insert into room_blocks(room_id, during, kind) values ($1, tstzrange('${bkk('09:00')}','${bkk('12:00')}'), 'maintenance')`, [b.rooms[0]]]],
  ['time off',            (b) => [`insert into therapist_time_off(therapist_id, during, kind) values ($1, tstzrange('${bkk('10:30')}','${bkk('11:30')}'), 'leave')`, [b.t1]]],
  ['shrink shift',        (b) => [`update therapist_shifts set during = tstzrange('${bkk('12:00')}','${bkk('22:00')}') where therapist_id=$1`, [b.t1]]],
])('%s is refused while a booking depends on it', async (_n, q) => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  const [sql, args] = q(b);
  await expectCode(asRole(b, 'manager', (c) => c.query(sql, args)), 'CONFLICTS_WITH_BOOKINGS');
});
test('a room with only past or cancelled bookings can be deactivated and keeps its history', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'cancelled',1)`, [k.id]));
  await asRole(b, 'manager', (c) => c.query(`update rooms set active=false where id=$1`, [b.rooms[0]]));
  const h = await asAdmin((c) => c.query(`select r.code from bookings k join rooms r on r.id=k.room_id where k.id=$1`, [k.id]));
  expect(h.rows[0].code).toBe('R1');
});
test('adding a position raises capacity; it cannot drop below a live booking', async () => {
  await asRole(b, 'manager', (c) => c.query(`insert into room_positions(room_id, label) values ($1,'2')`, [b.rooms[0]]));
  const party = randomUUID();
  await asRole(b, 'receptionist', (c) => book(c, b, { party }));
  const p2 = await asAdmin((c) => c.query(`select id from room_positions where room_id=$1 and label='2'`, [b.rooms[0]]));
  await asRole(b, 'receptionist', (c) => book(c, b, { party, therapist: b.t2, position: p2.rows[0].id, customer: b.c2 }));
  await expectCode(asRole(b, 'manager', (c) => c.query(`update room_positions set active=false where id=$1`, [p2.rows[0].id])), 'CONFLICTS_WITH_BOOKINGS');
});
```

- [ ] **Step 2: Write the failing concurrency tests** (`booking-concurrency.test.ts`). Each attempt uses its own pooled connection and `Promise.allSettled`.

```ts
test('20 simultaneous attempts on one slot yield exactly one booking', async () => {
  const res = await Promise.allSettled(Array.from({ length: 20 }, () => asRole(b, 'receptionist', (c) => book(c, b))));
  expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  for (const r of res.filter((r) => r.status === 'rejected'))
    expect(['THERAPIST_BUSY', 'POSITION_TAKEN']).toContain((r as PromiseRejectedResult).reason.message);
  expect((await asAdmin((c) => c.query(`select 1 from bookings`))).rowCount).toBe(1);
});
test('one therapist raced into six rooms gets one booking', async () => {
  const res = await Promise.allSettled(b.pos.map((p) => asRole(b, 'receptionist', (c) => book(c, b, { position: p }))));
  expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});
test('a booking raced against a room block never leaves both', async () => {
  const block = asRole(b, 'manager', (c) => c.query(`insert into room_blocks(room_id, during, kind) values ($1, tstzrange($2,$3), 'maintenance')`, [b.rooms[0], bkk('09:00'), bkk('12:00')]));
  const res = await Promise.allSettled([block, asRole(b, 'receptionist', (c) => book(c, b))]);
  expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
});
```

- [ ] **Step 3: Run** `npm run test:db -- booking-change booking-concurrency`. Expected: FAIL, functions do not exist.
- [ ] **Step 4: Write `0007_booking_change.sql`** per Interfaces. Factor the lock-and-validate block shared with `create_booking` into `private.check_slot(p_service_id, p_therapist_id, p_position_id, p_start, p_exclude_booking)` and call it from both.
- [ ] **Step 5: Run** the two files, then the concurrency file ten times in a row (`for i in $(seq 10); do npx vitest run tests/db/booking-concurrency.test.ts || break; done`). Expected: all passed on every run, no deadlock errors (`40P01`).
- [ ] **Step 6: Commit** `feat(db): move, lifecycle, resource guards and concurrency proof`.

---

### Task 9: Privacy-safe booking board and permission matrix

**Files:**
- Create: `supabase/migrations/0008_booking_board.sql`, `tests/db/board.test.ts`, `tests/db/permissions.test.ts`

**Interfaces:**
- Produces:

```sql
booking_board(p_from timestamptz, p_to timestamptz) returns table (
  booking_id uuid, version int, status booking_status, source booking_source,
  starts_at timestamptz, ends_at timestamptz, room_free_at timestamptz,
  therapist_id uuid, room_id uuid, position_id uuid, party_id uuid,
  service_id uuid, customer_id uuid, customer_display_name text)
```

  `security definer`. Returns bookings whose `service_during` overlaps `[p_from, p_to)`. Owner, manager, receptionist get all rows; a therapist gets only their own rows and `customer_id` is `null` for them; anyone else gets `NOT_AUTHORIZED`. It never returns phone, email, full name or notes. This is the only source the calendar and shared displays read.

- [ ] **Step 1: Write the failing tests**

```ts
test('the board shows display names only, and therapists only their own rows', async () => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, position: b.pos[1], customer: b.c2 }));
  const q = (c) => c.query(`select * from booking_board($1,$2)`, [bkk('00:00'), bkk('00:00', '2030-01-16')]);
  const all = await asRole(b, 'receptionist', q);
  expect(all.rowCount).toBe(2);
  expect(Object.keys(all.rows[0])).not.toEqual(expect.arrayContaining(['phone', 'email', 'full_name', 'note']));
  const mine = await asRole(b, 'therapist', q);
  expect(mine.rows.map((r) => [r.therapist_id, r.customer_id])).toEqual([[b.t1, null]]);
});
test('a booking crossing midnight appears on the day it starts and the next', async () => {
  await asAdmin((c) => c.query(`update therapist_shifts set during = tstzrange($2,$3) where therapist_id=$1`, [b.t1, bkk('18:00'), bkk('02:00','2030-01-16')]));
  await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('23:30') }));
  for (const [from, to] of [[bkk('00:00'), bkk('00:00','2030-01-16')], [bkk('00:00','2030-01-16'), bkk('00:00','2030-01-17')]])
    expect((await asRole(b, 'manager', (c) => c.query(`select 1 from booking_board($1,$2)`, [from, to]))).rowCount).toBe(1);
});
```

  `permissions.test.ts` is one table-driven test. For every actor in `['owner','manager','receptionist','therapist','customer','anon']` and every statement below, assert the outcome (`rows > 0`, `rows = 0`, or an error code):

| Statement | owner | manager | receptionist | therapist | customer | anon |
|---|---|---|---|---|---|---|
| `select from rooms` | rows | rows | rows | rows | 0 | 0 |
| `update rooms set zone='x'` | rows | rows | 0 | 0 | 0 | 0 |
| `insert into therapist_shifts …` | ok | ok | `42501` | `42501` | `42501` | `42501` |
| `select from customers` | rows | rows | rows | 0 | 1 (own) | 0 |
| `select from customer_private_notes` | rows | rows | 0 | 0 | 0 | 0 |
| `select from bookings` | rows | rows | rows | own only | own only | 0 |
| `insert into bookings …` | `42501` | `42501` | `42501` | `42501` | `42501` | `42501` |
| `select create_booking(…)` | ok | ok | ok | `NOT_AUTHORIZED` | `NOT_AUTHORIZED` | `NOT_AUTHORIZED` |
| `select booking_board(…)` | rows | rows | rows | own only | `NOT_AUTHORIZED` | `NOT_AUTHORIZED` |
| `select from audit_log` | rows | rows | 0 | 0 | 0 | 0 |
| `update staff set role='owner'` | rows | 0 | 0 | 0 | 0 | 0 |

- [ ] **Step 2: Run** `npm run test:db -- board permissions`. Expected: FAIL.
- [ ] **Step 3: Write `0008_booking_board.sql`**; fix any policy the matrix shows to be wrong in the migration that owns that table.
- [ ] **Step 4: Run** `npm run test:db`. Expected: every DB test passes.
- [ ] **Step 5: Document.** Add to `docs/architecture.md`: the ERD (Mermaid), the three exclusion constraints and what each prevents, the lock order, the error-code list, and the permission matrix above.
- [ ] **Step 6: Commit** `feat(db): booking board and permission matrix`.

---

### Task 10: Allocation ranking

**Files:**
- Create: `src/modules/booking/allocation.ts`, `src/modules/booking/allocation.test.ts`

**Interfaces:**
- Produces:

```ts
export type Candidate = { therapistId: string; positionId: string; roomId: string; therapistMinutesToday: number; roomSort: number };
export function rankAllocations(candidates: Candidate[], prefs: { preferredTherapistId?: string }): Candidate[];
```

  Order: the preferred therapist first; then fewer `therapistMinutesToday`; then lower `roomSort`; then `therapistId`, then `positionId`, ascending, so the result is deterministic. Pure function; does not mutate its input. Hard constraints are already applied by `available_candidates`; this only orders.

- [ ] **Step 1: Write the failing test**

```ts
const c = (t: string, p: string, min: number, sort: number): Candidate => ({ therapistId: t, positionId: p, roomId: 'r' + p, therapistMinutesToday: min, roomSort: sort });
test('balances workload, then room order', () => {
  const out = rankAllocations([c('a','2',120,2), c('b','1',60,1), c('b','2',60,2), c('a','1',120,1)], {});
  expect(out.map((x) => x.therapistId + x.positionId)).toEqual(['b1','b2','a1','a2']);
});
test('a preferred therapist outranks workload', () => {
  const out = rankAllocations([c('b','1',0,1), c('a','1',300,1)], { preferredTherapistId: 'a' });
  expect(out[0].therapistId).toBe('a');
});
test('an unavailable preferred therapist changes nothing and empty stays empty', () => {
  expect(rankAllocations([c('b','1',0,1)], { preferredTherapistId: 'zz' })).toHaveLength(1);
  expect(rankAllocations([], {})).toEqual([]);
});
```

- [ ] **Step 2: Run** `npx vitest run src/modules/booking/allocation.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `rankAllocations`.**
- [ ] **Step 4: Run.** Expected: 3 passed.
- [ ] **Step 5: Commit** `feat(booking): allocation ranking`.

---

### Task 11: App shell — sign-in, role gate, Thai/English, design system

**Blocked unless** `npx supabase start` works (Task 1, Step 7).

**Files:**
- Create: `src/lib/supabase/{server,browser,admin}.ts`, `src/lib/{time,money,errors}.ts` + `*.test.ts`, `src/i18n/{routing,request}.ts`, `messages/{th,en}.json`, `src/app/[locale]/login/page.tsx`, `src/app/[locale]/(staff)/layout.tsx`, `src/app/[locale]/(staff)/forbidden.tsx`, the request-interception file (`src/middleware.ts`, or `src/proxy.ts` if the installed Next.js uses that name), `src/app/globals.css`, `supabase/seed.sql`, `playwright.config.ts`, `tests/e2e/auth.spec.ts`

**Interfaces:**
- Produces:
  - Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_KEY`, `SUPABASE_SERVICE_KEY` (server only; imported only by `src/lib/supabase/admin.ts`).
  - `getSession(): Promise<{ userId: string; role: Role } | null>` and `requireRole(...roles: Role[]): Promise<{ userId: string; role: Role }>` in `src/modules/identity/session.ts`; `requireRole` renders the forbidden page when the role is not listed. Every staff page and server action starts with it.
  - `formatTHB(satang: number): string` — `formatTHB(150000) === '฿1,500.00'`.
  - `formatTime(iso: string): string` — 24-hour Bangkok time, `formatTime('2030-01-15T03:00:00Z') === '10:00'`; `bangkokDayRange(day: string): { from: string; to: string }` — `bangkokDayRange('2030-01-15')` is `{ from: '2030-01-14T17:00:00.000Z', to: '2030-01-15T17:00:00.000Z' }`.
  - `errorMessageKey(code: string): string` — maps each code in Global Constraints to `errors.<CODE>`; unknown input maps to `errors.UNKNOWN`. Both message files define all 15 keys.
  - Locales `th` (default) and `en`, URL prefix `/th`, `/en`. No user-visible string is written outside `messages/`.
  - Design tokens as CSS variables in `globals.css`, exposed to Tailwind: `--ivory #F6F2EA`, `--stone #D9D2C5`, `--stone-dark #8F877A`, `--charcoal #23211E`, `--sage #7C8A72`, `--brass #A68A56`, `--clay #A9745B`. Type: `Noto Serif Thai` for headings, `IBM Plex Sans Thai` for interface text, tabular numerals for times and money. Status colours: available `--sage`, reserved `--brass`, occupied `--charcoal`, cleaning `--clay`, out of service `--stone-dark`; every status also carries a text label, never colour alone.
  - Seed logins (local only): `owner@spa.test`, `manager@spa.test`, `reception@spa.test`, `therapist@spa.test`, all password `local-dev-only`; 6 rooms, 4 therapists, 5 services, shifts for the next 14 days.

- [ ] **Step 1: Write the failing unit tests** for `formatTHB`, `formatTime`, `bangkokDayRange`, `errorMessageKey` with the exact values above, plus: every code in Global Constraints has a key in both `th.json` and `en.json`.
- [ ] **Step 2: Write the failing browser tests** (`tests/e2e/auth.spec.ts`)

```ts
test('signed-out visitors are sent to the Thai login page', async ({ page }) => {
  await page.goto('/th/calendar');
  await expect(page).toHaveURL(/\/th\/login/);
});
test('a receptionist cannot open room administration', async ({ page }) => {
  await signIn(page, 'reception@spa.test');
  await page.goto('/th/admin/rooms');
  await expect(page.getByTestId('forbidden')).toBeVisible();
});
test('the interface switches to English', async ({ page }) => {
  await signIn(page, 'owner@spa.test');
  await page.goto('/en/calendar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
```

- [ ] **Step 3: Run** `npx vitest run src/lib` and `npx playwright test auth`. Expected: FAIL.
- [ ] **Step 4: Implement** the files listed. Sign-in is Supabase email and password. Playwright projects: `desktop` (1440×900) and `mobile` (390×844).
- [ ] **Step 5: Run** both commands, then `npm run build` and `npm run lint`. Expected: all pass, on both Playwright projects.
- [ ] **Step 6: Commit** `feat(app): sign-in, role gate, localisation and design tokens`.

---

### Task 12: Administration — rooms, categories and services

**Files:**
- Create: `src/modules/rooms/{schema.ts,actions.ts,components/*}`, `src/modules/catalog/{schema.ts,actions.ts,components/*}`, `src/app/[locale]/(staff)/admin/rooms/page.tsx`, `src/app/[locale]/(staff)/admin/services/page.tsx`, `tests/e2e/admin-rooms.spec.ts`

**Interfaces:**
- Consumes: `requireRole`, `errorMessageKey`, tables from Task 3.
- Produces (server actions; all begin with `requireRole('owner','manager')`, validate input with the Zod schema of the same name, and return `{ ok: true, id: string } | { ok: false, code: string }`):
  - `saveRoom(input: RoomInput)`, `setRoomActive(id: string, active: boolean)`, `reorderRooms(ids: string[])`, `addPosition(roomId: string, label: string)`, `setPositionActive(id: string, active: boolean)`, `addRoomBlock(input: RoomBlockInput)`, `removeRoomBlock(id: string)`
  - `saveCategory(input: CategoryInput)`, `saveService(input: ServiceInput)` (includes allowed category ids and required equipment), `setServiceActive(id, active)`
  - `RoomInput = { id?: string; code: string; displayName: string; categoryId: string; floor?: string; zone?: string; turnoverMin: number; equipment: string[]; notes?: string }`
- The rooms page lists rooms grouped by zone, with search by code or name, a category filter, an active/inactive filter, and drag-to-reorder. There is no delete control anywhere; deactivation asks for confirmation.

- [ ] **Step 1: Write the failing browser tests**

```ts
test('an owner adds a seventh room and it is listed without a deploy', async ({ page }) => {
  await signIn(page, 'owner@spa.test');
  await page.goto('/th/admin/rooms');
  await expect(page.getByTestId('room-row')).toHaveCount(6);
  await addRoom(page, { code: 'R7', displayName: 'ห้อง 7' });
  await expect(page.getByTestId('room-row')).toHaveCount(7);
});
test('deactivating a room with a future booking shows the reason and changes nothing', async ({ page }) => {
  await seedBooking({ roomCode: 'R1' });
  await signIn(page, 'manager@spa.test');
  await page.goto('/th/admin/rooms');
  await deactivate(page, 'R1');
  await expect(page.getByRole('alert')).toContainText(th.errors.CONFLICTS_WITH_BOOKINGS);
  await expect(page.getByTestId('room-row').filter({ hasText: 'R1' })).toHaveAttribute('data-active', 'true');
});
test('a manager creates a service limited to one room category', async ({ page }) => { /* create, reload, assert it persists with its category */ });
```

- [ ] **Step 2: Run** `npx playwright test admin-rooms`. Expected: FAIL.
- [ ] **Step 3: Implement** actions, schemas, components and pages. Lists must render from query results only; search the source for literal room codes or counts before finishing (`grep -rnE "R[1-6]\b|=== ?6\b" src/` returns nothing).
- [ ] **Step 4: Run** `npx playwright test admin-rooms` on both projects. Expected: pass.
- [ ] **Step 5: Commit** `feat(admin): rooms, categories and services`.

---

### Task 13: Administration — staff accounts, therapists and shifts

**Files:**
- Create: `src/modules/identity/{schema.ts,actions.ts,components/*}`, `src/modules/therapists/{schema.ts,actions.ts,components/*}`, `src/app/[locale]/(staff)/admin/staff/page.tsx`, `src/app/[locale]/(staff)/admin/therapists/page.tsx`, `tests/e2e/admin-staff.spec.ts`

**Interfaces:**
- Produces:
  - `createStaff(input: { email: string; password: string; role: Role; displayName: string })` — `requireRole('owner')` first, then the service-key client creates the auth user and the `staff` row; if the second step fails the auth user is removed. `setStaffActive(userId, active)`, `setStaffRole(userId, role)` — owner only.
  - `saveTherapist(input: TherapistInput)` (profile, employment type, linked staff account, service ids), `setTherapistActive(id, active)`, `saveShift(input: { id?: string; therapistId: string; start: string; end: string })`, `deleteShift(id)`, `copyWeekShifts(fromMonday: string, toMonday: string)`, `saveTimeOff(input: { therapistId: string; start: string; end: string; kind: 'break'|'leave'|'absence'; note?: string })`, `deleteTimeOff(id)` — owner and manager.
  - The therapists page shows a week grid: one row per therapist, generated from the query, filterable by name and employment type, with shifts and time off drawn on it.

- [ ] **Step 1: Write the failing browser tests**

```ts
test('an owner creates a receptionist who can then sign in', async ({ page, browser }) => {
  await signIn(page, 'owner@spa.test');
  await createStaffMember(page, { email: 'new@spa.test', password: 'local-dev-only', role: 'receptionist', displayName: 'ใหม่' });
  const p2 = await (await browser.newContext()).newPage();
  await signIn(p2, 'new@spa.test');
  await expect(p2).toHaveURL(/\/th\/calendar/);
});
test('a manager cannot open staff accounts', async ({ page }) => {
  await signIn(page, 'manager@spa.test');
  await page.goto('/th/admin/staff');
  await expect(page.getByTestId('forbidden')).toBeVisible();
});
test('a manager adds a shift and it appears on the week grid', async ({ page }) => { /* add 12:00–20:00 tomorrow, assert a shift block for that therapist and day */ });
test('shrinking a shift under a booking shows CONFLICTS_WITH_BOOKINGS', async ({ page }) => { /* seedBooking, shrink, assert alert text and unchanged block */ });
```

- [ ] **Step 2: Run** `npx playwright test admin-staff`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add a unit test asserting `src/lib/supabase/admin.ts` is imported only from `src/modules/identity/actions.ts`.
- [ ] **Step 4: Run** on both projects. Expected: pass.
- [ ] **Step 5: Commit** `feat(admin): staff accounts, therapists and shifts`.

---

### Task 14: Booking screens — day calendar, create, move, cancel

**Files:**
- Create: `src/modules/booking/{schema.ts,actions.ts,components/*}`, `src/modules/customers/{schema.ts,actions.ts,components/CustomerPicker.tsx}`, `src/app/[locale]/(staff)/calendar/page.tsx`, `tests/e2e/booking.spec.ts`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: `booking_board`, `available_candidates`, `create_booking`, `move_booking`, `set_booking_status`, `rankAllocations`, `bangkokDayRange`.
- Produces (server actions; owner, manager, receptionist unless noted):
  - `getBoard(day: string): Promise<BoardRow[]>` — any staff role; therapists receive only their own rows from the database.
  - `suggestAllocations(input: { serviceId: string; start: string; customerId?: string }): Promise<Candidate[]>` — calls `available_candidates`, then `rankAllocations` with the customer's preferred therapist.
  - `createBooking(input: { customerId: string; serviceId: string; therapistId: string; positionId: string; start: string; source: 'advance'|'walk_in'; idempotencyKey: string; partyId?: string; note?: string })`
  - `moveBooking(input: { bookingId: string; start: string; therapistId: string; positionId: string; expectedVersion: number })`
  - `setBookingStatus(input: { bookingId: string; to: BookingStatus; expectedVersion: number })` — therapists may call it; the database enforces which transitions.
  - `searchCustomers(q: string)`, `createCustomer(input: { displayName: string; phone?: string })`
  - All return `{ ok: true, ... } | { ok: false, code: string }`; the form generates `idempotencyKey` once when it opens and reuses it on every retry.
- The calendar page is a day timeline with a toggle between **therapist columns** and **room columns**; columns come from the query, grouped by zone in room view, horizontally scrollable with a sticky time axis. Walk-in starts at the current time rounded up to 5 minutes. Cards show time, service, customer display name, therapist, room and status. Moving and cancelling ask for confirmation; a refused move shows the translated error and leaves the card where it was. Loading, empty and failure states are explicit.

- [ ] **Step 1: Write the failing browser tests**

```ts
test('a receptionist books a new customer with a suggested therapist and room', async ({ page }) => {
  await signIn(page, 'reception@spa.test');
  await page.goto('/th/calendar');
  await openNewBooking(page);
  await createCustomerInline(page, { displayName: 'คุณบี', phone: '0820000000' });
  await pickService(page, 0);
  await pickStart(page, tomorrowAt('14:00'));
  await expect(page.getByTestId('suggestion')).not.toHaveCount(0);
  await page.getByTestId('suggestion').first().click();
  await page.getByTestId('confirm-booking').click();
  await expect(page.getByTestId('booking-card').filter({ hasText: 'คุณบี' })).toBeVisible();
});
test('a taken slot is refused with a clear message', async ({ page }) => {
  const k = await seedBooking({ at: tomorrowAt('14:00') });
  await signIn(page, 'reception@spa.test');
  await bookManually(page, { therapist: k.therapistName, room: 'R2', at: tomorrowAt('14:30') });
  await expect(page.getByRole('alert')).toContainText(th.errors.THERAPIST_BUSY);
});
test('double-clicking confirm creates one booking', async ({ page }) => { /* dblclick confirm; assert exactly one new card */ });
test('a manager moves a booking; a refused move leaves it in place', async ({ page }) => { /* move to free slot → card at new time; move onto busy slot → alert + card unchanged */ });
test('cancelling asks for confirmation and frees the slot', async ({ page }) => { /* cancel, confirm, then book the same slot successfully */ });
test('a therapist sees only their own bookings and no create button', async ({ page }) => {
  await seedBooking({ therapistEmail: 'therapist@spa.test' }); await seedBooking({ otherTherapist: true });
  await signIn(page, 'therapist@spa.test'); await page.goto('/th/calendar');
  await expect(page.getByTestId('booking-card')).toHaveCount(1);
  await expect(page.getByTestId('new-booking')).toHaveCount(0);
});
test('a newly added room becomes a calendar column', async ({ page }) => { /* add R7 in admin, open room view, assert 7 columns */ });
```

- [ ] **Step 2: Run** `npx playwright test booking`. Expected: FAIL.
- [ ] **Step 3: Implement** actions, schemas, components and the page.
- [ ] **Step 4: Run everything:** `npm run test:db && npx vitest run src && npx playwright test && npm run build && npm run lint`. Expected: all pass on both Playwright projects. Paste the real summary lines into `docs/architecture.md`.
- [ ] **Step 5: Record acceptance evidence** in `docs/architecture.md`: a table mapping each spec section 18 criterion met by this plan to the test that proves it (owner creates accounts and rooms; six is not a limit; add rooms without code or schema change; deactivate without losing history; grouping, categories and compatibility; manager creates services and schedules; receptionist creates a booking; conflicting and simultaneous bookings rejected; reschedule without conflicts; permissions; desktop and mobile). List the criteria left to Plans 2–4 and the known limitation from Task 8.
- [ ] **Step 6: Commit** `feat(booking): day calendar, create, move and cancel`.
