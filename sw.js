/* Service worker: offline shell + reminder scheduling while the app is open/backgrounded. */
const CACHE = 'ideasfest-vedri-v3';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  // Cache key without the cache-busting query, so offline lookups hit the last good copy.
  const key = new Request(url.origin + url.pathname);
  // Network first for everything on our origin (data and shell), falling back to the cached copy in a field with no signal.
  e.respondWith(fetch(e.request).then((r) => {
    if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
    return r;
  }).catch(() => caches.match(key, { ignoreSearch: true }).then((hit) => hit || (url.pathname.endsWith('/') ? caches.match('./index.html') : undefined))));
});

// Reminder timers. The page posts {type:'schedule', items:[{id,title,body,at}]}.
const timers = new Map();
self.addEventListener('message', (e) => {
  const msg = e.data || {};
  if (msg.type === 'schedule') {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    const now = Date.now();
    for (const it of msg.items || []) {
      const delay = it.at - now;
      if (delay < -60000 || delay > 36 * 3600 * 1000) continue;
      timers.set(it.id, setTimeout(() => {
        self.registration.showNotification(it.title, {
          body: it.body, tag: it.id, icon: './icons/icon-192.png', badge: './icons/icon-192.png',
          vibrate: [120, 60, 120], data: { sessionId: it.sessionId }, requireInteraction: false
        });
      }, Math.max(0, delay)));
    }
  }
  if (msg.type === 'test') {
    self.registration.showNotification('Reminders are working', { body: msg.body || 'You will get one like this before each planned session.', icon: './icons/icon-192.png', tag: 'test' });
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.sessionId;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const url = new URL('./', location.href).href + (id ? '#session=' + id : '');
    for (const c of list) { if ('focus' in c) { c.navigate ? c.navigate(url) : null; return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
