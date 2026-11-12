# Foundation, shell and restyle — design

Sub-project 1 of 4 of the staff-workspace redesign. Date: 2026-11-12. Status: draft for owner review.

## 1. Purpose

Make the staff workspace look and behave as one product: a shared design system, a clear navigation shell, and every existing screen restyled to match the owner's "BANYAN staff workspace" mockup. Behaviour, data, permissions and routes do not change.

**Success looks like**
- One set of tokens and primitives; no screen hand-writes its own button, field, card or status colour.
- A sidebar (desktop) and menu (phone) that show each role only its own links, grouped, with an active state.
- Today, Rooms, Guests, Payments, Reports, Settings and admin pages, and login, on the new look; a Booking details panel replaces the inline booking panel.
- The existing automated checks stay green after every step.

**What the owner said:** the biggest problem is visual polish and consistency; the mockup is the target ("this or better"). Chosen approach: own primitives using shadcn/ui conventions (A+), not the shadcn/ui package set.

## 2. Scope

**In**: tokens and type scale; primitives; shell and login; Today; Rooms; Guests (customer list and profile); Payments; Reports; Settings hub and admin pages; Booking details panel; loading, empty and error states; phone layouts.

**Out (separate sub-projects or later)**
- #2 Schedule rebuilt as a room-row timeline with cleaning blocks; drag-and-drop on it.
- #3 Therapist photos and the Team & rooms page.
- #4 A Bookings list page. The sidebar item stays hidden until it exists.
- Deposits ("Deposit pending" in the mockup): not a concept in the system; no UI for it.
- Dark mode. Real payment or messaging providers. Any database change.

## 3. Constraints (hard rules for every step)

1. Every `data-testid`, role and `aria-label` stays on the same element. Any exception is listed in the plan before the step starts.
2. `<select>` stays native (the browser suite calls `selectOption` 21 times).
3. Message keys are unchanged; the Thai/English parity test stays green. New copy gets both languages.
4. No change to behaviour, data, permissions, routes or server actions.
5. `lint`, `build`, `vitest run src`, the axe accessibility tests and the Playwright suite (desktop 1440×900, phone 390×844) pass before each commit is considered done.
6. No Radix and no new UI library. Inline SVG for the roughly 10 icons. Dependencies added: `class-variance-authority`, `clsx`, `tailwind-merge`.
7. `AGENTS.md` applies: Next.js 16 differs from older versions; the guides in `node_modules/next/dist/docs/` are read before code is written.

## 4. Foundation

### Tokens (`src/app/globals.css`)
Existing variables (`--ivory`, `--stone`, `--sage`, `--brass`, `--clay`, `--status-*`) stay so unmigrated screens are unchanged. Semantic tokens are added on top.

| Token | Value | Replaces |
|---|---|---|
| `surface`, `surface-muted` | white, ivory/cream | repeated `bg-white` (50 uses) |
| `ink`, `ink-muted` | charcoal, stone-dark | text colours |
| `line`, `line-strong` | stone, stone-dark | borders, input borders |
| `primary` | olive green, text ivory | solid buttons (was charcoal) |
| `danger` | clay | cancel, delete |
| `focus` | visible ring | one keyboard-focus style |
| `radius` | single value | the mix of `rounded` |

The exact olive is chosen against the axe contrast checker (text and chips on cream), not by eye. A named type scale (`title`, `heading`, `body`, `caption`) replaces loose `text-sm` use. Fonts are unchanged (IBM Plex Sans Thai, Noto Serif Thai).

### Primitives (`src/components/ui/`)
Each is small, single-purpose, built with `cva` and `cn()`.

| Component | Replaces | Rule |
|---|---|---|
| `Button` (primary, secondary, danger, link) | about 40 hand-written button class strings | 44px minimum height on touch |
| `Field`, `Input`, `Select` (native), `Textarea` | `field` constants in `BookingCalendar.tsx` and `RoomBoard.tsx` | label and error wired in |
| `Card` | `rowBox`, the `rounded border bg-white p-3` pattern | |
| `Badge`, `StatusDot` | three copies of `STATUS_BG` | one `status.ts` holds room and booking status colours; every chip also prints text |
| `Alert` | copied `role="alert"` blocks | keeps `role="alert"` |
| `PageHeader` | title-and-actions row on each page | |
| `EmptyState` | repeated "nothing" paragraphs | |

## 5. Shell and branding

