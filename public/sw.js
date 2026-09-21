'use strict';

const SW_VERSION = 'apex-sw-v1';
const CACHE_SHELL = `${SW_VERSION}-shell`;
const CACHE_PAGES = `${SW_VERSION}-pages`;
const CACHE_ASSETS = `${SW_VERSION}-assets`;
const KNOWN_CACHES = [CACHE_SHELL, CACHE_PAGES, CACHE_ASSETS];

const SHELL_URLS = [
  '/offline',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
];

const NAV_TIMEOUT_MS = 6000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('apex-sw-') && !KNOWN_CACHES.includes(k)).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (!event.data || typeof event.data !== 'object') return;
  if (event.data.type === 'PURGE') {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('apex-sw-')).map((k) => caches.delete(k)))),
    );
  }
  if (event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag !== 'apex-outbox-flush') return;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        clients.forEach((c) => c.postMessage({ type: 'OUTBOX_SYNC_REQUEST' }));
        // SW tanpa klien hidup: item aman di IDB, flush saat buka berikutnya.
      }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, CACHE_ASSETS));
    return;
  }

  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(staleWhileRevalidate(request, CACHE_ASSETS));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (request.destination === 'style' || request.destination === 'script' || request.destination === 'font') {
    event.respondWith(staleWhileRevalidate(request, CACHE_ASSETS));
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch: false });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone()).catch(() => undefined);
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const revalidate = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone()).catch(() => undefined);
      return res;
    })
    .catch(() => null);
  return hit || (await revalidate) || new Response('Offline', { status: 503 });
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_PAGES);
  try {
    const res = await fetchWithTimeout(request, NAV_TIMEOUT_MS);
    if (res.ok && !hasNoStore(res)) {
      if (!/^\/(login|api)\b/.test(new URL(request.url).pathname)) {
        cache.put(request, res.clone()).catch(() => undefined);
      }
    }
    return res;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    let offline = await cache.match('/offline');
    if (!offline) {
      offline = await (await caches.open(CACHE_SHELL)).match('/offline');
    }
    return offline || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

function hasNoStore(response) {
  const cc = response.headers.get('Cache-Control') || '';
  return /no-store|private/i.test(cc);
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('nav-timeout')), ms);
    fetch(request).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}


self.addEventListener('push', (event) => {
  let data;
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'APEX Alert' }; }
  const title = data.title ?? 'APEX Alert';
  const options = {
    body: data.body ?? '',
    icon: data.icon ?? '/icons/icon-192.png',
    badge: data.badge ?? '/icons/icon-192-maskable.png',
    tag: data.tag ?? 'apex-push',
    data: { url: data.url ?? '/' },
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c && typeof c.focus === 'function') {
          return c.focus().then((cc) => (cc && 'navigate' in cc ? cc.navigate(url) : clients.openWindow(url)));
        }
      }
      return clients.openWindow(url);
    }),
  );
});
