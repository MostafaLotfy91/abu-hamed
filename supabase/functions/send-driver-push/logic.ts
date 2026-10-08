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
