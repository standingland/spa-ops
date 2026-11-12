# Foundation, Shell and Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the staff workspace one design system, a grouped navigation shell and the BANYAN look on every existing screen, without changing behaviour.

**Architecture:** Semantic CSS tokens in `globals.css` plus seven small primitives in `src/components/ui/` (cva + `cn`, native `<select>`). A single-DOM shell (sidebar on desktop, disclosure menu on phones). Pure, unit-testable modules (`nav.ts`, `brand.ts`, `status.ts`, `roomAction.ts`, `events.ts`) carry the logic; screens only compose them.

**Tech Stack:** Next.js 16.4.6, React 19.3, Tailwind 4.3, next-intl 4.14, Vitest 5 (node environment, no jsdom), Playwright, `class-variance-authority`, `clsx`, `tailwind-merge`.

**Spec:** `docs/superpowers/specs/2026-11-12-foundation-restyle-design.md` (approved). Read it before starting.

## Global Constraints

Every task's requirements include this section.

- Every `data-testid`, role and `aria-label` stays on the same element it is on today. A new element never reuses an existing `data-testid` (Playwright resolves test ids in strict mode, so a duplicate breaks tests). Any exception is added to "Test exceptions" at the end of this plan before the step that needs it.
- `<select>` stays native (the browser suite calls `selectOption` 21 times).
- Existing message keys are unchanged. New copy gets both `messages/th.json` and `messages/en.json` (the parity test in `src/i18n/messages.test.ts` enforces equal keys and placeholders).
- No change to existing behaviour, data, permissions, routes or server actions. Additions the spec itself requires are allowed and are the only ones: route `/admin` (hub), read action `getBookingEvents`, field `rooms` on `TodayModel`.
- Dependencies added: `class-variance-authority`, `clsx`, `tailwind-merge` only. No Radix, no icon library; icons are inline SVG.
- Before a task is called done: `npm run lint`, `npx tsc --noEmit`, `npx vitest run src` pass. The Playwright suite (desktop 1440×900 and phone 390×844), the axe tests and `npm run test:prod` run on the owner's machine or CI (the authoring session has no Docker); a task is reported as "implemented, e2e pending" until they have run.
- `AGENTS.md`: Next.js 16 differs from older versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing code that touches routing, layouts, metadata or server actions.
- Thai is the default language; copy is written in both languages.
- Dark mode, deposits, the timeline Schedule, therapist photos and the Bookings list page are out of scope.

## Review Focus

Failure modes the spec implies that no feature test would otherwise catch, most likely first. Each has a pinning test in the owning task.

1. **Shared screen leaks names.** Today's new Room status panel must hide guest names when "Shared screen" is on (Task 8, e2e).
2. **Activity history leaks personal data.** `booking_events.before/after` carry the booking `note`; the history must show only kind, status change and time, and therapists must get no history (Task 11, unit + e2e).
3. **A therapist's menu.** A role with only three links must show no empty "Business" or "Setup" group and no divider (Task 5, unit).
4. **Nested admin paths.** `/admin/therapists` must highlight only Therapists, not Settings; `/customers/123` highlights Guests (Task 5, unit).
5. **Long Thai names on a phone.** A 60-character guest name in a room row, arrival row or chip must not cause horizontal page scroll at 390px (Task 8, e2e).

---

### Task 1: Baseline and dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `class-variance-authority`, `clsx`, `tailwind-merge` importable everywhere; a recorded baseline.

- [ ] **Step 1: Install and read the guides.** Run `npm ci`. Then read `node_modules/next/dist/docs/` entries for layouts, metadata (`generateMetadata`), and `usePathname`/`next-intl` navigation; note any API in the files this plan touches that differs from what the plan assumes, and write each difference under "Deviations" at the end of this plan.
- [ ] **Step 2: Record the baseline.** Run `npm run lint`, `npm run build` (with the placeholder env from `.github/workflows/ci.yml`), `npx vitest run src`. Expected: all pass. If one fails before any change, stop and report; do not start Task 2.
- [ ] **Step 3: Add the dependencies.** `npm install class-variance-authority@^0.7 clsx@^2 tailwind-merge@^3`.
- [ ] **Step 4: Verify.** Re-run the three commands from Step 2. Expected: pass.
- [ ] **Step 5: Commit** `package.json` and `package-lock.json` with message `chore: add cva, clsx and tailwind-merge for shared UI components`.

