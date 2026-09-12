# Shadow of the Shogun

A playable Shinobi-inspired sidescroller using the supplied samurai sprite sheet, zombie enemy sprite, and a rarer elite enemy.

## Enemy difficulty update
- Zombies remain the common enemy.
- The new elite enemy uses the supplied creature sprite and appears less often (about 14% of spawns early, rising to about 22% later).
- Elite enemies start at 5 HP and gain additional HP as play time increases.
- Elite enemies move faster, attack more aggressively, and deal 24 damage on contact.
- Spawn intervals, enemy speed, and attack pressure increase gradually over time.
- All enemy types use the same universal melee/shuriken damage and collision path, so both can always be hit reliably.
- Enemy deaths still trigger the existing explosion effect and disappear immediately.

## Controls
Desktop: A/D or Left/Right to move, Space/Up to jump, J to slash, K to throw shuriken, S/Down to crouch, R to restart.
Mobile: on-screen directional, jump, slash, and shuriken buttons.

Open `shinobi_sidescroller.html` in a modern browser. The game is self-contained; no network connection is required.
