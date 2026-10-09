// Web Push for the driver app: registers /driver-sw.js, subscribes with the public VAPID key and stores the
// subscription (register_push_subscription). The VAPID public key is public by design (VITE_VAPID_PUBLIC_KEY);
// the private key lives only in the send-driver-push Edge Function secrets.
import { supabase } from "@/integrations/supabase/client";

const SW_URL = "/driver-sw.js";
const SW_SCOPE = "/driver";

export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "";

export type PushSupport =
  /** Ready to subscribe. */
  | "ok"
  /** iPhone/iPad in Safari: push works only after "Add to Home Screen" (iOS 16.4+). */
  | "ios_install"
  /** Browser has no Web Push. */
  | "unsupported"
  /** The store has not set VITE_VAPID_PUBLIC_KEY. */
  | "not_configured";

export function isIos(ua = navigator.userAgent, touchPoints = navigator.maxTouchPoints) {
  // iPadOS reports a Mac user agent; touch points tell them apart.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
}

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (isIos() && !isStandalone()) return "ios_install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return "unsupported";
  if (!VAPID_PUBLIC_KEY) return "not_configured";
  return "ok";
}

/** base64url VAPID key -> bytes for pushManager.subscribe. */
export function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration() {
  return (
    (await navigator.serviceWorker.getRegistration(SW_SCOPE)) ??
    (await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }))
  );
}

/** This device's current subscription, if any (also keeps the service worker registered). */
export async function currentSubscription() {
  if (pushSupport() !== "ok") return null;
  const reg = await registration();
  return reg.pushManager.getSubscription();
}

/** Whether a subscription was made with the store's current VAPID key (a rotated key makes old ones fail). */
export function sameServerKey(sub: PushSubscription, key = VAPID_PUBLIC_KEY) {
  const own = sub.options?.applicationServerKey;
  if (!own) return true; // browser doesn't say: assume current
  const a = new Uint8Array(own);
  const b = urlBase64ToUint8Array(key);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

async function register(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc("register_push_subscription", {
    _endpoint: sub.endpoint,
    _keys: { p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" },
    _user_agent: navigator.userAgent.slice(0, 400),
  });
  return !error;
}

async function permissionGranted() {
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  return permission === "granted";
}

/**
 * Turns push on for this device. With `fresh`, any existing subscription is dropped first (server row and
 * browser) and a new one is made: fixes an expired endpoint or one made with an old VAPID key.
 */
export async function enablePush({ fresh = false } = {}): Promise<"enabled" | "denied" | "error"> {
  if (!(await permissionGranted())) return "denied";
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub && (fresh || !sameServerKey(sub))) {
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe().catch(() => false);
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    return (await register(sub)) ? "enabled" : "error";
  } catch {
    return "error";
  }
}

export type DevicePush =
  | { state: Exclude<PushSupport, "ok"> }
  /** Browser blocked notifications for this site. */
  | { state: "blocked" }
  /** Never turned on here. */
  | { state: "off" }
  /** Made with an old VAPID key: pushes fail until re-subscribed. */
  | { state: "key_mismatch" }
  /** The browser has a subscription the server no longer has (expired and removed, or never saved). */
  | { state: "stale" }
  /** Registered, but to another account that used this phone. */
  | { state: "other_account" }
  | {
      state: "ok" | "failing";
      createdAt: string | null;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      lastError: string | null;
    };

/** Everything the driver needs to know about push on this device. */
export async function devicePushStatus(): Promise<DevicePush> {
  const support = pushSupport();
  if (support !== "ok") return { state: support };
  if (Notification.permission === "denied") return { state: "blocked" };
  const sub = await currentSubscription();
  if (!sub) return { state: "off" };
  if (!sameServerKey(sub)) return { state: "key_mismatch" };
  const { data, error } = await supabase.rpc("my_push_device", { _endpoint: sub.endpoint });
  const row = data?.[0];
  if (error || !row) throw error ?? new Error("no status");
  if (row.other_account) return { state: "other_account" };
  if (!row.registered) return { state: "stale" };
  const failing =
    !!row.last_failure_at && (!row.last_success_at || row.last_failure_at > row.last_success_at);
  return {
    state: failing ? "failing" : "ok",
    createdAt: row.created_at,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastError: row.last_error,
  };
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe().catch(() => false);
}

/** Asks send-driver-push to send a test notification to the caller's own devices. */
export async function sendTestPush(): Promise<
  { sent: number; devices: number } | { error: string }
> {
  const { data, error } = await supabase.functions.invoke("send-driver-push", {
    body: { test: true },
  });
  if (error) return { error: error.message };
  return data as { sent: number; devices: number };
}

/**
 * On app start: a device that receives push is re-linked to whoever is signed in now (shared phone), and a
 * subscription made with an old VAPID key is replaced. One the server removed as expired is left alone, so
 * the app can tell the driver to re-enable instead of silently saving a dead endpoint again.
 */
export async function refreshPushRegistration(): Promise<DevicePush> {
  if (pushSupport() !== "ok" || Notification.permission !== "granted") return devicePushStatus();
  const status = await devicePushStatus();
  if (status.state === "key_mismatch") await enablePush({ fresh: true });
  else if (status.state === "other_account") {
    const sub = await currentSubscription();
    if (sub) await register(sub);
  } else return status;
  return devicePushStatus();
}