### Task 2: Tokens, `cn`, status styles, contrast guard

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/lib/cn.ts`, `src/components/ui/status.ts`
- Test: `src/lib/cn.test.ts`, `src/components/ui/status.test.ts`, `src/components/ui/contrast.test.ts`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string`; from `status.ts`: `ROOM_STATUS_KEY: Record<RoomStatus, string>` (message key under `status`, e.g. `out_of_service → 'outOfService'`), `roomStatusStyle(s: RoomStatus): { dot: string; chip: string }`, `bookingStatusStyle(s: BookingStatus): { chip: string; card: string }` (`card` is today's `STATUS_BG` string for that status, copied verbatim from `BookingCalendar.tsx:28-31`). Tailwind utilities `bg-surface`, `bg-surface-muted`, `text-ink`, `text-ink-muted`, `border-line`, `border-line-strong`, `bg-primary`, `text-primary-foreground`, `text-danger`, `bg-danger`, `text-title|heading|body|caption`, `bg-tint-<status>` for the 5 room and 7 booking statuses (`tint-out_of_service` is written `tint-out-of-service`, `tint-checked_in` is `tint-checked-in`, `tint-in_treatment` is `tint-in-treatment`, `tint-no_show` is `tint-no-show`).

- [ ] **Step 1: Write the failing tests.**
  - `cn.test.ts`: `cn('p-2', 'p-4')` equals `'p-4'`; `cn('a', false && 'b', undefined, 'c')` equals `'a c'`.
  - `status.test.ts`: for each of the 5 `RoomStatus` and 7 `BookingStatus` values the style functions return non-empty strings; every value of `ROOM_STATUS_KEY` is a key of `messages/en.json` → `status`.
  - `contrast.test.ts`: read `src/app/globals.css`, parse `--name: #rrggbb;` declarations from `:root`, compute WCAG contrast, assert ≥ 4.5 for: `--primary-foreground` on `--primary`; `--ink` on `--surface`, `--surface-muted`, and each `--tint-*`; `--ink-muted` on `--surface` and `--surface-muted`; `--danger` on `--surface`. Fail with the pair name in the message.
- [ ] **Step 2: Run to verify failure.** `npx vitest run src/lib/cn.test.ts src/components/ui` — Expected: FAIL (modules and tokens missing).
- [ ] **Step 3: Implement.** `cn.ts`: `twMerge(clsx(inputs))`. `globals.css`: keep every existing variable; add the semantic tokens (`--surface` white, `--surface-muted` ivory, `--ink` charcoal, `--ink-muted` stone-dark, `--line` stone, `--line-strong` stone-dark, `--primary` an olive green you choose so the contrast test passes with `--primary-foreground` ivory, `--danger` clay, `--focus` charcoal, `--radius: 0.5rem`) and light `--tint-*` tokens for every status; map them in `@theme inline`; add the type scale (`--text-title` 1.75rem, `--text-heading` 1.25rem, `--text-body` 0.9375rem, `--text-caption` 0.8125rem, each with a line height); add one global `:focus-visible` rule using `--focus`. Do not change `body`/heading font rules.
- [ ] **Step 4: Run to verify pass.** Same command. Expected: PASS. Then `npm run lint && npx tsc --noEmit`.
- [ ] **Step 5: Commit** (`feat(ui): design tokens, cn helper and one status style map`).

### Task 3: Form primitives

**Files:**
- Create: `src/components/ui/button.tsx`, `src/components/ui/field.tsx`
- Test: `src/components/ui/button.test.tsx`, `src/components/ui/field.test.tsx`

**Interfaces:**
- Consumes: `cn` (Task 2).
- Produces: `buttonVariants({ variant?: 'primary'|'secondary'|'danger'|'link'; size?: 'md'|'sm' }): string`; `Button(props: ButtonHTMLAttributes & VariantProps<typeof buttonVariants>)` — forwards every native prop and does **not** set `type` (existing forms rely on the default submit). `Field({ label: string; error?: string; children: ReactNode })` renders `<label>` wrapping the label text and the control, plus `<span role="alert">` for `error`. `Input`, `Select` (native `<select>`), `Textarea`: forward native props, share one class string `controlClass` exported from `field.tsx`.

- [ ] **Step 1: Write the failing tests** (use `renderToStaticMarkup` from `react-dom/server`; no DOM needed). `button.test.tsx`: `buttonVariants()` contains `min-h-11`; `variant:'primary'` contains `bg-primary`; `variant:'danger'` contains `bg-danger`; rendered `<Button>x</Button>` has no `type=` attribute; `<Button type="submit" data-testid="a">` keeps both attributes. `field.test.tsx`: `<Field label="Email"><Input name="e"/></Field>` markup starts with `<label` and contains `Email` and `<input`; with `error="Bad"` it contains `role="alert"` and `Bad`; `<Select>` renders a `<select`.
- [ ] **Step 2: Run to verify failure.** `npx vitest run src/components/ui/button.test.tsx src/components/ui/field.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** with cva. Sizes: `md` is `min-h-11 px-4 text-body`, `sm` is `min-h-11 pointer-fine:min-h-9 px-3 text-caption`. Primary = `bg-primary text-primary-foreground`; secondary = `border border-line-strong bg-surface text-ink`; danger = `bg-danger text-white`; link = underline, no padding. Disabled = `opacity-60`.
- [ ] **Step 4: Run to verify pass**, then lint and `tsc`.
- [ ] **Step 5: Commit** (`feat(ui): Button, Field, Input, Select, Textarea`).

### Task 4: Display primitives

**Files:**
- Create: `src/components/ui/card.tsx`, `badge.tsx`, `alert.tsx`, `page-header.tsx`, `empty-state.tsx`
- Test: `src/components/ui/display.test.tsx`

**Interfaces:**
- Consumes: `cn`, `roomStatusStyle`, `bookingStatusStyle` (Task 2).
- Produces: `Card({ tone?: 'default'|'danger'; className?; ...div props })`; `Badge({ tone?: 'neutral'|'warning'; ...span props })`; `StatusDot({ status: RoomStatus; className? })` (aria-hidden dot using `roomStatusStyle(...).dot`); `StatusChip({ kind: 'room'|'booking'; status: string; label: string })` (always prints `label`); `Alert({ tone?: 'error'|'info'; children })` renders `role="alert"` for `error` and `role="status"` for `info`; `PageHeader({ title: string; subtitle?: string; actions?: ReactNode })` renders one `<h1>`; `EmptyState({ children })`.

- [ ] **Step 1: Write the failing tests** (`renderToStaticMarkup`): `Alert tone="error"` has `role="alert"`; `tone="info"` has `role="status"`; `PageHeader` output contains exactly one `<h1`; `StatusChip kind="room" status="occupied" label="Occupied"` contains `Occupied`; `Card tone="danger"` contains a danger border class.
- [ ] **Step 2: Run to verify failure.** `npx vitest run src/components/ui/display.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** `Card` = `rounded-[var(--radius)] border border-line bg-surface p-4`. `PageHeader` title uses `font-serif text-title`; `actions` right-aligned and wrapping.
- [ ] **Step 4: Run to verify pass**, lint, `tsc`.
- [ ] **Step 5: Commit** (`feat(ui): Card, Badge, StatusChip, Alert, PageHeader, EmptyState`).

### Task 5: Navigation model and brand config

**Files:**
- Create: `src/modules/identity/nav.ts`, `src/lib/brand.ts`
- Modify: `.env.example`, `docs/deployment.md`
- Test: `src/modules/identity/nav.test.ts`, `src/lib/brand.test.ts`

**Interfaces:**
- Consumes: `import type { Role } from '@/modules/identity/session'` (type only, so tests run without the server).
- Produces: `type NavId = 'today'|'schedule'|'bookings'|'guests'|'therapists'|'rooms'|'payments'|'reports'|'settings'`; `type IconName = NavId | 'menu' | 'close'`; `type NavItem = { id: NavId; href: string; icon: IconName; roles: Role[]; hidden?: boolean }`; `type NavGroup = { id: 'operate'|'business'|'setup'; items: NavItem[] }`; `visibleNav(role: Role, opts: { managerReports: boolean }): NavGroup[]`; `activeHref(pathname: string, hrefs: string[]): string | null`; `type AdminTool = { id: 'adminRooms'|'services'|'notifications'|'staff'|'settings'; href: string; roles: Role[] }` (its link label is the message key `nav.<id>`, except `settings`, which uses the new key `nav.policies` so the hub does not repeat the word "Settings"); `visibleAdminTools(role: Role): AdminTool[]`; `getBrand(source: Record<string, string | undefined>): { name: string; tagline: string }`.
- Item table (href → roles): Today `/today`, Schedule `/calendar`, Rooms `/rooms` → all four roles; Guests `/customers` → owner, manager, receptionist; Therapists `/admin/therapists`, Payments `/payments`, Reports `/reports`, Settings `/admin` → owner, manager; Bookings `/bookings` → hidden for everyone (not rendered until sub-project 4). Order inside `operate`: today, schedule, bookings, guests, therapists, rooms; `business`: payments, reports; `setup`: settings. Reports is dropped for managers when `managerReports` is false. Groups with no visible items are omitted. Admin tools: `/admin/rooms`, `/admin/services`, `/admin/notifications` (owner, manager); `/admin/staff`, `/admin/settings` (owner).

- [ ] **Step 1: Write the failing tests.**
  - `nav.test.ts`: therapist gets one group `operate` with ids `['today','schedule','rooms']` and no other group (Review Focus 3); receptionist adds `guests`; manager with `managerReports:false` has no `reports` but has `payments`; owner has all of `payments, reports, settings` and never `bookings`; `activeHref('/admin/therapists', ['/admin','/admin/therapists'])` is `'/admin/therapists'`; `activeHref('/admin/staff', same)` is `'/admin'`; `activeHref('/customers/123', ['/customers'])` is `'/customers'`; `activeHref('/customersx', ['/customers'])` is `null`; `visibleAdminTools('manager')` excludes `staff` and `settings`.
  - `brand.test.ts`: `getBrand({})` is `{ name: 'BANYAN', tagline: "Men's Spa · Thailand" }`; `getBrand({ BRAND_NAME: '  Lotus  ' }).name` is `'Lotus'`; `BRAND_NAME: '   '` falls back to `'BANYAN'`.
- [ ] **Step 2: Run to verify failure.** `npx vitest run src/modules/identity/nav.test.ts src/lib/brand.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.** `activeHref` returns the longest `href` for which `pathname === href` or `pathname.startsWith(href + '/')`. Add `BRAND_NAME=BANYAN` and `BRAND_TAGLINE=Men's Spa · Thailand` to `.env.example` (commented as optional) and mention both variable names in `docs/deployment.md` (`src/docs.test.ts` requires every `.env.example` variable to appear there).
- [ ] **Step 4: Run to verify pass**: the two new tests plus `npx vitest run src/docs.test.ts`.
- [ ] **Step 5: Commit** (`feat(nav): role-filtered grouped navigation model and brand config`).

### Task 6: App shell, phone menu and Settings hub

**Files:**
- Create: `src/components/shell/Icon.tsx`, `Wordmark.tsx`, `NavList.tsx`, `ShellFrame.tsx`, `src/lib/usePanelBehavior.ts`, `src/app/[locale]/(staff)/admin/page.tsx`
- Modify: `src/app/[locale]/(staff)/layout.tsx`, `src/app/[locale]/layout.tsx` (page title from `getBrand`), `messages/th.json`, `messages/en.json`, `tests/e2e/a11y.spec.ts` (add `/th/admin` as owner)
- Test: `tests/e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `visibleNav`, `activeHref`, `visibleAdminTools`, `getBrand` (Task 5); `Button`, `Card`, `PageHeader` (Tasks 3–4); `LiveStatus`, `LocaleSwitch` (existing).
- Produces: `Icon({ name: IconName; className? })` (aria-hidden SVG, 11 icons); `Wordmark({ name: string; tagline: string })`; `NavList({ groups: { id: string; label: string; items: { id: string; href: string; label: string; icon: IconName }[] }[] })` (client; each link has `data-testid="nav-<id>"` and `aria-current="page"` when `activeHref` selects it); `usePanelBehavior(open: boolean, onClose: () => void, returnTo?: RefObject<HTMLElement | null>): void` — Escape calls `onClose`; closing returns focus to `returnTo.current` or to the element focused when it opened; `ShellFrame({ brand: ReactNode; status: ReactNode; children: ReactNode })` (client).
- New message keys (both languages): `nav.schedule`, `nav.guests`, `nav.bookings`, `nav.policies`, `nav.group.operate|business|setup`, `nav.menu`, `nav.closeMenu`. Existing `nav.*` keys stay.

- [ ] **Step 1: Write the e2e spec** `tests/e2e/shell.spec.ts` (runs on both projects). Tests: (a) reception sees `nav-today`, `nav-schedule`, `nav-guests`, `nav-rooms` and none of `nav-payments`, `nav-settings`; (b) therapist sees exactly `nav-today`, `nav-schedule`, `nav-rooms` and no group heading for business or setup; (c) manager at `/th/admin/therapists` has `aria-current="page"` on `nav-therapists` and not on `nav-settings`; (d) owner opens `/th/admin` and sees `admin-tool-staff` and `admin-tool-settings`, manager sees neither; (e) phone project only: `nav-today` is not visible until the menu button (`getByRole('button', { name: <nav.menu> })`) is pressed, `aria-expanded` flips, Escape closes it and focus is back on the button; (f) `page.getByTestId('sign-out')` and `getByTestId('live-status')` each resolve to at most one element on both projects.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/shell.spec.ts` on the owner's machine or CI. Expected: FAIL (not built). In the authoring session, state that this could not be run.
- [ ] **Step 3: Implement.** One DOM only: `ShellFrame` renders `<aside>` containing a top block (`brand`, `status`, and a menu button visible below `lg`) and a panel (`children`) that is always shown at `lg` and above, and shown below `lg` only when open (`aria-expanded` and `aria-controls` on the button; close on route change via `usePathname`, on Escape via `usePanelBehavior`). The layout (still a server component) keeps `requireRole()` and the manager-reports lookup, builds groups from `visibleNav` with translated labels, and passes `Wordmark`, `<LiveStatus />`, and as children `NavList` plus a footer (`LocaleSwitch`, Account link visible to every role, sign-out form with `data-testid="sign-out"`). Name text uses `truncate`. The hub page calls `requireRole('owner','manager')` and renders one `Card` link per `visibleAdminTools` entry with `data-testid="admin-tool-<id>"`; `/admin/therapists` is not repeated there. Metadata title in the locale layout comes from `getBrand(process.env).name`.
- [ ] **Step 4: Verify.** `npm run lint && npx tsc --noEmit && npx vitest run src` pass here; run `shell.spec.ts` and `a11y.spec.ts` where Docker is available. Expected: PASS.
- [ ] **Step 5: Commit** (`feat(shell): grouped sidebar, phone menu, settings hub, brand wordmark`).

### Task 7: Login card

**Files:**
- Create: `src/components/shell/Leaf.tsx`
- Modify: `src/app/[locale]/login/page.tsx`, `src/modules/identity/components/LoginForm.tsx`

**Interfaces:**
- Consumes: `Field`, `Input`, `Button`, `Alert`, `Card` (Tasks 3–4); `Wordmark`, `getBrand`, existing `LocaleSwitch`.

- [ ] **Step 1: Check the existing tests.** `tests/e2e/auth.spec.ts` and `a11y.spec.ts` use `login-email`, `login-password`, `login-submit`, `login-error` (`role="alert"`). These ids must survive.
- [ ] **Step 2: Rebuild `LoginForm` and the page** on the primitives: centered `Card`, wordmark above, language switch top-right, `Leaf` (aria-hidden inline SVG) as decoration on this page only. Keep the sign-in logic and the redirect to `/today` untouched; the error uses `Alert tone="error"` carrying `data-testid="login-error"`.
- [ ] **Step 3: Verify.** lint, `tsc`, unit tests; then `npx playwright test tests/e2e/auth.spec.ts tests/e2e/a11y.spec.ts` where Docker is available. Expected: PASS.
- [ ] **Step 4: Commit** (`feat(login): branded card on the new primitives`).

### Task 8: Today

**Files:**
- Create: `src/modules/operations/roomAction.ts`, `src/modules/operations/components/RoomStatusPanel.tsx`
- Modify: `src/modules/operations/today.ts` (add `rooms` to `TodayModel`), `src/modules/operations/components/TodayBoard.tsx`, `AttentionList.tsx`, `src/app/[locale]/(staff)/today/page.tsx` (select `zone` with `id, code`; pass `roomZones`), `messages/*.json`
- Test: `src/modules/operations/roomAction.test.ts`, extend `src/modules/operations/today.test.ts`, `tests/e2e/today-layout.spec.ts`

**Interfaces:**
- Consumes: `RoomState`, `TodayModel`, `BoardRow` (existing); `StatusChip`, `Card`, `Button`, `Alert`, `PageHeader` (Tasks 3–4); `setBookingStatus`, `markRoomReady` (existing actions).
- Produces: `TodayModel.rooms: RoomState[]` (set from `buildToday`'s `input.rooms`; no extra fetch); `roomAction(room: RoomState, model: TodayModel): { kind: 'start' | 'finish'; row: BoardRow } | { kind: 'ready' } | null`; `RoomStatusPanel({ model, names, roomZones, shared, role, onError })` (client). New test ids: `room-status-row`, `room-act-start`, `room-act-finish`, `room-act-ready`. Existing ids `count-*`, `arrival-row`, `waiting-row`, `treatment-row`, `cleaning-row`, `act-ready`, `ending-soon`, `therapist-state`, `cancellation-row`, `shared-toggle` stay unchanged and unique.

- [ ] **Step 1: Write the failing unit tests.** `today.test.ts`: `buildToday(input).rooms` deep-equals `input.rooms`. `roomAction.test.ts`: occupied room whose `currentBookingId` is in `model.inTreatment` → `{ kind: 'finish', row }`; room with a `model.waiting` row for that `roomId` (status `checked_in`) → `{ kind: 'start', row }`; room `cleaning` with `turnoverDueAt` set → `{ kind: 'ready' }`; available room with nothing waiting → `null`; `out_of_service` → `null`.
- [ ] **Step 2: Write the e2e spec** `today-layout.spec.ts`: (a) the panel has one `room-status-row` per active room; (b) turning the shared screen on removes the seeded guest's name from every `room-status-row` and from `[data-testid=arrival-row]` (Review Focus 1); (c) on the phone project, with a booking whose customer display name is a 60-character Thai string (seed it the way `today.spec.ts` seeds bookings), `document.documentElement.scrollWidth <= window.innerWidth` (Review Focus 5); (d) `getByTestId('arrival-row')` count equals the number of arrivals (no duplicated rows).
- [ ] **Step 3: Run the unit tests to verify failure.** `npx vitest run src/modules/operations` — Expected: FAIL.
- [ ] **Step 4: Implement.** Add `rooms` to `TodayModel`; write `roomAction`. Lay out `TodayBoard` as the spec's two columns: left `RoomStatusPanel` (rows grouped by zone via `roomZones`, scrolling inside its panel, status `StatusChip`, guest or treatment text that uses the same `shared` rule as `who()`, one action button calling `setBookingStatus` for start/finish and `markRoomReady` for ready); right column the Arrivals section (keeps `arrival-row` and `BookingActions`) and the Needs-attention list; below, compact cards for Waiting, In treatment, Awaiting cleaning, Pending payments, Therapists on shift and Cancellations; the 8 counts become one strip. Replace local `STATUS_BG`/`STATUS_KEY`/`rowBox` with `status.ts` and the primitives. Rows use `min-w-0` and `break-words` so long names wrap.
- [ ] **Step 5: Verify.** `npx vitest run src` passes; run `today.spec.ts`, `today-layout.spec.ts`, `live.spec.ts`, `exceptions.spec.ts`, `a11y.spec.ts` on desktop and phone where Docker is available, then `npm run test:scale`. Expected: PASS and the 40-room budget holds.
- [ ] **Step 6: Commit** (`feat(today): two-column layout with room status panel`).

### Task 9: Rooms

**Files:**
- Modify: `src/modules/operations/components/RoomBoard.tsx`, `ReportForm.tsx`, `src/app/[locale]/(staff)/rooms/page.tsx` (only if layout wrappers change)

**Interfaces:**
- Consumes: `Input`, `Select`, `Button`, `Card`, `StatusChip`, `StatusDot`, `Alert`, `PageHeader` (Tasks 3–4), `status.ts`.

- [ ] **Step 1: Restyle** `RoomBoard` and `ReportForm` on the primitives; remove its local `field`, `STATUS_BG` and `STATUS_KEY`. Keep `useLiveRefresh`, URL-synced filters and these ids on the same elements: `room-search`, `room-status-filter`, `room-category-filter`, `room-zone-filter`, `compact-toggle`, `room-summary`, `zone-heading`, `room-tile` (with `data-code`, `data-status`), `tile-status-label`, `act-ready`, `report-open`, `open-reports`. The compact tile is the readiness strip.
- [ ] **Step 2: Verify.** lint, `tsc`; `npx playwright test tests/e2e/rooms.spec.ts tests/e2e/exceptions.spec.ts tests/e2e/a11y.spec.ts` where Docker is available. Expected: PASS.
- [ ] **Step 3: Commit** (`feat(rooms): restyle room board on the new primitives`).

### Task 10: Guests

**Files:**
- Modify: `src/modules/customers/components/CustomerList.tsx`, `CustomerProfile.tsx`, `PrivacyTools.tsx`, `RetentionList.tsx`, `TreatmentNote.tsx`, `src/app/[locale]/(staff)/customers/page.tsx`, `customers/[id]/page.tsx`, `messages/*.json` (`customers.dangerZone`)

**Interfaces:**
- Consumes: primitives (Tasks 3–4).

- [ ] **Step 1: Restyle.** List becomes a table-style list with a search `Input`; rows stay links with `data-testid="customer-row"`; keep `customer-search`, `retention-tab` and the debounced URL search. Profile becomes sectioned `Card`s. Read `PrivacyTools.tsx` first: the anonymise tool goes in its own `Card tone="danger"` headed by `customers.dangerZone`; the export action stays outside it. Preserve every existing `data-testid` (see `tests/e2e/customers.spec.ts`).
- [ ] **Step 2: Verify.** lint, `tsc`, unit tests; `npx playwright test tests/e2e/customers.spec.ts tests/e2e/a11y.spec.ts` where Docker is available. Expected: PASS.
- [ ] **Step 3: Commit** (`feat(guests): restyle customer list, profile and privacy tools`).

### Task 11: Booking details panel

**Files:**
- Create: `src/modules/booking/events.ts`, `src/modules/booking/components/BookingDetails.tsx`
- Modify: `src/modules/booking/actions.ts` (add `getBookingEvents`), `src/modules/booking/components/BookingCalendar.tsx` (remove the inline `BookingPanel`, render `BookingDetails`), `TodayBoard.tsx` (add a details button), `messages/*.json`
- Test: `src/modules/booking/events.test.ts`, extend `tests/e2e/booking.spec.ts`

**Interfaces:**
- Consumes: `usePanelBehavior` (Task 6); `StatusChip`, `Card`, `Button`, `Alert`, `Input`, `Select` (Tasks 3–4); existing `PaymentSection`, `TreatmentNote`, `setBookingStatus`, `moveBooking`, `BoardRow`, `TherapistOpt`, `RoomOpt`.
- Produces: `type BookingEventView = { at: string; kind: 'created'|'status_changed'|'rescheduled'|'reassigned'; from?: BookingStatus; to?: BookingStatus }`; `describeEvent(e: { at: string; kind: string; before: unknown; after: unknown }): BookingEventView` (reads only `before.status` / `after.status`; never any other key); `getBookingEvents(bookingId: string): Promise<{ ok: true; events: BookingEventView[] } | { ok: false; code: string }>` (selects from `booking_events` ordered by `at`; maps each row through `describeEvent` on the server; therapists get `events: []`); `BookingDetails({ row: BoardRow; role: Role; labels: { service: string; therapist: string; room: string }; moveOptions?: { therapists: TherapistOpt[]; rooms: RoomOpt[] }; onClose: () => void })`. Reschedule is shown only when `moveOptions` is given and the role and status allow it, exactly as `BookingPanel` does today.
- Ids kept on the same elements as in the old panel: `booking-panel`, `panel-close`, `status-<to>`, `booking-move`, `booking-cancel`, `cancel-confirm`, `move-start`, `move-therapist`, `move-position`, `move-confirm`. New: `booking-history`, `open-details` (Today button).

- [ ] **Step 1: Write the failing unit tests** (`events.test.ts`): `describeEvent({ at, kind: 'status_changed', before: { status: 'confirmed', note: 'secret' }, after: { status: 'checked_in', note: 'secret' } })` equals `{ at, kind: 'status_changed', from: 'confirmed', to: 'checked_in' }` and `JSON.stringify` of the result does not contain `secret` (Review Focus 2); `created` with `after: { status: 'confirmed' }` gives `to: 'confirmed'`; an unknown `kind` throws; `before: null` gives no `from`.
- [ ] **Step 2: Extend the e2e spec.** In `booking.spec.ts` add: opening a card shows `booking-panel` and `booking-history` with at least a `created` entry for a desk role; Escape closes the panel and focus returns to the card; a therapist opening their own booking sees no `booking-history`; the history text never contains the seeded booking note.
- [ ] **Step 3: Run the unit tests to verify failure.** `npx vitest run src/modules/booking/events.test.ts` — Expected: FAIL.
- [ ] **Step 4: Implement.** `events.ts` and `getBookingEvents` (use the same `roleOrNull` pattern as neighbouring actions). `BookingDetails`: a right-hand panel from `lg`, a full-screen sheet below `lg`; `role="dialog"` with `aria-labelledby` on the guest name; focus moves into the panel on open; `usePanelBehavior` handles Escape and focus return. Header = booking `StatusChip` plus the existing `PaymentSection` status; details table = guest, date, time, treatment, price (from `PaymentSection`'s existing money panel; therapists see none), therapist, room; actions as in `BookingPanel`; history from `getBookingEvents`. Today's arrival, waiting and in-treatment rows get an `open-details` button that opens `BookingDetails` with `labels` from `names` and no `moveOptions`.
- [ ] **Step 5: Verify.** `npx vitest run src` passes; run `booking.spec.ts`, `drag.spec.ts`, `calendar-span.spec.ts`, `payments.spec.ts`, `today.spec.ts` where Docker is available. Expected: PASS.
- [ ] **Step 6: Commit** (`feat(booking): booking details panel with activity history`).

### Task 12: Payments and Reports

**Files:**
- Modify: `src/modules/payments/components/Reconciliation.tsx`, `PendingPayments.tsx`, `PaymentDialog.tsx`, `PaymentSection.tsx`, `ChargeAdjust.tsx`, `MethodsAdmin.tsx`, `src/modules/reports/components/ReportsDashboard.tsx`, `Bars.tsx`, `PeakGrid.tsx`, the `payments` and `reports` pages

**Interfaces:**
- Consumes: primitives (Tasks 3–4).

- [ ] **Step 1: Restyle** every component above on the primitives; report bars and the peak grid use the new tokens (olive and brass). Keep every `data-testid` (`payment-section`, `payment-status`, `payment-unverified`, `due-amount`, `refund-owed`, `pay-open` and the ones in `reconciliation.spec.ts`, `reports.spec.ts`). Do not change formulas, formatting (`formatTHB`) or CSV links.
- [ ] **Step 2: Verify.** lint, `tsc`, unit tests; `npx playwright test tests/e2e/payments.spec.ts tests/e2e/reconciliation.spec.ts tests/e2e/reports.spec.ts tests/e2e/a11y.spec.ts` where Docker is available. Expected: PASS.
- [ ] **Step 3: Commit** (`feat(payments,reports): restyle on the new primitives`).

### Task 13: Admin pages and account

**Files:**
- Modify: `src/modules/rooms/components/RoomsAdmin.tsx`, `src/modules/catalog/components/ServicesAdmin.tsx`, `src/modules/therapists/components/TherapistsAdmin.tsx`, `src/modules/identity/components/StaffAdmin.tsx`, `StaffPasswordReset.tsx`, `PasswordForm.tsx`, `src/modules/notifications/components/OutboxAdmin.tsx`, `src/modules/settings/components/SettingsForm.tsx`, `src/modules/operations/components/ReassignDialog.tsx`, and the matching pages under `src/app/[locale]/(staff)/admin/` and `account/`

**Interfaces:**
- Consumes: primitives (Tasks 3–4).

- [ ] **Step 1: Restyle** each component on the primitives. Keep `setting-*`, `setting-saved` (`role="status"`) and every id the `admin-*`, `settings`, `account` and `notifications` specs use.
- [ ] **Step 2: Verify.** lint, `tsc`, unit tests; `npx playwright test tests/e2e/admin-rooms.spec.ts tests/e2e/admin-staff.spec.ts tests/e2e/settings.spec.ts tests/e2e/account.spec.ts tests/e2e/notifications.spec.ts tests/e2e/a11y.spec.ts` where Docker is available. Expected: PASS.
- [ ] **Step 3: Commit** (`feat(admin): restyle admin and account pages`).

### Task 14: Loading, empty and error states

**Files:**
- Create: `src/components/ui/skeleton.tsx`
- Modify: the 5 `loading.tsx` and 5 `error.tsx` files under `src/app/[locale]/(staff)/{calendar,payments,reports,rooms,today}/`, `(staff)/forbidden.tsx`, `src/app/global-error.tsx`

**Interfaces:**
- Produces: `Skeleton({ className? })` (`aria-hidden` block). Consumes `Alert`, `Button`, `EmptyState`.

- [ ] **Step 1: Replace** each `loading.tsx` with skeleton blocks inside a `role="status"` wrapper that keeps a visually hidden `common.loading` text; each `error.tsx` with `Alert tone="error"` plus a retry `Button`. Keep `data-testid="today-error"` and any other id `errors.spec.ts` uses. `global-error.tsx` must keep working without the shell (no providers available there).
- [ ] **Step 2: Verify.** lint, `tsc`; `npx playwright test tests/e2e/errors.spec.ts` where Docker is available. Expected: PASS.
- [ ] **Step 3: Commit** (`feat(ui): loading, empty and error states`).

### Task 15: Cleanup and final verification

**Files:**
- Modify: any file still defining `field`, `rowBox` or a local `STATUS_BG`; `messages/*.json` (remove keys that no code references, in both languages)

- [ ] **Step 1: Find leftovers.** `grep -rn "const field\|const rowBox\|STATUS_BG" src`. Expected after cleanup: only the calendar card map inside `status.ts` (Task 2) and the calendar's own use of `bookingStatusStyle(...).card`. Remove only what this redesign orphaned.
- [ ] **Step 2: Remove unused message keys** that this work made unreferenced (check each with `grep -rn` before deleting; keep any key a test references).
- [ ] **Step 3: Full verification.** `npm run lint`, `npm run build`, `npx vitest run src` here. On the owner's machine or CI: `npm run test:db`, `npx playwright test` (desktop and phone), `npm run test:prod`, `npm run test:scale`. Expected: all pass; record the numbers in the PR description.
- [ ] **Step 4: Commit** (`chore: remove code orphaned by the restyle`) and update the PR description with results and the "Test exceptions" and "Deviations" sections below.

---

## Test exceptions

None known. Add one here, with the reason, before editing any test file other than the new ones named above.

## Deviations

None recorded yet. Task 1 Step 1 fills this in if the Next 16 guides differ from what this plan assumes.
