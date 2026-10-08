# Automatic order dispatching

Migration: `supabase/migrations/20261008140000_order_dispatch.sql`.

## How it works

1. An order reaches `store_settings.dispatch_trigger_status` (`preparing` by default, or `confirmed`) while
   `store_settings.features.auto_dispatch_enabled` is `true`, and it has no driver.
2. `dispatch_order` locks the order and picks **one** driver who:
   - has the `driver` role, an active profile and status `available`;
   - has no other open offer;
   - has fewer than `max_active_orders_per_driver` orders in confirmed/preparing/out_for_delivery;
   - has not been offered this order before.

   Among those, it picks the fewest active orders first, then the driver idle longest (oldest last offer).
   Driver rows are taken with `FOR UPDATE SKIP LOCKED`, so parallel dispatches never pick the same driver.
   Unique indexes guarantee one open offer per order and per driver.
3. The driver has `driver_accept_timeout_seconds` to answer through `driver_respond_to_offer(offer_id, accept)`:
   - **accept**: the order is assigned (`orders.driver_id`, `driver_accepted_at`, `dispatch_status = assigned`)
     inside the order's row lock, so only one accept can win;
   - **reject or timeout**: the next driver is offered. If nobody qualifies, the order gets
     `dispatch_status = no_driver_available` and waits.
4. Waiting orders are offered again when a driver becomes `available` or finishes or cancels an order.

Turning `auto_dispatch_enabled` off stops all automatic offers, including the next offer after a rejection.
Staff can still call `dispatch_order` for a single order. Manual assignment always works: setting
`orders.driver_id` cancels open offers and is recorded.

Drivers do **not** see the order row (address, customer name or phone) until they accept.
`driver_my_offers()` returns only the order number, area or city, total, cash to collect, item count and the
expiry time (plus the server time, so the app's countdown is correct even on a phone with a wrong clock).

## Tables

| Table | Who can read | Who can write |
| --- | --- | --- |
| `order_dispatch_offers` | the offered driver, staff | security-definer functions only |
| `driver_dispatch_state` (load, open offer, last offer time) | the driver themselves, staff | functions/triggers only |
| `order_dispatch_events` (audit: offered, accepted, rejected, expired, cancelled, no_driver, manual_assign, manual_unassign) | staff | functions/triggers only |

`orders.dispatch_status` is one of `unassigned`, `offered`, `assigned` or `no_driver_available`.

## Expiring offers

`expire_stale_offers()` must run every minute.

- **pg_cron** (Supabase: Database → Extensions → pg_cron): the migration schedules the
  `expire-dispatch-offers` job automatically when the extension is available.
  Check it with `select * from cron.job;`.
- **Without pg_cron**: deploy the Edge Function `supabase/functions/expire-dispatch-offers` and call it every
  minute with the header `Authorization: Bearer <DISPATCH_CRON_SECRET>`. Secret names: `DISPATCH_CRON_SECRET`
  (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase).

Offers are also expired whenever their order is dispatched or answered, so a late scheduler only delays the
hand-over to the next driver. It never assigns an expired offer.

## Settings (store_settings)

| Column | Default | Range |
| --- | --- | --- |
| `features.auto_dispatch_enabled` | `false` | |
| `dispatch_trigger_status` | `preparing` | `confirmed`, `preparing` |
| `driver_accept_timeout_seconds` | 120 | 30–1800 |
| `max_active_orders_per_driver` | 3 | 1–20 |
| `dispatch_alert_after_minutes` | 10 | 1–1440 (admin alert for orders waiting without a driver) |
