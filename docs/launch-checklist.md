# Launch checklist

Work through this list once per store deployment. Variable names only; values live in the hosting
provider's secret store, never in the repo.

## 1. Supabase project (production)

- [ ] Create a separate production project. Never reuse the dev/staging one.
- [ ] Apply every file in `supabase/migrations/` in order, using `supabase db push` from a trusted machine
      or the SQL editor. Do **not** run `supabase/seed.sql`, which holds the demo catalogue for development only.
- [ ] Confirm `store_settings` has exactly one row (id = 1) and fill it from the admin settings page:
      store name (ar/en), logo, colours, currency, delivery fee, free-shipping threshold, WhatsApp number,
      contact phone.
- [ ] Feature flags in `store_settings.features`: keep `online_payment` **off** (cash on delivery only).
      Turn on `ai_assistant` / `ai_analytics` only after `AI_API_KEY` is set (section 2).
- [ ] Storage: the `store-media` bucket exists and is public-read. Uploads are limited to staff and to
      image extensions by the migrations.
- [ ] Auth → URL configuration: Site URL = the production domain; add it (and `https://www.` if used)
      to the redirect allow-list. Remove localhost and preview URLs.
- [ ] Auth → email: set up a custom SMTP sender and check the Arabic templates for sign-up and reset.
- [ ] Create the first admin with the service role, as described in `docs/first-admin.md`. There is no in-app
      "claim admin" any more.
- [ ] Turn on daily backups / PITR on the project plan and do one test restore.

## 2. Hosting environment variables

| Name                                                 | Where          | Notes                                                                         |
| ---------------------------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`                                  | build + server | production project URL                                                        |
| `VITE_SUPABASE_PUBLISHABLE_KEY`                      | build + server | publishable/anon key                                                          |
| `SUPABASE_URL`                                       | server         | same URL                                                                      |
| `SUPABASE_PUBLISHABLE_KEY`                           | server         | same publishable key                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`                          | server only    | never prefixed `VITE_`                                                        |
| `AI_API_KEY`                                         | server only    | AI chat + AI insights. Free Google Gemini key from aistudio.google.com/apikey |
| `AI_PROVIDER` / `AI_MODEL`                           | server only    | optional: `gemini` (default), `groq`, `openrouter`, `openai`; model override  |
| `RATE_LIMIT_SALT`                                    | server only    | random, 16+ chars                                                             |
| `LOVABLE_CRON_SECRET` (+ `_PREVIOUS` while rotating) | server only    | scheduled jobs                                                                |
| `TRUSTED_IP_HEADER`                                  | server         | only if behind a proxy that sets it                                           |
| `VITE_VAPID_PUBLIC_KEY`                              | build + server | driver push notifications (public key)                                        |

Edge Function secrets (names only): `DISPATCH_CRON_SECRET` (only without pg_cron), `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `DRIVER_PUSH_WEBHOOK_SECRET`. Vault secrets: `driver_push_url`,
`driver_push_secret`. Setup steps: `docs/dispatch.md`.

## 3. Catalogue

- [ ] Create categories (and sub-categories) in the admin area and set each top-level category's
      **profile** (clothes / shoes / kids / modest / perfume / accessories / general). Filters and the
      product page follow the profile.
- [ ] Import products from Excel (admin → import). Fix every row the validator flags, then upload images
      in bulk.
- [ ] Add banners, the branch address and delivery zones.
- [ ] Place one real cash-on-delivery order end to end: pending → confirmed → preparing →
      out_for_delivery → delivered. Assign a driver and check the WhatsApp links.

## 4. Before going live

- [ ] `npm run lint && npx tsc --noEmit && npm test && npm run test:db && npm run build` are green.
- [ ] E2E suite passes against staging (`E2E_WEB_SERVER=1 npm run test:e2e`).
- [ ] Rotate any key that was ever pasted into chat, a ticket or a shared file.
- [ ] Check the server clock and NTP on any machine that runs scripts against Supabase (a skewed clock
      signs users out).
- [ ] Check that the favicon/logo and `public/*.webmanifest` match the store, and that SEO titles show the
      store name.
