# Spa Ops — Operations runbook

For the person who runs the system day to day. Everything here was tried on the developer machine unless it says **not yet confirmed**. Nothing in this repository touches a cloud project; steps that do are in `docs/deployment.md` and need the owner's decision.

## Backups

**Manual backup (local stack):** `npm run backup`. It writes `backups/<YYYYMMDD-HHmm>/` with three files, made by the Supabase CLI (`supabase db dump`, which runs `pg_dump` inside the database container):

| File | Content |
|---|---|
| `roles.sql` | cluster roles |
| `schema.sql` | the `public` schema: structure, constraints, row-level-security policies, functions |
| `data.sql` | the data of the `public` and `auth` schemas (COPY format), except auth's own migration bookkeeping |

A backup folder **contains personal data** (customers, staff logins with password hashes, payments). Keep it encrypted and off the machine it was made on. `backups/` is git-ignored.

**Cloud project:** `npm run backup -- --linked` dumps the linked Supabase project. It needs `npx supabase link` first, so it is the owner's step. What the hosting provider's own automatic backups cover and for how many days depends on the plan chosen, and **has not been confirmed**: check the provider's current pricing and backup documentation before relying on it, and keep your own dumps as well (a monthly one at least).

## Restore, and proof that it works

`npm run test:restore` is the restore drill. It runs against the **local** stack only (it refuses any other address). It: resets the local database; creates a known state through the app's own API (a customer with consent, two bookings, one payment); counts every table; runs `npm run backup`; wipes the database with `supabase db reset --no-seed`; truncates the public tables and restores `data.sql` with `psql` inside the database container; then checks that every row count matches (24 tables, including `auth.users`), that `owner@spa.test` signs in with the old password, that booking the same slot again is refused with `THERAPIST_BUSY`, and that the three exclusion constraints and row-level security on `bookings` exist.

**Last result (developer machine, local Docker stack):** `RESTORE DRILL PASSED in 94 s (24 tables compared)` — this includes two database resets, which dominate the time. A restore of the data alone takes a few seconds at this size; expect it to grow with the data.

**How to restore for real** (the steps the drill performs):

1. Stop the app, or put the spa in "paper mode" for the duration.
2. Create a fresh database with the migrations applied and **no seed**: locally `npx supabase db reset --no-seed`; on a new cloud project `npx supabase db push` only (never the seed).
3. Truncate the `public` tables in the new database (the migrations insert the three standard payment methods; the backup carries them).
4. Load `data.sql` with `psql -v ON_ERROR_STOP=1`. Stop at the first error; do not continue past one.
5. Verify: staff can sign in; `/api/health` answers; row counts look right; open Today and the reconciliation page.
6. Only then start the app again and tell the staff.

Why `psql` inside the container: `psql` is not installed on the developer machine, and the container always has the matching client. On a machine with PostgreSQL client tools installed, use them with the connection string instead.

Limitation found while writing the drill: the CLI dumps the `auth` schema data without auth's own migration table (excluded on purpose), so a restore must go into a database whose auth schema was created by the same Supabase version. Restoring into a much newer or older Supabase version is **not tested**.

## Rollback

* **The application:** redeploy the previous build from the hosting provider's deployment history. The app does not change the database by itself on start.
* **The database:** migrations only go forward. A migration that turns out to be wrong is **corrected by a new migration**, never by editing an applied one. If data was lost or damaged, restore from the latest backup (above), then re-apply anything entered since using the audit log and the payment ledger as the record.
* Settings (cancellation policy, thresholds, retention) are in the `app_settings` table, changed only by the owner and audited; reverting a setting is just setting it again.

## Schedules

| What | Endpoint | How often | Auth |
|---|---|---|---|
| Send customer messages (log-only until a provider is connected) | `POST /api/internal/dispatch` | every minute, or as often as the host allows | `Authorization: Bearer <CRON_SECRET>` |
| Retention maintenance | `POST /api/internal/maintenance` | once a day | same |

Maintenance **deletes nothing** until the owner turns on *Delete old data automatically* in Settings → Data retention. When on, it deletes audit-log entries older than the configured months and customer messages sent more than 90 days ago, and never bookings, payments or customers. Customer anonymisation is a separate, manual, per-customer action (Customers → the customer → Personal data).

## Reading the logs

The app writes one JSON line per event to standard output (`ts`, `level`, `event`, plus fields). Logs never contain names, phone numbers, emails, notes, payment references, passwords or tokens.

When staff see an unexpected error, the screen shows a short **reference code** (8 characters). Search the logs for it: `"ref":"ABCD2345"` finds the line `action.unknown_error` with the database error code and message. Known problems (a double booking, a missing permission) show a plain sentence and no code, and are not logged.

## When something looks wrong

| Sign | What it means | What to do |
|---|---|---|
| The live indicator in the header says offline | the browser lost its connection to the server | check the network; the screen refreshes by itself when it returns; until then the data on screen may be old |
| `/api/health` returns 503 | the app cannot reach the database | check the database service status; do not restart the database during a busy hour without a backup |
| Customer messages show **Stopped** (`dead`) | five send attempts failed | open Customer messages, read the error, fix the cause (provider, consent, contact), then use **Retry** |
| Cash does not match at closing | counted ≠ expected | open Payments for that day, look for a voided entry or an unverified transfer; the page shows when cash changed after the day was closed |
| Someone cannot sign in | wrong password, or the account was deactivated | the owner resets the password in Staff, or reactivates the account |
| A booking is "stranded" (needs reassignment) | a therapist's absence or a room closure was recorded over it | reception opens it from the attention list on Today and picks a new therapist and room |

## Monthly checklist

1. Run `npm run backup` (or the cloud equivalent) and store the folder encrypted, off the machine.
2. Run the restore drill (`npm run test:restore`) on a development machine and note the result and time. **A backup that was never restored is not a backup.**
3. Review customer messages with status **Stopped** and clear them.
4. Review the retention list (Customers → Retention review) and decide, case by case, who to anonymise.
5. Review the payments page for entries still **awaiting verification** older than a few days.
6. Check that the schedules above are still running (the last dispatch and maintenance lines in the logs).
