Create a CLAUDE.md file in the project root with these contents, then show me the file:

# Abu Hamed - Fashion Mall E-commerce (white-label)

## Project
Clothing/fashion mall store (men, women, kids, shoes, sneakers, slippers, galabeyas,
abayas, perfumes, accessories). Built with Lovable, continued with Claude Code.
Stack: React + Vite + TypeScript + Tailwind + Supabase.

## Rules
- Arabic default with full RTL, English toggle. Mobile-first.
- White-label: nothing store-specific hardcoded. Name, logo, colors, currency, fees and
  feature flags come from the `store_settings` table. Supabase keys from env vars only.
- Categories/products are database data, never hardcoded.
- Every DB change is a NEW migration file in supabase/migrations. Never edit old ones.
- Every new table needs RLS policies. Roles live in a separate user_roles table, checked with a
  security-definer function. Never on the profile table.
- Never expose secret keys (service role, AI keys, payment keys) in frontend code.
  AI and payment logic go in Supabase Edge Functions.
- Order flow: pending -> confirmed -> preparing -> out_for_delivery -> delivered / cancelled.
- Cash on delivery only for now. online_payment flag stays off.