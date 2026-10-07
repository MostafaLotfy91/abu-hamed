// Server-only rate limiting for the paid AI endpoints, backed by the ai_rate_check DB function
// (20 requests per 10 minutes per key). It fails closed: if the check can't run, the request is refused.

/** The only client-IP header we trust. The app is deployed behind Cloudflare, which sets this and strips spoofed copies. */
const TRUSTED_IP_HEADER = process.env["TRUSTED_IP_HEADER"] ?? "cf-connecting-ip";

/** Secret salt so hashes can't be precomputed from public data. */
function salt() {
  const s = process.env["RATE_LIMIT_SALT"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!s) throw new Error("Missing RATE_LIMIT_SALT");
  return s;
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Visitor key from the trusted IP header. Requests without it share one bucket, so they can't dodge the limit. */
export function visitorKey(request: Request) {
  return `ip:${request.headers.get(TRUSTED_IP_HEADER)?.trim() || "unknown"}`;
}

export type RateResult = "ok" | "limited" | "unavailable";

/** Records one request for `key` and reports whether it is allowed. */
export async function checkRateLimit(key: string, messageCount = 1): Promise<RateResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("ai_rate_check", {
      _client_hash: await sha256(`${salt()}|${key}`),
      _message_count: messageCount,
    });
    if (error) {
      console.error("ai_rate_check", error.message);
      return "unavailable";
    }
    return data === true ? "ok" : "limited";
  } catch (e) {
    console.error("rate check unavailable", (e as Error)?.message);
    return "unavailable";
  }
}

/** JSON error response for a failed check, or null when the request may proceed. */
export function rateLimitResponse(result: RateResult): Response | null {
  if (result === "ok") return null;
  const [status, error] =
    result === "limited" ? [429, "rate_limited"] : [503, "rate_limit_unavailable"];
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
