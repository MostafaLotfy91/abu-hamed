<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Keep the application in React with small, focused modules and clear feature boundaries so it remains easy to maintain.
- White-label: no store-specific data in code; branding, currency, fees, flags come from the single-row `store_settings` table (applied as CSS vars at runtime) so one codebase serves every client deployment.
- Reveal the application only after the initial settings request settles and brand CSS variables are applied, so reloads never flash the fallback theme.
- All schema lives in migrations (drizzle/migrations) so it can be replayed on each new client backend.
- Order totals are computed only in the `place_order` DB function, never trusted from the client, to prevent price tampering.
- Roles live in `user_roles` and are checked via `has_role`/`is_staff` security-definer functions; RLS is the real security boundary, UI gates are cosmetic.
- The first signed-in user can call `claim_first_admin()` once to bootstrap admin per deployment.
- Media bucket is private (workspace blocks public buckets); uploads store long-lived signed URLs.
- Customer text strings live in `src/lib/i18n.tsx` (ar/en); DB content uses `*_ar`/`*_en` columns read via `tx()`.
- AI stylist: /api/assistant server route (not Supabase Edge Functions, per stack rules) streams NDJSON events; gated server-side by the ai_assistant flag; the model may only cite products returned by its search tool and suggestions are validated against those rows; per-IP rate limit + anonymous counts via the server-only ai_rate_check function into staff-readable ai_usage_logs.
- Driver app at /driver (PWA via manifest only, no service worker), gated by the delivery_tracking flag; driver writes go through driver_* security-definer RPCs that require is_active_driver() (role + active + flag); locations via RLS-gated driver_locations; maps use Leaflet/OSM loaded client-side so no paid key is needed.
- Sellable unit is a product_variant (size × color, own SKU/stock, nullable price override); products.stock mirrors active variant stock via trigger, and place_order requires a variant whenever a product has active ones — so stock and price stay server-authoritative.
- Size scale comes from products.size_type, falling back to categories.size_type; scales live in src/lib/fashion.ts so storefront, admin and filters share one source.
- Returns/exchanges go through the request_return RPC (validates delivered status + store_settings.return_window_days); customers only read their own return_requests, staff update them.
- Seed/demo catalogue lives in migrations so each new client backend replays it.
