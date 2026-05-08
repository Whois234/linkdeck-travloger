// Travloger CRM — Service Worker
// Strategy:
//   /_next/static/*  → cache-first (hashed filenames, safe to cache forever)
//   images/fonts     → cache-first, 7-day TTL
//   /api/*           → network-only (bypass SW entirely)
//   navigation       → network-first, offline fallback

const STATIC_CACHE  = 'tl-static-v2';
const DYNAMIC_CACHE = 'tl-dynamic-v2';
const OFFLINE_URL   = '/offline.html';

const STATIC_ORIGINS = [
  '/_next/static/',
];

const STATIC_EXTENSIONS = /\.(woff2?|ttf|otf|ico|png|jpg|jpeg|svg|webp|avif)$/;

// ─── Install: pre-cache offline fallback ─────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: purge old caches ───────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Always bypass API routes — CRM data must always be fresh
  if (url.pathname.startsWith('/api/')) return;

  // 2. Non-GET requests bypass SW
  if (request.method !== 'GET') return;

  // 3. Cache-first for Next.js static chunks (content-addressed, never change)
  if (STATIC_ORIGINS.some(p => url.pathname.startsWith(p))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 4. Cache-first for static assets (images, fonts, icons)
  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE, 7 * 24 * 60 * 60));
    return;
  }

  // 5. Network-first for HTML navigation — show offline page if both fail
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }
});

// ─── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName, maxAgeSeconds) {
  const cache    = await caches.open(cacheName);
  const cached   = await cache.match(request);

  if (cached) {
    // Optionally revalidate stale entries in the background
    if (maxAgeSeconds) {
      const dateHeader = cached.headers.get('date');
      if (dateHeader) {
        const age = (Date.now() - new Date(dateHeader).getTime()) / 1000;
        if (age > maxAgeSeconds) {
          fetch(request).then(res => { if (res.ok) cache.put(request, res.clone()); }).catch(() => {});
        }
      }
    }
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Network error', { status: 408 });
  }
}

async function networkFirstWithFallback(request) {
  try {
    const response = await fetch(request);
    // Cache successful navigation responses for offline use
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try the cache, then fall back to the offline page
    const cached = await caches.match(request);
    if (cached) return cached;
    const offlinePage = await caches.match(OFFLINE_URL);
    return offlinePage || new Response('Offline', { status: 503 });
  }
}
// cache-bust 1778262704
