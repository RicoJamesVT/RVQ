# Guitar Dashboard – Standalone

An interactive music theory dashboard for guitarists (scales, modes, chords on a
fretboard and circle of fifths). This copy runs **completely offline** – no
internet, server or install needed – on desktop and mobile, in portrait and
landscape.

## Run it

**Desktop:** double-click `index.html` (Chrome, Edge, Firefox, Safari).

**Phone / tablet:** copy this folder to the device and open `index.html`, or – to
get a proper installable app icon – host the folder on any static web host (HTTPS
or `localhost`) once, then:

- iPhone / iPad (Safari): Share → *Add to Home Screen*
- Android (Chrome): menu → *Install app* / *Add to Home screen*

After the first visit over http(s) the app is cached and works with no connection.

## Layouts

| Screen                                   | Layout                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Desktop, tablet, phone in **landscape**  | Circles + controls in a row, fretboard underneath (scrolls on phones)  |
| Phone / small tablet in **portrait**     | Single column: controls, circles, then a swipeable fretboard strip     |

The layout switches live when you rotate the device or resize the window.
Everything is touch friendly (tap keys, modes, chords and fretboard notes).

## What changed from the original

- Single self-contained `index.html` (JS + CSS inlined, ~60 KB) – no CDN, fonts or network calls.
- Sound is now an offline Web Audio synthesiser. The original downloaded a piano
  soundfont from the internet, which can't work offline. (Tone differs from the sampled piano.)
- Removed the `zod` and `smplr` dependencies (validation is hand written).
- Responsive portrait/landscape layouts, safe-area (notch) support, larger touch targets.
- Scale-family picker is now a ‹ name › stepper (plain SVG) instead of an HTML
  `<select>` inside SVG, which is unreliable on mobile Safari.
- Removed the YouTube embed and social links (they need the internet); credits remain in the info panel.
- Web app manifest, icons and service worker for install + offline use.
- Local-storage / clipboard access hardened for `file://` and private browsing.

## Rebuild from source

The full modified project is in `source/`.

```bash
cd source
npm install            # or: bun install   (only esbuild is needed to build)
npm run build:standalone
```

This regenerates `source/standalone/` (the same files as this folder). The
original Bun workflow (`bun run start`, `bun run check`, `bun test`) still applies.

## Licence

MIT – see `LICENSE`. Guitar Dashboard is by Mike Hadlow (https://github.com/mikehadlow/gtr-cof).
