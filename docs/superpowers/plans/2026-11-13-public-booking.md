# Public Booking Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, Thai-first page where anyone can see the public therapists and book themselves instantly after signing in with LINE.

**Architecture:** New `/[locale]/book` pages and `/api/line/*` routes sit beside the staff app. All public reads and writes go through new `service_role`-only database functions that reuse the existing availability and booking rules (refactored into private cores). Guests are verified by LINE Login; confirmations go out through the existing notification outbox with a new `line` channel.

**Tech Stack:** Next.js 16 (App Router, read `node_modules/next/dist/docs/` first, per AGENTS.md), Supabase/Postgres, next-intl, Vitest (unit + `tests/db`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-13-public-booking-design.md`. Read it before starting; it also records the owner's answers.

## Global Constraints

- Thai first, English second; all copy goes in `messages/th.json` and `messages/en.json`.
- Times are Asia/Bangkok everywhere a guest sees one.
- `available_candidates` and `create_booking` stay staff-only. No existing function is loosened. Public functions are executable by `service_role` only (revoke from `public`, `anon`, `authenticated`).
- Online guests are always a **new customer record**, never merged with an existing customer. A guest never needs a phone number.
- Defaults stored as settings: 2 upcoming online bookings per guest; bookable from 2 hours to 30 days ahead; cancel up to 4 hours before start. A setting `online.enabled` (default false) and all LINE keys being present are both required before `/book` is open.
- A therapist's photo and profile are public only while `therapists.public` is true; only the fields named in the spec are exposed. Prices of online-bookable services are shown.
- Staff-side bookings made online use a new `online` value of `booking_source`.
- This folder is not a git repository. Steps that say "Checkpoint" mean: run the stated tests and confirm they pass. If the owner runs `git init`, commit at each checkpoint.
- Database tests need the local throwaway Postgres: `npm run test:db`. Never run migrations or tests against the owner's hosted project.

## Review Focus

1. **Forged or expired LINE `state`/session on return from LINE:** the guest lands back on the therapist page with a clear message and their service and time still selected; no booking, no 500.
2. **Two guests confirm the same slot at once:** the second sees "that time was just taken, please choose another" with choices kept; exactly one booking exists.
3. **Guest has blocked the Official Account (message push fails):** the booking stands, the outbox row ends `dead`, and the confirmation page still shows the cancel link.
4. **Therapist un-switched from public, service switched off, or `online.enabled` turned off between page load and confirm:** friendly "no longer available" error, no booking created.
5. **Double submit and cancel edge cases:** the same idempotency key yields one booking; cancelling twice, after the cutoff, or with a tampered token is refused with no change.

---

### Task 1: Settings, public profile fields and online flags (database)

**Files:**
- Create: `supabase/migrations/0023_public_profile_catalog.sql`
- Test: `tests/db/public-catalog.test.ts`

**Interfaces:**
- Produces: columns `therapists.public boolean not null default false`, `therapists.bio_th text`, `therapists.bio_en text`, `therapists.specialties text[] not null default '{}'`, `services.bookable_online boolean not null default false`. Settings (added to `private.setting_spec`, kinds follow the existing `int`/`bool` kinds): `online.enabled` bool default `false`, `online.max_upcoming` int 1–10 default 2, `online.min_lead_min` int 0–1440 default 120, `online.max_ahead_days` int 1–365 default 30, `online.cancel_cutoff_min` int 0–1440 default 240.

- [ ] **Step 1: Write failing tests** in `tests/db/public-catalog.test.ts`: `test('new therapists are not public and new services are not bookable online')`; `test('online settings have the stated defaults')` asserting `get_settings()` returns 2, 120, 30, 240 and `online.enabled` false; `test('only owner and manager can change online settings')` using `set_setting` as receptionist (rejected) and manager (accepted); `test('receptionist cannot set therapists.public')`.
- [ ] **Step 2: Run** `npx vitest run tests/db/public-catalog.test.ts` (via `npm run test:db`). Expected: FAIL (columns missing).
- [ ] **Step 3: Write the migration.** Follow the style of `0013_settings.sql` for the spec rows and `0022_therapist_photos.sql` for column additions; existing update policies already restrict therapist and service writes to owner and manager.
- [ ] **Step 4: Run** `npm run test:db`. Expected: new tests and all existing DB tests PASS.
- [ ] **Step 5: Checkpoint.**

### Task 2: Admin screens for public profile, online services and settings

**Files:**
- Modify: `src/modules/therapists/schema.ts`, `src/modules/therapists/actions.ts`, `src/modules/therapists/components/TherapistsAdmin.tsx`, `src/modules/catalog/schema.ts`, `src/modules/catalog/actions.ts`, the services admin component under `src/modules/catalog/components/`, `src/app/[locale]/(staff)/admin/settings/page.tsx` and its component, `messages/th.json`, `messages/en.json`
- Test: `src/modules/therapists/schema.test.ts` (create), `tests/e2e/admin-public.spec.ts` (create)

**Interfaces:**
- Consumes: Task 1 columns and settings.
- Produces: therapist input gains `public: boolean`, `bioTh?: string` (≤500 chars), `bioEn?: string` (≤500 chars), `specialties: string[]` (≤6 tags, each ≤24 chars, trimmed, non-empty); service input gains `bookableOnline: boolean`; the settings screen lists the five `online.*` settings.

- [ ] **Step 1: Write failing tests:** `schema.test.ts` with `test('specialties: trims, drops empties, caps at 6 tags of 24 chars')` and `test('bio over 500 characters is rejected')`.
- [ ] **Step 2: Run** `npx vitest run src/modules/therapists/schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Extend the schemas and the two save actions** to read and write the new fields. In `TherapistsAdmin.tsx`, add the public switch with this exact helper text next to it (Thai and English): "When on, this therapist's photo, nickname, bio and specialties are visible to anyone on the public booking page." Add a "Bookable online" switch to the service form and the five settings to the settings screen, reusing the existing patterns.
- [ ] **Step 4: Write the Playwright spec** `tests/e2e/admin-public.spec.ts`: as manager, turn a therapist public with a bio and two tags, turn a service bookable online, reload, and see both persisted. Run `npx playwright test tests/e2e/admin-public.spec.ts`. Expected: PASS.
- [ ] **Step 5: Checkpoint:** `npm test` and the spec above pass.

### Task 3: Public read functions, reusing the existing availability rules (database)

**Files:**
- Create: `supabase/migrations/0024_public_reads.sql`
- Test: `tests/db/public-reads.test.ts`

**Interfaces:**
- Consumes: Task 1 columns and settings.
- Produces (all `security definer`, executable by `service_role` only):
  - `private.available_candidates_core(p_service_id uuid, p_start timestamptz, p_exclude_booking uuid default null)` with the exact body of today's `available_candidates` minus the `require_role` call; `available_candidates` is redefined as `require_role(...)` then `return query select * from private.available_candidates_core(...)`. Existing behaviour is unchanged.
  - `public_therapists() returns table (id uuid, display_name text, bio_th text, bio_en text, specialties text[], has_photo boolean)` listing only active therapists with `public = true`, ordered by `sort_order`.
  - `public_therapist_services(p_therapist_id uuid) returns table (service_id uuid, name_th text, name_en text, duration_min int, price_satang int)`: only active services with `bookable_online` that the therapist offers; empty for a non-public therapist.
  - `public_free_times(p_therapist_id uuid, p_service_id uuid, p_day date) returns table (starts_at timestamptz)`: every 30-minute start inside that therapist's shifts on that Bangkok day for which the core returns a row for this therapist, that is not earlier than `now() + online.min_lead_min` and not later than `now() + online.max_ahead_days`. Empty unless `online.enabled`, the therapist is public, and the service is bookable online and offered by them.
  - `public_therapist_photo_path(p_therapist_id uuid) returns text`: `photo_path` only when the therapist is public, else null.

- [ ] **Step 1: Write failing tests** in `tests/db/public-reads.test.ts`: `test('available_candidates still refuses a receptionist-less caller and still returns the same rows')` (regression against the refactor, same assertions as `tests/db/booking-create.test.ts`); `test('public_therapists lists only public, active therapists and no staff fields')` asserting the exact column list; `test('public_therapist_services hides services that are not bookable online or not offered')`; `test('public_free_times excludes busy, off-shift, time-off, blocked-room and inside-lead-time starts')`; `test('public_free_times is empty when online.enabled is false')`; `test('public_therapist_photo_path is null once the therapist is switched off')`; `test('anon and authenticated cannot execute any public_ function')` (each call fails with permission denied).
- [ ] **Step 2: Run** `npm run test:db`. Expected: new tests FAIL.
- [ ] **Step 3: Write the migration.** Do the refactor first, then add the functions. Use the existing `tests/db/helpers.ts` base data for shifts.
- [ ] **Step 4: Run** `npm run test:db`. Expected: all PASS, including every pre-existing booking test.
- [ ] **Step 5: Checkpoint.**

### Task 4: Guest identity, online booking and guest cancel (database)

**Files:**
- Create: `supabase/migrations/0025_public_booking.sql`
- Test: `tests/db/public-booking.test.ts`

**Interfaces:**
- Consumes: Task 3 cores and settings.
- Produces: `customers.line_user_id text unique`; `booking_source` gains `'online'`; `private.create_booking_core(...)` holding the body of today's `create_booking` minus the role check (`create_booking` becomes role check plus core; behaviour unchanged); `booking_events` gains nullable `actor text` (set to `'guest_online'` for guest actions). Service-role-only functions:
  - `public_book(p_line_user_id text, p_line_name text, p_therapist_id uuid, p_service_id uuid, p_start timestamptz, p_idempotency_key text) returns table (booking_id uuid, starts_at timestamptz)`. Errors raised by code: `ONLINE_CLOSED` (setting off, service not bookable, therapist not public), `OUT_OF_WINDOW`, `TOO_MANY_BOOKINGS`, and the existing `THERAPIST_BUSY`, `POSITION_TAKEN`, `ROOM_OTHER_PARTY`, `THERAPIST_OFF_SHIFT`. Finds or creates the customer by `line_user_id` (display name from `p_line_name`, `comms_consent` true with `consent_recorded_at` now, a call recorded in the spec's review list); picks the first candidate position for that therapist from the core; creates the booking as `confirmed` with source `online`.
  - `public_cancel(p_booking_id uuid) returns void`: only a `confirmed` online booking, only before `online.cancel_cutoff_min` minutes ahead of start; writes a `status_changed` event with `actor = 'guest_online'` so the existing outbox trigger queues `booking_cancelled`. Errors: `CANCEL_TOO_LATE`, `INVALID_TRANSITION`.
  - `public_booking_view(p_booking_id uuid) returns table (starts_at timestamptz, ends_at timestamptz, status booking_status, service_name_th text, service_name_en text, therapist_name text)`: the minimum the confirmation page needs.

- [ ] **Step 1: Write failing tests** in `tests/db/public-booking.test.ts`: `test('a guest books and the booking is confirmed with source online')`; `test('the same idempotency key returns the same booking')`; `test('a third upcoming booking is refused TOO_MANY_BOOKINGS')`; `test('two guests racing for one slot: exactly one succeeds, the other gets THERAPIST_BUSY')` (use `Promise.all`, as `booking-concurrency.test.ts` does); `test('booking is refused when online.enabled is false, the service is not bookable, or the therapist is not public')`; `test('a guest never attaches to an existing customer, even with the same name')`; `test('cancel works before the cutoff and frees the slot')`; `test('cancel after the cutoff, twice, or on a non-online booking is refused')`; `test('cancelling queues exactly one booking_cancelled notification')`; `test('public_ functions are not executable by anon or authenticated')`.
- [ ] **Step 2: Run** `npm run test:db`. Expected: FAIL.
- [ ] **Step 3: Write the migration**, refactor first. Re-run the entire existing DB suite to prove the refactor is invisible.
- [ ] **Step 4: Run** `npm run test:db`. Expected: all PASS.
- [ ] **Step 5: Checkpoint.**

### Task 5: LINE client, environment and signed tokens

**Files:**
- Create: `src/lib/line.ts`, `src/modules/public/session.ts`, `src/modules/public/rateLimit.ts`, `supabase/migrations/0026_public_rate_limit.sql`, `tests/db/public-rate-limit.test.ts`
- Modify: `src/lib/env.ts`, `.env.example`
- Test: `src/lib/line.test.ts`, `src/modules/public/session.test.ts`, `src/lib/env.test.ts` (extend)

**Interfaces:**
- Produces in `env.ts`: `Env` gains `line: { loginChannelId: string; loginChannelSecret: string; messagingToken: string; publicBaseUrl: string; tokenSecret: string } | null` (non-null only when all five variables `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`, `LINE_MESSAGING_TOKEN`, `PUBLIC_BASE_URL`, `PUBLIC_TOKEN_SECRET` are set; `PUBLIC_TOKEN_SECRET` at least 32 characters when set; `LINE_API_BASE` optional override for tests). Partial configuration is a startup error naming the missing variables.
- Produces in `line.ts`: `buildLoginUrl(args: { state: string; nonce: string; redirectUri: string }): string` (scope `profile openid`, `bot_prompt=aggressive`); `exchangeCode(code: string, redirectUri: string): Promise<{ lineUserId: string; name: string }>` (calls the token endpoint, then verifies the ID token and nonce; throws `LINE_AUTH_FAILED`); `pushLine(lineUserId: string, text: string): Promise<void>` (throws on non-2xx); `lineSender: Sender`.
- Produces in `session.ts`: `signSession(payload: { lineUserId: string; name: string }, ttlSec: number): string`, `verifySession(token: string): { lineUserId: string; name: string } | null`, `signCancelToken(bookingId: string, ttlSec: number): string`, `verifyCancelToken(token: string): string | null` (returns the booking id). HMAC-SHA256 with `tokenSecret`, constant-time compare, expiry checked.
- Produces in `rateLimit.ts`: `allow(key: string, max: number, windowSec: number): Promise<boolean>` backed by a small `public_rate_hits` table and a `service_role`-only `public_rate_hit(p_key text, p_window_sec int, p_max int) returns boolean` function, both in the new migration `supabase/migrations/0026_public_rate_limit.sql` (test it in `tests/db/public-rate-limit.test.ts`: `test('the max+1th hit inside the window is refused, and the window resets')`).

- [ ] **Step 1: Write failing tests:** `line.test.ts` with `fetch` mocked: `test('login URL carries state, nonce, scope and bot_prompt')`, `test('exchangeCode rejects a wrong nonce')`, `test('pushLine throws when LINE answers 403')`; `session.test.ts`: `test('a tampered session is rejected')`, `test('an expired session is rejected')`, `test('a cancel token for booking A does not verify as booking B')`; `env.test.ts`: `test('partial LINE configuration is an error naming the missing variables')`.
- [ ] **Step 2: Run** `npx vitest run src/lib/line.test.ts src/modules/public src/lib/env.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** per the signatures above, using Node `crypto` only.
- [ ] **Step 4: Run the same command.** Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 6: LINE channel in the notification outbox

**Files:**
- Modify: `src/modules/notifications/dispatch.ts`, `src/modules/notifications/outbox.ts`, `src/modules/notifications/templates.ts`, the route `src/app/api/internal/dispatch/route.ts`
- Test: `src/modules/notifications/dispatch.test.ts`, `src/modules/notifications/templates.test.ts` (extend both)

**Interfaces:**
- Consumes: Task 5 `lineSender`, `signCancelToken`; Task 4 `customers.line_user_id`.
- Produces: `Sender.send` accepts `channel: 'sms' | 'email' | 'line'`; `OutboxPort.contact` returns `{ phone, email, lineUserId }`; dispatch prefers `line` when `lineUserId` is present, then sms, then email; `renderTemplate(key, payload, locale, senderName, opts?: { cancelUrl?: string })` appends the cancel link to `booking_confirmed` only when given. The dispatch route builds `cancelUrl = {publicBaseUrl}/{locale}/book/cancel?token=…` for bookings with source `online`, and uses `lineSender` when LINE is configured, otherwise `logSender`.

- [ ] **Step 1: Write failing tests:** `test('a customer with a LINE id is sent on the line channel')`; `test('a customer with only a phone is still sent by sms')` (regression); `test('the confirmed message for an online booking contains the cancel link, other messages do not')`; `test('a failing LINE push marks the row failed and it ends dead after five attempts')`.
- [ ] **Step 2: Run** `npx vitest run src/modules/notifications`. Expected: FAIL.
- [ ] **Step 3: Implement** the interface changes.
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 7: Public server logic and routes

**Files:**
- Create: `src/modules/public/actions.ts`, `src/app/api/line/login/route.ts`, `src/app/api/line/callback/route.ts`, `src/app/api/public/therapists/[id]/photo/route.ts`
- Modify: `src/proxy.ts` only if the matcher or CSP blocks the new routes (it should not)
- Test: `src/modules/public/actions.test.ts`, `src/app/api/public/photo.test.ts`

**Interfaces:**
- Consumes: Task 3 and 4 functions (called with `createAdminClient()` from `src/lib/supabase/admin.ts`, the only way the public path touches the database), Task 5 helpers.
- Produces: `listTherapists(): Promise<PublicTherapist[]>`; `getTherapistWithServices(id: string)`; `getFreeTimes(input: { therapistId: string; serviceId: string; day: string }): Promise<string[]>`; `bookOnline(input: { therapistId: string; serviceId: string; start: string; idempotencyKey: string }): Promise<{ ok: true; bookingId: string; cancelToken: string } | { ok: false; code: string }>` (reads the guest from the session cookie; code `NOT_SIGNED_IN` if none); `cancelOnline(token: string): Promise<{ ok: true } | { ok: false; code: string }>`; `getBookingView(token: string)`. Login route: stores a random `state` and `nonce` in a short-lived cookie together with the guest's return path and selection, redirects to `buildLoginUrl`; callback route: checks `state`, calls `exchangeCode`, sets the session cookie, redirects back to the stored path. The photo route streams the private object using the admin client only when `public_therapist_photo_path` returns a path, with `Cache-Control: public, max-age=300`; it returns 404 otherwise (no CSP change needed, the image is same-origin). Public reads and the login route are rate limited with `allow`.

- [ ] **Step 1: Write failing tests** (mock the admin client): `test('bookOnline without a session returns NOT_SIGNED_IN')`; `test('bookOnline maps THERAPIST_BUSY to a code the page can show')`; `test('callback with a wrong state redirects back with an error and sets no session')`; `test('callback with an expired state does the same')`; `test('cancelOnline with a tampered token changes nothing')`; `test('photo route returns 404 when the database returns no path')`.
- [ ] **Step 2: Run** `npx vitest run src/modules/public src/app/api/public`. Expected: FAIL.
- [ ] **Step 3: Implement** per the signatures. Use `src/lib/action.ts` result conventions where they fit.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 8: The public pages

**Files:**
- Create: `src/app/[locale]/book/page.tsx` (team wall), `src/app/[locale]/book/[therapistId]/page.tsx` (profile, service, date, time, confirm), `src/app/[locale]/book/done/page.tsx` (confirmation with cancel link), `src/app/[locale]/book/cancel/page.tsx`, components under `src/modules/public/components/`, public layout `src/app/[locale]/book/layout.tsx` (no staff chrome), messages in both languages
- Test: `tests/e2e/public-booking.spec.ts`, `tests/e2e/line-stub.ts`

**Interfaces:**
- Consumes: Task 7 actions and routes.
- Produces: the pages as in the approved wireframe A (a grid of therapist photos; tapping one opens the profile). Style follows the existing BANYAN look, mobile first, using `Avatar` and tokens from `src/components/ui/`. Every page shows "Booking is not open yet" when `online.enabled` is false or LINE is not configured. Dates and times are labelled Bangkok time. A slot taken between load and confirm shows "That time was just taken, please choose another", keeps the choices and reloads the free times. `line-stub.ts` is a tiny local server implementing the LINE token, profile and push endpoints, started by the Playwright config with `LINE_API_BASE` pointing at it.

- [ ] **Step 1: Write the failing Playwright spec** `tests/e2e/public-booking.spec.ts`: `test('a guest opens /book, sees only public therapists with photos, books via the stubbed LINE login, and sees the confirmation with a cancel link')`; `test('the booking appears on the staff schedule as online')`; `test('cancelling from the link frees the slot')`; `test('/book says not open when online.enabled is off')`; `test('a slot taken by someone else shows the taken message and keeps the choices')`; `test('a therapist switched off after the page loaded gives a friendly error and no booking')`; `test('the page works at 375px width with no horizontal scroll')`.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/public-booking.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Build the pages and components.** Copy from the guest's session cookie only a display name; never render anything from the staff tables. Add accessibility basics (labels, focus order); run the existing `tests/e2e/a11y.spec.ts` approach on `/book`.
- [ ] **Step 4: Run** the spec again plus `npx playwright test tests/e2e/a11y.spec.ts`. Expected: PASS.
- [ ] **Step 5: Checkpoint.**

### Task 9: Isolation proof and go-live checklist

**Files:**
- Create: `tests/db/public-isolation.test.ts`, `docs/public-booking.md`
- Modify: `docs/security-report.md` (replace the "No customer self-service portal" limitation with what now exists and what remains)
- Test: the new test file

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write failing tests** in `tests/db/public-isolation.test.ts`: `test('no public_ function returns a column that is not on the documented list')` (compare each function's result columns against an explicit allow-list); `test('anon and authenticated cannot read customers, bookings, payments, rooms or notification_outbox')` (regression for existing row-level security with a LINE-created customer present); `test('every function whose name starts with public_ is security definer, service_role only, with a pinned search_path')` (query `pg_proc` and `information_schema.routine_privileges`).
- [ ] **Step 2: Run** `npm run test:db`. Expected: FAIL until the allow-lists are written.
- [ ] **Step 3: Write `docs/public-booking.md`:** how the owner creates the LINE Official Account, Login channel and Messaging API channel, the five environment variables, where to set `online.enabled`, and the message-cost warning. Update the security report.
- [ ] **Step 4: Run** `npm run test:db`, `npm test` and `npx playwright test`. Expected: everything PASS.
- [ ] **Step 5: Checkpoint.** The feature stays closed (`online.enabled` false) until the owner sets the keys and turns it on.
