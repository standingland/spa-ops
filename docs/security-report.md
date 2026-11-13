# Spa Ops — Security and readiness report

**Status: ready for the owner's go-live decision. Not live.** No cloud project was created, nothing was deployed, nothing was bought, and no non-local database was touched. Everything here was measured on one developer machine against a local Supabase stack.

## Scope and date

* Date: 2026-11-12. Code: the `spa-ops` repository at the end of Plan 4.
* In scope: database rules and permissions, the web application's headers and error handling, sign-in and account handling, logging, performance on a year of data, backup and restore, and the deployment documents.
* Not in scope: the hosting provider's own security, a penetration test by an outside party, the legal review of privacy rules, and any real customer data.

## How it was checked

| Area | Method | Result |
|---|---|---|
| Table access | Catalog test: every table has row-level security; no table or function lets an anonymous visitor write | passes (`security-catalog.test.ts`) |
| Database functions | Catalog test: every privileged function pins its search path; private helper functions are not callable by anonymous visitors | passes |
| Outsiders | Anonymous visitor, a signed-in stranger with no staff row, and a deactivated employee each try every read and every action | all refused (`security-outsiders.test.ts`) |
| Role matrix | Every action by every role (owner, manager, receptionist, therapist, customer, anonymous) | 66 + 150 cells pass |
| Findings fixed in this pass | Anonymous had write privileges; private helpers were callable; a deactivated user could read their own staff row; no guard on a customer's account link; no health check | fixed in migration `0019_hardening.sql`, with tests |
| Browser security headers | Production build: nonce-based content security policy, frame denial, no-sniff, referrer policy, strict transport security when `APP_ENV=production`; pages not cached or indexed; downloads not cacheable | 3 of 3 pass (`tests/e2e-prod/headers.spec.ts`) |
| Settings at start-up | `parseEnv` refuses to start in production with a missing or unsafe value (local URL, equal keys, weak or default cron secret) and lists every problem | unit tests pass |
| Internal endpoints | Constant-time bearer-secret check on dispatch and maintenance | tested |
| Sign-in | Sign-up disabled; minimum password length 10; the owner is created once by a script that refuses if an owner exists | tested |
| Logging | Structured JSON; names, phones, emails, notes, payment references, passwords and tokens are redacted; unknown errors show the customer a short reference code, not internals | tested (`errors.spec.ts`, unit tests) |
| Dependencies | `npm audit` | 0 vulnerabilities |
| Secrets | Scan of the source tree for keys and passwords | clean |
| Accessibility | Automated checks (axe) on the main screens, both layouts | 10 of 10 pass on both |
| Test totals | Database 400 of 400; unit 52 of 52; performance 28 of 28; production headers 3 of 3; scale 3 of 3; full browser suite 162 passed, 3 flaky, 3 skipped | see `docs/acceptance.md` |

## Performance

Machine: Intel(R) Core(TM) Ultra 7 258V × 8, 32 GB, Windows 11, Docker Desktop (about 15 GB). Data: a deterministic year-sized set. Figure: 95th percentile of 30 runs. A developer laptop is not a production server; treat these as relative evidence, not a promise.

### Database operations (`.testdb/perf-results.json`, 2026-11-12)

| Operation | p95 (ms) | Budget (ms) |
|---|---|---|
| Find available rooms and therapists | 19.4 | 250 |
| Booking board, one day | 6.2 | 150 |
| Booking board, one week | 13.2 | 500 |
| Room status board | 12.9 | 250 |
| Pending payments | 147.2 | 300 |
| Stranded bookings | 21.2 | 300 |
| Day counts for a month | 21.2 | 300 |
| Customer search by phone | 67.0 | 150 |
| Customer search by name prefix | 3.7 | 150 |
| Customer summary | 2.4 | 150 |
| Create a booking | 5.3 | 250 |
| Cancel a booking | 3.8 | 250 |

### Reports (one year / one month of data)

