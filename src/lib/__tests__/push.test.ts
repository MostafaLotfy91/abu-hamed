import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignedPayload,
  bearerMatches,
  isGone,
  offerPayload,
  statusPayload,
  summarize,
  testPayload,
  ttlSeconds,
} from "../../../supabase/functions/send-driver-push/logic";
import { isIos, urlBase64ToUint8Array } from "../push";

describe("send-driver-push payloads", () => {
  it("offer payload: short Arabic title with the order number, opens /driver, no customer data", () => {
    const p = offerPayload(1234, "off-1");
    expect(p).toEqual({
      title: "أوردر جديد #1234",
      body: "اضغط للرد قبل انتهاء المهلة",
      url: "/driver",
      tag: "offer-off-1",
      requireInteraction: true,
    });
    // Only these keys: nothing like name, phone or address can slip in.
    expect(Object.keys(p).sort()).toEqual(["body", "requireInteraction", "tag", "title", "url"]);
  });

  it("test payload opens /driver", () => {
    expect(testPayload().url).toBe("/driver");
  });

  it("TTL lasts until the offer expires, clamped to 1 s .. 10 min", () => {
    const now = Date.parse("2026-10-08T12:00:00Z");
    expect(ttlSeconds("2026-10-08T12:02:00Z", now)).toBe(120);
    expect(ttlSeconds("2026-10-08T11:00:00Z", now)).toBe(1);
    expect(ttlSeconds("2026-10-08T14:00:00Z", now)).toBe(600);
  });

  it("only 404/410 mean the subscription is gone", () => {
    expect(isGone(404)).toBe(true);
    expect(isGone(410)).toBe(true);
    expect(isGone(429)).toBe(false);
    expect(isGone(500)).toBe(false);
    expect(isGone(undefined)).toBe(false);
  });

  it("assigned and status payloads: order number only, open /driver", () => {
    const a = assignedPayload(77, "o-1");
    expect(a).toMatchObject({ title: "أوردر #77 اتسلّم لك", url: "/driver", tag: "order-o-1" });
    expect(Object.keys(a).sort()).toEqual(["body", "requireInteraction", "tag", "title", "url"]);
    expect(statusPayload(77, "o-1", "preparing").title).toBe("أوردر #77 بيتجهز");
    expect(statusPayload(77, "o-1", "confirmed").title).toBe("أوردر #77 اتأكد");
  });

  it("summarizes the result for notification_log, with a reason for every failure", () => {
    expect(summarize([])).toEqual({
      status: "no_subscription",
      error: "driver has no registered device (enable notifications in the driver app settings)",
      devices: 0,
      sent: 0,
      removed: 0,
    });
    expect(summarize([{ id: "a", ok: true, status: 201 }])).toMatchObject({
      status: "sent",
      error: null,
      sent: 1,
    });
    const mixed = summarize([
      { id: "a", ok: true, status: 201 },
      { id: "b", ok: false, status: 410 },
      { id: "c", ok: false, status: 403 },
    ]);
    expect(mixed).toMatchObject({ status: "partial", devices: 3, sent: 1, removed: 1 });
    expect(mixed.error).toContain("410 subscription expired");
    expect(mixed.error).toContain("403 VAPID key mismatch");
    const allGone = summarize([
      { id: "a", ok: false, status: 404 },
      { id: "b", ok: false, status: 404 },
    ]);
    expect(allGone).toMatchObject({ status: "failed", removed: 2 });
    expect(allGone.error).toMatch(/×2$/);
    expect(
      summarize([{ id: "a", ok: false, message: "x".repeat(900) }]).error!.length,
    ).toBeLessThanOrEqual(500);
  });

  it("checks the webhook bearer secret", () => {
    expect(bearerMatches("Bearer s3cret", "s3cret")).toBe(true);
    expect(bearerMatches("Bearer s3cre", "s3cret")).toBe(false);
    expect(bearerMatches("s3cret", "s3cret")).toBe(false);
    expect(bearerMatches(null, "s3cret")).toBe(false);
    expect(bearerMatches("Bearer ", "")).toBe(false);
  });
});

describe("push client helpers", () => {
  it("decodes the base64url VAPID key", () => {
    expect([...urlBase64ToUint8Array("AQID_-8")]).toEqual([1, 2, 3, 255, 239]);
  });

  it("recognises iPhone, iPad (desktop-class UA) and not Android", () => {
    expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIos("Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5)).toBe(false);
  });
});

describe("driver service worker", () => {
  type Listener = (e: Record<string, unknown>) => void;
  const load = () => {
    const listeners: Record<string, Listener> = {};
    const shown: { title: string; opts: Record<string, unknown> }[] = [];
    const opened: string[] = [];
    const self = {
      location: { origin: "https://shop.example" },
      addEventListener: (t: string, fn: Listener) => (listeners[t] = fn),
      skipWaiting: vi.fn(),
      registration: {
        showNotification: async (title: string, opts: Record<string, unknown>) =>
          shown.push({ title, opts }),
      },
      clients: {
        claim: vi.fn(),
        matchAll: async () => [],
        openWindow: async (u: string) => opened.push(u),
      },
    };
    const code = readFileSync(path.resolve(__dirname, "../../../public/driver-sw.js"), "utf8");
    new Function("self", code)(self);
    return { listeners, shown, opened };
  };
  const waitable = () => {
    const ps: Promise<unknown>[] = [];
    return { waitUntil: (p: Promise<unknown>) => ps.push(p), done: () => Promise.all(ps) };
  };
  afterEach(() => vi.restoreAllMocks());

  it("shows the pushed notification", async () => {
    const { listeners, shown } = load();
    const w = waitable();
    listeners.push({
      ...w,
      data: { json: () => offerPayload(55, "o9") },
    });
    await w.done();
    expect(shown[0].title).toBe("أوردر جديد #55");
    expect(shown[0].opts).toMatchObject({
      tag: "offer-o9",
      requireInteraction: true,
      data: { url: "/driver" },
    });
  });

  it("opens /driver on tap and never another site", async () => {
    const { listeners, opened } = load();
    const tap = async (url: string) => {
      const w = waitable();
      listeners.notificationclick({ ...w, notification: { close: vi.fn(), data: { url } } });
      await w.done();
    };
    await tap("/driver");
    await tap("https://evil.example/phish");
    expect(opened).toEqual(["https://shop.example/driver"]);
  });
});
