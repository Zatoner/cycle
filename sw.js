/* Offline support for the Belle-Ile plan.
 *
 * The page degrades well on its own — the maps fall back to inline route outlines,
 * the weather falls back to baked-in normals, and the GPX is embedded — but none of
 * that helps if the HTML never arrives. This caches the page, Leaflet and the map
 * tiles you have already looked at, so the plan opens with no signal at all.
 *
 * Network-first for the page and libraries, so a new deploy still lands the moment
 * there is a connection; cache is only the fallback.
 */
const CORE = 'belle-ile-v1';
const TILES = 'belle-ile-tiles-v1';
const KEEP = [CORE, TILES];

const PRECACHE = [
  './',
  './index.html',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    // one flaky CDN response must not stop the worker installing
    await Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache the forecast: a stale one is worse than the baked-in normals,
  // and the page already falls back cleanly when this request fails.
  if (url.hostname.endsWith('open-meteo.com')) return;

  // Map tiles are immutable — serve from cache, fetch and keep on first sight.
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Page and libraries: network wins when online, cache rescues when not.
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(CORE)).put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const index = await caches.match('./index.html');
        if (index) return index;
      }
      throw err;
    }
  })());
});
