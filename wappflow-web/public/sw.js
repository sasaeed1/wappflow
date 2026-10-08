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
    icon: data.icon || '/pwa-icon-192.png',
    badge: data.badge || undefined,
    data: data.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: false,
    // A customer message offers Reply (opens its chat bubble); everything else Open.
    actions: data.data?.kind === 'chat'
      ? [{ action: 'open', title: 'Reply' }, { action: 'dismiss', title: 'Dismiss' }]
      : [{ action: 'open', title: 'Open' }, { action: 'dismiss', title: 'Dismiss' }],
    tag: data.tag || 'wappflow-notification',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  const url = data.url || '/dashboard';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Chat bubbles (PROP-007): if WappFlow is already open, bring it forward and
      // open that conversation's bubble there instead of loading a new page.
      if (data.kind === 'chat' && data.lead_id) {
        const open = clientList.find((c) => 'focus' in c);
        if (open) { open.postMessage({ type: 'wf-open-bubble', lead_id: data.lead_id }); return open.focus(); }
      }
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
