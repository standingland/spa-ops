# Spa Ops — Plan 3 of 4: Business Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can see what the business earned and collected, the desk can take and reconcile payments, staff can work from a private customer record, and the owner can change operating rules and honour data-protection requests without a developer.

**Architecture:** Money is an append-only ledger (`payments`): nothing is edited or deleted, mistakes are voided with a reason, and every balance and payment status is **derived** from it. What a booking costs is stored on the booking (price, discount, fee) and frozen when a fee is charged, so later policy changes never rewrite history. Every report is a SQL function with one written definition, restricted by role inside the database; screens and CSV files only present those results.

**Tech Stack:** As built — Next.js 16.4.6, React 19.3, Tailwind 4.3, next-intl 4, Supabase, Zod 4, Vitest 5 + `pg`, Playwright 1.65. No new dependencies (charts are CSS bars and tables). Read `AGENTS.md` before writing page or route code.

**Spec:** `docs/spec/master-prompt.md` — sections 9, 10 (cancellation and no-show policies), 11, 12, the manager-reports line of 13, and Phase 4 of section 16. Builds on `docs/architecture.md` and the two earlier plans in `docs/superpowers/plans/`.

## Global Constraints

- Everything in the Global Constraints of Plans 1 and 2 still applies (no hardcoded rooms, therapists, services; deactivate instead of delete; Thai first, English ready; THB as integer satang, 24-hour time, `Asia/Bangkok`; permissions enforced in the database; server clock decides; no cloud resources, purchases or deployments; no fabricated results).
- "Do not store card numbers or sensitive payment credentials." Payment reference and note fields refuse anything that looks like a card number.
- "Do not assume that recording a transfer means payment has been verified." A method marked as needing verification stays unverified until an owner or manager verifies it.
- "Distinguish booked revenue from collected revenue." "Avoid double-counting appointments, rescheduled services, and refunded transactions." The definitions in Tasks 5 and 6 are the only definitions; screens and CSV headers use the same words.
- "All reporting calculations must dynamically reflect the rooms and therapists configured in the database."
- "Do not expose private customer notes to unauthorized employees." Therapists still have no access to the `customers` table; anything they see comes through a function that returns only what a treatment needs.
- "Use data minimization and retention practices appropriate for Thailand's Personal Data Protection Act (PDPA), with legal compliance reviewed before production use." This plan builds the tools (consent record, export, anonymisation, retention list); it does not make a legal judgment. Anonymisation is irreversible and asks for typed confirmation.
- A "day" in any report or summary is a Bangkok calendar day. A booking belongs to the day its service **starts**; a payment to the day it was **received**.
- New error codes (SQLSTATE `P0001`, message equals the code): `INVALID_SETTING`, `INVALID_AMOUNT`, `OVERPAYMENT`, `REFUND_EXCEEDS_PAYMENT`, `CARD_DATA_REFUSED`, `REASON_REQUIRED`.
- Existing interfaces consumed exactly as built: `tests/db/helpers.ts` (`Base`, `resetDb`, `asRole`, `asAdmin`, `asService`, `book`, `bkk`, `soon`, `shiftNow`, `runTo`, `expectCode`, `randomUUID`); `tests/e2e/db.ts` (`admin`, `seedBooking`, `seedBookingNow`, `setStatusAsReception`, `tomorrowAt`, `resetTestData`); `tests/e2e/helpers.ts` (`signIn`); `roleOrNull`, `requireRole`; `fail`, `failFrom`, `done`, `ActionResult`; `formatTHB`; `bangkokDay`, `addDays`, `formatTime`; `getToday`, `OPS_DEFAULTS`, `OpsConfig`; `searchCustomers`, `createCustomer`; `useLiveRefresh`. Base fixture facts used in tests: `svc60` costs 150000 satang and lasts 60 minutes; `t1` and `t2` work 10:00–22:00 on 2030-01-15, which is a Tuesday.

## Review Focus

1. **A customer pays, then the booking is cancelled:** the booking shows as overpaid with a refund owed, the refund is recorded against the original payment, and collected revenue nets to zero without the booking being counted as revenue. → Task 3, Task 5.
2. **Double-tap or retry on "record payment":** one payment row, one amount. → Task 3, Task 9.
3. **Someone types a card number into the reference or note:** refused with a clear message; nothing is stored. → Task 3, Task 9.
4. **Policy changed after the fact:** a fee already charged, and a report already read, do not change when the owner edits the cancellation policy. → Task 2.
5. **A report exported to a spreadsheet:** Thai text opens correctly in Excel, and a service or customer name beginning with `=` cannot run as a formula. → Task 7, Task 12.

## File Structure

```
supabase/migrations/
  0013_settings.sql        app_settings, get_settings, set_setting; room_status_board reads the lead time
  0014_charges.sql         fee columns, policy applied on cancel / no-show, adjust_booking_charge
  0015_payments.sql        payment_methods, payments ledger, money read models, cash closing
  0016_customer_privacy.sql  customer fields, summary, booking_detail, export, anonymise, retention list
  0017_reports_money.sql   report_revenue, report_summary, report_by_service, report_by_therapist
  0018_reports_ops.sql     report_room_utilization, report_therapist_utilization, report_peak_periods
tests/db/                  settings, charges, payments, customer-privacy, reports-money, reports-ops (.test.ts)
src/lib/                   csv.ts, phone.ts (+tests); money.ts gains parseTHB; errors.ts gains six codes
src/modules/settings/      schema.ts, actions.ts, components/SettingsForm.tsx
src/modules/payments/      schema.ts, actions.ts, components/{PaymentDialog,PendingPayments,ChargeAdjust,Reconciliation,MethodsAdmin}.tsx
src/modules/customers/     schema.ts, actions.ts (extended), components/{CustomerList,CustomerProfile,PrivacyTools,RetentionList}.tsx
src/modules/reports/       schema.ts, actions.ts, definitions.ts, components/{ReportsDashboard,Bars,PeakGrid}.tsx
src/app/[locale]/(staff)/  admin/settings, payments, customers, customers/[id], reports  (page.tsx each)
src/app/api/reports/[name]/csv/route.ts
src/app/api/customers/[id]/export/route.ts
tests/e2e/                 settings, payments, reconciliation, customers, reports (.spec.ts)
```

---

### Task 1: Owner-editable settings

**Files:**
- Create: `supabase/migrations/0013_settings.sql`, `tests/db/settings.test.ts`

**Interfaces:**
- Produces:
  - `app_settings(key text primary key, value jsonb not null, updated_by uuid default auth.uid(), updated_at timestamptz not null default now())`. RLS: active staff select; no direct writes. Audited.
  - The complete list of keys, defaults and limits (anything else is `INVALID_SETTING`):

| Key | Default | Allowed |
|---|---|---|
| `ops.arrival_window_min` | 60 | integer 5–240 |
| `ops.late_arrival_min` | 10 | integer 1–120 |
| `ops.ending_soon_min` | 10 | integer 1–60 |
| `ops.room_prep_warn_min` | 15 | integer 1–120 |
| `ops.reserved_lead_min` | 30 | integer 0–240 |
| `policy.cancel_free_min` | 120 | integer 0–10080 |
| `policy.cancel_fee_percent` | 0 | integer 0–100 |
| `policy.no_show_fee_percent` | 0 | integer 0–100 |
| `payments.receptionist_can_record` | true | boolean |
| `reports.manager_can_view` | true | boolean |
| `retention.inactive_months` | 24 | integer 6–120 |

  - `get_settings() returns jsonb` — any active staff role; every key above with its stored value or default.
  - `set_setting(p_key text, p_value jsonb) returns jsonb` — owner only (`NOT_AUTHORIZED` otherwise); validates per the table; upserts; returns `get_settings()`.
  - `private.setting_int(p_key text) returns int`, `private.setting_bool(p_key text) returns boolean` — stored value or default; used by later migrations.
  - `room_status_board(p_now timestamptz default now(), p_reserved_lead_min int default null)` — replaced; a null lead time means `private.setting_int('ops.reserved_lead_min')`.

- [ ] **Step 1: Write the failing tests**

```ts
const settings = (a: Actor) => asRole(b, a, (c) => c.query(`select get_settings() s`)).then((r) => r.rows[0].s);

test('every key has a default until the owner changes it', async () => {
  const s = await settings('therapist');
  expect(Object.keys(s)).toHaveLength(11);
  expect([s['ops.reserved_lead_min'], s['policy.cancel_fee_percent'], s['reports.manager_can_view']]).toEqual([30, 0, true]);
});
test('the reserved lead time drives room status', async () => {
  await asRole(b, 'receptionist', (c) => book(c, b));                                   // 10:00
  const at = (t: string) => asRole(b, 'receptionist', (c) => c.query(`select status from room_status_board($1) where room_id=$2`, [t, b.rooms[0]])).then((r) => r.rows[0].status);
  expect(await at(bkk('09:20'))).toBe('available');
  await asRole(b, 'owner', (c) => c.query(`select set_setting('ops.reserved_lead_min', '45')`));
  expect(await at(bkk('09:20'))).toBe('reserved');
});
test('only the owner may change settings, and only valid ones', async () => {
  await expectCode(asRole(b, 'manager', (c) => c.query(`select set_setting('ops.late_arrival_min', '5')`)), 'NOT_AUTHORIZED');
  for (const [k, v] of [['ops.unknown', '5'], ['policy.cancel_fee_percent', '150'], ['ops.late_arrival_min', '"ten"'], ['reports.manager_can_view', '1']])
    await expectCode(asRole(b, 'owner', (c) => c.query(`select set_setting($1, $2::jsonb)`, [k, v])), 'INVALID_SETTING');
  expect((await asRole(b, 'owner', (c) => c.query(`update app_settings set value='1' returning key`))).rowCount).toBe(0);
});
test('a change is audited with the owner as actor', async () => {
  await asRole(b, 'owner', (c) => c.query(`select set_setting('retention.inactive_months', '36')`));
  const a = await asAdmin((c) => c.query(`select actor from audit_log where table_name='app_settings' order by id desc limit 1`));
  expect(a.rows[0].actor).toBe(b.users.owner);
});
```

