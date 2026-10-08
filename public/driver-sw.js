/* Driver app service worker (scope /driver): shows Web Push notifications for new orders and opens the app on tap.
 * Payload (from send-driver-push): { title, body, url, tag, requireInteraction }. No customer data is ever sent. */
/* global self */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "" };
  }
  const title = data.title || "أوردر جديد";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || "driver",
      renotify: true,
      requireInteraction: !!data.requireInteraction,
      icon: "/driver-icon-192.png",
      badge: "/driver-icon-192.png",
      vibrate: [300, 150, 300, 150, 300],
      dir: "rtl",
      lang: "ar",
      data: { url: data.url || "/driver" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/driver",
    self.location.origin,
  );
  // Only ever open pages of this site.
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).pathname.startsWith("/driver") && "focus" in c) {
          if ("navigate" in c && c.url !== target.href) c.navigate(target.href).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
