# Driver cash and earnings

Migration: `supabase/migrations/20261009130000_driver_finance.sql`.
Screens: driver app → **حسابي / My account**; admin → **كاش المناديب / Drivers cash** (admin only).
Currency symbol, language and the day boundary (`store_settings.timezone`) come from `store_settings`.

## The ledger

Every money event is one row in `driver_ledger`. Rows are **never updated or deleted** (a trigger rejects it,
even for the service role). Mistakes are corrected with new rows: a reversal or an adjustment.

One signed amount per row. **Positive = the driver owes the store more; negative = owes less.**

| Type                | When                                        | Amount                                                      |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| `cod_collected`     | order becomes `delivered` (has a driver)    | `+ order total` for cash on delivery, `0` for paid online   |
| `commission_earned` | same moment                                 | `- commission` (what the store owes the driver)             |
| `settlement_paid`   | admin records cash received from the driver | `- received` (`+` when the store pays the driver)           |
| `adjustment`        | admin correction, reason required           | either sign                                                 |
| `reversal`          | undoing a delivery's entries                | exactly `-(the entry it reverses)`, linked by `reverses_id` |

A delivered order gets **exactly one** `cod_collected` and **one** `commission_earned` row (unique index on
`(order_id, type)`): a repeated "delivered" event changes nothing.

### Balances (computed, never stored)

`driver_balance` (view) sums the ledger per driver:

- **owed_to_store** = sum of all amounts that affect cash. `> 0`: the driver must hand this over.
  `< 0`: the store owes the driver.
- **cash_held** = cash collected − cash handed over (includes the commission the driver kept).
- **cash_collected**, **commission_earned**, **settlements_paid**, **adjustments**: per-kind totals, net of
  reversals.
- **commission_payable**: commission earned while `driver_keeps_commission_from_cash` was off (see below).

Example: two COD orders of 130 with a commission of 20 → owed 220. A settlement of 200 → owed 20.

### Commission

| Setting                                | Meaning                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `driver_commission_type` = `fixed`     | `driver_commission_value` per delivered order                                       |
| `= percent_of_delivery_fee`            | `driver_commission_value` % of the order's delivery fee                             |
| per-driver override                    | `driver_payout_settings` (admin → driver page → "عمولة خاصة"); wins if set          |
| `driver_keeps_commission_from_cash` on | the commission reduces what the driver hands over (default)                         |
| `… off`                                | the driver hands over all cash; the commission is shown as payable, paid separately |

Rounding: to 2 decimals, half away from zero (Postgres `round`). The app does all arithmetic in integer
minor units (`src/lib/money.ts`), so 0.1 + 0.2 is exactly 0.3. The rule for each entry is fixed when it is
written; changing a setting later never rewrites history.

## Delivering a cash order

The driver taps **تم التسليم** and confirms the amount collected. The expected amount (order total) is shown and
cannot be edited. If the amount differs, a reason is required and the order is flagged (`cod_collections`,
`review_status = pending_review`). The ledger keeps the **expected** amount until an admin decides.

Admin → Drivers cash → "طلبات فيها فرق في المبلغ" → **مراجعة**:

- **Accept the difference**: writes an adjustment for the order (e.g. −10 if the customer paid 10 less).
- **Driver still owes it**: closes the review without an adjustment.

## Settlements

Admin → Drivers cash → **استلام تسوية**:

1. The expected amount is the driver's balance right now.
2. Enter the amount actually received. If it differs, a note is required. The difference stays on the
   balance and is recorded on the settlement row.
3. Confirm, then print the receipt.

Only admins can record settlements, unless `staff_can_record_settlements` is on.
`settlement_mode` (`end_of_day` or `per_order`) only changes the reminders. Alerts appear on the dashboard and
the cash page when a driver's cash held passes `driver_cash_limit` (0 = no limit), or when a balance from an
earlier day is still unsettled.

## Correcting mistakes

| Situation                                               | What to do                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Order marked delivered by mistake / refused at the door | Driver page → ledger → ↺ on its "تحصيل كاش" row (reason required): reverses cash and commission |
| Wrong amount, missing cash, fuel money, a bonus         | **تعديل** (adjustment) with a reason: `+` driver owes more, `−` less                            |
| Settlement typed wrong                                  | An adjustment with the opposite difference and a note; the settlement row itself stays          |
| Wrong commission rule                                   | Fix the setting for future orders; adjust past ones with an adjustment                          |

A customer return days later (return request) does **not** change the driver's ledger: the driver did collect
that cash. The refund is between the store and the customer. Delivered orders cannot be cancelled (order flow);
if that ever changes, the status trigger already writes reversals for a delivered → cancelled change.

## Access

| Data                                   | Driver   | Staff                       | Admin          |
| -------------------------------------- | -------- | --------------------------- | -------------- |
| own ledger, balance, settlements       | read     | read all                    | read all       |
| record settlement                      | no       | only if allowed in settings | yes            |
| adjustments, reversals, review closing | no       | no                          | yes            |
| commission overrides                   | read own | read                        | read and write |

Nobody writes ledger or settlement rows directly; only the security-definer functions do
(`record_delivery_financials`, `driver_mark_delivered`, `admin_record_settlement`, `admin_add_adjustment`,
`admin_reverse_delivery`, `admin_resolve_cod_review`).

## Reports

- **Excel export** (Drivers cash page and each driver's ledger). Cells starting with `= + - @` are escaped, so
  they can never run as formulas.
- **Daily report**: one file with the day's orders, COD total, commissions, settlements and outstanding
  balances, plus every entry of the day.
