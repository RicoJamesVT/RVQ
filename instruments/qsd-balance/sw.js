/* Offline support for FIND BALANCE W/ QSD.
   Only runs when the game is served over http(s) (browsers don't allow service workers on file://,
   but opening index.html straight from disk already works offline because everything is embedded).
   If you change any game file, bump CACHE so players pick up the new version. */
const CACHE = "qsd-balance-v3";
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "game.js",
  "boards.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache first (instant + offline), refresh in the background for next time.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const refresh = fetch(req).then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => null);
      if (hit) { e.waitUntil(refresh); return hit; }
      return refresh.then(res => res || caches.match("index.html"));
    })
  );
});
