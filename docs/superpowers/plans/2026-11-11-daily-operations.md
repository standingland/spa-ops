# Spa Ops — Plan 2 of 4: Daily Operations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reception, managers and therapists run a live day from one screen: arrivals, check-in, treatment, room cleaning and readiness, exceptions, and a calendar they can drag, all updating on every device without a reload.

**Architecture:** Room status is **derived** by the database from bookings, turnovers and blocks; it is never stored, so it cannot contradict a reservation. Physical reality is enforced at the moment a treatment starts (`set_booking_status`), not by rewriting the schedule. The Today screen is a pure function of four database read models, which makes it testable without a browser. Customer messages go through an outbox table with retries, so a failed provider never loses or blocks an operation.

**Tech Stack:** As built in Plan 1 — Next.js 16.4.6 (App Router, `src/proxy.ts`), React 19.3, Tailwind 4.3, next-intl 4, Supabase (PostgreSQL, Auth, Realtime), Zod 4, Vitest 5 + `pg`, Playwright 1.65. One new dependency: `@dnd-kit/core`. Read `AGENTS.md` first: this Next.js version differs from older ones; consult `node_modules/next/dist/docs/` before writing page or route code.

**Spec:** `docs/spec/master-prompt.md` — sections 7 (room status, scalable room dashboard), 8, 10, the notification parts of 3 and 15, and Phase 3 of section 16. Builds on `docs/superpowers/plans/2026-11-11-foundation-and-scheduling.md` and `docs/architecture.md`.

## Global Constraints

- Everything in Plan 1's Global Constraints still applies (no hardcoded rooms, therapists or services; no deletes; Thai first with English ready; THB, 24-hour time, `Asia/Bangkok`; permissions enforced in the database; no fabricated results; no cloud resources, purchases or deployments).
- "Avoid letting manually updated room statuses contradict confirmed appointment reservations." Room status has no writable column anywhere. The only manual levers are: mark ready, add or remove a block, report an issue.
- "Sensitive customer information must be protected on shared operational displays." Every screen in this plan reads customers only through `booking_board` and `room_status_board` (display name only; therapists see names only on their own bookings).
- "Never silently discard operational changes." Every refused action shows its translated error; every screen shows whether it is live.
- "Provide a safe recovery mechanism for failed external integrations." No real SMS, LINE or email provider is connected in this plan; connecting one costs money and needs the owner's approval.
- "Use discreet and neutral customer communications by default." Message text and payload never contain the service, the therapist, the room or the word for the business type.
- The clock that decides lateness, overruns and "today" is the **server's**. Client code never calls `new Date()` to make an operational decision.
- One new error code, same convention as Plan 1 (SQLSTATE `P0001`, message equals the code): `ROOM_NOT_READY`.
- Existing interfaces this plan consumes, exactly as built: `book`, `asRole`, `asAdmin`, `resetDb`, `bkk`, `expectCode`, `Base` (`tests/db/helpers.ts`); `signIn` (`tests/e2e/helpers.ts`); `admin`, `seedBooking`, `tomorrowAt`, `resetTestData` (`tests/e2e/db.ts`); `roleOrNull`, `requireRole` (`src/modules/identity/session.ts`); `fail`, `failFrom`, `done` (`src/lib/action.ts`); `getBoard`, `moveBooking`, `setBookingStatus`, `suggestAllocations`, `BoardRow` (`src/modules/booking/actions.ts`); `rankAllocations`; `bangkokDay`, `bangkokDayRange`, `bangkokInstant`, `addDays`, `mondayOf`, `formatTime` (`src/lib/time.ts`). Server actions return `{ ok: true, … } | { ok: false, code }`.
- Thresholds are constants for now (`OPS_DEFAULTS` in Task 5, SQL defaults in Task 3). Plan 3 moves them into an owner-editable settings table.

## Review Focus

1. **A couple finishes at different times:** the room stays occupied until the last partner's treatment is completed; only then does cleaning start. → Task 1.
2. **A treatment overruns into the next reservation:** the next customer cannot be started in that room (`ROOM_NOT_READY`), the overrun appears under "needs attention", and no booking is moved or cancelled automatically. → Task 1, Task 5.
3. **A screen left open across midnight, or a tablet with a wrong clock:** "today" follows server time in Bangkok, and a treatment that began before midnight is still listed as in progress. → Task 5.
4. **The live connection drops** (tablet sleeps, Wi-Fi blips): the screen says it is offline and catches up by polling; it never shows stale data as current. → Task 9.
5. **The message sender crashes after taking a message:** the message becomes claimable again after five minutes, is retried with back-off, and a sent message is never sent twice. → Task 4.

## File Structure

```
supabase/migrations/
  0009_turnover.sql          treatment timestamps, room_turnovers, start/complete rules, mark_room_ready
  0010_exceptions.sql        room_reports, record_absence, force_room_block, stranded_bookings
  0011_read_models.sql       room_status_board, booking_board (extended), booking_day_counts, realtime publication
  0012_notifications.sql     notification_outbox, enqueue trigger, claim/complete/retry
tests/db/                    ops-turnover, exceptions, room-status, notifications (.test.ts); helpers.ts extended
src/modules/operations/
  today.ts (+test)           pure: buildToday
  rooms.ts (+test)           pure: filterRooms, summarizeRooms
  schema.ts, actions.ts
  components/                TodayBoard, AttentionList, BookingActions, RoomBoard, ReassignDialog
src/modules/booking/
  drop.ts (+test)            pure: moveFromDrop
  month.ts (+test)           pure: monthGrid
  components/                BookingCalendar (modified), WeekView, MonthView
src/modules/notifications/
  templates.ts (+test), dispatch.ts (+test), outbox.ts, actions.ts, components/OutboxAdmin.tsx
src/lib/realtime.ts          useLiveRefresh
src/app/[locale]/(staff)/today/page.tsx
src/app/[locale]/(staff)/rooms/page.tsx
src/app/[locale]/(staff)/admin/notifications/page.tsx
src/app/api/internal/dispatch/route.ts
tests/e2e/                   today, rooms, exceptions, live, drag, calendar-span, notifications (.spec.ts)
```

---

### Task 1: Treatment timestamps, room turnover and start-of-treatment rules

**Files:**
- Create: `supabase/migrations/0009_turnover.sql`, `tests/db/ops-turnover.test.ts`
- Modify: `tests/db/helpers.ts`

**Interfaces:**
- Produces (database):
  - `bookings` gains `checked_in_at`, `started_at`, `completed_at` (`timestamptz`, nullable).
  - `room_turnovers(id uuid pk, room_id uuid not null → rooms, booking_id uuid not null unique → bookings, started_at timestamptz not null default now(), due_at timestamptz not null, ready_at timestamptz, ready_by uuid)` with `create unique index room_turnovers_one_open on room_turnovers (room_id) where ready_at is null`. RLS: any active staff member selects; no direct writes. Audited.
  - `set_booking_status` — same signature, replaced. Added behaviour, in this order after the existing version, transition and role checks:
    - `→ checked_in` sets `checked_in_at = now()`.
    - `→ in_treatment`: take the Plan 1 advisory locks on therapist and room (lowest uuid first). Raise `ROOM_NOT_READY` if the room has an open turnover, or an `in_treatment` booking of a **different** `party_id`. Raise `THERAPIST_BUSY` if the therapist has another `in_treatment` booking. Then set `started_at = now()`.
    - `→ completed`: set `completed_at = now()`. If `lower(service_during) < now() < upper(service_during)` (finished early), set `service_during` to end at `now()` and `room_during` to end at `least(upper(room_during), now() + the room's turnover_min)`. If no other booking in the room is `in_treatment`, insert a turnover with `due_at = now() + the room's turnover_min` (`on conflict do nothing`).
  - `mark_room_ready(p_room_id uuid) returns room_turnovers` — `security definer`; any active staff role (therapists included). Raises `INVALID_TRANSITION` when the room has no open turnover. Sets `ready_at = now()`, `ready_by = auth.uid()`; if `now()` is earlier than the booking's `upper(room_during)`, trims `room_during` to end at `greatest(upper(service_during), now())`. Does not change the booking's `version`.
  - `private.room_busy_now(p_room_id uuid, p_start timestamptz, p_exclude_booking uuid) returns boolean` — true when `p_start < now() + interval '5 minutes'` and the room has an open turnover or an `in_treatment` booking (other than `p_exclude_booking`) whose `upper(room_during) <= p_start`. `private.check_slot` raises `ROOM_NOT_READY` when it is true (checked after `ROOM_BLOCKED`); `available_candidates` excludes such rooms.
- Produces (`tests/db/helpers.ts`):

```ts
export const soon = (minutes: number): string => new Date(Date.now() + minutes * 60000).toISOString();
export function shiftNow(b: Base): Promise<void>;   // asAdmin: t1 and t2 each get a shift [now − 2h, now + 10h)
export function runTo(b: Base, bookingId: string, to: 'checked_in' | 'in_treatment' | 'completed'): Promise<BookingRow>;
                                                     // as receptionist, walks confirmed → … → to, reading the version each step
export function asService<T>(fn: (c: PoolClient) => Promise<T>): Promise<T>;   // set local role service_role, committed
```

- [ ] **Step 1: Write the failing tests**

