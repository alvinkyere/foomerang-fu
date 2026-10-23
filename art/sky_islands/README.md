# The sky islands (the HQ video, 9:03–9:47)

The owner's second map (2026-10-22): the map at 9:06 in `foomerang-fu physics hq.mp4`, built exactly as the video shows it.
Falling off an island kills; the map rotates with the plaza. Everything is our own art and models, measured from the video;
no video pixels are shipped (the measuring images live in `output/`, git-ignored).

## Slice 1: the camera and the plan

- `register.py`: all 1,305 frames of the round (9:03.6–9:47.1) registered to its opening view (9:04.0) by ground
  homographies (ORB + RANSAC, 1,388+ inliers each); `output/median.png` is their median (the ground without the players).
- `calibrate.py`: the game has one camera rig, the plaza's (pitch 56.17°, focal 3866 px). The cliffs' vertical edges meet
  2,416 px below the frame's middle: that rig at 0.932×; the characters' size agrees; and seen from above through it the
  islands come out square-cornered and the bridges straight-sided. `camera.json`; `output/plan.png` (the map from above).

## Slice 2: the islands, cliffs, stone blocks, bridges and mist

- `layout.py` → `layout.json` (plan units, the island tops are the ground, z 0): six islands (their grass from above,
  squared to each island's own axis; the top-right one turned 30°), three bridges (two of planks, one of logs turned
  −17.5°), and the stone blocks (their light tops segmented in the opening frame and cast back into the plan at 2.5 units:
  the block on the centre island's north-east corner shows 40 px of front face above the grass, a character's height).
- `tops.py` → `blender/tops.png`: the grass as flat tones (the close-up at 9:41.64: `#ddf6a8` 73%, soft green patches
  `#c1e7a3` 13%, light yellow patches `#f2f8af` 11%), where they lie read from the plan by local brightness, in those shares.
- `blender/build.py` → `sky.glb` (and a render through the game's camera): everything flat and unlit as the video. The
  cliffs below an edge go lavender `#aab5d3`, darken to `#93a5b7` ~3 units down, then lighten into the mist (`#e5f3de`) by
  ~14 (a column under the centre island's south edge); the blocks the same with lighter tops (`#afbce6`); the bridges
  purple-brown wood (`#936f90`) with tan ropes. The render and the video's median line up edge for edge.

Run order (from the repository root): `register.py`, `calibrate.py`, `layout.py`, `tops.py`, then
`Blender -b --python art/sky_islands/blender/build.py -- <out_dir> [render]`; `npx prettier --write art/sky_islands` after.

## Slice 3: the objects

- `objects.py` → `objects.json`: every object's place, size and palette. Feet read in the opening frame and cast onto the
  ground; heights solved from where the camera shows each top (a solid's far edge, a canopy's far side); small solids
  (pots, crates, the aloe) take their close-ups' proportions. Palettes are k-means over each object in its sharpest
  close-up (9:41.6, 9:15.5, 9:18.3, 9:43.2).
- `blender/objects.py`, built by `build.py`, flat-shaded in light / mid / dark tones by facing (the light from the upper
  left, as the video's shadows fall to the lower right): the gong (navy frame, olive-gold beehive bell on cords), five red
  maples (slate trunks, tiered umbrella caps with ragged fringes, fallen leaves), four hex plants (mint plates on stems,
  yellow buds), ten pots, two crates, the potted aloe, six bamboo stalks, eleven grass tufts, and the blue and gold spiral
  tiles on the tall blocks at the north corners (with those blocks, beyond the opening frame).
- Not yet as the video: the maples' leafy texture on their caps; the bell's vertical stripes; the ferns on some blocks'
  sides.

## Slice 5: in the rotation

- The product rotation is the plaza and the gong islands, shuffled a bag at a time (`PRODUCT_POOL`); `?arena=` still pins
  one map. `package.py` writes `apps/console/public/maps/gong_islands/`: the model, the plaza's camera rig with the islands'
  own plan origin, the plaza's characters (shared, not copied: `assetsFrom`) and a flat mist floor.
- The way round: the planks and logs run onto stone piers (the opening frame), and the north bar's lobe meets the tilted
  island behind a block; those four blocks are walked over, not walls (`arena.py`, `PIERS`). The log bridge reaches the east
  island's grass. The south island stands alone in the mist, as in the video: nobody walks to it or from it.
- CPUs: a CPU that cannot walk to its opponent goes to the nearest place it can walk to with them in throwing range and in
  sight; a heading over an edge turns along it (or stops), with a margin, and checked every few units (a bridge's corner).
- Not yet as the video: CPUs still fall now and then (a shove off an edge), fewer than one a round.
