// WappFlow Service Worker — Push Notification Handler

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Minimal passthrough fetch handler — required for PWA installability.
// Intentionally no caching: this is an auth-heavy, live app, so we never serve
// stale responses; requests go straight to the network.
self.addEventListener('fetch', () => { /* network passthrough */ });

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'WappFlow', body: event.data.text() }; }

  const title = data.title || 'WappFlow';
  const options = {
    body: data.body || 'You have a new notification',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-72.png',
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: false,
    actions: [
      { action: 'open', title: 'Open', icon: '/icon-72.png' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    tag: data.tag || 'wappflow-notification',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