```ts
const open = (room: string) => asAdmin((c) => c.query(`select * from room_turnovers where room_id=$1 and ready_at is null`, [room]));

test('each step stamps its time', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  expect((await runTo(b, k.id, 'checked_in')).checked_in_at).not.toBeNull();
  const s = await runTo(b, k.id, 'in_treatment');
  expect([s.started_at === null, s.completed_at]).toEqual([false, null]);
  expect((await runTo(b, k.id, 'completed')).completed_at).not.toBeNull();
});
test('completing opens one turnover; a therapist marks the room ready; a second tap is refused', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await runTo(b, k.id, 'completed');
  expect((await open(b.rooms[0])).rowCount).toBe(1);
  const t = await asRole(b, 'therapist', (c) => c.query(`select * from mark_room_ready($1)`, [b.rooms[0]]));
  expect(t.rows[0].ready_by).toBe(b.users.therapist);
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]])), 'INVALID_TRANSITION');
});
test('a shared room is cleaned only after the last partner finishes', async () => {
  await asAdmin((c) => c.query(`insert into room_positions(room_id, label) values ($1,'2')`, [b.rooms[0]]));
  const p2 = (await asAdmin((c) => c.query(`select id from room_positions where room_id=$1 and label='2'`, [b.rooms[0]]))).rows[0].id;
  const party = randomUUID();
  const a = await asRole(b, 'receptionist', (c) => book(c, b, { party }));
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { party, therapist: b.t2, position: p2, customer: b.c2 }));
  await runTo(b, a.id, 'in_treatment'); await runTo(b, z.id, 'in_treatment');
  await runTo(b, a.id, 'completed');
  expect((await open(b.rooms[0])).rowCount).toBe(0);
  await runTo(b, z.id, 'completed');
  expect((await open(b.rooms[0])).rowCount).toBe(1);
});
test('a treatment cannot start in a room that is being cleaned, or still occupied by someone else', async () => {
  const a = await asRole(b, 'receptionist', (c) => book(c, b));
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('12:15'), therapist: b.t2, customer: b.c2 }));
  await runTo(b, a.id, 'in_treatment'); await runTo(b, z.id, 'checked_in');
  const start = () => asRole(b, 'receptionist', async (c) => {
    const v = (await c.query(`select version from bookings where id=$1`, [z.id])).rows[0].version;
    return c.query(`select set_booking_status($1,'in_treatment',$2)`, [z.id, v]);
  });
  await expectCode(start(), 'ROOM_NOT_READY');                      // overrunning occupant
  await runTo(b, a.id, 'completed');
  await expectCode(start(), 'ROOM_NOT_READY');                      // cleaning
  await asRole(b, 'receptionist', (c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]]));
  await start();
  expect((await asAdmin((c) => c.query(`select status from bookings where id=$1`, [z.id]))).rows[0].status).toBe('in_treatment');
});
test('a therapist cannot run two treatments at once', async () => {
  const a = await asRole(b, 'receptionist', (c) => book(c, b));
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('11:00'), position: b.pos[1], customer: b.c2 }));
  await runTo(b, a.id, 'in_treatment');
  await expectCode(runTo(b, z.id, 'in_treatment'), 'THERAPIST_BUSY');
});
test('finishing early frees the therapist; the room is offered again only once marked ready', async () => {
  await shiftNow(b);
  const k = await asRole(b, 'receptionist', (c) => book(c, b, { start: soon(-4), source: 'walk_in' }));
  await runTo(b, k.id, 'completed');
  const r = await asAdmin((c) => c.query(`select upper(service_during) <= now() as freed, upper(room_during) <= now() + interval '15 minutes' as buf from bookings where id=$1`, [k.id]));
  expect(r.rows[0]).toEqual({ freed: true, buf: true });
  const rooms = (c: PoolClient) => c.query(`select distinct room_id from available_candidates($1,$2)`, [b.svc60, soon(1)]).then((x) => x.rows.map((y) => y.room_id));
  expect(await asRole(b, 'receptionist', rooms)).not.toContain(b.rooms[0]);
  await expectCode(asRole(b, 'receptionist', (c) => book(c, b, { start: soon(1), customer: b.c2, source: 'walk_in' })), 'ROOM_NOT_READY');
  await asRole(b, 'receptionist', (c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]]));
  expect(await asRole(b, 'receptionist', rooms)).toContain(b.rooms[0]);
  await asRole(b, 'receptionist', (c) => book(c, b, { start: soon(1), customer: b.c2, source: 'walk_in' }));
});
```

- [ ] **Step 2: Run** `npm run test:db -- ops-turnover`. Expected: FAIL (`runTo` / `room_turnovers` missing).
- [ ] **Step 3: Write `0009_turnover.sql`** and the four helpers. Replace `private.check_slot`, `available_candidates` and `set_booking_status` with `create or replace`, keeping every Plan 1 check in its existing order.
- [ ] **Step 4: Run** `npm run test:db`. Expected: the 6 new tests and all 121 existing tests pass. Run `tests/db/booking-concurrency.test.ts` ten times in a row; no `40P01`.
- [ ] **Step 5: Commit** `feat(db): treatment timestamps, room turnover and start rules`.

---

### Task 2: Exceptions — room reports, forced absence and room block, stranded bookings

**Files:**
- Create: `supabase/migrations/0010_exceptions.sql`, `tests/db/exceptions.test.ts`

**Interfaces:**
- Produces:
  - `room_reports(id uuid pk, room_id uuid not null → rooms, note text not null check (length(trim(note)) > 0), created_by uuid default auth.uid(), created_at timestamptz not null default now(), resolved_at timestamptz, resolved_by uuid)`. RLS: active staff select; no direct writes. Audited.
  - `report_room_issue(p_room_id uuid, p_note text) returns room_reports` — any active staff role.
  - `resolve_room_report(p_id uuid) returns room_reports` — owner, manager, receptionist; `INVALID_TRANSITION` if already resolved.
  - `record_absence(p_therapist_id uuid, p_from timestamptz, p_to timestamptz, p_kind time_off_kind, p_note text default null) returns setof uuid` — owner, manager. Inserts the time off **even when live bookings overlap** and returns the ids of those bookings.
  - `force_room_block(p_room_id uuid, p_from timestamptz, p_to timestamptz, p_kind block_kind, p_note text default null) returns setof uuid` — owner, manager; same idea for a room.
  - Both set `set_config('app.allow_stranding', 'on', true)`; `private.guard_time_off` and `private.guard_room_block` return early only when that setting is `'on'` **and** `private.current_role() in ('owner','manager')`. Direct inserts behave exactly as in Plan 1.
  - `stranded_bookings() returns table (booking_id uuid, reason text)` — owner, manager, receptionist. Bookings in `requested`, `confirmed` or `checked_in` whose `service_during` has not ended and which overlap their therapist's time off (`'therapist_time_off'`) or whose `room_during` overlaps a block on their room (`'room_blocked'`). Ordered by start.
- This closes Plan 1's known limitation (same-day absence).

- [ ] **Step 1: Write the failing tests**

```ts
const stranded = (c: PoolClient) => c.query(`select * from stranded_bookings()`).then((r) => r.rows);

test('an absence over a live booking is recorded and the booking is queued for reassignment', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const hit = await asRole(b, 'manager', (c) => c.query(`select * from record_absence($1,$2,$3,'absence')`, [b.t1, bkk('09:00'), bkk('13:00')]));
  expect(hit.rows.map((r) => r.record_absence)).toEqual([k.id]);
  expect(await asRole(b, 'receptionist', stranded)).toEqual([{ booking_id: k.id, reason: 'therapist_time_off' }]);
  await asRole(b, 'receptionist', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [k.id, bkk('10:00'), b.t2, b.pos[0]]));
  expect(await asRole(b, 'receptionist', stranded)).toEqual([]);
});
test('a forced room block queues its bookings; moving rooms clears it', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'owner', (c) => c.query(`select force_room_block($1,$2,$3,'maintenance','แอร์เสีย')`, [b.rooms[0], bkk('09:00'), bkk('18:00')]));
  expect(await asRole(b, 'manager', stranded)).toEqual([{ booking_id: k.id, reason: 'room_blocked' }]);
  await asRole(b, 'manager', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [k.id, bkk('10:00'), b.t1, b.pos[1]]));
  expect(await asRole(b, 'manager', stranded)).toEqual([]);
});
test('the plain insert is still refused, and only owner or manager may force', async () => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  await expectCode(asRole(b, 'manager', (c) => c.query(`insert into therapist_time_off(therapist_id, during, kind) values ($1, tstzrange($2,$3), 'leave')`, [b.t1, bkk('09:00'), bkk('13:00')])), 'CONFLICTS_WITH_BOOKINGS');
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select record_absence($1,$2,$3,'absence')`, [b.t1, bkk('09:00'), bkk('13:00')])), 'NOT_AUTHORIZED');
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select force_room_block($1,$2,$3,'closed')`, [b.rooms[0], bkk('09:00'), bkk('13:00')])), 'NOT_AUTHORIZED');
});
test('a therapist reports a room issue; reception resolves it once', async () => {
  const r = await asRole(b, 'therapist', (c) => c.query(`select * from report_room_issue($1,'ผ้าขนหนูหมด')`, [b.rooms[0]]));
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select resolve_room_report($1)`, [r.rows[0].id])), 'NOT_AUTHORIZED');
  await asRole(b, 'receptionist', (c) => c.query(`select resolve_room_report($1)`, [r.rows[0].id]));
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select resolve_room_report($1)`, [r.rows[0].id])), 'INVALID_TRANSITION');
});
```

