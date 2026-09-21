FIND BALANCE W/ QSD  -  multi-board edition
============================================

PLAY
  Double-click index.html (works straight from disk, no internet, no server), or upload the whole
  folder to any web host. Pick a board on the start screen; the "Boards" button switches boards any time.

BOARDS
  Classic       the original QSD board (unchanged)
  QSD Bubbles   roll inside the white bubble letters - three doorways cut in the outlines link the letters
  QSD Sticker   follow the cyan track; the red outline is solid
  Rico James    background + the face and one eye are playable (door in his cheek); extra space added top/bottom
  Spray City    white is open, black is solid; doorways cut through the cans link the rooms into loops
  Neon Skull    roll through the dark; neon art is solid. Headphones and cap are playable rooms.

CONTROLS
  Keyboard      arrow keys / WASD.  Space or Esc = pause.  B = boards menu.
  Touch/mouse   drag anywhere on the play area (relative to where you first touch).
  Tilt          "Enable Tilt" on a phone/tablet. Works in portrait AND landscape (it follows the screen rotation
                and re-zeroes when you rotate). "Recalibrate" re-zeroes to however you're holding it.
                Browsers only give web pages motion sensors over HTTPS (or localhost), not from a file.

PORTRAIT vs LANDSCAPE
  * Wide boards (QSD Bubbles, Spray City) turn 90 degrees on a portrait phone so they fill the screen -
    a note in the footer says so. Rotate the phone and they snap upright. Controls follow what you see.
  * On short landscape screens the buttons move to a side panel so the board gets the full height.

OFFLINE
  * Everything (art, collision, code) is embedded, so opening index.html from disk always works offline.
  * When hosted over http(s), a service worker (sw.js) caches the game; the footer shows "Offline ready"
    once it has. You can then "Add to Home Screen" / install it. If you change any game file, bump the
    CACHE version string at the top of sw.js so players get the update.

FILES
  index.html, style.css, game.js   game shell and logic (physics unchanged from the original)
  boards.js                        all board artwork + collision masks (generated - see tools/)
  sw.js, manifest.webmanifest, icons/   offline / install support
  tools/                           Python scripts + source art that regenerate boards.js

ADDING OR TWEAKING A BOARD  (tools/)
  Requires Python 3 with numpy, opencv-python, scipy, pillow.
  1. Put new art in tools/source_art/.
  2. In tools/build.py add a board_xxx() function (see the others): crop -> decide what counts as floor
     (a colour rule) -> optionally cut "gates" through walls with auto_gate() -> pick a start point.
  3. Add its name/theme/ball colours to BOARDS_META in tools/make_boards.py and to the list at the bottom.
  4. python3 tools/make_boards.py   (rewrites boards.js)
  Rule of thumb: the marble is 28px across on a 1024px-wide board, so corridors need to be ~36px+ wide.
