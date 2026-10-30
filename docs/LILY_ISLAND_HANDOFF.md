# Lily island: handoff (2026-10-30)

**Goal (owner):** the map of `foomerang-fu physics hq.mp4` at 10:37 must be a pixel-exact, high-quality copy of the HQ frame: same
shape, size, colour, texture, light and renderer look, with our own models (never the video's pixels). Owner's words: "until it looks
like the HQ, don't get back to me." Tested at `?arena=lily` (outside the rotation).

**Where everything is:** `art/lily_island/` (pipeline), `apps/console/public/maps/lily_island/` (packaged map),
`games/foomerang-fu/src/rules/lilyIslandArena.ts` (generated rules), `art/lily_island/output/` (git-ignored: `reference.png` is the
HQ frame at 637.0 s captured from Chrome, so it is already "as a browser shows it": colour.py is the identity for this map).

**Run order** (from the repository root; the Python is `art/audio/output/venv/bin/python`, Blender is `/Applications/Blender.app`):

    layout.py -> stones.py -> ground.py -> arena.py
    Blender -b --python art/lily_island/blender/build.py -- <tmp> [render]
    package.py <tmp>/island.glb         (then: npx prettier --write art/lily_island/*.json apps/console/public/maps/lily_island/manifest.json)

`scale.json` = `{hqZoom, scale}`: every script reads the frame at `hqZoom/scale` and plan sizes are `scale` times larger beside the
characters. **This is the one number that sets how big the land is.** `render.png` from build.py is a pixel-aligned preview under the
game's light; compare it with `output/reference.png` (blend 50/50, IoU of masks, medians of colours).

**Method (docs/AGENT_PLAYBOOK.md):** measure, build our own, compare by overlay and numbers, put it in the game and shoot the game
(Playwright, 1920x1080, `?arena=lily`), repeat. Never claim "matches" without a number or an overlay.

**Known gaps (update this list as you go):** see the end of this file, "Status log".

## Status log

### 2026-10-30 (session 1)
- **Size:** `scale.json` is now `{hqZoom 1.9, scale 2.0373}`, i.e. the frame is read at zoom 0.9314, the plaza's own (0.9326). The HQ's characters are
  ~55-80 px in this frame; at the old scale (1.35) ours were ~1.5x too big against the land ("the land is way too small"). The arena
  is 1814 x 1594 world units now (the plaza is 2034 x 1566). `arena.py` derives the world box from the island and writes `arena.json`;
  `package.py` reads it (plan origin), the water sheet is the island's box + 30 units.
- **Measure:** `measure.py <render.png>` prints mask IoUs and colour medians against `output/reference.png`. Last: grass IoU 0.84,
  grass colour #def295 vs HQ #ddf294. The stone and tree IoUs are polluted by the lavender kerb and the tree shadows (see below), use the per-block
  fit numbers from `fit_stones.py` (0.57-0.91) instead.
- **Outline:** `layout.py rectify()` straightens the traced outline to right angles in the plan (the HQ island is built of them).
  The land is the grass + the green glow at its edge + the lavender kerb round it (the kerb's outer edge is the land's edge), read at z 0.3.
- **Kerb:** the HQ has a raised lavender kerb round the island (build.py KERB_*: pieces laid along the outline). Thin on the back edges, tall on the front
  ones in the HQ: ours is one thickness (0.5 x 0.8) all round: still a gap.
- **Stones:** `stones.py` (hand outlines from the frame) -> `fit_stones.py` (silhouette fit: height, size, place) -> `stones.py` again
  applies `stonefit.json`. Delete `stonefit.json` before refitting. The HQ's rocks are broader at the foot (build.py `taper`). Colours per block
  (BLOCK_COLOURS): the HQ's trees and slabs throw SHADOWS on the stones (NW slab, W boulder are in shade): our renderer has no cast shadows.
- **Grass:** flat lime + drawn shapes (shade, pale, lime) from ground.py, tufts that sway, canopies that breathe (ThreePlaza.#animate).
- **Camera:** `followFrame` (min = whole island, max = 1.3x) in the manifest; the HQ zooms in as players close up (measured only by eye).
- **Power badges** over players are done for all maps (render/three/inventoryBadges.ts).

### Still different from the HQ (next steps, biggest first)
1. Water: HQ has teal depth gradient, hand-drawn foam outlines round every edge (several concentric ribbons), light shafts that are *in the scene*
   (ours is a CSS overlay). Our water is flat and the foam is the fountain's.
2. Cast shadows (trees on grass and stones, slabs on grass): the HQ bakes dark blue-green shapes; ours has only the grass `shade` patches.
3. Boulders: the HQ's are taller, more cube-like, with a second smaller rock beside the E boulder; ours are tapered prisms.
4. Tree canopies: HQ lumps are softer, larger discs with darker rings and a mottled colour; ours have star-shaped facets. Trunks need the HQ's patches.
5. Bamboo stands, lily pads (the HQ pads are bigger with a notch), the pink flowers, the green specks on the water by the notch.
6. Characters' spawn glows, the HQ's pale spawn discs (we draw `pale` patches from the frame).
7. The island is not yet in the rotation.
