# 🎮 Rico's Vinyl Quest (v1.0)

<div align="center">

### 🚀 [👉 CLICK HERE TO PLAY IN YOUR BROWSER NOW! 👈](https://RICOJAMESMUSIC.com)

[![Engine](https://shields.io)](#)
[![3D Graphics](https://shields.io)](#)
[![Audio](https://shields.io)](#)

</div>

A retro, rhythm-infused exploration overworld built entirely on raw web APIs. Take control of **Rico** or **Santos**, cruise through town on a skateboard, dig deep into vinyl crates, and gather audio elements to construct a custom-dynamic hip-hop beat loop.

---

## ⚡ Feature Showcase (Latest Big Updates)

This repository serves as a technical breakdown of the engine's custom architecture and gameplay loops:
*   **Three.js 3D Mini-Game Remakes:** Scored challenges feature high-performance, spotlit 3D environments acting as smooth fallback states to their 2D layout counterparts, including *3D Darts*, *3D Beat Match*, *3D Whack-a-Pigeon*, *3D Crate Digging*, and *3D Speed Sweep*.
*   **The Standalone Instrument Apps Framework:** Unlocking the main beat tape grants entry to *Rico's Beat Lab*—a sandbox linking out to independent fully-featured modular sub-applications embedded directly inside the DOM via frames (Pocket Sampler, Synthesizers, a step-sequencer Beat Bot, and a 4-Track mini-DAW).
*   **Responsive Multi-Viewport Input:** Native mobile responsiveness with calculated touch-controls layout, screen edge-safety padding buffers, and deep standard Gamepad input mapping wrappers.
*   **Deep Atmospheric Layering:** Cached linear/radial screen gradients, deterministically generated twinkling particle skyfields, and character-specific custom colored skate streaks.

---

## 🎬 Gameplay Feature Teaser

Wondering what awaits you on the street? Experience a deep, living world where music intersects with subculture:
*   **The Ultimate Hunt:** Comb through dusty bins for the ultra-rare *White Label 45* or weed out water-damaged polka records.
*   **Dynamic Soundscapes:** Watch the world change as your sampler fills up—the beat dynamically builds its layers with every rare record you find.
*   **Street-Level Flavor:** Grab a hot slice at *Junior's*, read the satirical local headlines at a curbside paper stand, or fuel your travel speed with a cup of cold brew.
*   **BTV Hip-Hop Royalty:** Cross paths with real Burlington-inspired icons like *SK1*, *Tha Truth*, *Mavstar*, *Boxguts*, and *Trav* as they prepare for the big cypher.
*   **Break the Screen:** Kick off a massive *Dance Party* right on the grass, unleashing a Solitaire-style cascade of spinning vinyl that paints the viewport.

---

## 🗺️ Overworld Map Tour

### 🏙️ Level 1: Burlington
Explore a thriving community street grid hosting iconic landmarks:
*   **Green Door Studio:** The local production hub. Stages the local *Cypher circle* and custom street-art decorations.
*   **Hey Bud:** An exotic plant greenhouse stacked with collectibles, hanging macrame foliage, and street print frames.
*   **Henry's Diner:** A retro joint hosting a 50s crooner archive, active coffee-drinking patrons, and an open chess table.
*   **Nectar's:** A classic music lounge staging *Reggae Nights*, custom neon tube banners, and a gravy fries vendor stand.
*   **Pure Pop Records:** A vinyl paradise carrying hidden white-labels, open record bins, and a rotating disco-ball.

### 🐊 Level 2: Bayou Crossing (Swamp Expansion)
An advanced overworld built using customized deterministic generation logic:
*   Navigate narrow multi-tile boardwalk trails stretching over murky water layers.
*   Encounter swamp-native dynamic ambient lifecycles: drifting *alligators*, vertical-hopping *marsh frogs*, and rhythmic boardwalk *snakes*.
*   Discover hidden local landmarks like **The Gut Hut**, **Swamp Food**, and the massive **Lake Monsters Ballpark Stadium**.

---

## 🕹️ Controls Layout

The engine translates input handling on runtime across Keyboard, Mouse/Touch UI, and standard Gamepad layers:

### Core Navigation

| Action | Keyboard / Mouse | Gamepad Mapping | Touch UI Equivalent |
| :--- | :--- | :--- | :--- |
| **Move Around** | `W` `A` `S` `D` / `Arrows` | Left Analog Stick / D-Pad | On-Screen D-Pad |
| **Interact / Advance** | `E` / `Enter` / `Space` | `A` Button | On-Screen `E` Button |
| **Back / Cancel / Shop**| `X` / `Escape` | `B` Button | On-Screen `X` Button |

### Actions & Toggles
*   `B` (Gamepad `Y`) — Toggle Skateboard mode (Boosts travel speed across exterior pavement rows).
*   `T` — Trigger **Turbo Taunt / Skate Tricks** (Spins the player sprite with custom particle sparkle paths).
*   `R` — Drop **Graffiti Tag** (Stamps dynamic hue-shifted decals down to the active overworld tile coordinates).
*   `C` / `Y` — Drink Cold Brew or Yerba Mate (Gives a clean +15% velocity multiplier to base travel steps).
*   `V` (Gamepad `LT`) — Open **The Crate Collection Book** to audit discovered record data and global progression logs.
*   `G` — Enter **Photo Mode** (Freezes frame logic and translates arrow taps to pan clean screen snapshots).
*   `M` — System-wide master volume audio mute toggle.

---

## 🛠️ Architecture & Optimization

This project is optimized for high-fidelity browser delivery with minimal runtime footprint:
*   **Audio Core:** Built on top of raw `AudioContext` pipelines. Uses web worker threads to stream steady micro-tick clocks completely independent of the main UI thread, completely bypassing audio stutters during massive overworld blitting draws.
*   **Graphics Core:** Split layer rendering combining custom 2D Canvas matrix transformations with a lazy-loading module to instantiate a globally cached `THREE.WebGLRenderer` context only when required.
*   **Performance Optimization:** Employs paint-order sprite caching, deterministic pseudo-RNG layout generators, and custom out-of-camera screen culling limits to minimize CPU garbage collection stalls.
*   **State Persistence:** Automated game-state serializations parsing directly into lightweight key-value strings inside `localStorage`, segmented into 3 active save slot files.
