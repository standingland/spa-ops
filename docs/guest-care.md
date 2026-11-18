# Guest care and commission settlement

Scope selected on 17 November 2026: appointment reminders, My appointments, FIFO waitlist offers, commission settlement and customer preferences. No deposits or self-service rescheduling are included.

## Behavior

- Reminders use the existing authenticated dispatcher, with owner settings for enablement and two lead times (default 24 hours and 2 hours). Only consenting, identifiable LINE customers receive reminders. A reminder is deduplicated by booking, current start and lead time. Old reminders are discarded after cancellation, rescheduling, consent withdrawal or start time; a late scheduler does not send both reminders together.
- `/th/book/mine` and `/en/book/mine` require a signed LINE session. Guests see their own upcoming appointments and paginated history, can use existing cancellation rules, and can book again with the same public therapist/service. This page stays accessible when new online bookings are closed, provided LINE is configured.
- A waitlist request specifies one therapist, treatment, Bangkok date and a range of acceptable **start** times. Offers are processed FIFO by the dispatcher and reserve a compatible room and therapist for up to 15 minutes by default (ending earlier at the minimum booking lead-time boundary). One guest holds at most one offer. Only the owning guest can accept an offer; ordinary bookings respect live offers. Acceptance uses the existing booking constraints and online limits. Expired offers pass to the next waiting guest; they do not repeatedly offer to the same expired request. Rejoining explicitly sends the request to the end of the queue and creates a fresh notification. Staff can review and cancel requests. Availability is revalidated if shifts, services or rooms change.
- Commission closing previews a delta against all earlier approved snapshots per completed booking. Approval checks the preview revision, freezes the amounts and records the approver. A later refund/discount or late completion appears as a new adjustment, including negative adjustments, without rewriting approved or paid records. Each therapist's amount is recorded as paid/adjusted once with a reference and its actual Bangkok date/time, separate from the record timestamp. This records a payment made elsewhere; it does not transfer money or alter the spa's customer-payment ledger.
- Customer preferences have structured pressure, oil and room fields plus a short note. Desk staff can edit; a therapist can read preferences only through a booking assigned to them. They are excluded from public guest APIs, included in customer export and cleared on anonymisation.

## Operations

Apply the new migration before starting this app version. Continue invoking `POST /api/internal/dispatch` with `CRON_SECRET` every minute; when LINE is configured, it processes offers and enqueues reminders before dispatching messages. No new hosted scheduler is created by the code. LINE credentials and a real end-to-end provider check remain necessary for live delivery. Database tests use a fresh isolated PostgreSQL cluster; provider interactions are mocked in unit tests. Browser checks use a temporary sample-data route, which is removed after inspection; these do not establish a working live LINE/Supabase journey.

Settings → Guest care controls reminders, lead times, waitlist enablement and offer lifetime. Reminder and waitlist switches default off so installing the migration alone does not contact customers. My appointments is linked from the public booking header; waitlist joining appears on the therapist's booking panel; staff waitlist review is linked from Customers; settlement is on Commissions.

Joining the waitlist requires an explicit checkbox consenting to appointment and waitlist messages via LINE. This also records consent for an existing customer who had previously opted out. To settle later commission adjustments, select the original completion-date range and approve the new difference; earlier approvals and payout records remain unchanged.

## Verification — 17 November 2026

- Fresh isolated PostgreSQL 18.6 cluster with all migrations: **759 tests passed in 87 files**, including existing scheduling, privacy, permissions, reporting, payments and inventory tests. New tests cover FIFO holds, competing schedulers, offer expiry and rejoining, idempotent acceptance/payout, stale commission previews, post-payout refunds, payout dates, ownership, preference erasure and notification suppression.
- TypeScript, full ESLint and the final production build passed. Generated test/browser artifacts are excluded from ESLint.
- Thai and English component fixtures were checked in headless Chromium at 320, 390, 768 and 1440 pixels. No horizontal page overflow or page JavaScript errors remained; approval confirmation and form constraints were checked. Screenshots are in ignored `output/playwright/guest-care/`. The temporary preview route was deleted and is absent from the final build.
- This change has **not** been deployed or applied to the app's configured local/hosted Supabase database. The configured local Supabase stack was unavailable. Real LINE sign-in, message delivery, hosted scheduling and the full existing browser suite have not been exercised for this change.

## Hosted migration — 18 November 2026 (Bangkok)

Applied to the existing `spa-ops` Supabase project (`ulufoauymzkhgmexjtnm`), whose URL was verified against the Vercel production configuration. The connected Supabase account lacked access to this project, so deployment used the owner's authenticated Supabase SQL Editor after the owner completed GitHub two-factor authentication.

The hosted history previously ended at `0028_public_booking_hardening`. Applied the following source migrations in order, with their repository versions recorded in `supabase_migrations.schema_migrations`:

1. `20261114222234_earnings_inventory.sql`
2. `20261115001413_commission_only.sql`
3. `20261117002606_guest_care_and_commission_settlement.sql`
4. `20261117182346_guest_care_search_path_hardening.sql`

The first three were applied in one transaction, including their history entries. The fourth pins `search_path` on the three helpers introduced, replaced or renamed by guest care; function bodies and privileges are unchanged.

Post-deployment verification:

- Existing row counts were unchanged: 8 bookings, 6 customers, 1 payment and 5 therapists. No production seed or synthetic booking/payment was inserted.
- All 11 added tables have RLS enabled. Anonymous clients have no table-write privileges on them. All six checked guest/scheduler RPCs are executable by `service_role`, and none by `anon` or `authenticated`.
- All three hardened helpers have pinned search paths. New security-definer functions have pinned search paths.
- Reapplied the helper hardening to the isolated PostgreSQL test database; 30 guest-care, security-catalog and public-isolation tests passed in 3 files.
- A read-only transaction passed owner settings (23 keys), earnings, inventory and commission-settlement RPC checks, plus a service-role lookup for an unmapped synthetic LINE identity. Direct authenticated execution of the guest lookup was denied as expected. No business records were changed by this smoke check.
- Reminder and waitlist switches remain **off**; reminder leads remain 1440 and 120 minutes. The deployment did not run a message dispatcher, send LINE messages, enable a feature switch or test a real booking lifecycle.
- Advisor Center was inspected. Other existing advisor warnings outside these touched helpers were not changed by this deployment.

Verification screenshot: ignored `output/playwright/guest-care/supabase-migration-2026-11-18.jpg`.
