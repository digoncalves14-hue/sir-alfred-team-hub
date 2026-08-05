/* Service worker exclusivo para notificações push (Sir Alfred Equipe). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Sir Alfred Equipe", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Sir Alfred Equipe";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.id || undefined,
      data: { tab: data.tab || null },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tab = event.notification.data && event.notification.data.tab;
  const url = tab ? `/?tab=${encodeURIComponent(tab)}` : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