- [ ] **Step 2: Run** `npm run test:db -- settings`. Expected: FAIL.
- [ ] **Step 3: Write `0013_settings.sql`.** `private.audit()` must handle a table whose key is `key` (text): store `row_id` as null for `app_settings` and keep the key inside `new`.
- [ ] **Step 4: Run** `npm run test:db`. Expected: all pass (201 existing + 4).
- [ ] **Step 5: Commit** `feat(db): owner-editable settings`.

---

### Task 2: What a booking costs — discounts, cancellation and no-show fees

**Files:**
- Create: `supabase/migrations/0014_charges.sql`, `tests/db/charges.test.ts`

**Interfaces:**
- Produces:
  - `bookings` gains `fee_satang int not null default 0 check (fee_satang >= 0)` and `charge_reason text`.
  - `booking_events.kind` additionally allows `'charge_adjusted'`.
  - `private.booking_charge(b bookings) returns int` — `b.fee_satang` when status is `cancelled` or `no_show`; otherwise `b.price_satang − b.discount_satang`.
  - `set_booking_status` — replaced, same signature; Plan 2 behaviour unchanged, plus: on `→ cancelled`, if `now() > lower(service_during) − policy.cancel_free_min minutes`, set `fee_satang = round((price_satang − discount_satang) × policy.cancel_fee_percent / 100)`; on `→ no_show`, set `fee_satang = round((price_satang − discount_satang) × policy.no_show_fee_percent / 100)`. The fee is stored once and never recalculated.
  - `adjust_booking_charge(p_booking_id uuid, p_discount_satang int, p_fee_satang int, p_reason text, p_expected_version int) returns bookings` — owner, manager. A null amount leaves that field unchanged. `STALE_VERSION` on a version mismatch; `REASON_REQUIRED` when the reason is blank; `INVALID_AMOUNT` when the discount is negative or above the price, or the fee is negative or above `price − discount`. Bumps `version`; adds a `charge_adjusted` event.

- [ ] **Step 1: Write the failing tests**

```ts
const policy = (k: string, v: number) => asRole(b, 'owner', (c) => c.query(`select set_setting($1, $2::jsonb)`, [k, String(v)]));
const cancel = (id: string, to = 'cancelled') => asRole(b, 'receptionist', (c) => c.query(`select * from set_booking_status($1,$2,1)`, [id, to])).then((r) => r.rows[0]);

test('cancelling well ahead is free; cancelling late charges the policy percentage', async () => {
  await policy('policy.cancel_fee_percent', 50); await shiftNow(b);
  const far = await asRole(b, 'receptionist', (c) => book(c, b));                                   // 2030
  const near = await asRole(b, 'receptionist', (c) => book(c, b, { start: soon(30), customer: b.c2, position: b.pos[1] }));
  expect((await cancel(far.id)).fee_satang).toBe(0);
  expect((await cancel(near.id)).fee_satang).toBe(75000);
});
test('a no-show is charged the no-show percentage of the discounted price', async () => {
  await policy('policy.no_show_fee_percent', 100);
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await asRole(b, 'manager', (c) => c.query(`select adjust_booking_charge($1, 30000, null, 'สมาชิก', 1)`, [k.id]));
  const r = await asRole(b, 'receptionist', (c) => c.query(`select * from set_booking_status($1,'no_show',2)`, [k.id]));
  expect([r.rows[0].discount_satang, r.rows[0].fee_satang]).toEqual([30000, 120000]);
});
test('a fee already charged does not change when the policy changes, and a manager can waive it', async () => {
  await policy('policy.no_show_fee_percent', 100);
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await cancel(k.id, 'no_show');
  await policy('policy.no_show_fee_percent', 10);
  expect((await asAdmin((c) => c.query(`select fee_satang from bookings where id=$1`, [k.id]))).rows[0].fee_satang).toBe(150000);
  const w = await asRole(b, 'manager', (c) => c.query(`select * from adjust_booking_charge($1, null, 0, 'ลูกค้าแจ้งล่วงหน้า', 2)`, [k.id]));
  expect([w.rows[0].fee_satang, w.rows[0].charge_reason, w.rows[0].version]).toEqual([0, 'ลูกค้าแจ้งล่วงหน้า', 3]);
  const ev = await asAdmin((c) => c.query(`select kind from booking_events where booking_id=$1 order by id desc limit 1`, [k.id]));
  expect(ev.rows[0].kind).toBe('charge_adjusted');
});
test('adjustments are limited to managers, need a reason and sane amounts', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const adj = (a: Actor, d: number | null, f: number | null, why: string, v = 1) => asRole(b, a, (c) => c.query(`select adjust_booking_charge($1,$2,$3,$4,$5)`, [k.id, d, f, why, v]));
  await expectCode(adj('receptionist', 1000, null, 'x'), 'NOT_AUTHORIZED');
  await expectCode(adj('manager', 1000, null, '  '), 'REASON_REQUIRED');
  await expectCode(adj('manager', 150001, null, 'x'), 'INVALID_AMOUNT');
  await expectCode(adj('manager', -1, null, 'x'), 'INVALID_AMOUNT');
  await expectCode(adj('manager', null, 150001, 'x'), 'INVALID_AMOUNT');
  await expectCode(adj('manager', 1000, null, 'x', 9), 'STALE_VERSION');
});
```

- [ ] **Step 2: Run** `npm run test:db -- charges`. Expected: FAIL.
- [ ] **Step 3: Write `0014_charges.sql`.**
- [ ] **Step 4: Run** `npm run test:db`. Expected: all pass, including `ops-turnover`, `notifications` and `booking-change`.
- [ ] **Step 5: Commit** `feat(db): discounts and cancellation / no-show fees`.

---

### Task 3: Payment ledger, balances and cash closing

**Files:**
- Create: `supabase/migrations/0015_payments.sql`, `tests/db/payments.test.ts`
- Modify: `tests/db/helpers.ts`

**Interfaces:**
- Produces (database):
  - `payment_methods(id uuid pk, code text not null unique, name_th text not null, name_en text, needs_verification boolean not null default false, active boolean not null default true, sort_order int not null default 0)`. The migration inserts `cash` (no verification), `bank_transfer` and `promptpay` (both need verification). RLS: active staff select; owner inserts and updates; no delete.
  - `payments(id uuid pk default gen_random_uuid(), booking_id uuid not null → bookings, method_id uuid not null → payment_methods, kind text not null check (kind in ('payment','refund')), amount_satang int not null check (amount_satang > 0), refund_of uuid → payments, reference text, note text, received_by uuid default auth.uid(), received_at timestamptz not null default now(), verified_at timestamptz, verified_by uuid, voided_at timestamptz, voided_by uuid, void_reason text, idempotency_key text not null unique)`. RLS: owner, manager, receptionist select; **no insert, update or delete policy for any role**. Audited.
  - `private.looks_like_card(p text) returns boolean` — true when `p`, with spaces and dashes removed, is 13–19 digits that pass the Luhn check.
  - Enum `payment_status ('not_due','unpaid','partial','paid','overpaid','refunded')`.
  - `record_payment(p_booking_id uuid, p_method_id uuid, p_amount_satang int, p_idempotency_key text, p_reference text default null, p_note text default null) returns payments` — owner, manager, and receptionist when `payments.receptionist_can_record` is true. Returns the existing row for a repeated key. Locks the booking row. `INVALID_AMOUNT` if amount ≤ 0; `RESOURCE_INACTIVE` if the method is inactive; `CARD_DATA_REFUSED` if the reference or note looks like a card; `OVERPAYMENT` if the amount exceeds the amount due. A method that does not need verification is verified at once (`verified_by` = the recorder).
  - `verify_payment(p_payment_id uuid) returns payments` — owner, manager; `INVALID_TRANSITION` if already verified or voided.
  - `void_payment(p_payment_id uuid, p_reason text) returns payments` — owner, manager; `REASON_REQUIRED`; `INVALID_TRANSITION` if already voided or if non-voided refunds point at it.
  - `record_refund(p_payment_id uuid, p_amount_satang int, p_idempotency_key text, p_reason text) returns payments` — owner, manager; inserts a `refund` row with `refund_of`, the same booking and method, `note = p_reason`, verified at once. `REASON_REQUIRED`; `INVALID_AMOUNT`; `REFUND_EXCEEDS_PAYMENT` when it exceeds the payment minus its earlier non-voided refunds; `INVALID_TRANSITION` if the payment is voided or is itself a refund.
  - `booking_money(p_booking_ids uuid[]) returns table (booking_id uuid, charge_satang int, paid_satang int, refunded_satang int, due_satang int, payment_status payment_status, has_unverified boolean)` — owner, manager, receptionist. Voided rows are ignored. `charge = private.booking_charge`; `net = paid − refunded`; `due = charge − net`. Status: `not_due` (charge 0, paid 0); `refunded` (charge 0, paid > 0, net 0); `unpaid` (charge > 0, net 0); `partial` (0 < net < charge); `paid` (net = charge, charge > 0); `overpaid` (net > charge).
  - `pending_payments() returns table (booking_id uuid, customer_display_name text, starts_at timestamptz, status booking_status, charge_satang int, due_satang int, payment_status payment_status)` — same roles; bookings in `completed`, `cancelled` or `no_show` whose `due_satang <> 0`, oldest first. A negative due is a refund owed.
  - `payment_day_summary(p_day date) returns table (method_id uuid, payments int, recorded_satang bigint, verified_satang bigint, unverified_satang bigint, refunded_satang bigint, voided_satang bigint)` — owner, manager; payments received on that Bangkok day, one row per method that has any.
  - `cash_closings(day date primary key, expected_satang bigint not null, counted_satang bigint not null, note text, closed_by uuid, closed_at timestamptz)` and `close_cash_day(p_day date, p_counted_satang bigint, p_note text default null) returns cash_closings` — owner, manager; `expected_satang` = that day's non-voided cash payments minus cash refunds, captured at closing; closing again replaces the row. RLS: owner, manager select.
