# Therapist photos and a "now" strip — design

Sub-project 3 of the staff-workspace redesign, reduced scope (option B). Date: 2026-11-12. Status: draft for owner approval.

## 1. Intent

Let the owner and managers put a photo on each therapist and see, on the existing Therapists admin page, who is on shift right now and which room they are in. Owner asked for three things: see who is on shift and in which room, add or change photos, and manage rooms and therapists on one page. Owner chose the smallest option (B), which delivers the first two. The third is not delivered; see Non-goals.

## 2. Goals

- Photo per therapist: upload, replace, remove. Shown on the Therapists admin page, with initials when there is no photo.
- A "now" strip at the top of the Therapists admin page: every therapist on shift at this moment, with state (free, in treatment, on break) and, when in treatment, the room.

## 3. Non-goals

- No Team & rooms page, no merge of rooms and therapist management, no change to the sidebar link (still opens `/admin/therapists`).
- Photos are not shown on Today, Schedule, the Shared screen or to therapists, receptionists or customers.
- No cropping UI, no multiple photos, no photo history.

## 4. Anti-goals

A photo of a person must not leak: no public bucket, no public URL, no photo on the Shared screen, no photo readable by roles that cannot open the Therapists admin page.

## 5. Constraints

- Existing rules apply: test ids, roles and aria-labels stay; message keys unchanged, new copy in Thai and English with the parity test green; `<select>` stays native; AGENTS.md (read Next 16 docs before writing code).
- Database change allowed here (one migration), unlike sub-project 1.
- Local verification is lint, build and unit tests; Playwright and database tests run in CI.

## 6. Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | New `/team` page with cards, shift state, rooms and inline editing | Meets all three asks; larger; two edit forms until the old pages retire |
| **B (chosen by owner)** | Photo upload and a "now" strip on the existing Therapists page | Smallest and lowest risk; does not merge rooms and therapists |
| C | Move all rooms/therapist editing into `/team` and retire admin pages | One page, no duplication; largest; rewrites several browser specs |

## 7. Design (my calls unless noted)

1. **Storage (my call):** private Supabase Storage bucket `therapist-photos`, one object per therapist at `<therapist_id>.jpg`. New nullable column `therapists.photo_path`. The page gets short-lived signed URLs created on the server; nothing public.
2. **Access (my call):** only owner and manager can upload, replace, remove or read, enforced by storage policies and by the server action's role check, the same roles as the Therapists page.
3. **Upload (my call):** the browser resizes to at most 256 px on the long side and re-encodes as JPEG before upload. The server action accepts only `image/jpeg` or `image/png`, at most 512 KB, and re-checks the therapist exists.
4. **CSP (my call):** `img-src` gains the Supabase origin (already known to `buildCsp`); nothing else widens.
5. **"Now" strip:** reuses Today's logic for on-shift, in-treatment and on-break so the two pages cannot disagree. Room comes from the in-treatment booking.
6. **UI:** built with the existing primitives (Card, Badge, Button, Field). Avatar is a small new component with initials fallback and a text alternative of the therapist's name.
7. **Audit:** photo changes are logged like other therapist changes if the existing audit trigger covers the table; otherwise noted as a gap.

## 8. Left to the builder

Exact bucket policy SQL, file naming on replace (overwrite vs new name to bust caches), avatar sizes, empty state when nobody is on shift, and the test set (unit tests for validation and the shared on-shift logic; one browser spec for upload in CI).

## 9. Risks

| Risk | Mitigation |
|---|---|
| Photo leaks via a public URL or wrong policy | Private bucket, signed URLs, policy test in CI |
| Large or hostile files | Type and size checks on the server, client resize |
| "Now" strip disagrees with Today | Share the same pure function |
| Owner expected the one-page experience | Stated here under Non-goals; can be revisited as option A or C |
