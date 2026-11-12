# Therapist photos and a "now" strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let owner and manager give each therapist a private photo, and show on the Therapists admin page who is on shift now and in which room.

**Architecture:** One migration adds `therapists.photo_path` and a private Storage bucket with owner/manager-only policies. The browser resizes any chosen image to a ~256 px JPEG; a server action validates and stores it and the page renders short-lived signed URLs. The "now" strip uses one pure function extracted from `buildToday`, so Today and the Therapists page cannot disagree.

**Tech Stack:** Next.js 16 App Router, next-intl, Supabase (Postgres, Storage, RLS), Vitest, Playwright, existing `src/components/ui` primitives.

**Spec:** `docs/superpowers/specs/2026-11-12-therapist-photos-design.md`

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (AGENTS.md).
- Test ids, roles and aria-labels already in the repo stay on the same elements; message keys unchanged, new copy in both `th` and `en` with the parity test green.
- `<select>` stays native; use existing primitives (Card, Badge, Button, Field, Alert); no new UI library.
- Bucket `therapist-photos` is private; no public URL; only owner and manager can read, upload, replace or remove.
- Photos appear only on the Therapists admin page (owner/manager). Never on Today, Schedule or the Shared screen.
- Original file size is unlimited for the person; the browser always resizes to at most 256 px on the long side and re-encodes as JPEG. Server accepts only `image/jpeg` or `image/png`, at most 512 KB.
- `img-src` gains the Supabase origin and nothing else widens.
- Local checks: `npx tsc --noEmit`, `npx eslint`, `npx vitest run src`, `npx next build`. `tests/db` and Playwright run in CI (they need the local Supabase stack).
- End commits with the repo's Co-Authored-By and Claude-Session lines.

## Review Focus

- A file the browser cannot decode (some HEIC): the page shows a Thai/English message, uploads nothing. (Task 4)
- A direct call with a 0-byte file, a 513 KB file, or `image/gif`: action returns `INVALID_INPUT`, nothing is written to Storage or `photo_path`. (Task 3)
- Replacing a photo: the new upload has a new object name, `photo_path` changes, the old object is deleted, and a stale cached URL cannot show the old face. (Task 3)
- Nobody on shift, or a therapist on shift with no bookings: the strip shows an empty state or "free", not a crash. (Task 2, Task 5)
- Receptionist or therapist role listing, reading or writing the bucket, or writing `photo_path`: denied. They can still read the `photo_path` file name (an unguessable `<id>-<timestamp>.jpg`), never the photo. (Task 1)

---

### Task 1: Migration, bucket and policies

**Files:**
- Create: `supabase/migrations/0022_therapist_photos.sql`
- Test: `tests/db/therapist-photos.test.ts`

**Interfaces:**
- Produces: column `therapists.photo_path text null`; private bucket id `therapist-photos`; storage policies limiting select/insert/update/delete on `storage.objects` for that bucket to `private.current_role() in ('owner','manager')`.

- [ ] **Step 1: Write the failing DB tests** in `tests/db/therapist-photos.test.ts` (style of `tests/db/rooms.test.ts`, using `asRole`, `asAdmin`, `resetDb`):
  - `owner and manager can set a therapist photo_path` (update returns rowCount 1).
  - `receptionist and therapist cannot change photo_path` (rowCount 0).
  - `owner and manager can insert, read and delete an object in therapist-photos`.
  - `receptionist and therapist cannot read or insert objects in therapist-photos` (select returns 0 rows, insert is rejected).
  - `the bucket is private` (`select public from storage.buckets where id='therapist-photos'` is false).
- [ ] **Step 2: Run** `npx vitest run tests/db/therapist-photos.test.ts` (CI or local stack). Expected: FAIL (column and bucket missing).
- [ ] **Step 3: Write the migration:** `alter table therapists add column photo_path text`; `insert into storage.buckets (id, name, public) values ('therapist-photos','therapist-photos', false) on conflict do nothing`; four policies on `storage.objects` for `bucket_id = 'therapist-photos'` using `private.current_role() in ('owner','manager')`. Existing `therapists` RLS and audit trigger already cover the new column; confirm the update policy is owner/manager only.
- [ ] **Step 4: Run the tests again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: private bucket and photo_path for therapist photos`.

### Task 2: Shared "on shift now" function

**Files:**
- Create: `src/modules/operations/onShift.ts`, `src/modules/operations/onShift.test.ts`
- Modify: `src/modules/operations/today.ts` (use the new function; `TodayModel.therapists` entries gain `roomId`), `src/modules/operations/today.test.ts` (existing therapist expectations gain `roomId`)

**Interfaces:**
- Consumes: `Span` from `today.ts`, `BoardRow` from `@/modules/booking/actions`.
- Produces: `export type NowState = 'in_treatment' | 'on_break' | 'free'`; `export function therapistsNow(input: { now: string; shifts: Span[]; timeOff: Span[]; rows: BoardRow[] }): { therapistId: string; state: NowState; roomId: string | null }[]` — sorted by therapist id like today's code; `roomId` is the room of that therapist's in-treatment booking, otherwise `null`.

- [ ] **Step 1: Write failing tests** in `onShift.test.ts`: `a therapist with an in-treatment booking is in_treatment with that room`; `on a break (time off covering now) is on_break with no room`; `on shift with nothing else is free`; `a shift that has ended or not started is not listed`; `nobody on shift returns an empty array`.
- [ ] **Step 2: Run** `npx vitest run src/modules/operations/onShift.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `therapistsNow` by moving the on-shift/state logic out of `buildToday` unchanged, adding `roomId`; make `buildToday` call it.
- [ ] **Step 4: Run** `npx vitest run src/modules/operations`. Expected: all PASS, including the updated `today.test.ts`.
- [ ] **Step 5: Commit** `refactor: extract therapistsNow so Today and Therapists share one rule`.