- Produces (`tests/db/helpers.ts`):

```ts
export function methodId(code: 'cash' | 'bank_transfer' | 'promptpay'): Promise<string>;
export function pay(b: Base, a: Actor, bookingId: string, amount: number, over?: Partial<{ method: 'cash' | 'bank_transfer' | 'promptpay'; key: string; reference: string | null; note: string | null }>): Promise<Record<string, any>>;
export function money(b: Base, bookingId: string): Promise<Record<string, any>>;   // booking_money row, read as manager
export function today(): Promise<string>;                                            // Bangkok date of now(), 'YYYY-MM-DD'
```

- [ ] **Step 1: Write the failing tests**

```ts
test('cash settles a completed booking and is verified at once', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b)); await runTo(b, k.id, 'completed');
  const p = await pay(b, 'receptionist', k.id, 150000);
  expect(p.verified_at).not.toBeNull();
  expect(await money(b, k.id)).toMatchObject({ charge_satang: 150000, paid_satang: 150000, due_satang: 0, payment_status: 'paid', has_unverified: false });
});
test('partial payments add up; paying more than is due is refused', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await pay(b, 'receptionist', k.id, 50000);
  expect(await money(b, k.id)).toMatchObject({ due_satang: 100000, payment_status: 'partial' });
  await expectCode(pay(b, 'receptionist', k.id, 100001), 'OVERPAYMENT');
  await pay(b, 'receptionist', k.id, 100000);
  expect((await money(b, k.id)).payment_status).toBe('paid');
});
test('a transfer is recorded but not trusted until a manager verifies it', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const p = await pay(b, 'receptionist', k.id, 150000, { method: 'bank_transfer', reference: 'TXN-88A1' });
  expect(p.verified_at).toBeNull();
  expect((await money(b, k.id)).has_unverified).toBe(true);
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select verify_payment($1)`, [p.id])), 'NOT_AUTHORIZED');
  await asRole(b, 'manager', (c) => c.query(`select verify_payment($1)`, [p.id]));
  expect((await money(b, k.id)).has_unverified).toBe(false);
  await expectCode(asRole(b, 'manager', (c) => c.query(`select verify_payment($1)`, [p.id])), 'INVALID_TRANSITION');
});
test('the same key twice is one payment', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b)); const key = randomUUID();
  const a = await pay(b, 'receptionist', k.id, 150000, { key });
  expect((await pay(b, 'receptionist', k.id, 150000, { key })).id).toBe(a.id);
  expect((await asAdmin((c) => c.query(`select 1 from payments`))).rowCount).toBe(1);
});
test('card numbers are refused; ordinary references are kept', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  await expectCode(pay(b, 'receptionist', k.id, 1000, { reference: '4111 1111 1111 1111' }), 'CARD_DATA_REFUSED');
  await expectCode(pay(b, 'receptionist', k.id, 1000, { note: '4111-1111-1111-1111' }), 'CARD_DATA_REFUSED');
  await pay(b, 'receptionist', k.id, 1000, { reference: '1234567890123456' });            // 16 digits, fails Luhn
  expect((await asAdmin((c) => c.query(`select 1 from payments`))).rowCount).toBe(1);
});
test('paid, then cancelled: overpaid until refunded, then refunded', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const p = await pay(b, 'receptionist', k.id, 150000);
  await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'cancelled',1)`, [k.id]));
  expect(await money(b, k.id)).toMatchObject({ charge_satang: 0, due_satang: -150000, payment_status: 'overpaid' });
  const pend = await asRole(b, 'manager', (c) => c.query(`select booking_id, due_satang from pending_payments()`));
  expect(pend.rows).toEqual([{ booking_id: k.id, due_satang: -150000 }]);
  const refund = (a: Actor, amt: number, why = 'ยกเลิก') => asRole(b, a, (c) => c.query(`select * from record_refund($1,$2,$3,$4)`, [p.id, amt, randomUUID(), why]));
  await expectCode(refund('receptionist', 150000), 'NOT_AUTHORIZED');
  await expectCode(refund('manager', 150001), 'REFUND_EXCEEDS_PAYMENT');
  await expectCode(refund('manager', 1000, ''), 'REASON_REQUIRED');
  await refund('manager', 100000); await expectCode(refund('manager', 50001), 'REFUND_EXCEEDS_PAYMENT'); await refund('owner', 50000);
  expect(await money(b, k.id)).toMatchObject({ refunded_satang: 150000, due_satang: 0, payment_status: 'refunded' });
  expect((await asRole(b, 'manager', (c) => c.query(`select 1 from pending_payments()`))).rowCount).toBe(0);
});
test('a mistake is voided with a reason, never edited or deleted', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const p = await pay(b, 'receptionist', k.id, 150000);
  for (const sql of [`update payments set amount_satang=1 returning id`, `delete from payments returning id`])
    expect((await asRole(b, 'owner', (c) => c.query(sql))).rowCount).toBe(0);
  await expectCode(asRole(b, 'manager', (c) => c.query(`select void_payment($1,' ')`, [p.id])), 'REASON_REQUIRED');
  await asRole(b, 'manager', (c) => c.query(`select void_payment($1,'บันทึกผิดรายการ')`, [p.id]));
  expect(await money(b, k.id)).toMatchObject({ paid_satang: 0, payment_status: 'unpaid' });
  await expectCode(asRole(b, 'manager', (c) => c.query(`select void_payment($1,'x')`, [p.id])), 'INVALID_TRANSITION');
});
test('therapists see no money; reception can be switched off', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b)); await pay(b, 'receptionist', k.id, 1000);
  expect((await asRole(b, 'therapist', (c) => c.query(`select 1 from payments`))).rowCount).toBe(0);
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select booking_money($1)`, [[k.id]])), 'NOT_AUTHORIZED');
  await asRole(b, 'owner', (c) => c.query(`select set_setting('payments.receptionist_can_record','false')`));
  await expectCode(pay(b, 'receptionist', k.id, 1000), 'NOT_AUTHORIZED');
  await pay(b, 'manager', k.id, 1000);
});
test('the day summary separates verified from unverified, and cash is closed against a count', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b));
  const z = await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, position: b.pos[1], customer: b.c2 }));
  await pay(b, 'receptionist', k.id, 150000); await pay(b, 'receptionist', z.id, 100000, { method: 'promptpay' });
  const day = await today();
  const s = await asRole(b, 'manager', (c) => c.query(`select m.code, s.recorded_satang::int r, s.verified_satang::int v, s.unverified_satang::int u from payment_day_summary($1) s join payment_methods m on m.id=s.method_id order by m.code`, [day]));
  expect(s.rows).toEqual([{ code: 'cash', r: 150000, v: 150000, u: 0 }, { code: 'promptpay', r: 100000, v: 0, u: 100000 }]);
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select close_cash_day($1, 140000)`, [day])), 'NOT_AUTHORIZED');
  const c1 = await asRole(b, 'manager', (c) => c.query(`select expected_satang::int e, counted_satang::int n from close_cash_day($1, 140000, 'ขาด 100 บาท')`, [day]));
  expect(c1.rows[0]).toEqual({ e: 150000, n: 140000 });
});
```

