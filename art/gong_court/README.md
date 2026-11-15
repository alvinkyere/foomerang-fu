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
| `measure.py`                 | the camera: the plaza's rig at zoom.json K x its zoom (1.055: the same characters measured in this frame and in our game at this view; first read as 1.34 from one banana, which made the court ~1.27x too small against the characters)       |
| `mosaic.py`                  | the round's median mosaic (SIFT homographies onto the READY frame)                                                                                                                                                                             |
| `fit_stones.py`              | every stone body as a prism: tops traced (or read by hand: `stones_manual.json`), heights read on the faces (`column.py`) or fitted by silhouette, walls as beams 1.34 tall, mints the tops inset 0.55, outlines grown 0.08 for the soft edges |
| `ground.py`                  | the grass: a smooth measured base and crisp traced shapes (sun patches, shadows, the stone's contact shadows)                                                                                                                                  |
| `stone_colours.py`           | the stone's top, its faces darkening in 8 steps to the foot, and by facing (the light from the east)                                                                                                                                           |
| `tops.py`                    | what lies on each platform's mint (the maple's, gong's and aloes' shadows, fallen leaves)                                                                                                                                                      |
| `props.py`                   | the bamboo stalks (foot, cut top, width, leaf sprays), the gong (posts, beam, disc), the pots (foot, radius, height, kind, lean) and the aloes (pot rim, leaves on screen) read off the still view, for 3D models                              |
| `fit_bamboo.py`              | each stalk's foot, top and width fitted by a 2D painter over a render without bamboo (held within 6 px and a quarter of the width; the south-east clump's lean towards the camera fits badly, kept as read)                                    |
| `cards.py`                   | the maples and tufts as traced cards: upright planes through each foot (on its platform); the bamboo, gong, pots and aloes are 3D (props.py) and kept out of every card                                                                        |
| `arena.py`                   | the rules: `games/foomerang-fu/src/rules/gongCourtArena.ts` (every stone body solid, pots; no dashed border: the walls close the court)                                                                                                        |
| `blender/build.py`           | the court in 3D (gong_court.glb; `render`, `wide`: the mosaic's view, `nocards`, `nobamboo`, `nogong`, `nopots`): six-sided bamboo stalks, the gong, turned terracotta pots                                                                    |
| `package.py`                 | `apps/console/public/maps/gong_court/`                                                                                                                                                                                                         |
| `compare.py`, `breakdown.py` | the render (or a game shot) against the frame and the mosaic; where the difference lies, body by body                                                                                                                                          |

**Animation:** none. Measured over the round (frames registered on the READY frame, `stab.py`): the bamboo, the maples and the gong hold
still, even when players pass; their apparent shifts are the moving camera's parallax. Manifest `scenery: {fade: false, sway: false}`.

**Last measured (2026-11-15, render vs the still view: still.py):** mean Lab difference 4.12 (median 1.07), 9.3% of pixels over 10,
at the true scale (zoom.json K 1.055). The bamboo, gong, pots and aloes are 3D; the maples, bush and tufts traced cards, filled whole
(an outline that crosses or touches itself is drawn as row strips of its pixels: Blender's polygon fill covered only part of it); the
ground's and the platforms' traced tones run edge to edge (no sliver of the base between neighbours); the stone darkens with depth.

**Tried and rejected (by the score against the still view):** (the bamboo in 3D first scored 1.5-2.4x worse than its cards and was
rejected; on 2026-11-14 it was built anyway, six-sided as the HQ's, for clarity over the score); a bevel band on the stone's edges; stone-free top decals; rim widths 0.4 and 0.7.

**Known gaps:** the stone's soft rounded edges are drawn sharp (a bevel band scored worse); the south-west octagon's outline
is read by eye and refit by the painter (a re-read scored the same and warped its east side: kept as it was); the maples are still flat traced cards (now clean:
no cracks, no halo); the bamboo's leaf sprays are read by eye (their count and angles approximate); the south-east clump's stalks lean towards the
camera, which the sideways-only stalk model cannot show; the platforms' outlines
are partly hand-read (± a few px); not in the rotation (the owner's call).
