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
1. Water: foam is now three thin concentric outlines round every edge (package.py cartoon ribbons, as the HQ draws them at the SE kerb): done. Still
   the HQ's bluer-toward-the-bottom shade is now a CSS gradient layer in `.arena-shafts` (2026-10-30, session 2); still missing: light shafts *in the scene* (ours is a CSS overlay, `.arena-shafts`).
2. Cast shadows (trees on grass and stones, slabs on grass): the HQ bakes dark blue-green shapes; ours has only the grass `shade` patches.
3. Boulders: the E cube now straight-sided (6.4 tall) with the low rock beside it (both hand-set in fit_stones.py MANUAL: touching blocks share one mask so a fit merges them); the other boulders are still tapered prisms. `stones.json` now keeps each outline's pixels (`px`) and stones.py/fit_stones.py re-read them at each height tried.
4. Tree canopies: now mottled soft discs with ragged edges (build.py blob()); the HQ's are puffier (more 3D) and the trunk is thicker and curved with big dark patches.
5. Bamboo stands, lily pads (the HQ pads are bigger with a notch), the pink flowers, the green specks on the water by the notch.
6. Characters' spawn glows, the HQ's pale spawn discs (we draw `pale` patches from the frame).
7. The island is not yet in the rotation.

### 2026-10-30 (session 2)
- Light shafts re-fitted to the HQ (structure tensor of the water's green excess over the top 420 px): bands run at 136.5 deg (CSS `136deg`),
  period ~18vw, strength +26 G / +14 B over plain water; `.arena-shafts` in styles.css is now that, plus the bluer-toward-the-bottom gradient.
  Still an overlay (it also tints canopies and grass a little, the HQ's shafts do too but less): moving them into the scene (a lit plane or
  the water shader) is the next step for them.
- Measured with `measure.py` on the Blender render (which has no overlay): water px differing >12 levels 46% (mostly the shafts and the foam),
  grass 18%. Whole frame ~49%. This number is NOT a pass mark; use blend images (`output/blendN.jpg`) region by region.
- (session 2, later) Slabs rebuilt from their traced outlines (fat rounded barrels, h 2.0, hand-set in fit_stones.py MANUAL), kerb pieces skip stones,
  bamboo taller (4.4-6.4), lily pads bigger with the HQ's rim ring / short dashes / bigger flower, birch trunk thick and banded, tree lumps placed
  at their own heights (layout.py). Trees are still the weakest object: the HQ's lumps are puffy domes with mottled colour and a bent S-shaped
  trunk; ours are flat-looking discs and a straight trunk. Cast shadows and in-scene shafts remain.
- (session 2, last) Owner feedback on two screenshots (text only, the pictures were not attached; read as: first = HQ, second = ours): our foam read as a
  topographic map extending far out -> now a soft wide glow at the coast + two sparse thin outlines (package.py cartoon: glowWidth 0.9, presence
  [0.3,0.55], ribbons 0.5 / 1.1) + 16 short isolated horizontal ripple dashes in open water (build.py RIPPLE_*); the bottom-third shade overlay was removed
  (the HQ measures uniform top to bottom at 10:37); trunk got more rings. NOT done, ask the owner / re-read the HQ: the E boulder 'floats' in the HQ
  and ours sits low; four orange circular 'decals' in ours are the runners' dust puffs (game-wide, not this map); the HQ camera is panned up/right of ours.

### Compare the game with the HQ (the owner, 2026-10-30: "the screenshot is the HQ at 10:37, compared with a scene in our game: ensure it is the same")
The game has a developer view, `?arena=lily&frame=hq`, that pins the camera to the HQ's 10:37 frame (manifest `hqFrame`; `&fu=&fv=&fz=` nudge it).
1. `art/lily_island/shoot_hq.sh NAME 1500` shoots it at 1920x1080 (to `$TMPDIR/NAME.png`; copy to `art/lily_island/output/`).
2. `python art/lily_island/hqcompare.py <shot.png>` lays the game's grass over the HQ's (scale + shift search), prints the grass IoU and what `fz/fu/fv` would
   change, and writes `output/hqcmp.jpg` (HQ | game | difference).
Status: scale 1.000, shift ~(-4, 4) px, grass IoU 0.82, grass colour #dcf295 vs HQ #ddf295, water median identical (#7aa9bc), 39% of pixels still differ by >12 levels
(shafts, foam, canopies, stones, the players' dust and the HUD names). `scale.json gameZoomFit 0.965`: the game's camera needs that factor over
hqZoom/scale to show the island as big as the HQ does (the Blender preview and the game's camera do not share one zoom convention).
- Kerb widened to 1.0 x 0.6 in a lighter lavender (#98a2e8 / #7f89d6) after a crop-by-crop look with hqcompare; tree lumps shrunk x0.84. The HQ's kerb is thick on the front (south/east) edges and almost only a soft glow on the back (north/west) edges: ours is one thickness all round (next fix).
- Kerb now thick on the camera-facing edges and thin on the back ones (build.py `f`). The player names ASH/RIK/JAS/PRICE at the left of the HQ frame are NOT to be built (owner, 2026-10-30): they are masked out of every comparison (x < 215).
- (2026-10-31) Trees: `fit_trees.py <game shot>` moves/scales each canopy in the GAME's view until its orange mask sits on the HQ's (residual now ~1 px; results in
  treefit.json, applied by layout.py; rerun layout->...->package, shoot, fit until ~0). Trunk heights/tops re-read from the frame (3.4 tall), thinner, blotched.
  STILL WRONG: the right tree's canopies are small and float high above the north-east slab in ours (the HQ's sit lower, bigger, overlapping the slab, trunk visible
  between them); the left tree's trunk is too short/thin and the HQ lumps are bigger and overlapping. The mask fit only matches centre+area, not each lump: next, fit each
  lump separately (split the mask into components) and lower the right tree. Pixel difference is still ~40%: it is spread over the whole frame (boulder shading,
  canopy mottling, shafts, foam), so there is no single fix to bring it to 10%.
- (2026-10-31) Where the ~40% of differing pixels sits (HQ-class masks, `hqcompare` shot): water 47% of it (HQ water covers half the frame, a third differs), grass 18%, stones 15%,
  trees 8%. In the water the gap is the shafts: HQ's top-centre water is +60 in G over plain water, ours ~+10 (cells.py-style grid of mean G difference). A stronger CSS
  overlay (one broad band, alpha 0.6, shifted -8% to line up) fixed the top-centre cells but made the whole-frame figure WORSE (46.6% vs 40.1%) because an overlay also tints
  grass, rocks and trees, which the HQ's shafts barely touch. Reverted. The fix is shafts drawn ONLY on the water (in the water shader: add the band as a
  brightness term on the water sheet, so land is untouched), then the same grid to tune it.
- (2026-10-31) Shafts moved into the water shader (waterShader.ts `shafts`, manifest water.shafts: angle 136.5, stops scaled x1.5, fade 0.28-0.72); the page overlay and
  `.arena-shafts` CSS are gone. Mean green of the top water cells now matches the HQ (difference 0 +-12 instead of -50). The whole-frame >12-level figure did NOT
  move (41%): it is set by high-frequency differences (foam outlines, stone/kerb edges, canopy texture, grass patches), not by smooth brightness. `cells.py`-style
  grids of mean difference are blind to those; use per-object masks of the difference image for them.