| Report | One year p95 (ms) | One month p95 (ms) | Budget (ms) |
|---|---|---|---|
| Summary | 84.2 | 35.7 | 2500 |
| Revenue over time (month grain) | 267.7 | 66.8 | 2500 |
| By service | 46.3 | 17.0 | 2500 |
| By therapist | 58.8 | 16.7 | 2500 |
| Room utilisation | 533.3 | 93.5 | 8000 (year) / 2500 (month) |
| Therapist utilisation | 133.5 | 39.9 | 8000 (year) / 2500 (month) |
| Peak periods | 63.5 | 22.2 | 8000 (year) / 2500 (month) |

### Screens on a production build with year-sized data (`.testdb/scale-results.json`)

| Screen | Measured (ms) | Budget (ms) |
|---|---|---|
| Today | 1770 | 3000 |
| Rooms | 442 | 3000 |
| Calendar, rooms | 627 | 4000 |
| Calendar, week | 973 | 4000 |
| Customers | 745 | 3000 |
| Reports | 1286 | 8000 |

A concurrency storm (many staff booking the same slots at once on the year-sized data) ends with no double bookings and no rooms or therapists overlapping.

## Backup and restore drill

`npm run test:restore` takes a backup of the local database, restores it into a scratch database, and compares 24 tables. **Passed in 97 seconds** on 2026-11-12. The drill was run only on the local stack and only into the same Supabase version. The cloud procedure is in `docs/operations.md` and has not been run.

## Unresolved risks and limitations

1. **Privacy law review is outstanding.** The system gives you a consent record, export, anonymisation and a retention list. It does not decide what the law requires. Do not enter real customer data before a legal review (consent wording, retention periods, where data is stored).
2. **Customer messages go out only through LINE, and only once configured.** Without the LINE keys messages are only logged; SMS and email still have no provider. Connecting LINE costs money beyond LINE's free allowance and needs the owner's approval. Appointment reminders are not built.
3. **No payment provider.** Staff record payments; transfers stay unverified until a manager checks the bank. Nothing moves money.
4. **Customer self-service is limited to the public booking page** (`docs/public-booking.md`): a guest verified by LINE can book and cancel their own online bookings, nothing else, and there is no guest booking history screen. The page is a new public attack surface: it is closed until the owner turns it on, every public database function is service-role only (`tests/db/public-isolation.test.ts`), requests are rate limited, and guest sessions and cancel links are signed and expire. Guests without LINE cannot book online. There is also **no audit-log viewer**; the audit log is written but not shown, and it is not pruned.
5. **Staff sign in with a password only.** Two-step sign-in can be turned on in Supabase for the owner but is not enforced.
6. **Numbers come from a developer laptop.** Production hosting may be slower or faster; re-measure after the first deploy.
7. **Hosting facts are unconfirmed:** whether the chosen plan pauses idle projects, how many days of backups it keeps, point-in-time recovery, and how often a scheduled job may run. `docs/deployment.md` lists what to check.
8. **The specification file is missing** from the repository (`docs/spec/master-prompt.md`), so acceptance was mapped from the plans' criteria.
9. **Browser tests are timing-sensitive on a busy machine.** Three tests passed only on retry in the final run (see `docs/acceptance.md`). Cause not proven.
10. **A hint in the plan was not built:** the "tell your manager this code" help text.
11. **Restore was tested only into the same Supabase version**, and Plan 3's browser run included one unrecorded run.
12. **Tooling, unrelated to the app:** the Megapowers doctor could not run because Go was not on this session's PATH.

## Owner decisions still open

All are listed in `docs/deployment.md` and marked **[owner decision]**: choosing hosting and a plan, creating the cloud project and applying migrations, the first owner account, schedules, the first cloud backup and restore drill, connecting a message provider, and the legal review.

## Statement

The software is built and tested to the plans' criteria on a local stack. It is **ready for the owner's go-live decision. It is not live.**
