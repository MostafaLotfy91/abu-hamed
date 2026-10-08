// Sound, vibration and system-notification helpers for the driver app. Browsers only allow audio after a
// user gesture, so the driver enables alerts once (unlockAlerts, from a button tap); the choice is remembered.
import { useEffect, useState } from "react";

const PREF = "driver.alerts";

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let ringing: ReturnType<typeof setInterval> | null = null;

function audio(): Ctx | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  return ctx;
}

/** Whether the driver already went through the one-time "enable sound and notifications" step. */
export function alertsOnboarded() {
  try {
    return localStorage.getItem(PREF) === "on";
  } catch {
    return false;
  }
}

/** Must run inside a tap/click handler: unlocks audio, asks for notification permission, plays a test chime. */
export async function unlockAlerts(): Promise<{
  sound: boolean;
  notifications: NotificationPermission | "unsupported";
}> {
  const a = audio();
  let sound = false;
  if (a) {
    try {
      await a.resume();
      sound = a.state === "running";
      chime(a);
    } catch {
      sound = false;
    }
  }
  vibrate([120]);
  let notifications: NotificationPermission | "unsupported" = "unsupported";
  if (typeof Notification !== "undefined") {
    notifications =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
  }
  try {
    localStorage.setItem(PREF, "on");
  } catch {
    /* private mode: the step shows again next time */
  }
  return { sound, notifications };
}

/** Two short tones. */
function chime(a: Ctx) {
  const t = a.currentTime;
  for (const [i, f] of [880, 1320].entries()) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.18);
    g.gain.exponentialRampToValueAtTime(0.4, t + i * 0.18 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.16);
    o.connect(g).connect(a.destination);
    o.start(t + i * 0.18);
    o.stop(t + i * 0.18 + 0.17);
  }
}

export function vibrate(pattern: number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* not supported */
  }
}

let ringStop: ReturnType<typeof setTimeout> | null = null;

/** Rings (chime + vibration every 2 s) for up to `maxMs` or until stopRinging(); restarts the limit if called again. */
export function startRinging(maxMs = 30_000) {
  if (ringStop) clearTimeout(ringStop);
  ringStop = setTimeout(stopRinging, maxMs);
  if (ringing) return;
  const ring = () => {
    const a = audio();
    if (a && a.state === "running") chime(a);
    vibrate([300, 150, 300]);
  };
  ring();
  ringing = setInterval(ring, 2000);
}

export function stopRinging() {
  if (ringStop) clearTimeout(ringStop);
  ringStop = null;
  if (!ringing) return;
  clearInterval(ringing);
  ringing = null;
  vibrate([0]);
}

/** A system notification when the app is open but in the background (permission granted during onboarding). */
export function notifyInBackground(title: string, body: string) {
  if (typeof document === "undefined" || document.visibilityState === "visible") return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: "driver-offer", requireInteraction: true });
  } catch {
    /* some mobile browsers only allow notifications from a service worker (Phase 3 push) */
  }
}

export type WakeLockState = "off" | "active" | "unsupported" | "error";

/**
 * Keeps the screen on while `on` is true (driver available or delivering). The lock is released by the
 * browser when the tab is hidden, so it is re-acquired when the app becomes visible again.
 */
export function useWakeLock(on: boolean): WakeLockState {
  const [state, setState] = useState<WakeLockState>("off");
  useEffect(() => {
    if (!on) {
      setState("off");
      return;
    }
    const wl = (
      navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<WakeLockSentinel> } }
    ).wakeLock;
    if (!wl) {
      setState("unsupported");
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        sentinel = await wl.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        setState("active");
        sentinel.addEventListener("release", () => !cancelled && setState("off"));
      } catch {
        if (!cancelled) setState("error");
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && (!sentinel || sentinel.released)) acquire();
    };
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release().catch(() => {});
    };
  }, [on]);
  return state;
}

/** True when sound can play now (audio unlocked in this page load). */
export function soundReady() {
  return ctx?.state === "running";
}

/** Resumes audio on a tap (after a reload the browser locks audio again until the next user gesture). */
export async function resumeSound() {
  const a = audio();
  if (!a) return false;
  try {
    await a.resume();
  } catch {
    /* ignored */
  }
  return a.state === "running";
}

/** One chime (admin new-order alert). Plays only once audio is unlocked by a tap in this page load. */
export function playChime() {
  const a = audio();
  if (a && a.state === "running") chime(a);
}
