// Sends Web Push notifications to a driver's devices.
//  * POST {"log_id": "..."} with "Authorization: Bearer <DRIVER_PUSH_WEBHOOK_SECRET>": called by the database
//    (pg_net) for a notification_log row it queued: a new offer, a manual assignment, or the driver's order
//    reaching the start status. The result (sent / partial / failed / no_subscription + reason) is written back.
//  * POST {"offer_id": "..."} (same secret): older database versions; notifies the offered driver, not logged.
//  * POST {"test": true} with the signed-in driver's JWT: a test notification to the caller's own devices (logged).
// Subscriptions the push service reports as gone (404/410) are deleted; the driver app then asks to re-enable.
// Secrets (names only): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https: contact),
// DRIVER_PUSH_WEBHOOK_SECRET; SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
// Deploy with --no-verify-jwt: the function checks the webhook secret or the user's JWT itself.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import {
  assignedPayload,
  bearerMatches,
  deviceError,
  isGone,
  offerPayload,
  statusPayload,
  summarize,
  testPayload,
  ttlSeconds,
  type DeviceResult,
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

type Order = { order_number: number; status: string } | null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json(405, { error: "method" });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const body = (await req.json().catch(() => ({}))) as {
    log_id?: string;
    offer_id?: string;
    test?: boolean;
  };
  const fromDatabase = !!(body.log_id || body.offer_id);
  if (
    fromDatabase &&
    !bearerMatches(
      req.headers.get("authorization"),
      Deno.env.get("DRIVER_PUSH_WEBHOOK_SECRET") ?? "",
    )
  )
    return json(401, { error: "unauthorized" });

  let logId = body.log_id ?? null;
  const finish = async (fields: Record<string, unknown>) => {
    if (logId)
      await db
        .from("notification_log")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", logId);
  };

  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) {
    await finish({
      status: "not_configured",
      error: "VAPID keys are not set in Edge Function secrets",
    });
    return json(500, { error: "push_not_configured" });
  }
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com", pub, priv);

  let userId: string;
  let payload: PushPayload;
  let ttl = 60;

  if (body.log_id) {
    const { data: log } = await db
      .from("notification_log")
      .select("event,recipient,status,order_id,offer_id,orders(order_number,status)")
      .eq("id", body.log_id)
      .maybeSingle();
    if (!log || log.status !== "queued" || !log.recipient)
      return json(200, { skipped: "not_queued" });
    const order = log.orders as unknown as Order;
    const number = order?.order_number ?? "";
    userId = log.recipient;
    if (log.event === "offer_created") {
      const { data: offer } = await db
        .from("order_dispatch_offers")
        .select("status,expires_at")
        .eq("id", log.offer_id ?? "")
        .maybeSingle();
      if (!offer || offer.status !== "offered") {
        await finish({ status: "skipped", error: "offer already closed" });
        return json(200, { skipped: "offer_closed" });
      }
      payload = offerPayload(number, log.offer_id!);
      ttl = ttlSeconds(offer.expires_at);
    } else if (log.event === "order_assigned") {
      payload = assignedPayload(number, log.order_id ?? "");
      ttl = 600;
    } else {
      payload = statusPayload(number, log.order_id ?? "", order?.status ?? "");
      ttl = 600;
    }
  } else if (body.offer_id) {
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
    const { data: log } = await db
      .from("notification_log")
      .insert({ event: "test", recipient: userId })
      .select("id")
      .maybeSingle();
    logId = log?.id ?? null;
  } else return json(400, { error: "bad_request" });

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("id,endpoint,keys")
    .eq("user_id", userId);
  const results: DeviceResult[] = await Promise.all(
    (subs ?? []).map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), {
          TTL: ttl,
          urgency: "high",
        })
        .then(() => ({ id: s.id, ok: true, status: 201 }))
        .catch((e: { statusCode?: number; body?: string; message?: string }) => ({
          id: s.id,
          ok: false,
          status: e.statusCode,
          message: e.body || e.message,
        })),
    ),
  );
  const now = new Date().toISOString();
  const gone = results.filter((r) => isGone(r.status)).map((r) => r.id);
  if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
  const ok = results.filter((r) => r.ok).map((r) => r.id);
  if (ok.length)
    await db
      .from("push_subscriptions")
      .update({ last_success_at: now, last_failure_at: null, last_error: null })
      .in("id", ok);
  for (const r of results.filter((r) => !r.ok && !isGone(r.status)))
    await db
      .from("push_subscriptions")
      .update({ last_failure_at: now, last_error: deviceError(r).slice(0, 300) })
      .eq("id", r.id);

  const summary = summarize(results);
  await finish(summary);
  return json(200, {
    devices: summary.devices,
    sent: summary.sent,
    removed: summary.removed,
    status: summary.status,
  });
});
