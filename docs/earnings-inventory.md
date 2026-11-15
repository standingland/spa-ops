# Commissions and inventory

Routes: `/th/earnings`, `/th/inventory` (also `/en/…`), under Business in the staff sidebar. Only active owners and managers can read or change these modules, including through the database API. Other staff continue completing treatments normally.

## Setup and everyday use

1. In Inventory, add each material with a permanent unit (for example ml or piece) and a low-stock threshold. Units cannot be changed after creation; use a new material for a different unit.
2. Receive opening stock, entering quantity and **purchase cost per material unit**, not the total invoice value. Record subsequent purchases the same way. Receipts use a weighted average unit cost; when the old balance is zero or negative, the new purchase cost becomes the average.
3. Choose a service and save its material recipe. Quantities support three decimal places. An empty recipe clears it. Existing recipes still consume an inactive material until it is removed from the recipe.
4. In Commissions, save a percentage (two decimals) or fixed THB amount per service. A therapist-specific rule overrides the general service rule. Saving the same service/therapist pair updates its rate. Removing an override restores the general rule for future completions.
5. Finish a treatment using the existing booking workflow. One database transaction captures the effective commission rule, deducts every recipe material, captures its average cost, and records the normal room turnover. Retries cannot accrue or deduct twice. No matching rule means zero commission; no recipe means no material usage.
6. Use stock adjustments for physical counts, wastage, or actual material returns: enter the **change** in quantity (e.g. -2), with a reason. Adjustments keep the previous average cost. They never edit previous movements.

## Calculation and dates

Commission is an **accrual for completed services**, not verified collections or payroll paid. The rate is frozen at completion. The current basis is `max(0, booking price - discount - nonvoided service refunds)`; fees do not earn commission. Percentage commissions round to the nearest satang. Fixed commissions are reduced by the refunded proportion of the discounted service price and become zero if that price is zero. Subsequent discounts/refunds can therefore change an earlier service period's report; rate changes cannot. There is no payroll close or payout ledger in this version.

Commissions are grouped by completion date and material costs by usage date, all in Asia/Bangkok. Date ranges must be valid and at most 366 days apart. Detailed histories display the latest 100 rows; summary totals include **all** matching rows. Earnings CSV contains only therapist name, completed treatments and commission; inventory CSV contains current material balances and average costs.

Inventory balances and valuation always show **current** stock, irrespective of the history date filter. Material costs are captured per usage movement and never recalculated after a later purchase or recipe edit. The service cost summary includes only completed treatments with recorded material usage. It covers materials only, excluding labor, overhead, and profit. Estimated recipe cost uses current average costs.

Insufficient recorded stock may become **negative**, visibly flagged alongside low-stock alerts, so a completed real treatment is not prevented by an incorrect stock count. Staff should reconcile the physical count. Refunding a service does not restore already-consumed materials. There is no automatic backfill: bookings completed before migration are untouched.

## Migration and verification

Migration `20261114222234_earnings_inventory.sql` adds six RLS-protected tables, checked RPCs, and an `AFTER UPDATE OF status` trigger. It does not rewrite old bookings. Schema changes were applied to the local development stack without resetting existing data. Deployment to a hosted environment is a separate step.

The user subsequently chose commissions only. Migration `20261115001413_commission_only.sql` removes the tip-writing RPCs and staff access to the retired tip ledger. Existing historical rows are preserved for audit, excluded from earnings reports, and never exposed by the application. The menu, page, CSV and server actions contain no tip feature.

`tests/db/business.test.ts` verifies rule precedence/snapshots, discount and refund calculations, fixed commissions, weighted receipts, fractional consumption/cost snapshots, negative stock, concurrent completions, duplicate requests, recipe validation, immutability of units, Bangkok date boundaries, and denial of both reads and writes for other roles. Existing browser-test reset code clears these new dependent ledgers before deleting bookings.

Initial verification before the commission-only correction, on 2026-11-15 (Bangkok): all 721 unit/database tests in 82 files passed against an isolated test database; ESLint, the production build, and database function lint passed. The production build was opened in the browser: Thai and English pages rendered, English service names resolved correctly, and both screens at the mobile breakpoint had no horizontal page overflow. This was a read-only browser check; the full pre-existing Playwright suite was not rerun. Security advisors reported existing warnings on older helper functions and the public btree_gist extension, with none on the new functions/tables. The new local migration history entry was marked applied after the schema was verified; older pre-existing history drift was left untouched.

Commission-only correction verification: 47 relevant unit/database tests in 7 files passed, including the removed API, historical-ledger isolation, commission/refund calculations, payments, security, localization and navigation. Production build, ESLint and database function lint passed. Authenticated HTTP checks of the final Thai and English earnings pages confirmed that commission configuration renders and no tip controls or labels remain; the inventory page also rendered. Both local and isolated-test migrations preserved their existing row counts. The local app is running at `http://localhost:3100`.
