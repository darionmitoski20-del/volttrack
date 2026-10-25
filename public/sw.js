// Minimal service worker: only handles Web Push display + notification clicks.
// No offline caching — that's out of scope here.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'VoltTrack', body: event.data.text() };
  }
  const { title, body, url } = payload;
  event.waitUntil(
    self.registration.showNotification(title || 'VoltTrack', {
      body,
      icon: new URL('volt.svg', self.registration.scope).href,
      badge: new URL('volt.svg', self.registration.scope).href,
      data: { url: new URL((url || '/').replace(/^\//, ''), self.registration.scope).href },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
