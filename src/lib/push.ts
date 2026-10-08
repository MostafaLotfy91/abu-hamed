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

export async function enablePush(): Promise<"enabled" | "denied" | "error"> {
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") return "denied";
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));
    const j = sub.toJSON();
    const { error } = await supabase.rpc("register_push_subscription", {
      _endpoint: sub.endpoint,
      _keys: { p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" },
      _user_agent: navigator.userAgent.slice(0, 400),
    });
    return error ? "error" : "enabled";
  } catch {
    return "error";
  }
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

/** On app start: if this device already has a subscription, (re)link it to the signed-in driver. */
export async function refreshPushRegistration() {
  if (pushSupport() !== "ok" || Notification.permission !== "granted") return;
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  const j = sub.toJSON();
  await supabase.rpc("register_push_subscription", {
    _endpoint: sub.endpoint,
    _keys: { p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" },
    _user_agent: navigator.userAgent.slice(0, 400),
  });
}