**Sidebar (≥1024px, about 232px):** wordmark and tagline; Today, Schedule, Bookings (hidden until #4), Guests, Therapists, Rooms; divider; Payments, Reports (owner and manager; the manager-reports switch still hides Reports); divider; Settings (owner and manager); footer with live status, language switch, Account and sign-out (`data-testid="sign-out"` kept).

**Mapping from today's 13 links:** Today, Rooms, Calendar→Schedule, Customers→Guests keep their routes. Payments and Reports stay top-level. Admin rooms, Services, Notifications, Staff and Settings are reached from a Settings hub page. Sidebar "Rooms" opens the live room board (`/rooms`); sidebar "Therapists" opens the existing therapist admin page (`/admin/therapists`, owner and manager only) until #3 adds the Team & rooms page. Role filtering stays server-side in the layout; a group with no visible items is not rendered (a therapist sees Today, Schedule, Rooms).

**Phones (<1024px):** slim top bar with wordmark and a menu button opening the same grouped list full screen. Plain disclosure (`aria-expanded`), closes on navigation and on Escape, returns focus to the button.

**Active state:** filled pill and `aria-current="page"` via one small client component using `usePathname`; the layout stays a server component.

**Branding:** wordmark and tagline come from one config value (environment variable, defaults "BANYAN" and "Men's Spa · Thailand"); the page `<title>` uses it. Customer messages still never mention the business type.

**Login:** centered card, wordmark above, primitives for the form, language switch in the corner; the decorative leaf appears on login only.

## 6. Screens

**Today:** two columns as in the mockup. Left: Room status, one row per room (status chip, guest and treatment, one action: Start, Finish or Mark ready), grouped by zone and scrolling in its panel so 40 rooms work. Right: Upcoming arrivals and Needs attention. Below: Waiting, In treatment, Pending payments, Therapists on shift and Cancellations as compact cards; nothing is removed. The 8 count tiles become one slim strip. The shared-screen toggle stays in the header. Data: Today reads the same room-status function the Rooms page already uses (a read, no database change).

**Rooms:** cards with status chips; one styled filter bar; "Compact" toggle gives the mockup's readiness strip.

**Guests:** table-style list with search; profile as sectioned cards; privacy tools in a separate "Danger zone" card.

**Payments, Reports, Settings hub, admin pages:** same primitives; report bars and the peak grid use the new palette.

**Booking details panel:** right-hand panel on desktop, full-screen sheet on phones, plain positioned element with focus handling and Escape. Header: booking status chip and the existing payment status. Details: guest, date, time, treatment, price, therapist, room. Actions: Reschedule, Cancel and the next status step with existing role rules. Activity history from existing booking events. Used from Schedule and Today.

**States:** loading skeletons, empty states, `Alert` errors; the existing `loading.tsx` and `error.tsx` files (5 screens) are restyled.

**Phones:** one column, 44px controls, stacked Today panels.

## 7. Rollout (each step its own commit)

0. Install dependencies, read the Next 16 docs, record a baseline (`lint`, `build`, `vitest run src`).
1. Tokens, type scale, `cn()`, primitives, `status.ts`. Old screens look unchanged.
2. Shell, phone menu, wordmark setting, login.
3. Today.
4. Rooms, then Guests.
5. Booking details panel.
6. Payments, Reports, Settings hub, admin pages, states.
7. Remove now-unused `field`, `rowBox`, `STATUS_BG` copies.

## 8. Testing

- Always: `lint`, `build`, `vitest run src` (includes message parity), axe accessibility tests, Playwright on desktop and phone, `test:prod` (headers).
- New small tests: nav shows each role only its links; `status.ts` covers every room and booking status.
- At step 3 run `test:scale` (40 rooms) to confirm Today's extra read is within budget.
- Test exceptions are written into the plan before each step.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Layout changes break tests that depend on DOM order | small steps, frozen selectors, named exceptions up front |
| Olive on cream fails contrast | choose the green with the axe checker before step 2 |
| Today's room read slows the page | reuse existing read; `test:scale` at step 3 |
| Phone menu traps focus | focus test; Escape and focus return |
| Long Thai text wraps badly in chips and cards | review with a long Thai sample |

## 10. Verification limits

The app needs the local Supabase stack (Docker), which is not available in the authoring session. Lint, build and unit tests can run there; the Playwright suite and visual review must run in CI (`.github/workflows/ci.yml`) or on the owner's machine. A step is not reported done on lint and build alone.

## 11. Assumptions to confirm

- BANYAN is the name to ship under, and the "Men's Spa" tagline may appear in the staff UI.
- The mockup's English-only sample is a layout reference; Thai remains the default language.
- Hidden Bookings item (instead of a disabled one) until sub-project #4.