- [ ] **Step 2: Run** `npm run test:db -- exceptions`. Expected: FAIL.
- [ ] **Step 3: Write `0010_exceptions.sql`.**
- [ ] **Step 4: Run** `npm run test:db`. Expected: all pass (the Plan 1 guard tests included).
- [ ] **Step 5: Commit** `feat(db): room reports, forced absence and stranded bookings`.

---

### Task 3: Read models — derived room status, extended board, day counts

**Files:**
- Create: `supabase/migrations/0011_read_models.sql`, `tests/db/room-status.test.ts`
- Modify: `tests/db/board.test.ts` (only if a column assertion needs the new columns)

**Interfaces:**
- Produces:
  - Enum `room_status ('available','reserved','occupied','cleaning','out_of_service')`.
  - `room_status_board(p_now timestamptz default now(), p_reserved_lead_min int default 30) returns table (room_id uuid, status room_status, current_booking_id uuid, current_therapist_id uuid, current_customer_display_name text, expected_end timestamptz, next_booking_id uuid, next_starts_at timestamptz, turnover_started_at timestamptz, turnover_due_at timestamptz, block_kind block_kind, block_note text, open_reports int)` — `security definer`, `stable`; any active staff role, otherwise `NOT_AUTHORIZED`. One row per **active** room, ordered by zone then `sort_order`. Status is the first rule that matches:
    1. `occupied` — a booking in the room is `in_treatment`.
    2. `out_of_service` — a `maintenance` or `closed` block contains `p_now`.
    3. `cleaning` — an open turnover, or a `cleaning` block contains `p_now`.
    4. `reserved` — a booking is `checked_in`, or a `requested`/`confirmed` booking starts at or before `p_now + p_reserved_lead_min` and has not ended.
    5. `available`.
    - `current_*` describe the `in_treatment` booking with the latest expected end. `expected_end = coalesce(started_at, lower(service_during)) + (upper(service_during) − lower(service_during))`. `next_*` is the earliest `requested`/`confirmed`/`checked_in` booking in the room whose service has not ended at `p_now`. For a therapist, `current_customer_display_name` is null unless the booking is theirs, and `block_note` is null.
  - `booking_board(p_from, p_to)` — dropped and recreated with four more columns appended: `checked_in_at timestamptz, started_at timestamptz, completed_at timestamptz, expected_end timestamptz`. Everything else unchanged.
  - `booking_day_counts(p_from date, p_to date) returns table (day date, bookings int, booked_minutes int)` — one row per Bangkok calendar day in `[p_from, p_to]` that has bookings; counts statuses other than `cancelled` and `no_show`, by the day the booking **starts**; role filtering as `booking_board`.
  - Realtime: add `bookings`, `room_turnovers`, `room_blocks`, `room_reports`, `therapist_time_off`, `therapist_shifts` to publication `supabase_realtime`, inside a `do` block that does nothing when the publication does not exist (the test cluster).

- [ ] **Step 1: Write the failing tests**

```ts
const st = (a: Actor, at: string, room = b.rooms[0]) =>
  asRole(b, a, (c) => c.query(`select * from room_status_board($1) where room_id=$2`, [at, room])).then((r) => r.rows[0]);

test('status follows the booking through the day', async () => {
  expect((await st('receptionist', bkk('09:00'))).status).toBe('available');
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  expect((await st('receptionist', bkk('09:00'))).status).toBe('available');           // 60 min ahead > 30 lead
  expect(await st('receptionist', bkk('09:45'))).toMatchObject({ status: 'reserved', next_booking_id: k.id });
  await runTo(b, k.id, 'checked_in');
  expect((await st('receptionist', bkk('08:00'))).status).toBe('reserved');
  await runTo(b, k.id, 'in_treatment');
  const occ = await st('receptionist', bkk('10:10'));
  expect(occ).toMatchObject({ status: 'occupied', current_booking_id: k.id, current_therapist_id: b.t1 });
  expect(occ.expected_end).not.toBeNull();
  await runTo(b, k.id, 'completed');
  const cl = await st('receptionist', bkk('11:05'));
  expect(cl.status).toBe('cleaning'); expect(cl.turnover_due_at).not.toBeNull();
  await asRole(b, 'therapist', (c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]]));
  expect((await st('receptionist', bkk('11:10'))).status).toBe('available');
});
test('blocks: maintenance is out of service, a cleaning block is cleaning, an occupied room stays occupied', async () => {
  await asAdmin((c) => c.query(`insert into room_blocks(room_id, during, kind, note) values ($1, tstzrange($2,$3), 'maintenance', 'x'), ($4, tstzrange($2,$3), 'cleaning', null)`, [b.rooms[1], bkk('15:00'), bkk('17:00'), b.rooms[2]]));
  expect(await st('manager', bkk('16:00'), b.rooms[1])).toMatchObject({ status: 'out_of_service', block_kind: 'maintenance', block_note: 'x' });
  expect((await st('therapist', bkk('16:00'), b.rooms[1])).block_note).toBeNull();
  expect((await st('manager', bkk('16:00'), b.rooms[2])).status).toBe('cleaning');
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await runTo(b, k.id, 'in_treatment');
  await asRole(b, 'owner', (c) => c.query(`select force_room_block($1,$2,$3,'closed')`, [b.rooms[0], bkk('09:00'), bkk('18:00')]));
  expect((await st('manager', bkk('10:30'))).status).toBe('occupied');
});
test('one row per active room, following configuration', async () => {
  const n = () => asRole(b, 'receptionist', (c) => c.query(`select 1 from room_status_board($1)`, [bkk('09:00')])).then((r) => r.rowCount);
  expect(await n()).toBe(7);
  await asRole(b, 'manager', (c) => c.query(`insert into rooms(code, display_name, category_id) values ('R7','ห้อง 7',$1)`, [b.cat.standard]));
  await asRole(b, 'manager', (c) => c.query(`update rooms set active=false where id=$1`, [b.rooms[5]]));
  expect(await n()).toBe(7);
});
test('therapists see a customer name only on their own treatment; outsiders see nothing', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, customer: b.c2 }));
  await runTo(b, k.id, 'in_treatment');
  expect((await st('therapist', bkk('10:10'))).current_customer_display_name).toBeNull();
  expect((await st('receptionist', bkk('10:10'))).current_customer_display_name).not.toBeNull();
  for (const a of ['customer', 'anon'] as const)
    await expectCode(asRole(b, a, (c) => c.query(`select 1 from room_status_board()`)), 'NOT_AUTHORIZED');
});
test('the board carries treatment times; day counts skip cancellations and count by start day', async () => {
  await asAdmin((c) => c.query(`update therapist_shifts set during = tstzrange($2,$3) where therapist_id=$1`, [b.t1, bkk('09:00'), bkk('02:00', '2030-01-16')]));
  const a = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => book(c, b, { start: bkk('23:30'), customer: b.c2 }));
  const x = await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, position: b.pos[1], start: bkk('14:00') }));
  await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'cancelled',1)`, [x.id]));
  await runTo(b, a.id, 'in_treatment');
  const row = (await asRole(b, 'manager', (c) => c.query(`select * from booking_board($1,$2) where booking_id=$3`, [bkk('00:00'), bkk('00:00', '2030-01-16'), a.id]))).rows[0];
  expect([row.started_at === null, row.expected_end === null, row.completed_at]).toEqual([false, false, null]);
  const d = await asRole(b, 'manager', (c) => c.query(`select day::text, bookings, booked_minutes from booking_day_counts('2030-01-14','2030-01-17')`));
  expect(d.rows).toEqual([{ day: '2030-01-15', bookings: 2, booked_minutes: 120 }]);
});
```

- [ ] **Step 2: Run** `npm run test:db -- room-status`. Expected: FAIL.
- [ ] **Step 3: Write `0011_read_models.sql`.**
- [ ] **Step 4: Run** `npm run test:db`, then `npx supabase db reset` (migrations and seed must apply on the real stack, publication included). Expected: all pass; reset exits 0.
- [ ] **Step 5: Commit** `feat(db): derived room status, extended board and day counts`.

---

### Task 4: Customer message outbox

**Files:**
- Create: `supabase/migrations/0012_notifications.sql`, `tests/db/notifications.test.ts`

**Interfaces:**
- Produces:
  - `notification_outbox(id uuid pk default gen_random_uuid(), booking_id uuid not null → bookings, customer_id uuid not null → customers, template text not null check (template in ('booking_confirmed','booking_changed','booking_cancelled')), payload jsonb not null, status text not null default 'pending' check (status in ('pending','failed','sent','dead')), attempts int not null default 0, next_attempt_at timestamptz not null default now(), last_error text, dedupe_key text not null unique, created_at timestamptz not null default now(), sent_at timestamptz)`. The row holds **no phone number, email or name**; the sender looks the contact up at send time. `payload` is exactly `{"booking_id": …, "starts_at": …}`.
  - Trigger on `booking_events` insert: `created` → `booking_confirmed`; `rescheduled` → `booking_changed`; `status_changed` whose new status is `cancelled` → `booking_cancelled`; nothing for other events. Enqueues only when the customer has `comms_consent = true` and a phone or an email. `dedupe_key` is the event id.
  - `claim_notifications(p_limit int) returns setof notification_outbox` — executable by `service_role` only. Picks rows with `status in ('pending','failed') and next_attempt_at <= now()`, oldest first, `for update skip locked`; sets `attempts = attempts + 1` and `next_attempt_at = now() + interval '5 minutes'` (the visibility timeout), and returns them.
  - `complete_notification(p_id uuid, p_ok boolean, p_error text default null) returns void` — `service_role` only. Success: `status 'sent'`, `sent_at = now()`. Failure: `last_error = p_error`; if `attempts >= 5` then `status 'dead'`, else `status 'failed'` and `next_attempt_at = now() +` 1, 5, 30, 120 minutes for attempts 1, 2, 3, 4.
  - `retry_notification(p_id uuid) returns void` — owner, manager; a `failed` or `dead` row becomes `pending` with `attempts = 0`, `next_attempt_at = now()`; anything else `INVALID_TRANSITION`.
  - RLS: owner and manager select; no direct writes for any signed-in role.

- [ ] **Step 1: Write the failing tests**

```ts
const consent = (id: string) => asAdmin((c) => c.query(`update customers set comms_consent=true, phone='0810000000' where id=$1`, [id]));
const box = () => asAdmin((c) => c.query(`select * from notification_outbox order by created_at`)).then((r) => r.rows);
const due = () => asAdmin((c) => c.query(`update notification_outbox set next_attempt_at = now()`));
const claim = () => asService((c) => c.query(`select * from claim_notifications(10)`)).then((r) => r.rows);

