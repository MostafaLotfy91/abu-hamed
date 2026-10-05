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
- All schema lives in migrations (drizzle/migrations) so it can be replayed on each new client backend.
- Order totals are computed only in the `place_order` DB function, never trusted from the client, to prevent price tampering.
- Roles live in `user_roles` and are checked via `has_role`/`is_staff` security-definer functions; RLS is the real security boundary, UI gates are cosmetic.
- The first signed-in user can call `claim_first_admin()` once to bootstrap admin per deployment.
- Media bucket is private (workspace blocks public buckets); uploads store long-lived signed URLs.
- Customer text strings live in `src/lib/i18n.tsx` (ar/en); DB content uses `*_ar`/`*_en` columns read via `tx()`.
- AI shopping assistant: /api/assistant server route (not Supabase Edge Functions, per stack rules), gated server-side by the ai_assistant flag; the model may only cite products returned by its search tool and suggestions are validated against those rows.
- Driver app at /driver (PWA via manifest only, no service worker); driver writes go through driver_* security-definer RPCs, locations via RLS-gated driver_locations.
