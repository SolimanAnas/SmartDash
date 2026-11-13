const CACHE = 'smartdash-v6';
const PRECACHE = [
  'manifest.json',
  '404.html',
  'icons/icon-48x48.png',
  'icons/icon-72x72.png',
  'icons/icon-96x96.png',
  'icons/icon-128x128.png',
  'icons/icon-144x144.png',
  'icons/icon-152x152.png',
  'icons/icon-192x192.png',
  'icons/icon-384x384.png',
  'icons/icon-512x512.png',
];
const CDN_CACHE = 'smartdash-cdn-v6';
const OLD_CACHES = [
  'dcas-ops-v1',
  'dcas-ops-v2',
  'dcas-ops-v3',
  'dcas-ops-cdn-v1',
  'dcas-ops-cdn-v2',
  'dcas-ops-cdn-v3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map((f) => new Request(f, { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE && k !== CDN_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isNav = event.request.mode === 'navigate';

  if (
    url.hostname === 'cdnjs.cloudflare.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        try {
          const res = await fetch(event.request);
          if (res.ok) {
            const cache = await caches.open(CDN_CACHE);
            cache.put(event.request, res.clone());
          }
          return res;
        } catch {
          return cached || new Response('', { status: 408 });
        }
      })(),
    );
    return;
  }

  if (isNav) {
    event.respondWith(
      (async () => {
        try {
          const bustUrl = new URL(event.request.url);
          bustUrl.searchParams.set('_sw_cache', Date.now());
          const res = await fetch(new Request(bustUrl, { cache: 'no-store' }));
          if (res.ok) {
            const cache = await caches.open(CACHE);
            cache.put(event.request, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallback = await caches.match('404.html');
          if (fallback) return fallback;
          return new Response('Offline', { status: 503 });
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        const res = await fetch(event.request);
        if (res.ok && event.request.method === 'GET') {
          const cache = await caches.open(CACHE);
          cache.put(event.request, res.clone());
        }
        return res;
      } catch {
        const fallback = await caches.match('index.html');
        if (fallback) return fallback;
        return new Response('Offline', { status: 503 });
      }
    })(),
  );
});

// Document-expiry alerts: tapping a notification focuses SmartDash on Documents & Alerts.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || './#docs',
    self.registration.scope,
  ).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of wins) {
        if (w.url.indexOf(self.registration.scope) === 0 && 'focus' in w) {
          await w.focus();
          if ('navigate' in w) return w.navigate(target);
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })(),
  );
});
