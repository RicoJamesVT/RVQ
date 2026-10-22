# Gamepad support (RVQ release-party build)

**How it works**
- `lib/gamepad-bridge.js` is loaded by every mini-game / instrument page (and injected into the inlined srcdoc apps by `game.js`). It does nothing until a controller is touched.
- **Key mapping**: buttons/sticks become real keyboard events per game (profiles at the top of the file). **Virtual cursor**: a stick drives an on-screen pointer that sends real pointer/mouse events (click, hold-to-drag, sliders, scrolling) so mouse-only pages work too.
- **SELECT/BACK always exits** a mini-game back to the world (handled in `game.js`).
- `game.js` also: appends `gamepad` to every iframe `allow` list (needed by Chrome for cross-origin / file:// iframes), reads the first connected pad (not just slot 0), stops double-firing overworld input while a mini-game is open, and adds RT = trick, right-stick up = photo mode, down = graffiti, left = mute.
- `sw.js`: cache bumped to `rvq-v6`, bridge precached.

**Universal controls (any mini-game without its own profile)**
Left stick = pointer · A / RT = click, hold to drag · D-pad = nudge hovered slider/dropdown · Right stick = scroll · START = press the main on-screen button · SELECT = exit.

**Per-game profiles** (stick plays, right stick = pointer, unless noted)
Claw Machine, Dig Dash, Digger, Dust Racing, Gator Grooves, Gator Jam Slam, Humble Treasures, QSD Balance, Sunny Side Diner, Swamp Cave Summer, Syrup Roads, Vinyl Snake, VT Dirt, Truth Knocks, Penalty Kings: left stick/D-pad = arrows, face buttons = the game's action keys.
Hyper Swim (alternate X/B), Linus Tug of War (mash any button), Home Run Derby, Precision Points, Scoop Beats: left stick = pointer, buttons = game keys.
Instruments with pads on shoulders/triggers/D-pad: Frequency Altar, Pocket Sampler, Rico1200, Bayou Break Station, Santos Drum Kit, Skank Riot, Rico Keys (octave), Rico DAW, Filter Lab.
Games that already read the pad themselves (Dig On, KANGAIDEN, Johnny Slides, J2S Pro Skater): game keeps left stick/buttons; right stick + RT = menu pointer.

**Known limits**
- OS dialogs (Load Audio, file import, microphone permission) can't be driven by a pad; text typing isn't possible.
- Native dropdowns can't open from a pad, so A / D-pad cycle through the options instead.
- Pointer drags are sent as mouse events; a page that listens only to touch events needs its keyboard profile.
- Browsers may not treat a pad press as a "user gesture", so audio can stay muted until one real click/key per launch. For party machines start Chrome/Edge with `--autoplay-policy=no-user-gesture-required` (kiosk: `--kiosk`).
- Use Xbox-style / "standard mapping" controllers; serve over http(s) or localhost rather than file:// if possible.
