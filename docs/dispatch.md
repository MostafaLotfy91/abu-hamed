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

| Table                                                                                                                       | Who can read                 | Who can write                   |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------- |
| `order_dispatch_offers`                                                                                                     | the offered driver, staff    | security-definer functions only |
| `driver_dispatch_state` (load, open offer, last offer time)                                                                 | the driver themselves, staff | functions/triggers only         |
| `order_dispatch_events` (audit: offered, accepted, rejected, expired, cancelled, no_driver, manual_assign, manual_unassign) | staff                        | functions/triggers only         |

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

| Column                           | Default     | Range                                                    |
| -------------------------------- | ----------- | -------------------------------------------------------- |
| `features.auto_dispatch_enabled` | `false`     |                                                          |
| `dispatch_trigger_status`        | `preparing` | `confirmed`, `preparing`                                 |
| `driver_accept_timeout_seconds`  | 120         | 30–1800                                                  |
| `max_active_orders_per_driver`   | 3           | 1–20                                                     |
| `dispatch_alert_after_minutes`   | 10          | 1–1440 (admin alert for orders waiting without a driver) |

## Push notifications (app closed or screen locked)

Migration `20261008150000_push_subscriptions.sql` and Edge Function `supabase/functions/send-driver-push`.

How it works: a new offer row → database trigger (pg_net) → `send-driver-push` → Web Push to every device the
driver enabled → the service worker `/driver-sw.js` shows **«أوردر جديد #123»** and opens `/driver` on tap.
The payload holds only the order number, a short text and the link: no customer name, phone or address.
Devices the push service reports as gone (HTTP 404/410) are deleted automatically.

One-time setup per store:

1. Generate keys: `node scripts/generate-vapid-keys.mjs` (prints to your terminal only).
2. App environment (Vercel → Project → Settings → Environment Variables, and `.env` locally):
   `VITE_VAPID_PUBLIC_KEY` (public by design). Redeploy after adding it.
3. Edge Function secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set`):
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:owner@yourstore.com`),
   `DRIVER_PUSH_WEBHOOK_SECRET` (any long random string).
4. Deploy: `supabase functions deploy send-driver-push --no-verify-jwt`
   (the function checks the webhook secret or the driver's own login itself).
5. Let the database call it. In the SQL editor, run once with your values:

   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-driver-push', 'driver_push_url');
   select vault.create_secret('<same value as DRIVER_PUSH_WEBHOOK_SECRET>', 'driver_push_secret');
   ```

   Requires the pg_net extension (Database → Extensions). Without these two secrets nothing is sent and
   dispatching works exactly the same.
   Shortcut for a dev/staging project (allowlisted in `.env.test`): put the four function secrets in the
   git-ignored `supabase/.env.push`, then
   `npx supabase secrets set --env-file supabase/.env.push --project-ref <ref>` (step 3) and
   `node scripts/setup-push-vault.mjs` (step 5; creates or updates both Vault secrets, prints no values).

6. Each driver: driver app → ⚙ Settings → turn on "Order notifications" → "Send a test notification".

Phones:

- **Android (Chrome)**: works in the browser tab or installed app.
- **iPhone/iPad**: iOS 16.4+, and only after Safari → Share → **Add to Home Screen**, then opening the app
  from that icon and enabling notifications there. The settings screen shows these steps on iPhone.
