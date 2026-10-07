# End-to-end tests (Playwright)

Browser tests for the storefront, admin, driver app, live tracking, AI stylist (mocked), WhatsApp button,
access control and accessibility. They run against a **local Supabase** (recommended) or a **staging** project.
They create users, orders, products and temporarily change `store_settings`, so they must **never** run against production.

## Quick start (local Supabase)

```bash
npx supabase start                    # needs Docker; a fresh stack applies every file in supabase/migrations
node scripts/make-env-test.mjs        # writes .env.test from `supabase status` (localhost only, keys not printed)
npx playwright install chromium       # once
npx playwright test                   # E2E_WEB_SERVER=1 in .env.test starts `vite dev --mode test` for you
npx supabase stop                     # when done
```

## Prerequisites

1. Docker and the Supabase CLI (`npx supabase` works without a global install).
2. Start a local Supabase stack. On first start it applies all migrations from `supabase/migrations`:
   ```bash
   npx supabase start
   npx supabase status        # prints the local API URL, anon key and service_role key
   ```
   To rebuild the local database from the migrations later, `npx supabase stop --no-backup` then `start` again.
3. Install the Playwright browser once:
   ```bash
   npx playwright install chromium
   ```
4. Create `.env.test` in the repo root (it is git-ignored by the `.env.*` rule): run `node scripts/make-env-test.mjs`,
   or write it by hand. The E2E config reads **only** this file plus real environment variables; it never reads `.env`.

   ```dotenv
   # App under test (vite dev uses port 8080 by default)
   E2E_BASE_URL=http://localhost:8080

   # Supabase used by the app AND by the seed helper (values from `supabase status`)
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_PUBLISHABLE_KEY=<local anon key>
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_PUBLISHABLE_KEY=<local anon key>
   SUPABASE_SERVICE_ROLE_KEY=<local service_role key>   # Node-side seeding only, never sent to the browser

   # Test accounts: created/updated automatically by the seed (any values you like)
   E2E_ADMIN_EMAIL=e2e-admin@example.test
   E2E_ADMIN_PASSWORD=<at least 6 chars>
   E2E_CUSTOMER_EMAIL=e2e-customer@example.test
   E2E_CUSTOMER_PASSWORD=<at least 6 chars>
   E2E_DRIVER_EMAIL=e2e-driver@example.test
   E2E_DRIVER_PASSWORD=<at least 6 chars>

   # Optional
   # E2E_WEB_SERVER=1          # let Playwright start `vite dev --mode test` (Vite then loads .env.test)
   # E2E_WORKERS=1             # default 1: specs share one DB and one store_settings row
   # E2E_ALLOW_REMOTE=staging  # REQUIRED to target a non-localhost app/Supabase (staging only)
   ```

   `E2E_SUPABASE_URL` / `E2E_SUPABASE_ANON_KEY` may be used instead of `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`.

5. The app must point at the same Supabase as the seed. Either run it yourself with the test env:
   ```bash
   npx vite dev --mode test      # loads .env.test (values there override .env)
   ```
   or set `E2E_WEB_SERVER=1` and let Playwright start it.

## Running

```bash
npx playwright test                                  # all specs, desktop (1280x800) + mobile (375x812)
npx playwright test --project=desktop-chromium       # one project
npx playwright test tests/e2e/driver.spec.ts         # one file
npx playwright test --list                           # discover only (no browser, no backend)
npx playwright show-report tests/e2e/.report         # HTML report
```

If any required variable is missing, every spec is **skipped** with the list of missing variables.

## What the suite does to the database

- **Global setup** (`global-setup.ts`): creates or updates the three accounts (admin via `grant_admin_by_email`,
  driver via `user_roles` + `driver_profiles`, customer with one address), snapshots `store_settings` to
  `tests/e2e/.state/settings-snapshot.json`, and turns on `delivery_tracking`, `whatsapp_button`, `ai_assistant`
  (`online_payment` stays off), plus a test WhatsApp number/templates and a 14-day return window.
- **Per worker** (`fixtures/test.ts`, `catalog`): one category, one shirt with Black S (0 stock) / M / L variants
  and a 10% coupon, all tagged `E2E…<TAG>`; removed at the end by `cleanupTag` (with the orders, banners, coupons,
  social links and import jobs that carry the tag).
- **Per test** (`fixtures/seed.ts`): orders through the real `place_order` RPC, moved through the status flow,
  assigned to the driver, etc.
- **Global teardown** restores `store_settings` from the snapshot.

## Safety guards

- `playwright.config.ts` and `fixtures/seed.ts` throw if `E2E_BASE_URL` or the Supabase URL is not
  `localhost`/`127.0.0.1`, unless `E2E_ALLOW_REMOTE=staging`.
- The service-role key is read only from `.env.test` / the environment, used only in Node, never logged.
- Every browser context blocks requests to any `*.supabase.co` host other than the configured one.
- AI is always mocked: `POST /api/assistant` and `/api/admin-insights` are fulfilled with NDJSON in the exact
  format the clients parse (`fixtures/mocks.ts`). No real AI calls.
- WhatsApp: `wa.me` is blocked; specs only assert the `href`.
- Map tiles (OpenStreetMap) and Google Fonts are stubbed so runs are deterministic.

## Layout

| File | Covers |
| --- | --- |
| `customer-shopping.spec.ts` | departments, categories, filters, search, product page (size/colour, out-of-stock size), wishlist, cart, coupon, COD checkout, order timeline, language toggle |
| `returns.spec.ts` | exchange / return requests on delivered orders |
| `admin.spec.ts` | admin login, product CRUD + variants + image upload, Excel import (valid / errors / undo), order status, coupons, banners (`javascript:` rejected), settings (name/colour on storefront), WhatsApp number + social links, drivers |
| `driver.spec.ts` | assigned order, accept, start delivery, `driver_locations` row saved, delivered, availability |
| `live-tracking.spec.ts` | customer order page updates in real time from a second (driver) browser context |
| `ai-stylist.spec.ts` | stylist chat with mocked stream, product cards, add to cart, errors, feature flag |
| `whatsapp-button.spec.ts` | wa.me links per page (general / product / order), hidden on `/admin` and `/driver` |
| `access-control.spec.ts` | signed-out redirects, customer/driver denied on `/admin` / `/driver` |
| `a11y.spec.ts` | axe WCAG 2 A/AA on home, product, checkout (fails on serious/critical) |

Known gaps are marked `test.fixme` with the reason (branches: no admin page and no storefront page exist yet).
