# Foomerang Fu power effects: a reusable vector animation library

Our own animations of the power effects, frame for frame as the owner's reference video (`foomerang - fu physics.mp4`) moves
them, traced into flat-colour vector shapes. Each effect is a folder:

- `frame_000.svg …` — one SVG per frame, at the video's 30 fps. Resolution-free: open, edit or render them at any size, in any
  engine or tool (Inkscape, Illustrator, a browser, a game engine's SVG importer, or rasterise them to a sprite sheet).
- `animation.json` — fps, frame count, the frame files, `size` (the SVG's viewBox, video pixels), `widths` (how many character
  widths one frame spans: scale it to your characters), `ground` (lies flat on the ground) or not (faces the camera),
  `tintable` (white parts take the power's colour), `loop`, the palette, and `ringRadius` for the blast ring.

| Effect       | What it is                                                      |
| ------------ | --------------------------------------------------------------- |
| `pickup`     | taking a power Book: flash, streaks, confetti (tint per power)  |
| `blast`      | the Explosive's fireball, puffs and smoke                       |
| `blast_ring` | the Explosive's ring on the ground (radial gradients, perfect)  |
| `shield_pop` | the Shield bubble breaking                                      |
| `split`      | the Multi boomerang's split flash                               |
| `iceblock`   | the ice block round a frozen player (grows in over 0.15 s)      |
| `thaw`       | the ice breaking                                                |
| `burning`    | the flames on a burning player (loop)                           |
| `burnt`      | the last flames and smoke off a player dead of fire             |
| `fire_patch` | a patch of fire on the ground, all its life (stamp along paths) |

Made by `art/physics_reference/vfx_extract.py` (cut out of the video) → `vfx_vectorize.py` (traced: the effect's own palette,
sub-pixel smooth outlines, opacity per shape) or `vfx_ring.py` (the ring's radial profile). The game plays atlases rendered from
them (`apps/console/public/vfx/`).
