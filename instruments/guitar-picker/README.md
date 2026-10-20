# GuitarPicker — Standalone

A single-file, offline build of GuitarPicker. No server, no install, no internet needed.
Works on desktop, tablet and phone, in portrait and landscape.

## Desktop (Windows / macOS / Linux)
Unzip, then **double-click `index.html`**. That's it (Chrome, Edge, Firefox, Safari).
Allow the microphone when asked. Tip: bookmark it, or in Chrome/Edge use
*Menu → Cast, save and share → Install page as app* once you've opened it from a web address (see below).

## Phone / tablet
Phones can't reliably open a local file *and* allow the microphone from it, so for mobile put this
folder on any **HTTPS** static host once (GitHub Pages, Netlify Drop, Cloudflare Pages, …), open the
address on your device, then:

- **Android (Chrome):** menu → *Install app* / *Add to Home screen*
- **iPhone / iPad (Safari):** Share → *Add to Home Screen*

After the first visit it runs fully offline, full screen, and rotates freely between portrait and
landscape (landscape gives the note highway the most room). Your songs, progress and coins are stored
on the device (localStorage) — use the in-app export if you want a backup.

Note: without a microphone the app still opens and plays; only note grading / tuner / listening need it.
Browsers only allow the mic on `https://`, `localhost`, or `file://` (desktop) — a plain `http://192.168…`
address on a phone will not work.

## What's in this folder
| Path | What it is |
|---|---|
| `index.html` | The whole app (all code, styles and logo inlined) |
| `manifest.json`, `sw.js`, `pwa.js`, `icons/` | Optional: installable-app + offline support when hosted |
| `source/` | The original project plus `build.mjs`. Edit `src/` / `styles/`, run `node build.mjs`, and a fresh `dist/` appears |

Run the tests in `source/` with `npm test`.
