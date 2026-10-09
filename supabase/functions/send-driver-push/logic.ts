// Pure helpers for send-driver-push (no Deno or network APIs), unit-tested from the app's test suite.
// Payloads carry no customer data: only the order number, where to open, and a tag.

export type PushPayload = {
  title: string;
  body: string;
  /** Opened on tap (same origin as the service worker). */
  url: string;
  /** Same tag replaces an older notification for the same offer instead of stacking. */
  tag: string;
  /** Keep on screen until the driver acts (where the platform supports it). */
  requireInteraction: boolean;
};

export function offerPayload(orderNumber: number | string, offerId: string): PushPayload {
  return {
    title: `أوردر جديد #${orderNumber}`,
    body: "اضغط للرد قبل انتهاء المهلة",
    url: "/driver",
    tag: `offer-${offerId}`,
    requireInteraction: true,
  };
}

export function testPayload(): PushPayload {
  return {
    title: "إشعار تجريبي",
    body: "الإشعارات شغالة على الجهاز ده ✓",
    url: "/driver",
    tag: "driver-test",
    requireInteraction: false,
  };
}

/** Seconds the push service may hold the message: until the offer expires (at least 1, at most 10 min). */
export function ttlSeconds(expiresAt: string, now = Date.now()) {
  const left = Math.floor((new Date(expiresAt).getTime() - now) / 1000);
  return Math.min(600, Math.max(1, left));
}

/** 404/410 from a push service mean the subscription is gone for good and should be deleted. */
export function isGone(status: number | undefined) {
  return status === 404 || status === 410;
}

/** Constant-time comparison of a bearer token with the expected secret. */
export function bearerMatches(header: string | null, secret: string) {
  const m = /^Bearer (.+)$/.exec(header ?? "");
  if (!m || !secret) return false;
  const a = new TextEncoder().encode(m[1]);
  const b = new TextEncoder().encode(secret);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Driver assigned to an order by the store (no offer to answer). */
export function assignedPayload(orderNumber: number | string, orderId: string): PushPayload {
  return {
    title: `أوردر #${orderNumber} اتسلّم لك`,
    body: "افتح التطبيق لتفاصيل التوصيل",
    url: "/driver",
    tag: `order-${orderId}`,
    requireInteraction: true,
  };
}

/** The driver's order reached the start status (e.g. preparing): get ready to pick it up. */
export function statusPayload(
  orderNumber: number | string,
  orderId: string,
  status: string,
): PushPayload {
  const what = status === "confirmed" ? "اتأكد" : "بيتجهز";
  return {
    title: `أوردر #${orderNumber} ${what}`,
    body: "جهّز نفسك للاستلام",
    url: "/driver",
    tag: `order-${orderId}`,
    requireInteraction: false,
  };
}

export type DeviceResult = { id: string; ok: boolean; status?: number; message?: string };

/** Human-readable reason for one failed device (stored per device and in the log). */
export function deviceError(r: DeviceResult): string {
  if (isGone(r.status)) return `${r.status} subscription expired (removed; driver must re-enable)`;
  if (r.status === 403 || r.status === 401)
    return `${r.status} VAPID key mismatch (re-subscribe the device or check VAPID keys)`;
  if (r.status === 413) return "413 payload too large";
  if (r.status === 429) return "429 push service rate limit";
  return `${r.status ?? "network"} ${(r.message ?? "send failed").slice(0, 120)}`;
}

/** notification_log result for one notification sent to all of a driver's devices. */
export function summarize(results: DeviceResult[]) {
  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const removed = failed.filter((r) => isGone(r.status)).length;
  const status =
    results.length === 0
      ? "no_subscription"
      : sent === results.length
        ? "sent"
        : sent > 0
          ? "partial"
          : "failed";
  const counts = new Map<string, number>();
  for (const r of failed) counts.set(deviceError(r), (counts.get(deviceError(r)) ?? 0) + 1);
  const error =
    results.length === 0
      ? "driver has no registered device (enable notifications in the driver app settings)"
      : [...counts].map(([e, n]) => (n > 1 ? `${e} ×${n}` : e)).join("; ") || null;
  return { status, error: error?.slice(0, 500) ?? null, devices: results.length, sent, removed };
}