### Task 3: Photo rules and server actions

**Files:**
- Create: `src/modules/therapists/photo.ts`, `src/modules/therapists/photo.test.ts`
- Modify: `src/modules/therapists/actions.ts`

**Interfaces:**
- Produces in `photo.ts`: `export const PHOTO_MAX_BYTES = 512 * 1024`; `export function checkPhoto(file: { type: string; size: number }): 'ok' | 'INVALID_INPUT'` (only `image/jpeg`/`image/png`, `0 < size <= PHOTO_MAX_BYTES`); `export function photoObjectName(therapistId: string, stamp: number): string` returning `<therapistId>-<stamp>.jpg`.
- Produces in `actions.ts`: `export async function uploadTherapistPhoto(form: FormData): Promise<ActionResult>` (fields `therapistId`, `file`); `export async function removeTherapistPhoto(therapistId: string): Promise<ActionResult>`; `export async function photoUrls(paths: string[]): Promise<Record<string, string>>` returning signed URLs valid 3600 s keyed by path.
- Consumes: `roleOrNull('owner','manager')`, `fail`, `done`, `failFrom` as the other actions do.

- [ ] **Step 1: Write failing tests** in `photo.test.ts`: `accepts jpeg and png under the limit`; `rejects gif`; `rejects 0 bytes`; `rejects 512 KB + 1`; `accepts exactly 512 KB`; `object names differ for two stamps of the same therapist`.
- [ ] **Step 2: Run** `npx vitest run src/modules/therapists/photo.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `photo.ts`** (pure functions).
- [ ] **Step 4: Implement the actions.** `uploadTherapistPhoto`: role check (`NOT_AUTHORIZED`), parse the form, `checkPhoto`, confirm the therapist exists, upload to bucket under a new object name, update `photo_path`, then delete the previous object (a failed delete is logged via `@/lib/log`, not surfaced). `removeTherapistPhoto`: clear `photo_path`, delete the object. `photoUrls` is role-checked and uses `createSignedUrls`.
- [ ] **Step 5: Run** `npx vitest run src/modules/therapists` and `npx tsc --noEmit`. Expected: PASS, no type errors.
- [ ] **Step 6: Commit** `feat: therapist photo validation and server actions`.

### Task 4: Browser resize

**Files:**
- Create: `src/lib/resizeImage.ts`, `src/lib/resizeImage.test.ts`

**Interfaces:**
- Produces: `export function fitWithin(width: number, height: number, max: number): { width: number; height: number }` (scales down only, keeps aspect, rounds, never returns 0); `export class ImageDecodeError extends Error {}`; `export async function resizeToJpeg(file: File, max = 256): Promise<Blob>` using `createImageBitmap` and a canvas, quality 0.85, throwing `ImageDecodeError` when the browser cannot decode the file.

- [ ] **Step 1: Write failing tests** for `fitWithin`: `4000x3000 at 256 gives 256x192`; `a portrait 3000x4000 gives 192x256`; `smaller than max is unchanged`; `a 10000x1 image never collapses to height 0`.
- [ ] **Step 2: Run** `npx vitest run src/lib/resizeImage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both exports (`resizeToJpeg` is not unit-tested in the node environment; covered by the Task 6 browser spec).
- [ ] **Step 4: Run** the tests again. Expected: PASS.
- [ ] **Step 5: Commit** `feat: resize chosen photos in the browser`.

### Task 5: UI, strip, page wiring and CSP

