// Bump this string every time you deploy new levels/features/assets.
// Bumping it is what makes the service worker fetch fresh files and
// evict the old cache — that's the whole "auto update" mechanism.
const CACHE_VERSION = 'rvq-v4';

const APP_SHELL = [
  './',
  './index.html',
  './game.js',
  './manifest.json',
  // Three.js is lazy-loaded (via a classic <script> tag, see loadThreeJS()
  // in game.js) the first time a player picks any 3D mini-game, rather than
  // up front, so it doesn't add to the base game's load time. But that also
  // means it was never in APP_SHELL, so it was never precached — offline,
  // that first-time fetch simply failed and every 3D mini-game dropped
  // straight to its "COULDN'T START 3D MODE" fallback screen. Precaching it
  // here alongside the app shell guarantees it's already on disk before the
  // player ever needs it, connection or not.
  './lib/three.min.js',
  // These instrument pages are self-contained apps loaded into an <iframe>
  // on demand (see openChessApp()/openInstrument()/openBeatBotApp()/
  // openOrganApp()/openMiniGolfApp() in game.js). They'd otherwise only be
  // cache-first, meaning each wouldn't be saved for offline play until the
  // player opened it once while online. Precaching them here guarantees
  // they all work offline from the very first install.
  //
  // Each page's own stylesheet/script/support files need to be listed here
  // too, not just its index.html -- a couple of these instruments ship as
  // index.html + style.css + game.js (+ extra data files), and only the
  // index.html was previously listed. Offline, that meant the iframe itself
  // would load but come up unstyled/broken because its CSS and JS 404'd.
  './instruments/wu-chess/index.html',
  './instruments/mini-golf/index.html',
  './instruments/mini-golf/game.js',
  './instruments/rico-beat-bot/index.html',
  './instruments/rico-beat-bot/rico-logo.png',
  './instruments/church-street-organ/index.html',
  './instruments/rico-keys/index.html',
  './instruments/rico-keys/style.css',
  './instruments/rico-keys/game.js',
  './instruments/rico-eq/index.html',
  './instruments/rico-eq/style.css',
  './instruments/rico-eq/game.js',
  './instruments/rico-cuts/index.html',
  './instruments/rico-cuts/style.css',
  './instruments/rico-cuts/game.js',
  './instruments/rico-pocket-sampler/index.html',
  './instruments/rico-pocket-sampler/style.css',
  './instruments/rico-pocket-sampler/game.js',
  './instruments/rico-pocket-sampler/default-kit.js',
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
