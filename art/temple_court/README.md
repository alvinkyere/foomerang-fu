# The temple court (`temple_court`, `?arena=temple`)

The map of `ff physics hq 2.mp4` at 2:01 (121.5 s, the READY frame: the round's widest view). The round's camera follows the
players (up to 1.48x in), so no single frame shows the whole court: `mosaic.py` lays 159 frames of the round (119.8–146.2 s) onto
the READY frame and takes each pixel's median (players, trails and READY gone). The mosaic and the frame are local only
(`output/`, git-ignored) and used only for measuring and comparing: every shape and colour in the game is our own geometry,
measured from them.

**Run order** (from the repository root; Python = `art/audio/output/venv/bin/python`): `run.sh [package]`, after the slow steps
(`mosaic.py` ~10 min, `fit_planters.py` + `fit_big_planters.py`, `hexfields.py --fit` ~4 min; their json is committed).

| Step                  | What it measures or makes                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `measure.py`          | the camera: the plaza's rig at its reference zoom (the characters measure as in the meadow's READY frame)        |
| `mosaic.py`           | the round's median mosaic (SIFT homographies onto the READY frame)                                               |
| `fit_planters.py`     | the four small planters: octagonal prisms fitted to the mosaic's lavender by silhouette (IoU 0.90–0.92)          |
| `fit_big_planters.py` | the three big planters under the trees: fitted to their silhouettes' boxes read off the frame                    |
| `layout.py`           | the walls' wings, towers, gates, slab and statues, banners, lanterns, trees' feet, outskirts' trees; the border  |
| `fit_crowns.py`       | the three trees' crowns: ellipsoids fitted to the frame's canopy green (IoU 0.69–0.81)                           |
| `floor.py`            | the paving and its painted border (three grey lines, a kerb), read across the mosaic with `profile.py`           |
| `hexfields.py`        | the two orange hex fields: the lattice (s 0.603, turn −1.16°) and 176 pads, their three oranges, their buds      |
| `shadow_mass.py`      | the still shadows: warm and cool on the paving, olive on the ground (the mosaic laid flat, traced)               |
| `ground_field.py`     | the yellow ground as a smooth measured field (lemon in the middle, apricot at the edges)                         |
| `joints.py`           | the flagstones' faint joints                                                                                     |
| `arena.py`            | the rules data: `games/foomerang-fu/src/rules/templeCourtArena.ts` (39 walls, border, spawns, Book spots)        |
| `blender/build.py`    | the court in 3D (court.glb; with `render`, render.png through the HQ's camera; `plants` adds the fields at rest) |
| `package.py`          | `apps/console/public/maps/temple_court/` (model, manifest with `plants`)                                         |
| `compare.py`          | the render against the frame or the mosaic: side by side, blend, mean Lab difference                             |

**Solid:** the wings (plinth and wall), towers, all seven planters, the gates' stone bases, the statues' slab, the east gate's
posts, its stone lanterns and the banners' poles. **Not solid:** the hex fields — the game's own plants (render/hexPlants.ts:
pushed aside, springing back, burning), with this map's own oranges, brown stems and their shadow falling west (the court's sun
is in the east: manifest `plants.shadow`). **Animated:** the plants; the court's trees and the outskirts' trees sway and fade
when a player is behind them (the renderer's `TREE_<k>_tree`); the banners swing from their crossbars (`BUNTING_pennant_*`).

**Last measured (2026-11-07, render vs the round's mosaic inside the READY frame, the names masked):** mean Lab difference
7.5 (median 1.9); 23% of pixels over 10. At the start: 14.0 (median 10.6).

**Known gaps:** the outskirts (beyond the border) are our own autumn trees placed where the round shows trees, not traced tree
by tree; the planters' stones are uniform blocks (the HQ's are a little chunkier and uneven); the buildings' shoji panel layout
is one pattern for every wing; the fork and knife are simple shapes (no bevels); no fallen leaves on the court's paving.
