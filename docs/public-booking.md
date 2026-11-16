# Public booking page

Guests open `/th/book` (or `/en/book`), see the public therapists as a wall of photos, tap one to read their profile, and book a treatment with them. They sign in with LINE, the booking is **confirmed instantly**, and the confirmation (with a cancel link) arrives as a LINE message and on the confirmation page. The page is closed until you finish the steps below.

Design and decisions: `docs/superpowers/specs/2026-11-13-public-booking-design.md`.

## What guests can and cannot do

* Book one treatment with one therapist at a time, from 2 hours to 30 days ahead, at most 2 upcoming online bookings each (all three numbers are settings).
* Cancel online up to 4 hours before the start (also a setting). After that they must contact you. A guest who cancels inside your free-cancellation window is charged the same late-cancellation fee as a staff cancel.
* Guests without LINE cannot book online in this version; they phone or visit reception.
* Staff see the booking on the schedule like any other; its source is **online**. A guest is always a new customer record, never merged with an existing one. Reception can merge duplicates by hand.

## Switch-on checklist (owner)

1. **Create the LINE accounts** at the LINE Developers console. In one provider create a **Messaging API** channel (this is your LINE Official Account) and a **LINE Login** channel. Link the Official Account to the Login channel so guests are asked to add it as a friend.
2. In the LINE Login channel, set the callback URL to `https://<your domain>/api/line/callback`, and publish the channel.
3. Copy the keys into the app's environment (see `docs/deployment.md`): `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`, `LINE_MESSAGING_TOKEN` (the Messaging API channel access token), `PUBLIC_BASE_URL` (for example `https://spa.example.com`), and `PUBLIC_TOKEN_SECRET` (32 or more random characters). Set all five or none; a partial set stops the app at start.
4. **Apply the database migrations** `0023` to `0028` to the production database the way the rest of `docs/deployment.md` describes. They only add columns, settings and functions; they delete nothing.
5. In the app, as manager or owner:
   * **Therapists:** open a therapist, turn on **Show on the public page**, and fill in the bio and specialties. Read the note beside the switch: turning it on makes this therapist's **existing photo** visible to anyone. Turning it off, or replacing or removing the photo, stops it being served.
   * **Services:** turn on **Bookable online** for the treatments guests may book. Their prices are shown on the public page.
6. As the owner, open **Settings → Online booking** and turn on **Open the public booking page**. This is the last switch; until it is on (and the LINE keys are set) every public page says "Online booking is not open yet".
7. Make sure the message job is scheduled (`POST /api/internal/dispatch`, see `docs/operations.md`). Confirmations and cancellations are sent by that job, so they arrive within a minute or two of the scheduler's interval.
8. Try it yourself: book with your own LINE account, check the confirmation message, then cancel from its link.

## Costs and limits

### Incoming LINE webhook

The optional endpoint `/api/line/webhook` verifies requests with the **Messaging API channel secret** stored in `LINE_MESSAGING_CHANNEL_SECRET`. This is different from the LINE Login channel secret. Configure it as a server-side secret, deploy, then set the webhook URL to `https://<your domain>/api/line/webhook`, verify it in LINE Developers and enable Use webhook. The endpoint accepts authenticated events but does not store them, create guest records, or send replies; events received now cannot be replayed later. Booking confirmations are outgoing messages and still require the scheduled dispatcher.

* LINE charges for messages beyond the free allowance of your Official Account plan. Check LINE's current plan and price pages for Thailand before opening the page to the public.
* If a guest blocks your Official Account, the confirmation message fails and is retried a few times, then marked dead in **Admin → Notifications**. The booking itself stands, and the confirmation page still shows the cancel link.

## What is exposed publicly

Only these, and only through server code that uses the service key:

* Therapists who are switched on: nickname, bio, specialties, photo.
* Treatments that are both bookable online and offered by that therapist: name, duration, price.
* Free start times for one therapist and treatment on one day.
* For a guest holding their own signed link: that one booking's time, therapist and treatment.

The database functions behind these (`public_*`) cannot be called by the public database roles; `tests/db/public-isolation.test.ts` proves it and lists exactly what each may return.

## Turning it off

Turn **Open the public booking page** off in Settings. Existing online bookings are unaffected; guests can still cancel from their links. Therapist photos also stop being served while the page is off.