test('nothing is queued without consent', async () => {
  await asRole(b, 'receptionist', (c) => book(c, b));
  expect(await box()).toEqual([]);
});
test('create, move and cancel each queue one discreet message', async () => {
  await consent(b.c1);
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'receptionist', (c) => c.query(`select move_booking($1,$2,$3,$4,1)`, [k.id, bkk('14:00'), b.t1, b.pos[0]]));
  await asRole(b, 'receptionist', (c) => c.query(`select move_booking($1,$2,$3,$4,2)`, [k.id, bkk('14:00'), b.t2, b.pos[0]]));   // reassign only: no message
  await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'cancelled',3)`, [k.id]));
  const rows = await box();
  expect(rows.map((r) => r.template)).toEqual(['booking_confirmed', 'booking_changed', 'booking_cancelled']);
  for (const r of rows) expect(Object.keys(r.payload).sort()).toEqual(['booking_id', 'starts_at']);
});
test('a claimed message is hidden for five minutes, then claimable again if the sender died', async () => {
  await consent(b.c1); await asRole(b, 'receptionist', (c) => book(c, b));
  expect((await claim()).map((r) => r.attempts)).toEqual([1]);
  expect(await claim()).toEqual([]);
  await due();
  expect((await claim()).map((r) => r.attempts)).toEqual([2]);
});
test('failures back off and die after five attempts; a sent message is never claimed again', async () => {
  await consent(b.c1); await asRole(b, 'receptionist', (c) => book(c, b));
  for (let i = 1; i <= 5; i++) {
    const [m] = await claim();
    await asService((c) => c.query(`select complete_notification($1,false,'boom')`, [m.id]));
    expect((await box())[0].status).toBe(i < 5 ? 'failed' : 'dead');
    await due();
  }
  expect(await claim()).toEqual([]);
  const [dead] = await box();
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select retry_notification($1)`, [dead.id])), 'NOT_AUTHORIZED');
  await asRole(b, 'manager', (c) => c.query(`select retry_notification($1)`, [dead.id]));
  const [m] = await claim();
  await asService((c) => c.query(`select complete_notification($1,true)`, [m.id]));
  await due();
  expect(await claim()).toEqual([]);
  expect((await box())[0]).toMatchObject({ status: 'sent', attempts: 1 });
});
test('signed-in staff cannot claim or read around the rules', async () => {
  await consent(b.c1); await asRole(b, 'receptionist', (c) => book(c, b));
  await expect(asRole(b, 'owner', (c) => c.query(`select claim_notifications(1)`))).rejects.toMatchObject({ code: '42501' });
  expect((await asRole(b, 'receptionist', (c) => c.query(`select 1 from notification_outbox`))).rowCount).toBe(0);
  expect((await asRole(b, 'manager', (c) => c.query(`select 1 from notification_outbox`))).rowCount).toBe(1);
});
```

- [ ] **Step 2: Run** `npm run test:db -- notifications`. Expected: FAIL.
- [ ] **Step 3: Write `0012_notifications.sql`.**
- [ ] **Step 4: Run** `npm run test:db`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(db): customer message outbox with retries`.

---

### Task 5: The Today model (pure) and the new error code

**Files:**
- Create: `src/modules/operations/today.ts`, `src/modules/operations/today.test.ts`
- Modify: `src/lib/errors.ts` (add `ROOM_NOT_READY` to `ERROR_CODES`), `src/lib/errors.test.ts`, `messages/th.json`, `messages/en.json`, `src/modules/booking/actions.ts` (`BoardRow` and its mapping gain `checkedInAt`, `startedAt`, `completedAt`, `expectedEnd`, each `string | null`)

**Interfaces:**
- Produces:

```ts
export type RoomStatus = 'available' | 'reserved' | 'occupied' | 'cleaning' | 'out_of_service';
export type RoomState = {
  roomId: string; status: RoomStatus;
  currentBookingId: string | null; currentTherapistId: string | null; currentCustomerDisplayName: string | null; expectedEnd: string | null;
  nextBookingId: string | null; nextStartsAt: string | null;
  turnoverStartedAt: string | null; turnoverDueAt: string | null;
  blockKind: 'maintenance' | 'cleaning' | 'closed' | null; blockNote: string | null; openReports: number;
};
export type Span = { therapistId: string; start: string; end: string };
export type OpsConfig = { arrivalWindowMin: number; lateArrivalMin: number; endingSoonMin: number; roomPrepWarnMin: number };
export const OPS_DEFAULTS: OpsConfig = { arrivalWindowMin: 60, lateArrivalMin: 10, endingSoonMin: 10, roomPrepWarnMin: 15 };
export type AttentionKind = 'needs_reassignment' | 'overrunning' | 'room_not_ready' | 'late_arrival' | 'turnover_overdue' | 'room_report';
export type Attention = { kind: AttentionKind; bookingId?: string; roomId?: string; since: string };
export type TodayModel = {
  day: string;                                   // Bangkok day of `now`
  counts: { reservations: number; cancelled: number; noShow: number } & Record<RoomStatus, number>;
  arrivals: BoardRow[]; waiting: BoardRow[]; inTreatment: BoardRow[]; endingSoon: BoardRow[];
  awaitingCleaning: RoomState[]; cancellations: BoardRow[];
  therapists: { therapistId: string; state: 'in_treatment' | 'on_break' | 'free' }[];
  attention: Attention[];
};
export function buildToday(input: {
  now: string; rows: BoardRow[]; rooms: RoomState[]; shifts: Span[]; timeOff: Span[];
  stranded: { bookingId: string; reason: string }[]; cfg?: OpsConfig;
}): TodayModel;
```

  Rules (all comparisons against `now`; "today" is the Bangkok day of `now`):
  - `counts.reservations`: rows starting today, not `cancelled`/`no_show`. `counts.cancelled` / `noShow`: rows starting today with that status. Room-status counts: number of rooms per status.
  - `arrivals`: `requested`/`confirmed` with `startsAt <= now + arrivalWindowMin` (late ones stay listed), by start. `waiting`: `checked_in`, by `checkedInAt`. `inTreatment`: every `in_treatment` row **whatever day it started**, by `expectedEnd`. `endingSoon`: `in_treatment` with `expectedEnd <= now + endingSoonMin`. `awaitingCleaning`: rooms with status `cleaning` and a turnover, by `turnoverDueAt`. `cancellations`: today's `cancelled` and `no_show` rows.
  - `therapists`: those with a shift containing `now`; `in_treatment` if they have an `in_treatment` row, else `on_break` if time off contains `now`, else `free`; ordered by `therapistId`.
  - `attention`, in this kind order, then by `since`: `needs_reassignment` (each stranded booking; `since` = its `startsAt` when the row is in `rows`, otherwise `now`), `overrunning` (`in_treatment`, `expectedEnd < now`; since `expectedEnd`), `room_not_ready` (room `occupied`/`cleaning`/`out_of_service` with `nextStartsAt <= now + roomPrepWarnMin`; since `nextStartsAt`), `late_arrival` (`requested`/`confirmed`, `startsAt < now − lateArrivalMin`; since `startsAt`), `turnover_overdue` (`cleaning`, `turnoverDueAt < now`; since `turnoverDueAt`), `room_report` (`openReports > 0`; since `now`).
  - Pure; never reads the system clock.

- [ ] **Step 1: Write the failing tests.** Local builders `row(over)` and `room(over)` fill every field with a neutral default (`status: 'confirmed'`, `startsAt: '2030-01-15T06:00:00Z'`, room `status: 'available'`, nulls elsewhere). `NOW = '2030-01-15T05:00:00Z'` (12:00 in Bangkok).

