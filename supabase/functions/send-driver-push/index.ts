// Sends Web Push notifications to a driver's devices.
//  * POST {"offer_id": "..."} with "Authorization: Bearer <DRIVER_PUSH_WEBHOOK_SECRET>": called by the database
//    when an offer is created (trigger order_dispatch_offers_push via pg_net). Notifies the offered driver.
//  * POST {"test": true} with the signed-in driver's JWT: a test notification to the caller's own devices.
// Subscriptions the push service reports as gone (404/410) are deleted.
// Secrets (names only): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: contact),
// DRIVER_PUSH_WEBHOOK_SECRET; SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Deploy with --no-verify-jwt: the function checks the webhook secret or the user's JWT itself.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import {
  bearerMatches,
  isGone,
  offerPayload,
  testPayload,
  ttlSeconds,
  type PushPayload,
} from "./logic.ts";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method" });

  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return json(500, { error: "push_not_configured" });
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com", pub, priv);
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const body = (await req.json().catch(() => ({}))) as { offer_id?: string; test?: boolean };
  let userId: string;
  let payload: PushPayload;
  let ttl = 60;

  if (body.offer_id) {
    if (
      !bearerMatches(
        req.headers.get("authorization"),
        Deno.env.get("DRIVER_PUSH_WEBHOOK_SECRET") ?? "",
      )
    )
      return json(401, { error: "unauthorized" });
    const { data: offer } = await db
      .from("order_dispatch_offers")
      .select("driver_id,status,expires_at,orders(order_number)")
      .eq("id", body.offer_id)
      .maybeSingle();
    if (!offer || offer.status !== "offered") return json(200, { skipped: "offer_closed" });
    const orderNumber = (offer.orders as { order_number: number } | null)?.order_number ?? "";
    userId = offer.driver_id;
    payload = offerPayload(orderNumber, body.offer_id);
    ttl = ttlSeconds(offer.expires_at);
  } else if (body.test) {
    const jwt = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
    const { data: u } = jwt ? await db.auth.getUser(jwt) : { data: { user: null } };
    if (!u.user) return json(401, { error: "unauthorized" });
    const { data: role } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", u.user.id)
      .eq("role", "driver")
      .maybeSingle();
    if (!role) return json(403, { error: "drivers_only" });
    userId = u.user.id;
    payload = testPayload();
  } else return json(400, { error: "bad_request" });

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id,endpoint,keys")
    .eq("user_id", userId);
  const results = await Promise.all(
    (subs ?? []).map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), {
          TTL: ttl,
          urgency: "high",
        })
        .then(() => ({ id: s.id, ok: true, status: 201 }))
        .catch((e: { statusCode?: number }) => ({ id: s.id, ok: false, status: e.statusCode })),
    ),
  );
  const gone = results.filter((r) => isGone(r.status)).map((r) => r.id);
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  const ok = results.filter((r) => r.ok).map((r) => r.id);
  if (ok.length)
    await db
      .from("push_subscriptions")
      .update({ last_success_at: new Date().toISOString() })
      .in("id", ok);
  return json(200, { devices: results.length, sent: ok.length, removed: gone.length });
});
