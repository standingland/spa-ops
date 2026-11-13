# Public booking page: therapist showcase with instant LINE booking

Date: 2026-11-13. Status: draft, awaiting the owner's approval. Nothing is built.

## Intent and why

Today every screen in the app is behind staff login, and reception makes every booking. The owner wants a public page, open to anyone without an account, that works as a **showcase for the therapists** and lets a guest **book themselves**. The therapists are the draw: the guest chooses a person first, then books time with that person. The aim is easy access for anyone, so booking is instant and does not wait for reception.

## Goals

- A public page, Thai first with English, that anyone can open, showing each public therapist as a photo, with a profile reached by tapping the photo.
- A guest can book a service with a chosen therapist, instantly confirmed, without staff involvement.
- The booking uses the existing booking rules, so a double booking is still impossible and the booking appears on the staff schedule like any other.
- The guest's identity is verified through LINE. The guest receives the confirmation, and a link to cancel, as a LINE message.
- Managers control who appears publicly and edit profiles from the existing Therapists admin page.

## Non-goals

- No online payment, deposit or price collection. The system records payments at the desk only, as it does today.
- No guest accounts, passwords or booking history screens.
- No booking for parties or several guests at once (single guest, single service per booking).
- No fallback for guests without LINE. They phone or visit reception.
- No staff-side changes beyond the profile editing and a visible "online" source on bookings.

## Anti-goals (a failure even if it technically works)

- Any staff-only data reachable from the public path: guest lists, other guests' bookings, notes, payments, rooms, staff accounts.
- A therapist's photo or profile shown publicly without a manager turning it on.
- A fake or bot booking filling a therapist's day without a verified LINE login.

## Constraints

- Stack: the existing Next.js app, Supabase database, next-intl (Thai/English). **This Next.js version has breaking changes; the builder must read the relevant guide in `node_modules/next/dist/docs/` before writing any code** (see AGENTS.md).
- `available_candidates` and `create_booking` currently require a signed-in staff role. They must not be loosened. The public path needs its own narrow functions.
- Therapist photos today live in a private bucket readable only by owner and manager. Public photos need a separate, deliberate path.
- No message provider is connected today; the notification outbox only logs. LINE is the first real sender (the `Sender` interface in `src/modules/notifications/dispatch.ts` currently supports `sms` and `email` channels).
- The owner must create and pay for the LINE accounts (LINE Official Account, LINE Login channel, Messaging API channel) and supply their keys. The builder cannot do this. Message costs beyond LINE's free allowance are the owner's to check.
- The configured database is the owner's real hosted project with live data. Migrations and test bookings against it need the owner's go-ahead; prefer a local or branch database for development.
- The Content-Security-Policy in `src/lib/csp.ts` limits image sources and will need updating for public photos.

## Approaches considered

1. **Inside the existing app, with a narrow public path (chosen).** A public `/book` page, LINE Login, and a small set of database functions callable only from server code that expose just public profiles, free times, and "create this booking for this verified LINE guest". Reuses the booking rules, translations and outbox. Trade-off: the public page lives in the same app as staff screens, so the public code must be kept strictly separate and tested for isolation.
2. **A separate public app sharing the database.** Strongest isolation, but a second deployment to secure and maintain, and duplicated translations and styling. Too heavy for one page.
3. **Guests as full Supabase users with LINE as the login provider.** Elegant, but needs a new customer role and security rules rewritten across many tables. Highest risk for least visible gain.

The owner chose approach 1.

## Decisions made with the owner

- **Layout A, "team wall, then book":** a grid of therapist photos; tapping one opens a profile, then service, then time, then confirm. (Chosen from three wireframes; the mockups are in `.superpowers/brainstorm/`.)
- **Instant confirmation.** The booking is created as confirmed with no reception step.
- **Verification by LINE only.** Guest taps "Continue with LINE" (LINE Login); the guest is prompted to add the Official Account as a friend so confirmations can be pushed. Guests without LINE are out of scope.
- **Profile content (proposed by me, accepted as a direction):** photo, nickname, short bio in Thai and English, a few specialty tags. Each therapist has a "show on public page" switch; only switched-on therapists, and only the fields listed here, are exposed publicly.
- **Booking steps:** therapist, then a service that therapist offers, then a free time, then confirm.