```ts
const run = (i: Partial<Parameters<typeof buildToday>[0]>) => buildToday({ now: NOW, rows: [], rooms: [], shifts: [], timeOff: [], stranded: [], ...i });

test('arrivals include the next hour and late customers, not later ones', () => {
  const m = run({ rows: [row({ bookingId: 'late', startsAt: '2030-01-15T04:40:00Z' }), row({ bookingId: 'soon', startsAt: '2030-01-15T05:59:00Z' }), row({ bookingId: 'later', startsAt: '2030-01-15T07:00:00Z' })] });
  expect(m.arrivals.map((r) => r.bookingId)).toEqual(['late', 'soon']);
  expect(m.attention).toEqual([{ kind: 'late_arrival', bookingId: 'late', since: '2030-01-15T04:40:00Z' }]);
  expect(m.counts.reservations).toBe(3);
});
test('a treatment that began before midnight is still in progress the next day', () => {
  const m = buildToday({ now: '2030-01-15T17:20:00Z', rows: [row({ bookingId: 'x', status: 'in_treatment', startsAt: '2030-01-15T16:30:00Z', expectedEnd: '2030-01-15T17:30:00Z' })], rooms: [], shifts: [], timeOff: [], stranded: [] });
  expect(m.day).toBe('2030-01-16');
  expect(m.inTreatment.map((r) => r.bookingId)).toEqual(['x']);
  expect(m.endingSoon.map((r) => r.bookingId)).toEqual(['x']);
  expect(m.counts.reservations).toBe(0);
});
test('overrun, room not ready, overdue cleaning and reports are raised in priority order', () => {
  const m = run({
    rows: [row({ bookingId: 'o', status: 'in_treatment', expectedEnd: '2030-01-15T04:50:00Z' })],
    rooms: [room({ roomId: 'r1', status: 'occupied', nextStartsAt: '2030-01-15T05:10:00Z' }),
            room({ roomId: 'r2', status: 'cleaning', turnoverStartedAt: '2030-01-15T04:30:00Z', turnoverDueAt: '2030-01-15T04:45:00Z' }),
            room({ roomId: 'r3', openReports: 2 })],
    stranded: [{ bookingId: 's', reason: 'therapist_time_off' }],
  });
  expect(m.attention.map((a) => a.kind)).toEqual(['needs_reassignment', 'overrunning', 'room_not_ready', 'turnover_overdue', 'room_report']);
  expect(m.awaitingCleaning.map((r) => r.roomId)).toEqual(['r2']);
  expect([m.counts.occupied, m.counts.cleaning, m.counts.available]).toEqual([1, 1, 1]);
});
test('therapist states come from shifts, breaks and treatments', () => {
  const span = (t: string, s: string, e: string) => ({ therapistId: t, start: s, end: e });
  const m = run({
    rows: [row({ status: 'in_treatment', therapistId: 'a', expectedEnd: '2030-01-15T05:30:00Z' })],
    shifts: [span('a', '2030-01-15T03:00:00Z', '2030-01-15T15:00:00Z'), span('b', '2030-01-15T03:00:00Z', '2030-01-15T15:00:00Z'), span('c', '2030-01-15T03:00:00Z', '2030-01-15T15:00:00Z'), span('d', '2030-01-15T08:00:00Z', '2030-01-15T15:00:00Z')],
    timeOff: [span('b', '2030-01-15T04:30:00Z', '2030-01-15T05:30:00Z')],
  });
  expect(m.therapists).toEqual([{ therapistId: 'a', state: 'in_treatment' }, { therapistId: 'b', state: 'on_break' }, { therapistId: 'c', state: 'free' }]);
});
test('ROOM_NOT_READY is a known error with Thai and English text', () => {
  expect(errorMessageKey('ROOM_NOT_READY')).toBe('errors.ROOM_NOT_READY');
  expect(th.errors.ROOM_NOT_READY && en.errors.ROOM_NOT_READY).toBeTruthy();
});
```

- [ ] **Step 2: Run** `npx vitest run src/modules/operations src/lib`. Expected: FAIL.
- [ ] **Step 3: Implement** `today.ts`, the error code, both message files, and the `BoardRow` fields.
- [ ] **Step 4: Run** `npx vitest run src && npm run build`. Expected: pass; build exits 0.
- [ ] **Step 5: Commit** `feat(ops): today model and ROOM_NOT_READY`.

---

### Task 6: Today screen — arrival to ready room

**Files:**
- Create: `src/modules/operations/schema.ts`, `src/modules/operations/actions.ts`, `src/modules/operations/components/{TodayBoard,AttentionList,BookingActions}.tsx`, `src/app/[locale]/(staff)/today/{page,loading,error}.tsx`, `tests/e2e/today.spec.ts`
- Modify: `src/app/[locale]/(staff)/layout.tsx` (nav: `/today` first, for all four roles; `/rooms` second), `src/modules/identity/components/LoginForm.tsx:24` (`router.replace('/today')`), `tests/e2e/helpers.ts:8` and `tests/e2e/admin-staff.spec.ts:30` (expect `/\/th\/today/`), `tests/e2e/db.ts`, `messages/{th,en}.json`

**Interfaces:**
- Consumes: `buildToday`, `RoomState`, `setBookingStatus`, the RPCs from Tasks 1–3.
- Produces (`src/modules/operations/actions.ts`):
  - `getRoomStates(): Promise<{ ok: true; rooms: RoomState[] } | { ok: false; code: string }>` — any staff role.
  - `getToday(): Promise<{ ok: true; now: string; model: TodayModel } | { ok: false; code: string }>` — any staff role. `now` is the server's clock. Reads `booking_board` for `[start of today − 12 h, end of today)`, `room_status_board`, shifts and time off overlapping `now`, and `stranded_bookings` (an empty list for therapists).
  - `markRoomReady(roomId: string)`, `reportRoomIssue(input: { roomId: string; note: string })` — any staff role. `resolveRoomReport(id: string)` — owner, manager, receptionist.
- Produces (`tests/e2e/db.ts`): `seedBookingNow(o?: { roomCode?: string; therapistEmail?: string; customerName?: string; consent?: boolean }): Promise<{ id: string; therapistName: string; roomCode: string; at: string }>` — with the service client, replaces that therapist's shifts overlapping the next three hours with one shift `[now − 1 h, now + 3 h)`, then books through `create_booking` at one minute from now as a walk-in; `consent: true` first sets the customer's `comms_consent` and a phone number. `resetTestData` also clears `room_turnovers`, `room_reports`, `notification_outbox`.
- The Today page (`data-testid` in brackets): status counts [`count-<status>`], arrivals [`arrival-row`], waiting [`waiting-row`], in treatment [`treatment-row`, with expected end and an "ending soon" mark], awaiting cleaning [`cleaning-row`], cancellations, therapists on shift with their state, and the attention list [`attention-item`, `data-kind`]. Each row carries only the actions the signed-in role may take: [`act-checked_in`], [`act-in_treatment`], [`act-completed`], [`act-no_show`], [`act-cancelled`] (asks to confirm), [`act-ready`]. A "shared screen" switch [`shared-toggle`] replaces every customer name with the service name and is remembered per device (browser storage inside `try/catch`). Pending payments are not shown; they arrive with Plan 3.

- [ ] **Step 1: Write the failing browser tests**

```ts
test('a walk-in goes from arrival to a ready room on one screen', async ({ page }) => {
  await seedBookingNow({ roomCode: 'R1', customerName: 'คุณเดิน' });
  await signIn(page, 'reception@spa.test');
  await expect(page).toHaveURL(/\/th\/today/);
  const arrival = page.getByTestId('arrival-row').filter({ hasText: 'คุณเดิน' });
  await arrival.getByTestId('act-checked_in').click();
  await page.getByTestId('waiting-row').filter({ hasText: 'คุณเดิน' }).getByTestId('act-in_treatment').click();
  await expect(page.getByTestId('count-occupied')).toHaveText('1');
  await page.getByTestId('treatment-row').filter({ hasText: 'คุณเดิน' }).getByTestId('act-completed').click();
  const cleaning = page.getByTestId('cleaning-row').filter({ hasText: 'R1' });
  await expect(cleaning).toBeVisible();
  await cleaning.getByTestId('act-ready').click();
  await expect(page.getByTestId('cleaning-row')).toHaveCount(0);
  await expect(page.getByTestId('count-available')).toHaveText('6');
});
test('a therapist runs their own treatment from a phone and cannot cancel', async ({ page }) => {
  const k = await seedBookingNow({ therapistEmail: 'therapist@spa.test' });
  await setStatusAsReception(k.id, 'checked_in');
  await signIn(page, 'therapist@spa.test');
  const mine = page.getByTestId('waiting-row');
  await expect(mine).toHaveCount(1);
  await expect(page.getByTestId('act-cancelled')).toHaveCount(0);
  await mine.getByTestId('act-in_treatment').click();
  await page.getByTestId('treatment-row').getByTestId('act-completed').click();
  await page.getByTestId('cleaning-row').getByTestId('act-ready').click();
  await expect(page.getByTestId('cleaning-row')).toHaveCount(0);
});
test('two desks, one booking: the second tap is told the screen was out of date', async ({ page, browser }) => {
  await seedBookingNow({ customerName: 'คุณซ้ำ' });
  const p2 = await (await browser.newContext()).newPage();
  await signIn(page, 'reception@spa.test'); await signIn(p2, 'manager@spa.test');
  await p2.routeWebSocket(/realtime/, () => {});                    // keep the second desk stale once live updates exist (Task 9)
  await page.getByTestId('act-checked_in').click();
  await expect(page.getByTestId('waiting-row')).toHaveCount(1);
  await p2.getByTestId('arrival-row').getByTestId('act-checked_in').click();
  await expect(p2.getByRole('alert')).toContainText(th.errors.STALE_VERSION);
});
test('starting in a room that is still being cleaned is refused in plain words', async ({ page }) => { /* complete one booking in R1, check in a second for R1, tap start → alert th.errors.ROOM_NOT_READY; row stays under waiting */ });
test('shared-screen mode hides customer names and survives a reload', async ({ page }) => {
  await seedBookingNow({ customerName: 'คุณลับ' });
  await signIn(page, 'reception@spa.test');
  await page.getByTestId('shared-toggle').click();
  await expect(page.getByText('คุณลับ')).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('คุณลับ')).toHaveCount(0);
});
```

