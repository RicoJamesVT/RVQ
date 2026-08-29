// Bump this string every time you deploy new levels/features/assets.
// Bumping it is what makes the service worker fetch fresh files and
// evict the old cache — that's the whole "auto update" mechanism.
const CACHE_VERSION = 'rvq-v1';

const APP_SHELL = [
  './',
  './index.html',
  './game.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  // Take over immediately instead of waiting for old tabs to close.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isAppShell = APP_SHELL.some((path) => req.url.endsWith(path.replace('./', '')));

  if (isAppShell) {
    // Network-first for the shell: players get new code/levels right away
    // when online, and still get something if they're offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
  } else {
    // Cache-first for assets (images/audio/video): they rarely change and
    // this keeps the game fast + fully playable offline. New asset files
    // (e.g. a new level's images) are fetched from network the first time
    // and cached automatically.
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          return res;
        });
      })
    );
  }
});