**Files:**
- Create: `src/components/ui/avatar.tsx`, `src/components/ui/avatar.test.tsx`, `src/modules/therapists/components/NowStrip.tsx`, `src/modules/therapists/components/NowStrip.test.tsx`, `src/lib/csp.test.ts`
- Modify: `src/lib/csp.ts`, `src/modules/therapists/components/TherapistsAdmin.tsx`, `src/app/[locale]/(staff)/admin/therapists/page.tsx`, `messages/th.json`, `messages/en.json`

**Interfaces:**
- Consumes: `therapistsNow` (Task 2), `uploadTherapistPhoto`/`removeTherapistPhoto`/`photoUrls` (Task 3), `resizeToJpeg`/`ImageDecodeError` (Task 4), `getBoard(day)` for today's rows.
- Produces: `Avatar({ name, src, size })` (`size: 'sm' | 'md'`), renders an `<img alt={name}>` when `src` is set, otherwise the first letters of the name in a circle with `aria-label={name}`. `NowStrip({ people: { therapistId: string; name: string; photoUrl: string | null; state: NowState; roomName: string | null }[] })` with `data-testid="now-strip"` and rows `now-<therapistId>`; empty state text when the list is empty. `TherapistRow` gains `photo_path: string | null`; `TherapistsAdmin` gains prop `photoUrls: Record<string, string>`. Test ids on the photo control: `therapist-photo-<id>` (avatar), `therapist-photo-input-<id>` (file input), `therapist-photo-remove-<id>`.

- [ ] **Step 1: Write failing tests:** `avatar.test.tsx` (initials when no src; img with alt when src; Thai name initials do not break), `NowStrip.test.tsx` (lists each person with state text and room; shows the empty state when none), `csp.test.ts` (`img-src` contains `'self' blob: data:` plus the Supabase origin; an invalid Supabase URL leaves `img-src` unchanged; other directives equal the previous output).
- [ ] **Step 2: Run** `npx vitest run src/components/ui/avatar.test.tsx src/modules/therapists src/lib/csp.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `Avatar`, `NowStrip` and the `csp.ts` change (derive the origin once and reuse it for `connect` and `img-src`).
- [ ] **Step 4: Wire the page:** `page.tsx` selects `photo_path`, calls `getBoard(today)` and `photoUrls`, builds the `NowStrip` people from `therapistsNow` (active therapists only), passes `photoUrls` into `TherapistsAdmin`. `TherapistsAdmin` shows the avatar beside each therapist with a "Change photo" file input (`accept="image/jpeg,image/png,image/heic,image/*"` is fine; decoding decides) and a Remove button; on `ImageDecodeError` show an `Alert` with the new `therapists.photo.unreadable` message ("use a JPEG or PNG"); other errors use the existing `errorText` path; on success `router.refresh()`.
- [ ] **Step 5: Add messages** in `th` and `en`: `therapists.photo.change`, `.remove`, `.unreadable`, `.alt` (if needed) and `therapists.now.title`, `.empty`, `.state.in_treatment`, `.state.on_break`, `.state.free`, `.inRoom`.
- [ ] **Step 6: Run** `npx vitest run src`, `npx tsc --noEmit`, `npx eslint`, `npx next build`. Expected: all PASS.
- [ ] **Step 7: Commit** `feat: therapist photos and a now strip on the Therapists page`.

### Task 6: Browser spec and privacy check

**Files:**
- Create: `tests/e2e/therapist-photos.spec.ts`
- Modify: `tests/e2e/a11y.spec.ts` only if `/admin/therapists` is not already scanned.

**Interfaces:**
- Consumes: test ids from Task 5; existing `tests/e2e/helpers.ts` and `db.ts` for login and seeding.

- [ ] **Step 1: Write the spec** (runs on desktop and mobile projects): `owner uploads a photo and sees it after reload` (generate a small PNG buffer in the test; assert `therapist-photo-<id>` contains an `img`); `owner removes the photo and sees initials`; `an undecodable file shows the unreadable message` (upload a text file renamed `.heic`); `the now strip lists a therapist on shift` (seed a shift covering now); `a receptionist cannot open /admin/therapists` (forbidden page); `no photo appears on Today with the shared screen on` (seed a photo, open Today, assert no `img` with the therapist's name).
- [ ] **Step 2: Run in CI** (cannot run locally). Expected: PASS, a11y scan clean. Compare any failure with the known flaky baseline before acting.
- [ ] **Step 3: Commit** `test: browser coverage for therapist photos`.

### Task 7: Final verification

- [ ] **Step 1:** run `npx tsc --noEmit`, `npx eslint`, `npx vitest run src`, `npx next build` locally; read CI for `tests/db` and Playwright.
- [ ] **Step 2:** open the preview on a phone and at 1440 px, upload a photo, and confirm the strip; report anything unverified plainly.
- [ ] **Step 3:** push, keep the PR a draft until the owner asks to merge.