- [ ] **Step 2: Run** `npm run test:db -- payments`. Expected: FAIL.
- [ ] **Step 3: Write `0015_payments.sql`** and the four helpers.
- [ ] **Step 4: Run** `npm run test:db`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(db): payment ledger, balances and cash closing`.

---

### Task 4: Customer record, privacy tools and retention

**Files:**
- Create: `supabase/migrations/0016_customer_privacy.sql`, `tests/db/customer-privacy.test.ts`

**Interfaces:**
- Produces:
  - `customers` gains `service_notes text` (treatment preferences a therapist needs, e.g. pressure) and `anonymised_at timestamptz`; `check (phone is null or phone ~ '^(0\d{8,9}|\+\d{6,15})$')`; `create unique index customers_phone_unique on customers (phone) where phone is not null`.
  - `customer_summary(p_customer_id uuid) returns table (visits int, cancelled int, no_shows int, first_visit timestamptz, last_visit timestamptz, avg_days_between numeric, top_service_id uuid, upcoming int)` — owner, manager, receptionist. `visits` = completed bookings; `avg_days_between` is null with fewer than two visits; `upcoming` = `requested`/`confirmed`/`checked_in` bookings that have not ended.
  - `booking_detail(p_booking_id uuid) returns table (booking_id uuid, note text, service_notes text, customer_display_name text)` — desk roles for any booking; a therapist only for their own booking (`NOT_AUTHORIZED` otherwise). Never returns contact details.
  - `export_customer(p_customer_id uuid) returns jsonb` — owner, manager. `{"profile": {…customer columns}, "notes": […private notes], "bookings": [{id, starts_at, ends_at, status, service, therapist, room, price_satang, discount_satang, fee_satang, note}], "payments": [{received_at, kind, amount_satang, method, verified}]}`.
  - `anonymise_customer(p_customer_id uuid, p_reason text) returns customers` — **owner only**. `REASON_REQUIRED`; `INVALID_TRANSITION` if already anonymised; `CONFLICTS_WITH_BOOKINGS` if the customer has a `requested`/`confirmed`/`checked_in`/`in_treatment` booking that has not ended. Then, in one transaction: sets `display_name = 'Removed'`, nulls `full_name`, `phone`, `email`, `user_id`, `preferred_therapist_id`, `service_notes`; `comms_consent = false`; `anonymised_at = now()`; deletes the customer's private notes; nulls `note` on their bookings and removes the `note` key from those bookings' `booking_events.before/after` and from the `old`/`new` of those bookings' `audit_log` rows; sets pending or failed outbox rows for them to `dead`; and nulls `old`/`new` on `audit_log` rows for that customer and their notes, then writes one audit row `action = 'ANONYMISE'` holding only the reason. Bookings and payments remain, linked to the emptied record.
  - `retention_candidates(p_as_of timestamptz default now()) returns table (customer_id uuid, display_name text, last_activity timestamptz)` — owner only; customers not yet anonymised whose latest booking end (or `created_at` if they never booked) is more than `retention.inactive_months` months before `p_as_of`. It lists; it never anonymises by itself.

- [ ] **Step 1: Write the failing tests**

```ts
test('a phone number identifies one customer and must be normalised', async () => {
  const ins = (p: string) => asRole(b, 'receptionist', (c) => c.query(`insert into customers(display_name, phone) values ('x', $1)`, [p]));
  await ins('0810000000');
  await expect(ins('0810000000')).rejects.toMatchObject({ code: '23505' });
  await expect(ins('081-000-0000')).rejects.toMatchObject({ code: '23514' });
  await ins('+14155550100');
});
test('the summary counts visits, cancellations and no-shows', async () => {
  const mk = (start: string) => asRole(b, 'receptionist', (c) => book(c, b, { start }));
  await runTo(b, (await mk(bkk('10:00'))).id, 'completed');
  await asRole(b, 'receptionist', (c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]]));
  await runTo(b, (await mk(bkk('12:30'))).id, 'completed');
  const x = await mk(bkk('15:00')); await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'cancelled',1)`, [x.id]));
  const n = await mk(bkk('17:00')); await asRole(b, 'receptionist', (c) => c.query(`select set_booking_status($1,'no_show',1)`, [n.id]));
  await mk(bkk('19:00'));
  const s = await asRole(b, 'receptionist', (c) => c.query(`select * from customer_summary($1)`, [b.c1]));
  expect(s.rows[0]).toMatchObject({ visits: 2, cancelled: 1, no_shows: 1, top_service_id: b.svc60, upcoming: 1 });
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select customer_summary($1)`, [b.c1])), 'NOT_AUTHORIZED');
});
test('a therapist reads treatment notes for their own booking only, never contact details', async () => {
  await asAdmin((c) => c.query(`update customers set service_notes='แรงกดปานกลาง', phone='0810000000' where id=$1`, [b.c1]));
  const mine = await asRole(b, 'receptionist', (c) => book(c, b, { note: 'มาสาย 5 นาที' }));
  const other = await asRole(b, 'receptionist', (c) => book(c, b, { therapist: b.t2, position: b.pos[1], customer: b.c2 }));
  const d = await asRole(b, 'therapist', (c) => c.query(`select * from booking_detail($1)`, [mine.id]));
  expect(d.rows[0]).toEqual({ booking_id: mine.id, note: 'มาสาย 5 นาที', service_notes: 'แรงกดปานกลาง', customer_display_name: expect.any(String) });
  await expectCode(asRole(b, 'therapist', (c) => c.query(`select booking_detail($1)`, [other.id])), 'NOT_AUTHORIZED');
});
test('export gathers everything held about one person, for owner and manager only', async () => {
  const k = await asRole(b, 'receptionist', (c) => book(c, b)); await pay(b, 'receptionist', k.id, 150000);
  await asRole(b, 'manager', (c) => c.query(`insert into customer_private_notes(customer_id, body) values ($1,'n')`, [b.c1]));
  const e = (await asRole(b, 'manager', (c) => c.query(`select export_customer($1) e`, [b.c1]))).rows[0].e;
  expect(Object.keys(e).sort()).toEqual(['bookings', 'notes', 'payments', 'profile']);
  expect([e.bookings.length, e.payments.length, e.notes.length]).toEqual([1, 1, 1]);
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select export_customer($1)`, [b.c1])), 'NOT_AUTHORIZED');
});
test('anonymising empties the person and keeps the business record', async () => {
  await asAdmin((c) => c.query(`update customers set full_name='ชื่อ จริง', phone='0810000000', comms_consent=true where id=$1`, [b.c1]));
  await asRole(b, 'manager', (c) => c.query(`insert into customer_private_notes(customer_id, body) values ($1,'ลับ')`, [b.c1]));
  const k = await asRole(b, 'receptionist', (c) => book(c, b, { note: 'โน้ต' })); await pay(b, 'receptionist', k.id, 150000);
  const anon = (a: Actor, why = 'ลูกค้าขอลบข้อมูล') => asRole(b, a, (c) => c.query(`select * from anonymise_customer($1,$2)`, [b.c1, why]));
  await expectCode(anon('manager'), 'NOT_AUTHORIZED');
  await expectCode(anon('owner', ''), 'REASON_REQUIRED');
  await expectCode(anon('owner'), 'CONFLICTS_WITH_BOOKINGS');
  await runTo(b, k.id, 'completed');
  const r = (await anon('owner')).rows[0];
  expect([r.display_name, r.full_name, r.phone, r.comms_consent, r.anonymised_at === null]).toEqual(['Removed', null, null, false, false]);
  const left = await asAdmin((c) => c.query(`select
    (select count(*)::int from customer_private_notes where customer_id=$1) notes,
    (select note from bookings where id=$2) note,
    (select count(*)::int from payments where booking_id=$2) payments,
    (select count(*)::int from notification_outbox where customer_id=$1 and status in ('pending','failed')) queued,
    (select count(*)::int from audit_log where row_id=$1 and (old::text like '%0810000000%' or new::text like '%0810000000%')) leaked,
    (select count(*)::int from booking_events where before::text like '%โน้ต%' or after::text like '%โน้ต%') event_notes,
    (select count(*)::int from audit_log where old::text like '%โน้ต%' or new::text like '%โน้ต%' or old::text like '%ลับ%') audit_notes`, [b.c1, k.id]));
  expect(left.rows[0]).toEqual({ notes: 0, note: null, payments: 1, queued: 0, leaked: 0, event_notes: 0, audit_notes: 0 });
  await expectCode(anon('owner'), 'INVALID_TRANSITION');
});
test('the retention list follows the configured months and only lists', async () => {
  await asRole(b, 'receptionist', (c) => book(c, b));                                                       // c1 active on 2030-01-15
  const list = (asOf: string) => asRole(b, 'owner', (c) => c.query(`select customer_id from retention_candidates($1)`, [asOf])).then((r) => r.rows.map((x) => x.customer_id));
  expect(await list('2031-06-01T00:00:00Z')).toEqual([b.c2]);                                               // c2 never booked, created long before
  expect((await list('2033-01-01T00:00:00Z')).sort()).toEqual([b.c1, b.c2].sort());
  await expectCode(asRole(b, 'manager', (c) => c.query(`select retention_candidates()`)), 'NOT_AUTHORIZED');
  expect((await asAdmin((c) => c.query(`select 1 from customers where anonymised_at is not null`))).rowCount).toBe(0);
});
```

- [ ] **Step 2: Run** `npm run test:db -- customer-privacy`. Expected: FAIL.
- [ ] **Step 3: Write `0016_customer_privacy.sql`.** Deleting private notes is the one deliberate hard delete in the system; it happens only inside `anonymise_customer`.
- [ ] **Step 4: Run** `npm run test:db`. Expected: all pass. If an existing test or `supabase/seed.sql` stores a phone that fails the new check, normalise that value there.
- [ ] **Step 5: Commit** `feat(db): customer summary, privacy tools and retention list`.

---

### Task 5: Money reports

**Files:**
- Create: `supabase/migrations/0017_reports_money.sql`, `tests/db/reports-money.test.ts`

**Interfaces:**
- Produces — all `security definer`, `stable`; owner always, manager when `reports.manager_can_view` is true, everyone else `NOT_AUTHORIZED` (helper `private.require_reports()`). `p_from` and `p_to` are inclusive Bangkok dates.
  - Definitions (write these as a comment block at the top of the migration; Task 12 copies them into the screen and the docs):
    - **Booked revenue** = for bookings whose service starts in the period: `price − discount` of `completed` bookings **plus** `fee_satang` of `cancelled` and `no_show` bookings. A rescheduled booking is one booking, counted on the day it finally starts.
    - **Collected revenue** = non-voided `payment` rows received in the period. **Refunded** = non-voided `refund` rows received in the period. **Net collected** = collected − refunded. Verification does not change these; unverified amounts are shown separately in reconciliation.
    - **Average transaction value** = booked revenue of completed bookings ÷ completed bookings (fees excluded).
    - **Cancellation rate** = cancelled ÷ all bookings starting in the period; **no-show rate** likewise. **Reschedules** = `rescheduled` events on those bookings.
    - **Returning customer rate** = of customers with a completed booking in the period, the share who had a completed booking before their first one in the period.
  - `report_revenue(p_from date, p_to date, p_grain text default 'day') returns table (bucket date, booked_satang bigint, collected_satang bigint, refunded_satang bigint, net_collected_satang bigint)` — `p_grain` is `day`, `week` (bucket = Monday) or `month` (bucket = first day); otherwise `INVALID_SETTING`. Only buckets with data, ascending.
  - `report_summary(p_from date, p_to date) returns table (bookings int, completed int, cancelled int, no_shows int, walk_ins int, reschedules int, cancellation_rate numeric, no_show_rate numeric, booked_satang bigint, fee_satang bigint, avg_transaction_satang bigint, customers int, returning_customers int, returning_rate numeric)` — rates rounded to 4 places; 0 when the denominator is 0.
  - `report_by_service(p_from date, p_to date) returns table (service_id uuid, completed int, minutes int, booked_satang bigint)` and `report_by_therapist(…) returns table (therapist_id uuid, completed int, minutes int, booked_satang bigint)` — completed bookings only; fees are not attributed. Inactive services and therapists still appear when they have completed bookings in the period.

- [ ] **Step 1: Write the failing tests.** One fixture builder used by every test in the file:

```ts
// On 2030-01-15:  A c1/t1/R1 10:00 completed, discount 30000 → 120000, paid cash 120000
//                 B c2/t2/R2 10:00 completed → 150000, unpaid
//                 C c1/t1/R1 14:00 paid 150000 by transfer, then cancelled (fee 0), refunded 150000
//                 D c2/t2/R2 14:00 no-show, fee set to 50000 by a manager
//                 E c1/t1/R1 16:00 walk-in, moved to 17:00, still confirmed
// On 2030-01-10:  P c1/t1/R1 10:00 completed (an extra shift for t1 is inserted for that day)
async function fixture() { /* builds the above with book, runTo, mark_room_ready between R1 treatments, pay, adjust_booking_charge, record_refund */ }

test('summary: one definition per number', async () => {
  await fixture();
  const s = (await asRole(b, 'owner', (c) => c.query(`select * from report_summary('2030-01-15','2030-01-15')`))).rows[0];
  expect(s).toMatchObject({ bookings: 5, completed: 2, cancelled: 1, no_shows: 1, walk_ins: 1, reschedules: 1,
    cancellation_rate: '0.2000', no_show_rate: '0.2000', booked_satang: '320000', fee_satang: '50000',
    avg_transaction_satang: '135000', customers: 2, returning_customers: 1, returning_rate: '0.5000' });
});
test('booked revenue sits on the service day; collected and refunded on the day money moved', async () => {
  await fixture(); const day = await today();
  const rows = (await asRole(b, 'owner', (c) => c.query(`select bucket::text, booked_satang::int b, collected_satang::int c, refunded_satang::int r, net_collected_satang::int n from report_revenue(least($1::date,'2030-01-10'), greatest($1::date,'2030-01-15'))`, [day]))).rows;
  const by = Object.fromEntries(rows.map((x) => [x.bucket, x]));
  expect(by['2030-01-15']).toMatchObject({ b: 320000 });
  expect(by['2030-01-10']).toMatchObject({ b: 150000 });
  expect(by[day]).toMatchObject({ c: 270000, r: 150000, n: 120000 });
  expect(rows.reduce((t, x) => t + x.b, 0)).toBe(470000);
});
test('week and month buckets start on Monday and on the 1st', async () => {
  await fixture();
  const g = (grain: string) => asRole(b, 'owner', (c) => c.query(`select bucket::text, booked_satang::int b from report_revenue('2030-01-01','2030-01-31',$1) where booked_satang > 0`, [grain])).then((r) => r.rows);
  expect(await g('week')).toEqual([{ bucket: '2030-01-07', b: 150000 }, { bucket: '2030-01-14', b: 320000 }]);
  expect(await g('month')).toEqual([{ bucket: '2030-01-01', b: 470000 }]);
  await expectCode(asRole(b, 'owner', (c) => c.query(`select report_revenue('2030-01-01','2030-01-31','hour')`)), 'INVALID_SETTING');
});
test('revenue by service and by therapist counts completed work only', async () => {
  await fixture();
  const svc = await asRole(b, 'owner', (c) => c.query(`select service_id, completed, minutes, booked_satang::int b from report_by_service('2030-01-15','2030-01-15')`));
  expect(svc.rows).toEqual([{ service_id: b.svc60, completed: 2, minutes: 120, b: 270000 }]);
  const th = await asRole(b, 'owner', (c) => c.query(`select therapist_id, completed, booked_satang::int b from report_by_therapist('2030-01-15','2030-01-15') order by b`));
  expect(th.rows).toEqual([{ therapist_id: b.t1, completed: 1, b: 120000 }, { therapist_id: b.t2, completed: 1, b: 150000 }]);
});
test('reports are for the owner, and for managers only while allowed', async () => {
  const q = (a: Actor) => asRole(b, a, (c) => c.query(`select 1 from report_summary('2030-01-15','2030-01-15')`));
  await q('manager');
  for (const a of ['receptionist', 'therapist', 'customer'] as const) await expectCode(q(a), 'NOT_AUTHORIZED');
  await asRole(b, 'owner', (c) => c.query(`select set_setting('reports.manager_can_view','false')`));
  await expectCode(q('manager'), 'NOT_AUTHORIZED'); await q('owner');
});
```

- [ ] **Step 2: Run** `npm run test:db -- reports-money`. Expected: FAIL.
- [ ] **Step 3: Write `0017_reports_money.sql`.**
- [ ] **Step 4: Run** `npm run test:db`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(db): revenue and booking reports`.

---

### Task 6: Utilisation and demand reports

**Files:**
- Create: `supabase/migrations/0018_reports_ops.sql`, `tests/db/reports-ops.test.ts`

**Interfaces:**
- Produces — same access rule as Task 5. The period is `[p_from 00:00, p_to + 1 day 00:00)` in Bangkok time; every duration is clipped to it.
  - Definitions (comment block at the top of the migration):
    - **Open minutes** = the minutes in the period covered by at least one therapist shift (the union of all shifts). The spa is "open" when someone is rostered.
    - **Room utilisation** = booked room minutes ÷ (open minutes − minutes of `maintenance`/`closed` blocks on that room inside open time). Booked room minutes = `service_during` of bookings not `cancelled`/`no_show`.
    - **Therapist utilisation** = booked minutes ÷ (shift minutes − time-off minutes inside shifts).
    - **Turnover efficiency** = average minutes from turnover start to ready, and the share marked ready at or before `due_at`, for turnovers started in the period.
    - **Peak periods** = bookings (not `cancelled`/`no_show`) by ISO weekday (1 = Monday) and hour of the Bangkok start time.
  - `report_room_utilization(p_from date, p_to date) returns table (room_id uuid, zone text, category_id uuid, open_minutes int, booked_minutes int, utilization numeric, turnovers int, avg_turnover_min numeric, on_time_rate numeric)` — one row per room that is active **or** has bookings in the period; `utilization` rounded to 4 places, 0 when the denominator is 0; the two turnover figures are null when there are none.
  - `report_therapist_utilization(p_from date, p_to date) returns table (therapist_id uuid, shift_minutes int, time_off_minutes int, booked_minutes int, utilization numeric)` — therapists with a shift or a booking in the period.
  - `report_peak_periods(p_from date, p_to date) returns table (dow int, hour int, bookings int)` — only cells with bookings.

- [ ] **Step 1: Write the failing tests**

```ts
// Fixture on 2030-01-15 (t1, t2 work 10:00–22:00 = 720 open minutes):
//   t1 break 13:00–14:00; R3 maintenance block 10:00–16:00
//   A c1/t1/R1 10:00 completed; E c1/t1/R1 17:00 confirmed; B c2/t2/R2 10:00 completed; X c2/t2/R2 14:00 cancelled
async function fixture() { /* built with asAdmin inserts for the break and block, then book / runTo / set_booking_status */ }
const R = '2030-01-15';

test('room utilisation uses open time and removes maintenance', async () => {
  await fixture();
  const rows = (await asRole(b, 'owner', (c) => c.query(`select room_id, open_minutes, booked_minutes, utilization from report_room_utilization($1,$1)`, [R]))).rows;
  const by = Object.fromEntries(rows.map((x) => [x.room_id, x]));
  expect(by[b.rooms[0]]).toEqual({ room_id: b.rooms[0], open_minutes: 720, booked_minutes: 120, utilization: '0.1667' });
  expect(by[b.rooms[1]]).toMatchObject({ booked_minutes: 60, utilization: '0.0833' });
  expect(by[b.rooms[2]]).toMatchObject({ open_minutes: 360, booked_minutes: 0, utilization: '0.0000' });
  expect(rows).toHaveLength(7);
});
test('rooms follow configuration: a new room appears, a retired room with history stays', async () => {
  await fixture();
  await asRole(b, 'manager', (c) => c.query(`insert into rooms(code, display_name, category_id, zone) values ('R7','ห้อง 7',$1,'ZZ')`, [b.cat.standard]));
  await asAdmin((c) => c.query(`update bookings set status='cancelled' where status='confirmed'; update rooms set active=false where id=$1`, [b.rooms[0]]));
  const rows = (await asRole(b, 'owner', (c) => c.query(`select room_id, zone from report_room_utilization($1,$1)`, [R]))).rows;
  expect(rows).toHaveLength(8);
  expect(rows.map((x) => x.room_id)).toContain(b.rooms[0]);
  expect(rows.filter((x) => x.zone === 'ZZ')).toHaveLength(1);
});
test('therapist utilisation removes breaks from rostered time', async () => {
  await fixture();
  const rows = (await asRole(b, 'owner', (c) => c.query(`select therapist_id, shift_minutes, time_off_minutes, booked_minutes, utilization from report_therapist_utilization($1,$1) order by utilization desc`, [R]))).rows;
  expect(rows).toEqual([
    { therapist_id: b.t1, shift_minutes: 720, time_off_minutes: 60, booked_minutes: 120, utilization: '0.1818' },
    { therapist_id: b.t2, shift_minutes: 720, time_off_minutes: 0, booked_minutes: 60, utilization: '0.0833' }]);
});
test('peak periods count by Bangkok weekday and hour', async () => {
  await fixture();
  const p = await asRole(b, 'owner', (c) => c.query(`select dow, hour, bookings from report_peak_periods($1,$1) order by hour`, [R]));
  expect(p.rows).toEqual([{ dow: 2, hour: 10, bookings: 2 }, { dow: 2, hour: 17, bookings: 1 }]);
});
test('turnover efficiency is measured from start to ready', async () => {
  await fixture(); const day = await today();
  await asRole(b, 'therapist', (c) => c.query(`select mark_room_ready($1)`, [b.rooms[0]]));
  const r = (await asRole(b, 'owner', (c) => c.query(`select turnovers, on_time_rate, avg_turnover_min is not null as timed from report_room_utilization($1,$1) where room_id=$2`, [day, b.rooms[0]]))).rows[0];
  expect(r).toEqual({ turnovers: 1, on_time_rate: '1.0000', timed: true });
  await expectCode(asRole(b, 'receptionist', (c) => c.query(`select report_peak_periods($1,$1)`, [R])), 'NOT_AUTHORIZED');
});
```

- [ ] **Step 2: Run** `npm run test:db -- reports-ops`. Expected: FAIL.
- [ ] **Step 3: Write `0018_reports_ops.sql`** (multiranges for the union of shifts).
- [ ] **Step 4: Run** `npm run test:db`, then `npx supabase db reset`. Expected: all pass; reset exits 0.
- [ ] **Step 5: Commit** `feat(db): utilisation and demand reports`.

---

### Task 7: Shared helpers — CSV, phone, amounts, error text

**Files:**
- Create: `src/lib/csv.ts`, `src/lib/csv.test.ts`, `src/lib/phone.ts`, `src/lib/phone.test.ts`
- Modify: `src/lib/money.ts`, `src/lib/money.test.ts`, `src/lib/errors.ts`, `src/lib/errors.test.ts`, `messages/{th,en}.json`

**Interfaces:**
- Produces:

```ts
export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null };
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string;
export function normalizePhone(input: string): string | null;
export function parseTHB(input: string): number | null;      // satang
```

  - `toCsv`: starts with the UTF-8 byte-order mark `﻿`; lines end with `\r\n`; a cell containing `"`, `,`, or a line break is quoted with `"` doubled; a text cell whose first character is `=`, `+`, `-`, `@`, tab or carriage return is prefixed with `'`; numbers are written as plain digits; null is an empty cell.
  - `normalizePhone`: strips spaces, dashes, dots and brackets; `+66` or leading `66` followed by 8–9 digits becomes `0…`; other `+` numbers keep the `+`; returns null unless the result matches the database rule `^(0\d{8,9}|\+\d{6,15})$`.
  - `parseTHB`: accepts digits with optional thousands commas and up to two decimals; returns satang; null for anything else, including negatives.
  - `ERROR_CODES` gains the six codes from Global Constraints, each with a Thai and an English message.

- [ ] **Step 1: Write the failing tests**

```ts
test('csv is Excel-safe: BOM, CRLF, quoting, and no live formulas', () => {
  const out = toCsv([{ header: 'ชื่อ', value: (r: any) => r.n }, { header: 'บาท', value: (r: any) => r.v }],
    [{ n: 'นวดไทย, 60 นาที', v: 1500 }, { n: '=HYPERLINK("x")', v: null }, { n: 'a "b"', v: -5 }]);
  expect(out).toBe('﻿ชื่อ,บาท\r\n"นวดไทย, 60 นาที",1500\r\n"\'=HYPERLINK(""x"")",\r\n"a ""b""",-5\r\n');
});
test('phones normalise to one stored form', () => {
  expect(['081-000-0000', '+66 81 000 0000', '66810000000', '(02) 123 4567', '+1 415 555 0100', 'abc', '12'].map(normalizePhone))
    .toEqual(['0810000000', '0810000000', '0810000000', '021234567', '+14155550100', null, null]);
});
test('amounts parse to satang or not at all', () => {
  expect(['1,500', '1500.5', '0', '99.99', '-5', '1.234', 'x', ''].map(parseTHB)).toEqual([150000, 150050, 0, 9999, null, null, null, null]);
});
test('every new error code has Thai and English text', () => {
  for (const c of ['INVALID_SETTING', 'INVALID_AMOUNT', 'OVERPAYMENT', 'REFUND_EXCEEDS_PAYMENT', 'CARD_DATA_REFUSED', 'REASON_REQUIRED']) {
    expect(errorMessageKey(c)).toBe(`errors.${c}`);
    expect((th.errors as any)[c] && (en.errors as any)[c]).toBeTruthy();
  }
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src && npm run build`. Expected: pass.
- [ ] **Step 5: Commit** `feat(lib): csv, phone and amount helpers; new error codes`.

---

### Task 8: Settings screen, and screens that obey it

**Files:**
- Create: `src/modules/settings/{schema.ts,actions.ts}`, `src/modules/settings/components/SettingsForm.tsx`, `src/app/[locale]/(staff)/admin/settings/page.tsx`, `tests/e2e/settings.spec.ts`
- Modify: `src/modules/operations/actions.ts` (`getToday` passes the stored thresholds to `buildToday`), `src/app/[locale]/(staff)/layout.tsx` (nav: settings, owner only), `tests/e2e/db.ts`, `messages/{th,en}.json`

**Interfaces:**
- Produces:
  - `type Settings` — one typed field per key in Task 1's table (e.g. `'ops.late_arrival_min': number`, `'reports.manager_can_view': boolean`).
  - `getSettings(): Promise<{ ok: true; settings: Settings } | { ok: false; code: string }>` — any staff role.
  - `saveSetting(key: keyof Settings, value: number | boolean): Promise<{ ok: true; settings: Settings } | { ok: false; code: string }>` — owner.
  - `opsConfigFrom(s: Settings): OpsConfig` (in `schema.ts`, pure).
  - `tests/e2e/db.ts`: `seedBookingNow` accepts `inMinutes?: number` (default 1); `resetTestData` also clears `app_settings`, `payments`, `cash_closings`, and restores the three seeded payment methods to active.
- The page groups the keys as Daily operations, Cancellation and no-show, Payments, Reports, Data retention; each field [`setting-<key>`] shows its unit and allowed range, saves on its own, and confirms in words [`role="status"`]. A refused value shows the translated `INVALID_SETTING` and keeps the old value.

- [ ] **Step 1: Write the failing browser tests**

```ts
test('the owner shortens the arrival window and Today follows', async ({ page }) => {
  await seedBookingNow({ inMinutes: 30, customerName: 'คุณรอบ' });
  await signIn(page, 'owner@spa.test');
  await expect(page.getByTestId('arrival-row').filter({ hasText: 'คุณรอบ' })).toBeVisible();
  await page.goto('/th/admin/settings');
  await page.getByTestId('setting-ops.arrival_window_min').fill('5');
  await page.getByTestId('setting-ops.arrival_window_min').blur();
  await expect(page.getByRole('status')).toBeVisible();
  await page.goto('/th/today');
  await expect(page.getByTestId('arrival-row')).toHaveCount(0);
});
test('an out-of-range value is refused and the old value stays', async ({ page }) => {
  await signIn(page, 'owner@spa.test'); await page.goto('/th/admin/settings');
  await page.getByTestId('setting-policy.cancel_fee_percent').fill('150');
  await page.getByTestId('setting-policy.cancel_fee_percent').blur();
  await expect(page.getByRole('alert')).toContainText(th.errors.INVALID_SETTING);
  await page.reload();
  await expect(page.getByTestId('setting-policy.cancel_fee_percent')).toHaveValue('0');
});
test('a manager cannot open settings', async ({ page }) => {
  await signIn(page, 'manager@spa.test'); await page.goto('/th/admin/settings');
  await expect(page.getByTestId('forbidden')).toBeVisible();
});
```

- [ ] **Step 2: Run** `npx playwright test settings`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add a unit test: `opsConfigFrom` maps the four `ops.*_min` keys onto `OpsConfig` field for field.
- [ ] **Step 4: Run** `npx vitest run src && npx playwright test settings today` on both projects. Expected: pass.
- [ ] **Step 5: Commit** `feat(settings): owner settings screen`.

---

### Task 9: Taking payment at the desk

**Files:**
- Create: `src/modules/payments/{schema.ts,actions.ts}`, `src/modules/payments/components/{PaymentDialog,PendingPayments,ChargeAdjust}.tsx`, `tests/e2e/payments.spec.ts`
- Modify: `src/modules/operations/components/TodayBoard.tsx` (pending payments section, desk roles only), `src/modules/booking/components/BookingCalendar.tsx` (payment badge and pay button in the booking panel), `messages/{th,en}.json`

**Interfaces:**
- Produces (`payments/actions.ts`; owner, manager, receptionist unless noted):
  - `type Money = { bookingId: string; chargeSatang: number; paidSatang: number; refundedSatang: number; dueSatang: number; paymentStatus: 'not_due' | 'unpaid' | 'partial' | 'paid' | 'overpaid' | 'refunded'; hasUnverified: boolean }`
  - `getMoney(bookingIds: string[]): Promise<{ ok: true; money: Money[] } | { ok: false; code: string }>`
  - `getPendingPayments(): Promise<{ ok: true; rows: { bookingId: string; customerDisplayName: string; startsAt: string; status: BookingStatus; chargeSatang: number; dueSatang: number; paymentStatus: Money['paymentStatus'] }[] } | { ok: false; code: string }>`
  - `listPaymentMethods(): Promise<{ ok: true; methods: { id: string; code: string; nameTh: string; nameEn: string | null; needsVerification: boolean }[] } | { ok: false; code: string }>` — active methods only.
  - `recordPayment(input: { bookingId: string; methodId: string; amount: string; reference?: string; note?: string; idempotencyKey: string }): Promise<ActionResult>` — `amount` is what the person typed; the action converts it with `parseTHB` (`INVALID_AMOUNT` when null).
  - `adjustCharge(input: { bookingId: string; discount?: string; fee?: string; reason: string; expectedVersion: number }): Promise<ActionResult>` — owner, manager.
- Behaviour: Today gains a pending-payments section [`pending-payment-row`] listing amount due [`due-amount`], or "refund owed" for a negative due. The pay button [`pay-open`] opens a dialog with the amount pre-filled to the amount due [`pay-amount`], method [`pay-method`], reference [`pay-reference`], and submit [`pay-submit`]; the dialog creates its idempotency key once when it opens. The calendar booking panel shows a payment badge [`payment-status`, `data-status`] with "awaiting verification" [`payment-unverified`] where relevant, the pay button, and for owner and manager a charge editor [`charge-open`] (discount, fee, reason). Therapists see no amounts, badges or buttons. Live refresh also listens to `payments`.

- [ ] **Step 1: Write the failing browser tests**

```ts
test('a finished treatment is paid in cash and leaves the pending list', async ({ page }) => {
  const k = await seedBookingNow({ customerName: 'คุณจ่าย' }); await setStatusAsReception(k.id, 'completed');
  await signIn(page, 'reception@spa.test');
  const row = page.getByTestId('pending-payment-row').filter({ hasText: 'คุณจ่าย' });
  await expect(row.getByTestId('due-amount')).toHaveText('฿1,500.00');
  await row.getByTestId('pay-open').click();
  await expect(page.getByTestId('pay-amount')).toHaveValue('1,500.00');
  await page.getByTestId('pay-submit').dblclick();
  await expect(page.getByTestId('pending-payment-row')).toHaveCount(0);
  expect((await admin.from('payments').select('id')).data).toHaveLength(1);
});
test('a part payment leaves the rest due; a transfer waits for verification', async ({ page }) => {
  /* pay 500 cash → due-amount ฿1,000.00; pay 1,000 by bank transfer with reference → row gone;
     calendar panel badge data-status="paid" and payment-unverified visible */
});
test('typing a card number is refused in plain words', async ({ page }) => {
  /* reference 4111 1111 1111 1111 → alert th.errors.CARD_DATA_REFUSED; no payments row */
});
test('more than is due is refused', async ({ page }) => { /* amount 2,000 → alert th.errors.OVERPAYMENT */ });
test('a manager gives a discount with a reason; reception cannot', async ({ page }) => {
  /* manager: charge-open, discount 300, reason → due-amount ฿1,200.00; reception: charge-open has count 0 */
});
test('a therapist sees no money anywhere', async ({ page }) => {
  /* own completed booking: /th/today has no pending-payment-row; calendar panel has no payment-status */
});
```

- [ ] **Step 2: Run** `npx playwright test payments`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx playwright test payments today booking` on both projects. Expected: pass.
- [ ] **Step 5: Commit** `feat(payments): take payment and adjust charges at the desk`.

---

### Task 10: Reconciliation

**Files:**
- Create: `src/modules/payments/components/{Reconciliation,MethodsAdmin}.tsx`, `src/app/[locale]/(staff)/payments/{page,loading,error}.tsx`, `tests/e2e/reconciliation.spec.ts`
- Modify: `src/modules/payments/{schema.ts,actions.ts}`, `src/app/[locale]/(staff)/layout.tsx` (nav: payments, owner and manager), `messages/{th,en}.json`

**Interfaces:**
- Produces (owner, manager unless noted):
  - `getDayLedger(day: string): Promise<{ ok: true; summary: { methodId: string; code: string; name: string; payments: number; recordedSatang: number; verifiedSatang: number; unverifiedSatang: number; refundedSatang: number; voidedSatang: number }[]; entries: { id: string; bookingId: string; customerDisplayName: string; kind: 'payment' | 'refund'; methodCode: string; amountSatang: number; reference: string | null; receivedAt: string; verified: boolean; voided: boolean; voidReason: string | null }[]; closing: { expectedSatang: number; countedSatang: number; note: string | null; closedAt: string; expectedNowSatang: number } | null } | { ok: false; code: string }>` — `expectedNowSatang` is today's recomputed cash figure, so a change after closing is visible.
  - `verifyPayment(id: string)`, `voidPayment(input: { id: string; reason: string })`, `refundPayment(input: { paymentId: string; amount: string; reason: string; idempotencyKey: string })`, `closeCashDay(input: { day: string; counted: string; note?: string })` — each `ActionResult`.
  - `savePaymentMethod(input: { id?: string; code: string; nameTh: string; nameEn?: string; needsVerification: boolean })`, `setPaymentMethodActive(id: string, active: boolean)` — owner.
- The page: a day picker; a table per method (recorded, verified, awaiting verification, refunded, voided) with totals [`ledger-method-row`, `data-code`]; the day's entries [`ledger-entry`, `data-state` = `verified` | `unverified` | `voided`] with verify [`entry-verify`], refund [`entry-refund`] and void [`entry-void`] (each asks for confirmation; refund and void require a reason); a cash-closing form [`cash-counted`, `cash-close`] that shows expected, counted and the difference [`cash-difference`], and a warning [`cash-changed`] when cash moved after closing. Owners also get the payment-method list (add, rename, deactivate; no delete).

- [ ] **Step 1: Write the failing browser tests**

```ts
test('a manager verifies a transfer and the totals move from awaiting to verified', async ({ page }) => {
  const k = await seedBookingNow(); await payViaApi(k.id, 150000, 'bank_transfer');
  await signIn(page, 'manager@spa.test'); await page.goto('/th/payments');
  const row = page.locator('[data-testid=ledger-method-row][data-code=bank_transfer]');
  await expect(row).toContainText('฿1,500.00');
  await page.getByTestId('entry-verify').click(); await page.getByTestId('confirm').click();
  await expect(page.getByTestId('ledger-entry')).toHaveAttribute('data-state', 'verified');
});
test('cash is closed against a count and a later change is flagged', async ({ page }) => {
  const k = await seedBookingNow(); await payViaApi(k.id, 150000, 'cash');
  await signIn(page, 'owner@spa.test'); await page.goto('/th/payments');
  await page.getByTestId('cash-counted').fill('1,400'); await page.getByTestId('cash-close').click();
  await expect(page.getByTestId('cash-difference')).toHaveText('-฿100.00');
  await page.getByTestId('entry-void').click(); await page.getByTestId('reason').fill('บันทึกผิด'); await page.getByTestId('confirm').click();
  await expect(page.getByTestId('cash-changed')).toBeVisible();
});
test('a refund needs a reason and cannot exceed the payment', async ({ page }) => {
  /* refund 2,000 on a 1,500 payment → th.errors.REFUND_EXCEEDS_PAYMENT; empty reason → th.errors.REASON_REQUIRED; 1,500 with reason → a refund ledger-entry appears */
});
test('the owner adds a payment method and it is offered at the desk; reception cannot open reconciliation', async ({ page }) => {
  /* add "เครดิตร้าน" needing verification → appears in pay-method on Today; reception /th/payments → forbidden */
});
```

- [ ] **Step 2: Run** `npx playwright test reconciliation`. Expected: FAIL.
- [ ] **Step 3: Implement.** `payViaApi` is a local test helper calling `record_payment` with the public client signed in as reception.
- [ ] **Step 4: Run** `npx playwright test reconciliation payments` on both projects. Expected: pass.
- [ ] **Step 5: Commit** `feat(payments): daily reconciliation, refunds, voids and cash closing`.

---

### Task 11: Customer records and privacy tools

**Files:**
- Create: `src/modules/customers/components/{CustomerList,CustomerProfile,PrivacyTools,RetentionList}.tsx`, `src/app/[locale]/(staff)/customers/page.tsx`, `src/app/[locale]/(staff)/customers/[id]/page.tsx`, `src/app/api/customers/[id]/export/route.ts`, `tests/e2e/customers.spec.ts`
- Modify: `src/modules/customers/{schema.ts,actions.ts}`, `src/modules/customers/components/CustomerPicker.tsx` (normalise the phone; show the translated duplicate message with a link to the existing record), `src/modules/booking/components/BookingCalendar.tsx` and `src/modules/operations/components/TodayBoard.tsx` (a treatment-notes line from `booking_detail` on a booking the viewer may open), `src/app/[locale]/(staff)/layout.tsx` (nav: customers, desk roles), `messages/{th,en}.json`

**Interfaces:**
- Produces (`customers/actions.ts`; owner, manager, receptionist unless noted):
  - `listCustomers(input: { q?: string; page?: number }): Promise<{ ok: true; rows: { id: string; displayName: string; phone: string | null; lastVisit: string | null; anonymised: boolean }[]; total: number } | { ok: false; code: string }>` — 50 per page; `q` matches display name, full name or normalised phone.
  - `getCustomer(id: string): Promise<{ ok: true; customer: CustomerProfile } | { ok: false; code: string }>` — `CustomerProfile` holds the editable fields, the `customer_summary` figures, the last 50 bookings (time, service, therapist, room, status, note) each with its `Money`, and `privateNotes` (an empty list unless the viewer is owner or manager).
  - `saveCustomer(input: { id: string; displayName: string; fullName?: string; phone?: string; email?: string; preferredTherapistId?: string | null; serviceNotes?: string; commsConsent: boolean }): Promise<ActionResult>` — normalises the phone (`INVALID_INPUT` if it cannot be); sets `consent_recorded_at` whenever `commsConsent` changes.
  - `addPrivateNote(input: { customerId: string; body: string })` — owner, manager.
  - `getBookingDetail(bookingId: string): Promise<{ ok: true; note: string | null; serviceNotes: string | null } | { ok: false; code: string }>` — any staff role; the database decides.
  - `anonymiseCustomer(input: { id: string; reason: string; confirmText: string })` — owner; `confirmText` must equal the customer's current display name, otherwise `INVALID_INPUT`.
  - `getRetentionCandidates()` — owner.
  - `GET /api/customers/[id]/export` — owner, manager; returns `export_customer` as a JSON download (`content-disposition: attachment`); `403` otherwise.
- Pages: `/customers` — search [`customer-search`], rows [`customer-row`], paging, and for owners a retention tab [`retention-row`] with the configured months stated. `/customers/[id]` — details form, consent switch with the date it was last recorded [`consent-recorded`], summary figures [`stat-visits`, `stat-cancelled`, `stat-no-shows`], history [`history-row`], private notes [`private-note`] for owner and manager only, and a privacy panel (export [`export-json`]; anonymise [`anonymise-open`, `anonymise-confirm-text`, `anonymise-submit`] for owners, with a plain statement that it cannot be undone and what is kept). An anonymised record is read-only. Therapists get the forbidden page on both routes.

- [ ] **Step 1: Write the failing browser tests**

```ts
test('reception finds a customer by phone in any format and updates consent', async ({ page }) => {
  await admin.from('customers').insert({ display_name: 'คุณค้น', phone: '0812223333' });
  await signIn(page, 'reception@spa.test'); await page.goto('/th/customers');
  await page.getByTestId('customer-search').fill('081-222-3333');
  await page.getByTestId('customer-row').filter({ hasText: 'คุณค้น' }).click();
  await page.getByTestId('consent').check(); await page.getByTestId('save-customer').click();
  await expect(page.getByTestId('consent-recorded')).not.toBeEmpty();
  await expect(page.getByTestId('private-note')).toHaveCount(0);
  await expect(page.getByTestId('anonymise-open')).toHaveCount(0);
});
test('the profile shows visits, cancellations and payment state per booking', async ({ page }) => {
  /* one completed + paid, one cancelled for the same customer; stat-visits "1", stat-cancelled "1"; history-row count 2; first row's payment-status data-status="paid" */
});
test('a second customer with the same phone is refused with a link to the first', async ({ page }) => {
  /* new booking → create customer inline with an existing phone → th.errors.DUPLICATE and a link whose href ends with the existing id */
});
test('a therapist sees treatment notes on their own booking and cannot open customer records', async ({ page }) => {
  /* service_notes set; therapist Today row shows the note text; /th/customers → forbidden */
});
test('the owner exports, then anonymises after typing the name; history and payments remain', async ({ page }) => {
  /* export-json download is JSON with keys profile, notes, bookings, payments;
     wrong confirm text → th.errors.INVALID_INPUT; correct → page shows "Removed", form read-only, history-row still listed;
     service client: customer phone is null, payments count unchanged */
});
test('managers can add private notes but not anonymise; the retention tab is owner-only', async ({ page }) => { /* … */ });
```

- [ ] **Step 2: Run** `npx playwright test customers`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx playwright test customers booking today` on both projects. Expected: pass.
- [ ] **Step 5: Commit** `feat(customers): records, history and privacy tools`.

---

### Task 12: Reports screen, CSV export and close-out

**Files:**
- Create: `src/modules/reports/{schema.ts,actions.ts,definitions.ts}`, `src/modules/reports/components/{ReportsDashboard,Bars,PeakGrid}.tsx`, `src/app/[locale]/(staff)/reports/{page,loading,error}.tsx`, `src/app/api/reports/[name]/csv/route.ts`, `tests/e2e/reports.spec.ts`
- Modify: `src/app/[locale]/(staff)/layout.tsx` (nav: reports; owner, and manager when allowed), `messages/{th,en}.json`, `docs/architecture.md`

**Interfaces:**
- Produces:
  - `type ReportRange = { from: string; to: string; grain: 'day' | 'week' | 'month' }` (Zod: valid dates, `from <= to`, at most 366 days).
  - `getReports(range: ReportRange): Promise<{ ok: true; revenue: RevenueRow[]; summary: Summary; services: ServiceRow[]; therapists: TherapistRow[]; rooms: RoomUtilRow[]; therapistUtil: TherapistUtilRow[]; peaks: { dow: number; hour: number; bookings: number }[] } | { ok: false; code: string }>` — calls the seven report functions; rows carry display names joined from the catalog (service, therapist, room code, zone, category).
  - `definitions.ts`: `METRIC_KEYS` — one message key per metric defined in Tasks 5 and 6; the Thai and English texts restate those definitions and are shown beside each figure [`metric-help`].
  - `GET /api/reports/[name]/csv?from=&to=&grain=` — `name` ∈ `revenue`, `services`, `therapists`, `rooms`, `therapist-utilization`, `peaks`; same role rule as the database (`403` otherwise, `404` for another name, `400` for a bad range); body from `toCsv`; headers in the viewer's language; amounts in baht with two decimals; filename `spa-<name>-<from>_<to>.csv`.
- The page: range presets (today, 7 days, this month, last month, custom) and grain [`range-preset-*`, `grain`]; headline figures [`kpi-booked`, `kpi-collected`, `kpi-net`, `kpi-bookings`, `kpi-avg`, `kpi-cancel-rate`, `kpi-no-show-rate`, `kpi-returning-rate`]; revenue over time as paired bars, booked beside collected, each labelled; tables for services and therapists; room utilisation grouped by zone or by category [`group-by`], with turnover figures; therapist utilisation; a weekday-by-hour grid for peaks [`peak-cell`]; an export link per section [`export-<name>`]. Every bar and cell also shows its number as text.

- [ ] **Step 1: Write the failing browser tests**

```ts
test('daily revenue reflects what was actually recorded', async ({ page }) => {
  const a = await seedBookingNow({ customerName: 'ก' }); await setStatusAsReception(a.id, 'completed'); await payViaApi(a.id, 150000, 'cash');
  const z = await seedBookingNow({ roomCode: 'R2', otherTherapist: true, customerName: 'ข' }); await setStatusAsReception(z.id, 'completed'); await payViaApi(z.id, 50000, 'cash');
  await signIn(page, 'owner@spa.test'); await page.goto('/th/reports');
  await page.getByTestId('range-preset-today').click();
  await expect(page.getByTestId('kpi-booked')).toHaveText('฿3,000.00');
  await expect(page.getByTestId('kpi-collected')).toHaveText('฿2,000.00');
  await expect(page.getByTestId('kpi-bookings')).toHaveText('2');
  await voidViaApi(/* the 500 payment */);
  await page.reload();
  await expect(page.getByTestId('kpi-collected')).toHaveText('฿1,500.00');
  await expect(page.getByTestId('metric-help').first()).not.toBeEmpty();
});
test('the revenue export is a spreadsheet-safe CSV with the same numbers', async ({ page }) => {
  /* same data; click export-revenue; read the download: starts with ﻿; header row in Thai; one data row whose booked and collected cells are 3000.00 and 2000.00 */
});
test('a service named like a formula cannot execute in the export', async ({ request, page }) => {
  /* rename a service to "=1+1" with the service client; complete a booking for it; export services; the cell begins with '= */
});
test('room utilisation regroups by zone and by category from configuration', async ({ page }) => {
  /* addRooms(4, zones A,B); group-by zone shows a heading per zone present in the data; switching to category shows the category names */
});
test('managers lose reports when the owner switches them off; reception never has them', async ({ page, request }) => {
  /* manager opens /th/reports ok; owner sets reports.manager_can_view false (service client or settings page);
     manager → forbidden page and GET /api/reports/revenue/csv?… → 403; reception → forbidden */
});
```

- [ ] **Step 2: Run** `npx playwright test reports`. Expected: FAIL.
- [ ] **Step 3: Implement.** `seedBookingNow` gains `otherTherapist?: boolean` if it lacks it; `voidViaApi` signs in as manager with the public client.
- [ ] **Step 4: Run everything:** `npm run test:db && npx vitest run src && npx playwright test && npm run build && npm run lint`. Expected: all pass on both Playwright projects. Paste the real summary lines into `docs/architecture.md`.
- [ ] **Step 5: Record in `docs/architecture.md`:** the metric definitions verbatim from the two report migrations; the payment ledger rules (append-only, void, refund, verification, status table); the fee policy and that fees are frozen when charged; the settings table; what anonymisation removes and keeps; the new tables in the ERD and the permission matrix; and acceptance evidence for "Payments can be recorded and reconciled", "Daily revenue reports reflect actual recorded transactions" and the manager-permission part of "Users cannot access actions or information beyond their permissions", each mapped to its test. State plainly: PDPA compliance still needs a legal review before production; no payment provider is integrated (recording only); audit-log retention is not yet limited. List what remains for Plan 4.
- [ ] **Step 6: Commit** `feat(reports): management reports and CSV export; docs: plan 3 evidence`.
