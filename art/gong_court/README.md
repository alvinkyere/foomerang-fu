# The gong court (`gong_court`, `?arena=court`)

The map of `foomerang-fu physics hq.mp4` at 0:35 (35.0 s, the round's READY frame: its widest view). A grass court closed by low
lavender walls, a raised platform at each corner (a maple on the north-west one, the gong on the north-east one, potted aloes on the
southern two, a low step and an octagon in the south-west), a bamboo planter, a fallen block and an L of blocks on the grass; maples,
bamboo, pots and boulders round it. The round's camera follows the players, so `mosaic.py` lays 200 frames of the round (33.3–66.6 s)
onto the READY frame and takes each pixel's median (players, trails and READY gone). The mosaic and the frames are local only
(`output/`, git-ignored) and used only for measuring and comparing: every shape and colour in the game is our own geometry.

**Run:** `art/gong_court/run.sh [package]` (from the repository root; `mosaic.py` once first, ~10 min; `videoshot.mjs 35.0` for the
frame as Chrome shows it).

| Step                         | What it measures or makes                                                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `measure.py`                 | the camera: the plaza's rig at 1.34x its zoom (the characters' size: the banana's yellow 33 x 42 px here, 25 x 29 at 9:05.7)                                                                                                                   |
| `mosaic.py`                  | the round's median mosaic (SIFT homographies onto the READY frame)                                                                                                                                                                             |
| `fit_stones.py`              | every stone body as a prism: tops traced (or read by hand: `stones_manual.json`), heights read on the faces (`column.py`) or fitted by silhouette, walls as beams 1.34 tall, mints the tops inset 0.55, outlines grown 0.08 for the soft edges |
| `ground.py`                  | the grass: a smooth measured base and crisp traced shapes (sun patches, shadows, the stone's contact shadows)                                                                                                                                  |
| `stone_colours.py`           | the stone's top, its faces darkening in 8 steps to the foot, and by facing (the light from the east)                                                                                                                                           |
| `tops.py`                    | what lies on each platform's mint (the maple's, gong's and aloes' shadows, fallen leaves)                                                                                                                                                      |
| `cards.py`                   | the maples, bamboo, pots, aloes, gong and tufts as traced cards: upright planes through each foot (on its platform)                                                                                                                            |
| `arena.py`                   | the rules: `games/foomerang-fu/src/rules/gongCourtArena.ts` (every stone body solid, pots; no dashed border: the walls close the court)                                                                                                        |
| `blender/build.py`           | the court in 3D (gong_court.glb; `render`, `wide`: the mosaic's view, `nocards`)                                                                                                                                                               |
| `package.py`                 | `apps/console/public/maps/gong_court/`                                                                                                                                                                                                         |
| `compare.py`, `breakdown.py` | the render (or a game shot) against the frame and the mosaic; where the difference lies, body by body                                                                                                                                          |

**Animation:** none. Measured over the round (frames registered on the READY frame, `stab.py`): the bamboo, the maples and the gong hold
still, even when players pass; their apparent shifts are the moving camera's parallax. Manifest `scenery: {fade: false, sway: false}`.

**Last measured (2026-11-13, render vs the round's mosaic inside the READY frame, the names masked):** mean Lab difference 4.72 (median
1.27), 10.1% of pixels over 10. At the first render: 10.7. In the game (`?arena=court&frame=hq`, two CPUs): 5.3; game vs render 0.8 (the
players).

**Known gaps:** the stone's soft rounded edges are drawn sharp (a bevel band scored worse); the cards are flat traced shapes (the HQ's
bamboo, pots and gong are round 3D and show parallax as its camera moves; ours, on upright cards, do not); the platforms' outlines
are partly hand-read (± a few px); not in the rotation (the owner's call).
