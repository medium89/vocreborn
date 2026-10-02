self.addEventListener("push", (event) => {
  const payload = event.data?.json?.() ?? { title: "TUSOVA", body: "Новое событие", url: "/" };
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, icon: "/brand/tusova-note-owl.png", badge: "/brand/tusova-note-owl.png", data: { url: payload.url || "/" } }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => windows[0] ? windows[0].focus() : clients.openWindow(event.notification.data.url)));
});