- [ ] **Step 2: Run** `npx playwright test today`. Expected: FAIL.
- [ ] **Step 3: Implement.** `setStatusAsReception` is a local test helper using the public client, like `seedBooking`.
- [ ] **Step 4: Run** `npx playwright test` (whole suite, both projects — the landing-page change touches Plan 1 tests). Expected: all pass.
- [ ] **Step 5: Commit** `feat(ops): today screen with check-in, treatment and room readiness`.

---

### Task 7: Room dashboard

**Files:**
- Create: `src/modules/operations/rooms.ts`, `src/modules/operations/rooms.test.ts`, `src/modules/operations/components/RoomBoard.tsx`, `src/app/[locale]/(staff)/rooms/{page,loading,error}.tsx`, `tests/e2e/rooms.spec.ts`

**Interfaces:**
- Produces:

```ts
export type RoomTile = RoomState & { code: string; displayName: string; zone: string | null; floor: string | null; categoryId: string; notes: string | null };
export type RoomFilter = { q?: string; status?: RoomStatus; categoryId?: string; zone?: string };
export function filterRooms(tiles: RoomTile[], f: RoomFilter): RoomTile[];          // q matches code or display name, case-insensitive
export function summarizeRooms(tiles: RoomTile[]): { total: number; byStatus: Record<RoomStatus, number>; byZone: { zone: string | null; total: number; occupied: number }[] };
```

- The page shows a summary strip (count per status; occupied/total per zone), then tiles [`room-tile`, `data-status`] grouped under zone headings [`zone-heading`]. Filters: search [`room-search`], status [`room-status-filter`], category, zone; a compact switch [`compact-toggle`] reduces each tile to code, status label and one time. A full tile shows: status label and colour, current customer display name and therapist, expected completion, next reservation time, turnover started/due, block reason, open report count, and the room's notes for owner, manager and receptionist only. Tile actions: mark ready (when cleaning), report an issue, and a link to the room timeline (`/calendar?view=rooms`). Filters live in the URL query so a filtered view can be bookmarked on a wall tablet. Tiles are plain elements with no per-tile data fetching; at dozens of rooms no pagination or virtualisation is added (Plan 4 measures this).

- [ ] **Step 1: Write the failing unit tests**

```ts
const t = (code: string, status: RoomStatus, zone: string | null = 'A'): RoomTile => ({ ...blankTile, roomId: code, code, displayName: 'ห้อง ' + code, status, zone });
test('search, status and zone filters combine', () => {
  const all = [t('R1', 'available'), t('R2', 'occupied'), t('R12', 'occupied', 'B')];
  expect(filterRooms(all, { q: 'r1' }).map((x) => x.code)).toEqual(['R1', 'R12']);
  expect(filterRooms(all, { q: 'r1', status: 'occupied' }).map((x) => x.code)).toEqual(['R12']);
  expect(filterRooms(all, { zone: 'A', status: 'occupied' }).map((x) => x.code)).toEqual(['R2']);
  expect(filterRooms(all, {})).toHaveLength(3);
});
test('the summary counts by status and by zone', () => {
  const s = summarizeRooms([t('R1', 'available'), t('R2', 'occupied'), t('R3', 'occupied', 'B'), t('R4', 'cleaning', null)]);
  expect(s.total).toBe(4);
  expect([s.byStatus.occupied, s.byStatus.available, s.byStatus.reserved]).toEqual([2, 1, 0]);
  expect(s.byZone).toEqual([{ zone: 'A', total: 2, occupied: 1 }, { zone: 'B', total: 1, occupied: 1 }, { zone: null, total: 1, occupied: 0 }]);
});
```

- [ ] **Step 2: Write the failing browser tests**

```ts
test('forty more rooms stay searchable, filterable and grouped', async ({ page }) => {
  await addRooms(40, { zones: ['A', 'B', 'C', 'D'] });               // service client; codes X01..X40
  await signIn(page, 'manager@spa.test'); await page.goto('/th/rooms');
  await expect(page.getByTestId('room-tile')).toHaveCount(46);
  expect(await page.getByTestId('zone-heading').count()).toBeGreaterThanOrEqual(4);
  await page.getByTestId('room-search').fill('X1');
  await expect(page.getByTestId('room-tile')).toHaveCount(10);        // X10..X19
  await page.getByTestId('room-search').fill('');
  await page.getByTestId('compact-toggle').click();
  await expect(page.getByTestId('room-tile')).toHaveCount(46);
});
test('a tile follows the room through occupied, cleaning and ready', async ({ page }) => { /* seedBookingNow R1; drive statuses with setStatusAsReception; reload between steps; assert data-status occupied → cleaning → (click act-ready) → available; status filter "cleaning" shows exactly R1 while cleaning */ });
test('a therapist reports an issue from a tile and does not see room notes', async ({ page }) => { /* set rooms.notes for R2 via service client; therapist: notes text absent; report "ไฟเสีย" → tile shows 1 open report */ });
```

- [ ] **Step 3: Run** `npx vitest run src/modules/operations` and `npx playwright test rooms`. Expected: FAIL.
- [ ] **Step 4: Implement.** Confirm no literal room code or count: `grep -rnE "R[1-6]\b|X[0-9]{2}" src/` returns nothing.
- [ ] **Step 5: Run** both commands on both Playwright projects. Expected: pass.
- [ ] **Step 6: Commit** `feat(ops): scalable room dashboard`.

---

### Task 8: Exceptions on screen — absence, forced block, reassignment queue

**Files:**
- Create: `src/modules/operations/components/ReassignDialog.tsx`, `tests/e2e/exceptions.spec.ts`
- Modify: `src/modules/operations/actions.ts`, `src/modules/operations/schema.ts`, `src/modules/operations/components/AttentionList.tsx`, `src/modules/therapists/components/TherapistsAdmin.tsx` (time-off form), `src/modules/rooms/components/RoomsAdmin.tsx` (block form), `messages/{th,en}.json`

**Interfaces:**
- Produces (`operations/actions.ts`; owner and manager unless noted):
  - `recordAbsence(input: { therapistId: string; start: string; end: string; kind: 'break' | 'leave' | 'absence'; note?: string }): Promise<{ ok: true; affected: string[] } | { ok: false; code: string }>`
  - `forceRoomBlock(input: { roomId: string; start: string; end: string; kind: 'maintenance' | 'cleaning' | 'closed'; note?: string })` — same result shape.
  - `suggestReassign(bookingId: string): Promise<{ ok: true; booking: BoardRow; candidates: Candidate[] } | { ok: false; code: string }>` — owner, manager, receptionist; calls `available_candidates(service, start, p_exclude_booking)` and `rankAllocations`.
- Behaviour: when the existing time-off or room-block form gets `CONFLICTS_WITH_BOOKINGS`, it keeps the form filled and offers one explicit choice [`force-confirm`]: "record anyway and queue the affected bookings", which calls `recordAbsence` / `forceRoomBlock` and then states how many bookings were queued. A `needs_reassignment` attention item opens `ReassignDialog` [`reassign-option`], which lists ranked alternatives at the same time and applies the chosen one with `moveBooking`; if there are none it says so and offers the normal move form. A `room_report` item shows the note and a resolve button [`report-resolve`].

- [ ] **Step 1: Write the failing browser tests**

```ts
test('a manager records a sick day over a booking and reception reassigns it', async ({ page, browser }) => {
  const k = await seedBooking({ at: tomorrowAt('14:00'), customerName: 'คุณรอ' });
  await signIn(page, 'manager@spa.test'); await page.goto('/th/admin/therapists');
  await addTimeOff(page, { therapist: k.therapistName, from: tomorrowAt('09:00'), to: tomorrowAt('20:00'), kind: 'absence' });
  await expect(page.getByRole('alert')).toContainText(th.errors.CONFLICTS_WITH_BOOKINGS);
  await page.getByTestId('force-confirm').click();
  await expect(page.getByRole('status')).toContainText('1');
  const p2 = await (await browser.newContext()).newPage();
  await signIn(p2, 'reception@spa.test');
  const item = p2.getByTestId('attention-item').filter({ hasText: 'คุณรอ' });
  await expect(item).toHaveAttribute('data-kind', 'needs_reassignment');
  await item.click();
  await p2.getByTestId('reassign-option').first().click();
  await expect(p2.getByTestId('attention-item').filter({ hasText: 'คุณรอ' })).toHaveCount(0);
});
test('a forced room closure queues its bookings', async ({ page }) => { /* seedBooking R1 tomorrow; manager adds maintenance block on R1 → conflict → force-confirm → /th/today shows needs_reassignment for it */ });
test('a receptionist is not offered the force option', async ({ page }) => { /* reception cannot open /th/admin/therapists: forbidden page */ });
test('a room report reaches the desk and can be resolved', async ({ page }) => { /* reportViaApi as therapist; reception /th/today: attention room_report with the note; click report-resolve; item gone */ });
```

