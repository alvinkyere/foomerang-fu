# Bridge islands: handoff (2026-10-31)

The map of `foomerang-fu physics hq.mp4` at **1:12-1:15** (two lime islands in the water joined by a purple brick bridge between stone walls; a navy gong gate, hex bushes,
clay pots, orange and red trees, bamboo, lily pads, three levers). Reference frame: `art/bridge_islands/output/reference.png` (git-ignored; captured from Chrome at 75.5 s with
`$TMPDIR/mb/shots.mjs`, see lily's handoff). Play it at **`?arena=bridge`** (not in the rotation). Pipeline = the lily island's (docs/LILY_ISLAND_HANDOFF.md has the method, the
compare tools and the lessons): `layout.py -> stones.py -> ground.py -> arena.py`, `Blender -b --python art/bridge_islands/blender/build.py -- <tmp>`, `package.py <tmp>/island.glb`,
then prettier on the json; `hqcompare.py`, `fit_stones.py`, `fit_trees.py`, `fit_shafts.py`, `measure.py` are copies of lily's (names changed, NOT yet adapted/run).

## Status: FIRST PASS ONLY (everything below is rough)
- Done: land outline (grass + glow + kerb + bridge masks -> polygons, not straightened), the bridge deck + seams, 15 stone blocks (hand outlines from the frame in `stones.py HAND`,
  all one colour, heights from the generic policy), 4 trees (per-tree colours), 3 hex bushes, 9 pots, 2 lanterns, the gong gate, crates, bamboo, 6 lily pads, 3 levers (visual only: what
  they do in the HQ is not known: ask the owner / watch the HQ), the water as the lily island's.
- Not done / wrong: stone heights, shapes and colours (per block fits: run `fit_stones.py` once its mask/paths are adapted); the bridge's brick/plank texture (a flat deck with lines); the
  bridge walls are solid 'slab' blocks, the bridge is ground; trees (flat canopies, no trunk shape fit); the light shafts (top right of the HQ frame; none yet); the islets' outlines
  are merged/rough; the big stone wall along the top right; the red bunting along the back; arena.py has no slider/levers logic; CPUs untested; the model is 3.6 MB (bushes are many small
  hexagons: merge them).
- The camera: manifest `fixedFrame`/`followFrame` copied from lily (zoom ~0.93 x 0.965); `?frame=hq` pin and `hqFrame` untested here.
