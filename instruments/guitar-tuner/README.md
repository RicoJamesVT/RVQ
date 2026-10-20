# Guitar Tuner (standalone)

A browser-based guitar tuner for standard tuning (E A D G B E). It works on
desktop and mobile, in portrait and landscape, with no build step, no server
and no dependencies.

## Run it

**Desktop – quickest:** unzip and double-click `index.html`, click **Start tuning**
and allow the microphone.
(Chrome, Edge, Firefox and Safari all allow the microphone on a local file; some
browsers ask for permission every time you open it.)

**Desktop or phone – recommended:** serve the folder and open it in a browser.
Microphones on phones only work on `https://` pages (or `localhost`), so for a
phone either:

* upload the folder to any static HTTPS host (GitHub Pages, Netlify, Cloudflare
  Pages, your own site) and open the URL, or
* run `python3 -m http.server 8000` on your computer for desktop testing at
  `http://localhost:8000`.

Served over HTTPS it can also be installed ("Add to Home Screen" / "Install app")
and then works offline.

## Using it

Tap **Start tuning**, pluck one string at a time and let it ring.
The big dial points at the pitch it hears. The indicator shows whether to tune
**up** (arrow up), **down** (arrow down) or that the string is **in tune** (green
tick, within roughly 10 cents). The row of six circles highlights which string
the tuner thinks you are playing.

## What changed from the original

Original project: https://github.com/GoogleChrome/guitar-tuner (Apache 2.0).

* Polymer 1, Babel, Gulp/Sass and Google App Engine replaced by one plain
  `index.html` (HTML, CSS and JS inline).
* Responsive layout: stacked in portrait, side-by-side in landscape, with the
  dial resizing to fit any screen and safe-area padding for notches.
* A **Start** button (required by iOS/Android for audio) plus clear microphone
  error messages.
* Microphone processing (echo cancellation, noise suppression, auto gain) is
  switched off for a cleaner pitch signal.
* Fixed: nearest-string selection compared a signed value to absolute values; one
  B string frequency typo (246.932 vs 246.942 Hz); correlation window could read
  past the buffer on high sample-rate devices.
* Screen stays awake while tuning (where supported).
* Fonts bundled locally; service worker and manifest are optional extras.

## Files

```
index.html     the whole app
manifest.json  install-to-home-screen metadata (needs http/https)
sw.js          offline cache (needs http/https)
fonts/         Roboto (Apache 2.0)
icons/         app icons
LICENSE        Apache License 2.0
```