## Calls I made that the owner has not seen (marked for review)

- A guest may hold at most **2 upcoming bookings** at once.
- Bookable from **2 hours ahead** up to **30 days ahead**.
- A guest can cancel through the LINE link up to **4 hours before** the start.
- Bookings carry a distinct **"online" source** so reception can see where they came from.

## Answered by the owner after the reviewer pass

- **Public photos:** switching a therapist to "public" publishes the photo already on file. There is no separate upload. The admin screen should say plainly, next to the switch, that the existing photo becomes visible to anyone. Un-switching (or replacing or removing the photo) must stop it being served publicly.
- **Services:** each service gets a "bookable online" switch, off by default; only switched-on services can be booked on the public page. **Prices are shown** on the public page for those services.

## Settled after the reviewer pass

From the project itself:

- **Rooms are part of every booking.** `available_candidates` returns a therapist, a room position and a room together, and `create_booking` takes the position. The public free-times and booking functions must go through those same rules (reuse their internals; do not reimplement), so therapist, room and turnover time are all checked. Times are in Bangkok time. Shifts, time off, room blocks and room compatibility are already in `available_candidates`.
- **Therapist-to-service links already exist** (`therapist_services`), and services have a price and an active flag. The customers table allows a missing phone number.

My calls (marked for the owner to check while reading):

- **Login happens at the confirm step.** The guest's choices (therapist, service, time) survive the LINE redirect. If two guests pick the same slot, the loser sees "that time was just taken, please choose another" with the rest of their choices kept. No timed hold.
- **Online guests are always a new, separate customer record**, never merged with an existing customer by name or phone, so a guest can never be linked to someone else's history. Reception can merge duplicates by hand later.
- **The confirmation screen itself shows the cancel link**, in addition to the LINE message, so a failed message never leaves the guest without a way to cancel. The cancel link is a signed token tied to that booking and works without logging in again.
- **Cancelling uses the existing cancelled status**, frees the slot at once, and the booking's history records it was cancelled by the guest online.
- **The page may be built and tested before the LINE keys exist**, using a log-only sender behind a setting. It must not go live to the public until the keys are in.
- **The numbers above (2 upcoming bookings, 2 hours to 30 days ahead, 4-hour cancel cutoff) are stored as settings**, not hard-coded, with those values as defaults.

## What the database change looks like (direction, not final)

- Therapists gain public-profile fields (public flag, Thai/English bio, specialty tags, public photo reference).
- Customers gain a LINE user id; a guest is found or created from the LINE login, with a display name, never a phone number requirement.
- Service-role-only functions for: list public therapists, list a therapist's public services, list free times for therapist plus service on a day, create a booking for a verified guest, and cancel a booking owned by that guest. Each one re-checks the rules; none is callable by the public database role.
- The notification outbox and sender gain a `line` channel, with templates for confirmed and cancelled.

## Left to the builder

- Exact database function shapes, names and migration numbering.
- How the free-times view is computed and how many slots to offer (for example, 15 or 30 minute steps), and handling therapists with no shifts.
- Rate-limit numbers on the public endpoints and bot protection details.
- How the LINE session is held (a short-lived signed cookie is the expected shape) and how a returning guest is recognised.
- How to enforce or encourage the friend-add, and what to do if the guest has blocked the Official Account (the booking still stands; the app records that the message could not be sent).
- Public photo storage mechanics and the CSP change.
- Page styling in the existing BANYAN look, mobile first.
- Tests: the existing suites (Vitest, database tests, Playwright) are the model, including a test that proves no staff data is reachable from the public path.

## Open for the owner

- Creating the LINE accounts and supplying the three keys.
- Confirming which database the work may be tried against.
