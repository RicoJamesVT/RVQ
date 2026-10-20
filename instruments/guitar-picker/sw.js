// Service worker (only used when served over http/https — not on file://).
// Precaches the shell so the very first load is enough for full offline use, then serves
// network-first with cache fallback so updates are picked up whenever you're online.
// Bump CACHE when shipping a new build to drop old copies.
const CACHE = "guitarpicker-v2";
const SHELL = [
  "./", "index.html", "pwa.js", "manifest.json",
  "icons/logo.svg", "icons/icon-192.png", "icons/icon-512.png",
  "icons/icon-maskable-512.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  // addAll would fail the whole install if one entry 404s (e.g. running the unbundled
  // source tree, which has no single-file index) — add individually and ignore misses.
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request, { ignoreSearch: true })
          .then((hit) => hit || (e.request.mode === "navigate" ? caches.match("index.html") : undefined))
      )
  );
});
