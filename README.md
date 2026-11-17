# Spa Ops

A booking and daily-operations system for a spa: therapists, rooms and beds, bookings that cannot double-book, a room dashboard, customer records, payments and reconciliation, and management reports. Thai first, English ready. Rooms, therapists, services and policies are all configured in the system (nothing is hard-coded), and the database itself refuses a double booking.

## Requirements

* Node.js 22
* Docker Desktop (runs the local Supabase stack: PostgreSQL, Auth, Realtime)

## First run

```bash
npm install
npx supabase start
cp .env.example .env.local        # then paste the keys printed by `npx supabase status -o env`
npx supabase db reset             # applies the migrations and the small development seed
npx playwright install chromium
npm run dev                       # http://localhost:3000/th/login
```

The seed creates four logins, **for local development only** (password `local-dev-only`): `owner@spa.test`, `manager@spa.test`, `reception@spa.test`, `therapist@spa.test`. They do not exist in production, where the first owner is created with `scripts/bootstrap-owner.mjs` (see `docs/deployment.md`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | development server |
| `npm run build` | production build |
| `npm run start` | serve the production build |
| `npm run lint` | ESLint |
| `npm test` | unit tests under `src/` (Vitest) |
| `npm run test:db` | builds a throwaway PostgreSQL and runs the database tests: constraints, permissions, money, reports, security catalog |
| `npx playwright test` | browser tests on desktop and phone sizes (needs the local Supabase stack running and freshly seeded) |
| `npm run test:prod` | security-header tests against the production build (port 3200) |
| `npm run test:perf` | load budgets and the concurrency storm on a year of generated data |
| `npm run test:scale` | loads the local stack with the year of data, then times the screens on the production build; run `npx supabase db reset` afterwards |
| `npm run test:restore` | backup-and-restore drill on the local stack |
| `npm run backup` | writes `backups/<timestamp>/` (roles, schema, data); contains personal data |

## Where to read more

* `docs/architecture.md` — data model, rules, permission matrix, acceptance evidence per plan
* `docs/earnings-inventory.md` — commissions, material recipes, stock movements and cost calculations
* `docs/guest-care.md` — LINE reminders, My appointments, waitlist offers, customer preferences and commission settlement
* `docs/operations.md` — backups, restore, rollback, schedules, logs, monthly checklist
* `docs/deployment.md` — the go-live runbook (every cloud or paid step is the owner's decision)
* `docs/security-report.md` and `docs/acceptance.md` — what was verified, and what is still open
* `docs/superpowers/plans/` — the four implementation plans