- [ ] **Step 2: Run** `npx playwright test exceptions`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx playwright test exceptions admin-staff admin-rooms` on both projects. Expected: pass.
- [ ] **Step 5: Commit** `feat(ops): absence, forced block and reassignment queue`.

---

### Task 9: Live updates

**Files:**
- Create: `src/lib/realtime.ts`, `src/modules/identity/components/LiveStatus.tsx`, `tests/e2e/live.spec.ts`
- Modify: `TodayBoard.tsx`, `RoomBoard.tsx`, `BookingCalendar.tsx` (mount the hook), `playwright.config.ts` (`webServer.env: { NEXT_PUBLIC_LIVE_POLL_MS: '3000' }`), `.env.example`, `messages/{th,en}.json`

**Interfaces:**
- Produces: `useLiveRefresh(tables: readonly string[]): 'live' | 'offline'` — subscribes to Postgres changes on those tables through the browser Supabase client; any event triggers one `router.refresh()` debounced by 300 ms; independently refreshes every `NEXT_PUBLIC_LIVE_POLL_MS` (default `60000`); returns `'offline'` while the channel is not subscribed or the browser reports offline. Event payloads are never rendered — they only trigger a refetch through the role-checked server actions. `LiveStatus` [`live-status`, `data-state`] shows the state in words and colour in the staff header.
- Tables: Today and Rooms listen to `bookings`, `room_turnovers`, `room_blocks`, `room_reports`, `therapist_time_off`; the calendar to `bookings`, `room_blocks`, `therapist_shifts`, `therapist_time_off`.

- [ ] **Step 1: Write the failing browser tests**

```ts
test('a booking made at one desk appears on another without a reload', async ({ page }) => {
  await signIn(page, 'manager@spa.test');
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-state', 'live');
  await seedBookingNow({ customerName: 'คุณสด' });
  await expect(page.getByTestId('arrival-row').filter({ hasText: 'คุณสด' })).toBeVisible({ timeout: 5000 });
});
test('room tiles follow a status change made elsewhere', async ({ page }) => { /* open /th/rooms; seedBookingNow R1 + setStatusAsReception to in_treatment; R1 tile data-status becomes occupied within 5 s */ });
test('offline is shown, and the screen catches up when the connection returns', async ({ page, context }) => {
  await signIn(page, 'manager@spa.test');
  await context.setOffline(true);
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-state', 'offline');
  await seedBookingNow({ customerName: 'คุณกลับ' });
  await context.setOffline(false);
  await expect(page.getByTestId('arrival-row').filter({ hasText: 'คุณกลับ' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('live-status')).toHaveAttribute('data-state', 'live');
});
```

- [ ] **Step 2: Run** `npx playwright test live`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx playwright test live today rooms` on both projects. Expected: pass.
- [ ] **Step 5: Commit** `feat(ops): live updates with offline indicator`.

---

### Task 10: Drag-and-drop on the day calendar

**Files:**
- Create: `src/modules/booking/drop.ts`, `src/modules/booking/drop.test.ts`, `tests/e2e/drag.spec.ts`
- Modify: `src/modules/booking/components/BookingCalendar.tsx`, `package.json` (`@dnd-kit/core`)

**Interfaces:**
- Produces:

```ts
export type Drop = { view: 'therapists' | 'rooms'; columnId: string; day: string; minutesFromMidnight: number };
export function moveFromDrop(row: BoardRow, drop: Drop, rooms: RoomOpt[]): MoveBookingInput;
export function isDraggable(row: BoardRow, role: Role): boolean;   // desk roles only; status requested, confirmed or checked_in
```

  `moveFromDrop`: start = `drop.day` at `minutesFromMidnight` rounded to the nearest 5, Bangkok time. Therapist view: `therapistId = columnId`, position unchanged. Room view: therapist unchanged; position unchanged if the booking is already in that room, otherwise the room's first active position by label. `expectedVersion = row.version`.
- Behaviour: dropping shows a bar with the old and new time, therapist and room and two buttons [`drop-confirm`], [`drop-undo`]; nothing is saved until confirmed. A refused move shows the translated error and the card returns to its place. The existing move form stays as the keyboard and touch path.

- [ ] **Step 1: Write the failing unit tests**

```ts
const rooms = [{ id: 'r1', code: 'R1', display_name: '', zone: null, room_positions: [{ id: 'p1', label: '1', active: true }] },
               { id: 'r2', code: 'R2', display_name: '', zone: null, room_positions: [{ id: 'p2b', label: '2', active: true }, { id: 'p2a', label: '1', active: false }] }];
const k = { ...blankRow, bookingId: 'k', version: 3, therapistId: 't1', roomId: 'r1', positionId: 'p1', status: 'confirmed' } as BoardRow;
test('dropping on a therapist column changes therapist and snaps to five minutes', () => {
  expect(moveFromDrop(k, { view: 'therapists', columnId: 't2', day: '2030-01-15', minutesFromMidnight: 843 }, rooms))
    .toEqual({ bookingId: 'k', start: '2030-01-15T07:05:00.000Z', therapistId: 't2', positionId: 'p1', expectedVersion: 3 });
});
test('dropping on another room picks its first active position; same room keeps the position', () => {
  expect(moveFromDrop(k, { view: 'rooms', columnId: 'r2', day: '2030-01-15', minutesFromMidnight: 600 }, rooms).positionId).toBe('p2b');
  expect(moveFromDrop(k, { view: 'rooms', columnId: 'r1', day: '2030-01-15', minutesFromMidnight: 600 }, rooms)).toMatchObject({ positionId: 'p1', therapistId: 't1' });
});
test('only desk roles drag, and only bookings that have not started', () => {
  expect(isDraggable(k, 'receptionist')).toBe(true);
  expect(isDraggable(k, 'therapist')).toBe(false);
  expect(isDraggable({ ...k, status: 'in_treatment' }, 'manager')).toBe(false);
});
```

- [ ] **Step 2: Write the failing browser tests** (`test.skip(({ isMobile }) => isMobile)` — touch dragging is covered by the move form)

```ts
test('dragging a card to another therapist moves it after confirmation', async ({ page }) => { /* seedBooking tomorrow 11:00; drag card onto the second therapist column; drop-confirm; card is inside that column after refresh */ });
test('undo leaves the booking untouched', async ({ page }) => { /* drag, drop-undo; data-start unchanged; version unchanged via service client */ });
test('a refused drop explains why and the card stays', async ({ page }) => { /* two bookings; drag one onto the other's therapist at the same time; drop-confirm; alert th.errors.THERAPIST_BUSY; card back in original column */ });
```

- [ ] **Step 3: Run** `npx vitest run src/modules/booking` and `npx playwright test drag --project=desktop`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** the unit tests and `npx playwright test drag booking`. Expected: pass.
- [ ] **Step 6: Commit** `feat(booking): drag-and-drop rescheduling`.

---

### Task 11: Week and month calendar

**Files:**
- Create: `src/modules/booking/month.ts`, `src/modules/booking/month.test.ts`, `src/modules/booking/components/{WeekView,MonthView}.tsx`, `tests/e2e/calendar-span.spec.ts`
- Modify: `src/modules/booking/actions.ts`, `src/modules/booking/schema.ts`, `src/app/[locale]/(staff)/calendar/page.tsx`, `BookingCalendar.tsx` (span switch), `messages/{th,en}.json`

**Interfaces:**
- Produces:
  - `monthGrid(month: string): string[][]` — `month` is `YYYY-MM`; rows are Monday-first weeks of `YYYY-MM-DD`, padded with the neighbouring months' days.
  - `getWeek(monday: string): Promise<{ ok: true; rows: BoardRow[] } | { ok: false; code: string }>` — `booking_board` over seven Bangkok days.
  - `getMonthCounts(month: string): Promise<{ ok: true; days: { day: string; bookings: number; bookedMinutes: number }[] } | { ok: false; code: string }>` — `booking_day_counts` over the grid's first to last day.
  - URL: `/calendar?span=day|week|month&day=YYYY-MM-DD` (`span` defaults to `day`; the existing `view` parameter is unchanged). Switch [`span-day`], [`span-week`], [`span-month`].
  - Week: seven day columns [`week-day`, `data-day`], each a time-ordered list of compact cards [`week-card`] with a therapist filter and a room filter built from the query. Month: a grid [`month-cell`, `data-day`] showing the booking count and booked hours; choosing a cell opens that day. Therapists see only their own bookings and counts.

- [ ] **Step 1: Write the failing unit test**

```ts
test('January 2030 is five Monday-first weeks from 31 Dec to 3 Feb', () => {
  const g = monthGrid('2030-01');
  expect(g).toHaveLength(5);
  expect(g[0]).toEqual(['2029-12-31','2030-01-01','2030-01-02','2030-01-03','2030-01-04','2030-01-05','2030-01-06']);
  expect(g[4][6]).toBe('2030-02-03');
});
test('a month starting on Monday has no leading padding', () => {
  expect(monthGrid('2030-04')[0][0]).toBe('2030-04-01');
});
```

- [ ] **Step 2: Write the failing browser tests**

```ts
test('week view lists a booking under its day', async ({ page }) => {
  const k = await seedBooking({ at: tomorrowAt('15:00'), customerName: 'คุณสัปดาห์' });
  await signIn(page, 'reception@spa.test'); await page.goto(`/th/calendar?span=week&day=${dayOf(k.at)}`);
  await expect(page.getByTestId('week-day')).toHaveCount(7);
  await expect(page.locator(`[data-testid=week-day][data-day="${dayOf(k.at)}"]`).getByTestId('week-card')).toContainText('คุณสัปดาห์');
});
test('month view counts the day and opens it', async ({ page }) => {
  const k = await seedBooking({ at: tomorrowAt('15:00') });
  await signIn(page, 'manager@spa.test'); await page.goto(`/th/calendar?span=month&day=${dayOf(k.at)}`);
  const cell = page.locator(`[data-testid=month-cell][data-day="${dayOf(k.at)}"]`);
  await expect(cell).toContainText('1');
  await cell.click();
  await expect(page).toHaveURL(new RegExp(`span=day.*day=${dayOf(k.at)}|day=${dayOf(k.at)}.*span=day`));
  await expect(page.getByTestId('booking-card')).toHaveCount(1);
});
test('a therapist sees only their own bookings in week and month', async ({ page }) => { /* one own + one other tomorrow; week-card count 1; month cell shows 1 */ });
```

- [ ] **Step 3: Run** `npx vitest run src/modules/booking` and `npx playwright test calendar-span`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** unit tests and `npx playwright test calendar-span booking` on both projects. Expected: pass.
- [ ] **Step 6: Commit** `feat(booking): week and month calendar`.

---

### Task 12: Message dispatcher, recovery screen and close-out

**Files:**
- Create: `src/modules/notifications/{templates.ts,templates.test.ts,dispatch.ts,dispatch.test.ts,outbox.ts,actions.ts}`, `src/modules/notifications/components/OutboxAdmin.tsx`, `src/app/[locale]/(staff)/admin/notifications/page.tsx`, `src/app/api/internal/dispatch/route.ts`, `tests/e2e/notifications.spec.ts`
- Modify: `src/lib/supabase/admin.test.ts` (allow `src/modules/notifications/outbox.ts` as the second importer of `admin.ts`), `src/app/[locale]/(staff)/layout.tsx` (nav entry, owner and manager), `.env.example` (`NOTIFY_SENDER_NAME`, `CRON_SECRET`), `messages/{th,en}.json`, `docs/architecture.md`

**Interfaces:**
- Produces:

```ts
// templates.ts
export type TemplateKey = 'booking_confirmed' | 'booking_changed' | 'booking_cancelled';
export function renderTemplate(key: TemplateKey, payload: { starts_at: string }, locale: 'th' | 'en', senderName: string): string;
// dispatch.ts
export type OutboxRow = { id: string; customer_id: string; template: TemplateKey; payload: { booking_id: string; starts_at: string } };
export interface OutboxPort {
  claim(limit: number): Promise<OutboxRow[]>;
  contact(customerId: string): Promise<{ phone: string | null; email: string | null }>;
  complete(id: string, ok: boolean, error?: string): Promise<void>;
}
export interface Sender { send(m: { channel: 'sms' | 'email'; to: string; text: string }): Promise<void> }
export function dispatchPending(port: OutboxPort, sender: Sender, opts: { senderName: string; limit?: number }): Promise<{ sent: number; failed: number }>;
// outbox.ts — the only notifications file that imports the service-key client
export function supabaseOutbox(): OutboxPort;
export const logSender: Sender;      // writes one structured log line; the recipient is masked to its last 2 characters
```

  - Exact Thai texts (English mirrors them): confirmed `{sender}: ยืนยันนัดหมายของคุณ วันที่ {date} เวลา {time} น.`; changed `{sender}: นัดหมายของคุณเปลี่ยนเป็นวันที่ {date} เวลา {time} น.`; cancelled `{sender}: นัดหมายวันที่ {date} เวลา {time} น. ถูกยกเลิกแล้ว`. `{date}` is `DD/MM/YYYY` and `{time}` is `HH:mm`, both in Bangkok time.
  - `dispatchPending`: for each claimed row — phone present → `sms`, else email → `email`, else `complete(id, false, 'NO_CONTACT')`; a `send` that throws → `complete(id, false, <message>)`; otherwise `complete(id, true)`. One failing row never stops the rest. Messages are sent in Thai.
  - `POST /api/internal/dispatch` — requires header `authorization: Bearer <CRON_SECRET>` (otherwise `401`, and `503` when `CRON_SECRET` is unset); runs `dispatchPending(supabaseOutbox(), logSender, …)` and returns `{ sent, failed }`.
  - `listOutbox(filter?: 'pending' | 'failed' | 'dead' | 'sent')`, `retryNotification(id)` — owner, manager. The page [`outbox-row`, `data-status`] shows template, booking time, status, attempts, last error and next attempt, with retry [`outbox-retry`] on failed and dead rows. It shows no phone, email or customer name.
  - No real provider is wired. A real `Sender` (SMS, LINE, email) is a later, owner-approved step; it only has to implement `Sender`.

- [ ] **Step 1: Write the failing unit tests**

```ts
test('the confirmed text is exact, in Bangkok time, and says nothing about the visit', () => {
  const s = renderTemplate('booking_confirmed', { starts_at: '2030-01-15T03:00:00Z' }, 'th', 'Studio');
  expect(s).toBe('Studio: ยืนยันนัดหมายของคุณ วันที่ 15/01/2030 เวลา 10:00 น.');
  for (const k of ['booking_confirmed', 'booking_changed', 'booking_cancelled'] as const)
    for (const l of ['th', 'en'] as const)
      expect(renderTemplate(k, { starts_at: '2030-01-15T03:00:00Z' }, l, 'Studio')).not.toMatch(/นวด|สปา|massage|spa|therap/i);
});
test('one bad message does not stop the others, and each outcome is recorded', async () => {
  const done: [string, boolean, string?][] = [];
  const port: OutboxPort = {
    claim: async () => [row('a', 'c1'), row('b', 'c2'), row('c', 'c3')],
    contact: async (id) => ({ c1: { phone: '0810000000', email: null }, c2: { phone: null, email: null }, c3: { phone: null, email: 'x@y.z' } }[id]!),
    complete: async (id, ok, error) => { done.push([id, ok, error]); },
  };
  const sent: string[] = [];
  const sender: Sender = { send: async (m) => { if (m.channel === 'email') throw new Error('smtp down'); sent.push(m.channel + ':' + m.to); } };
  expect(await dispatchPending(port, sender, { senderName: 'Studio' })).toEqual({ sent: 1, failed: 2 });
  expect(sent).toEqual(['sms:0810000000']);
  expect(done).toEqual([['a', true, undefined], ['b', false, 'NO_CONTACT'], ['c', false, 'smtp down']]);
});
```

- [ ] **Step 2: Write the failing browser tests**

```ts
test('the dispatch endpoint refuses callers without the secret', async ({ request }) => {
  expect((await request.post('/api/internal/dispatch')).status()).toBe(401);
});
test('a consented booking is sent once and shown as sent', async ({ page, request }) => {
  await seedBookingNow({ customerName: 'คุณแจ้ง', consent: true });
  const r = await request.post('/api/internal/dispatch', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(await r.json()).toEqual({ sent: 1, failed: 0 });
  expect(await (await request.post('/api/internal/dispatch', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).json()).toEqual({ sent: 0, failed: 0 });
  await signIn(page, 'manager@spa.test'); await page.goto('/th/admin/notifications');
  await expect(page.getByTestId('outbox-row')).toHaveAttribute('data-status', 'sent');
  await expect(page.getByText('คุณแจ้ง')).toHaveCount(0);
});
test('a dead message can be retried by a manager; reception cannot open the page', async ({ page }) => { /* mark the row dead with the service client; manager clicks outbox-retry → data-status pending; reception → forbidden */ });
```

- [ ] **Step 3: Run** `npx vitest run src/modules/notifications src/lib` and `npx playwright test notifications`. Expected: FAIL.
- [ ] **Step 4: Implement.** `playwright.config.ts` sets `process.env.CRON_SECRET ??= 'local-dev-only'` for the test process and passes it and `NOTIFY_SENDER_NAME: 'Studio'` to the dev server. Every spec in this plan calls `resetTestData()` in `beforeEach`.
- [ ] **Step 5: Run everything:** `npm run test:db && npx vitest run src && npx playwright test && npm run build && npm run lint`. Expected: all pass on both Playwright projects. Paste the real summary lines into `docs/architecture.md`.
- [ ] **Step 6: Record in `docs/architecture.md`:** the room-status precedence table; the start-of-treatment rules; the turnover lifecycle; the outbox state diagram and back-off table; the new tables in the ERD and permission matrix; and acceptance evidence for the spec section 18 criteria this plan completes — "Employees can check customers in and update treatment progress", "Treatment completion correctly updates the room turnover workflow", "Room readiness updates the operational dashboard" — each mapped to its test. Remove the Plan 1 "known limitation" note. List what remains for Plans 3–4, and that reminders before an appointment and a real message provider are not built.
- [ ] **Step 7: Commit** `feat(notifications): dispatcher and recovery screen; docs: plan 2 evidence`.
