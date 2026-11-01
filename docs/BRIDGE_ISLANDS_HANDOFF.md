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

## Update (same day, second pass)
- Borrowed models: the gong gate (`objects.gong`, turned along the gate's own axis), the hex bushes (`objects.hexplant`), the pots (`objects.pot`), bamboo and crates, all from
  `art/sky_islands/blender/objects.py` (the gong islands' own, as they are). The trees stay this pipeline's own cauliflower blobs (the HQ's here are puffy S-trunk trees like the
  lily island's; sky_islands' `maple` is the umbrella type: not borrowed). Also available there and not yet used: `aloe` (the HQ's flowerpot plant at about (1400, 350) px), `tuft`.
- Stones: `fit_stones.py` runs (indices re-sorted by y: 0 NW islet block, 3 bridge NW wall, 4 SE wall..., 9 the tall block in the water, 11 the back wall); `MANUAL` in it holds
  hand-set heights for blocks the mask cannot fit. Many fits are weak (IoU 0.2-0.6): the stones are covered by vines and the shafts tint them.
- Camera: `?frame=hq` pins `hqFrame` (u 0.0465, v 0.0137, zoom as lily); the grass overlay (hqcompare / `output/grassov.png`) shows the game's land a few px up-left of the HQ's at the SE and S ends:
  the kerb eats the grass edge there, thin it or move the outline out ~0.5 unit. Grass and water colours already match the HQ frame (#ddf195 vs #dcf296, #7aa6bb vs #7aa8bb).
- Colours are the lily island's; the HQ frame here has a stronger teal cast from the shafts (top right).

## Object-by-object (2026-10-31, owner: "every object, perfect down to the last pixel")
`art/bridge_islands/objcmp.py <shot>` lists every object of the map (box in the reference frame) and writes `output/obj_<name>.png` (HQ | game, 3x) with the share of differing
pixels. Start of the pass: 49-99% differ per object (all of them). Done so far: the bridge's walls are chains of fat rounded bricks with a taller cap (`BRICK_WALLS` = stones.json
indices 6 and 11, sorted by y; check them after any re-sort), the deck has offset brick courses (the HQ's are scalloped, with tan grass-blade streaks across: not built), the gate is
placed from the HQ's posts (still hidden under the back wall in the game: the back wall block 3 is too tall/wide there), the trees take the HQ's two colours, bush size from measure.
Back wall now a row of blocks (BRICK_WALLS has 3) and the gate shows; the HQ wall is smoother, taller and wider (one long soft slab). Next, in order: trees (trunk + lump
shapes), then each block's height/colour (`BLOCK_COLOURS` is one pair for all), the islets' outlines, pads, crates, bamboo, lanterns, the aloe pot.

## 2026-10-31 later
- `fit_trees.py` (this map's) fits the four canopies in the game's own view (treefit.json, applied by layout.py): residual < 3 px. Islets are regular hexagons (layout.py `_hex`), the two big islands are separate rectified outlines
  (the bridge is its own polygon, added to the walkable ground by ground.py), `gameZoomFit` 0.997 / `hqFrame` u 0.0726 v 0.0656 re-pinned. `hqcompare.py`'s printed "game wants fz x" is the INVERSE of what it
  should say: scale sc > 1 means the game must be zoomed IN by sc (multiply `gameZoomFit` by sc).
- State: whole frame still ~59% differing (>12 levels); grass IoU 0.47. Biggest visible gaps: the land outline (HQ west island is a clean diagonal strip, ours a rounded blob: rectify() breaks
  on this outline, hand-fit two rotated rectangles with minAreaRect instead), tree trunks absent, the east islet (a big round rock with a grass top), vines, light shafts, the back wall's softness.
- (later) LESSON: fit the CAMERA first with the land (grass closed over its props, scale+shift search: see the snippet in the log: IoU 0.50 -> 0.66 once u,v = -0.0014, 0.0166), THEN the props in the game view
  (fit_trees.py): fitting props first just hides a camera error inside the props. Now: whole frame 50% differing as shot, grass (closed) IoU 0.66, canopies within 2 px.
- (2026-10-31, owner asked for 30%) Whole frame 50.4% -> 47.0% differing (>12 levels). Tools added: `fit_stones_game.py` (nudges each stone block in the game's view),
  `grade.py` + waterShader `grade` (a 9x6 screen-space RGB grid fitted to the HQ's water, damped 0.5, converges to ~1 level in 5 shots), `fit_props.py` (UNRELIABLE: it pushes props to the
  search limits, props.json removed). Tree colours matched (red #d97b69 vs HQ #d67b6a), canopy IoU 0.52 / 0.37. Where the rest is: grass 25% of bad (its edge band: HQ's is a 6 px darker-green
  glow, now narrowed), water 32% (foam outlines + shafts: the HQ's shafts here are a different pattern from lily's, `fit_shafts.py` fit gave no gain and is not wired), stones 18%, trees 9%,
  other 17% (vines, bamboo, pots). 30% is NOT reached; each remaining item is worth ~1% and needs per-object modelling.
- (2026-11-01, owner: the south-west island "kerb rectangular, rounded edges, fix it once and for all") The drawn grass came from the TRACED mask (a blob with prop holes) while the kerb came from
  the straightened outline: two shapes. `ground.py` now rasterises `layout.json banks` + the bridge as THE ground (grass, lime/shade/pale shapes, walkable ground and kerb are one shape) and
  build.py `_soft_rect` draws any four-cornered bank as a rounded rectangle (corner 1.9, long enough to be an island). Whole frame 46.5% differing.
