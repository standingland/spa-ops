# Spa Ops — Go-live runbook

This document is the whole path from this repository to a running spa. **Nothing here has been executed**: no cloud project was created, nothing was bought, nothing was deployed, and no production data was touched. Every step marked **[owner decision]** costs money, creates something outside this machine, or cannot be undone, and needs the owner's explicit approval before anyone runs it.

## 1. Choose hosting **[owner decision]**

The default assumption is a Supabase cloud project in the **Singapore** region for the database and sign-in, and a Node host for the app (Vercel is the default assumption; any host that runs a Next.js 16 server and can call a URL on a schedule will do).

Before choosing a plan, check on the providers' **current pricing and documentation pages** (this document deliberately states no prices or limits, because they change):

* does the plan **pause inactive projects**, and after how long;
* how many **days of automatic backups** it keeps, and whether **point-in-time recovery** is included;
* how often a **scheduled job** may run (the message dispatcher wants every minute);
* the database size, connection and bandwidth limits against a spa of your size;
* where the data is stored (Thailand's PDPA and cross-border transfer rules are part of the legal review in step 10).

## 2. Create the project and apply the migrations **[owner decision]**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push          # applies supabase/migrations/*.sql only
```

`db push` applies the migrations. **The development seed (`supabase/seed.sql`) is never applied to production.** It contains the four development logins.

## 3. Authentication settings (Supabase dashboard → Authentication)

* Sign-ups **disabled** (staff accounts are created by the owner; the app never lets visitors register).
* Minimum password length **10** (the app also enforces 10).
* Site URL set to the production address.
* Recommended: turn on two-step sign-in for the owner account. The app does not enforce it for staff.

The same settings for the local stack live in `supabase/config.toml` (`enable_signup = false`, `minimum_password_length = 10`).

## 4. Environment variables

Set these on the host. A production start **refuses to run** and lists every problem if one is missing or unsafe (`src/lib/env.ts`).

| Variable | Value and where it comes from |
|---|---|
| `APP_ENV` | `production`. Turns on the strict checks and the `Strict-Transport-Security` header |
| `NEXT_PUBLIC_SUPABASE_URL` | the project's API URL (must be `https`, not localhost) — dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_KEY` | the project's public (anon / publishable) key — same page |
| `SUPABASE_SERVICE_KEY` | the project's **secret** service key — same page. Server only; never expose it; it must differ from the public key |
| `CRON_SECRET` | a freshly generated random string of **32 or more characters** (for example `openssl rand -base64 48`). Not `local-dev-only` |
| `NOTIFY_SENDER_NAME` | the business name shown in customer messages (default `Studio`) |
| `NEXT_PUBLIC_LIVE_POLL_MS` | optional; how often screens refresh as a fallback, in milliseconds (default 60000) |

Used only on development machines, never set in production: `TEST_DATABASE_URL` (point the database tests at your own empty PostgreSQL instead of the throwaway one) and `E2E_DATABASE_URL` (direct SQL for the browser tests; defaults to the local Supabase database).

## 5. Create the first owner, once

A production database has no accounts. Against the production environment variables:

```bash
OWNER_PASSWORD='<a long password>' node scripts/bootstrap-owner.mjs --email owner@your-spa.example --name "Owner Name"
```

It prints `created`, or `owner_exists` (and changes nothing) when an active owner already exists. The password is read from the environment, never from an argument. Then sign in and change it on **My account** if you wish, and create the other staff accounts under **Staff**.

## 6. Schedules

| What | Call | How often |
|---|---|---|
| Customer message dispatch | `POST https://<app>/api/internal/dispatch` with header `Authorization: Bearer <CRON_SECRET>` | every minute, or as often as the host allows |
| Retention maintenance | `POST https://<app>/api/internal/maintenance` with the same header | once a day |

Two ways to schedule: the host's own scheduler (for example Vercel Cron, which must be configured to send the bearer header), or database scheduling (`pg_cron` with `pg_net`) calling the endpoint from inside Supabase. Maintenance deletes nothing until the owner turns on *Delete old data automatically* in Settings. Dispatch only logs messages until a provider is connected (see step 10).

## 7. Smoke test after every deploy

1. `GET /api/health` returns `{"ok":true}`.
2. Sign in; the header's live indicator turns to *live*.
3. Create a booking and cancel it (check Today and the calendar).
4. Check the security headers on a page response (`X-Frame-Options: DENY`, a `Content-Security-Policy`, `Strict-Transport-Security`).
5. Open Payments and Reports as the owner.

## 8. First backup and a restore drill **[owner decision]**

Run `npm run backup -- --linked` against the project, then restore it into a **scratch** project (a second, throwaway Supabase project, which may cost money) following `docs/operations.md`, and confirm staff can sign in and counts match. Do this before real customer data is entered, and monthly afterwards.

## 9. Rollback

* **Application:** redeploy the previous build from the host's deployment history.
* **Database:** migrations only go forward; a mistake is corrected by a new migration; lost data is restored from backup. Details in `docs/operations.md`.

## 10. Before real customer data

* **PDPA legal review** of the consent text, retention periods, anonymisation procedure and where the data is stored. The system provides the tools (consent record, export, anonymisation, a retention list); it does not decide what the law requires.
* **Customer messages:** decide whether to connect a message provider (SMS, LINE or email; this costs money and needs the owner's approval) or leave messages off. Until then, messages are only logged. Only the confirmed / changed / cancelled messages exist; appointment reminders are not built.
* Set the **cancellation and no-show policy** and the **retention months** in Settings.
* Replace the header name "Spa Ops" and set `NOTIFY_SENDER_NAME` to the business name.
* Decide who may see reports (the owner can switch them off for managers) and whether reception may record payments.
* Remove or disable any development account that was ever created in this database.
