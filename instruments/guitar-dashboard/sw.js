// Offline cache for the standalone Guitar Dashboard (used when served over http/https).
// Bump CACHE_VERSION when files change so installed copies update.
const CACHE_VERSION = "gtr-dashboard-v1";
const FILES = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./favicon.ico",
    "./icons/icon-32.png",
    "./icons/icon-180.png",
    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(FILES)));
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

// Cache first, fall back to network; navigation requests always fall back to the cached app shell.
self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") {
        return;
    }
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then(
            (cached) =>
                cached ||
                fetch(event.request).catch(() =>
                    event.request.mode === "navigate" ? caches.match("./index.html") : Response.error(),
                ),
        ),
    );
});
