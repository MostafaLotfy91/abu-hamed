// Fallback scheduler for projects without pg_cron: expires driver offers past their timeout and moves each
// order on to the next driver. Schedule it every minute (Supabase Dashboard > Edge Functions > Schedules,
// or any external cron) with header `Authorization: Bearer <DISPATCH_CRON_SECRET>`.
// Secrets (names only): DISPATCH_CRON_SECRET, plus SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY provided by Supabase.
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const secret = Deno.env.get("DISPATCH_CRON_SECRET");
  if (!secret) return new Response("not configured", { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return new Response("unauthorized", { status: 401 });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false },
    },
  );
  const { data, error } = await db.rpc("expire_stale_offers");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ expired: data }), {
    headers: { "content-type": "application/json" },
  });
});
