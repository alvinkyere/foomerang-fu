# GARDEN — the first production arena (Slice 9)

Garden is **"Garden Map - Fu" became a playable arena**: one arena, reconstructed from the reference image in the repository root, with real solid geometry underneath and a stylised 2.5D rendering on top. Slice 9 is engineering complete; **it is not PASS** until the project owner has played it and compared it with the reference.

## 1. The reference

| | |
| --- | --- |
| File | `Garden Map - Fu.jpeg` (repository root; tracked, never moved, renamed, edited, cropped, compressed or recoloured: its SHA-256 is still `7193b0451a92e571614ae15bdc9e5dddb424ad8887e82575b27c356507674eb8`) |
| Extension / format | `.jpeg` / JPEG |
| Native size | **2752 × 1566 px** |
| Aspect ratio | **1.7573 : 1** (≈ 16 : 9.1) |

The image is **never used as a texture, background, billboard or screenshot layer**. Garden is drawn from geometry and vector art (see §5). The comparison tool reads the image and writes only derivatives into `docs/garden/`.

## 2. How it was measured

All analysis is in `scripts/garden` (Python: PIL, numpy, scipy), working in a 1999-px-wide frame (the image scaled by 0.7264) and reproducible.

1. **Segmentation.** Lavender stone (wall tops, boulders), olive barricades, cyan portals and the dashed boundary were separated by colour; wall *top faces* (lighter) from *front faces* (darker).
2. **The boundary.** The dashed arena boundary was found dash by dash (36 on the top edge, 32 on the bottom, 23 on the left, 18 on the right) and fitted with straight lines: top y = 79, bottom y = 1043.5, left edge slope −0.1396, right edge slope +0.1116. The two side lines meet at the **horizon, 5,394 px above the frame** (x = 1021): a long lens, mild perspective. The near edge is **1.176×** the far edge, which matches the 1.176 growth of the dash spacing (37.5 → 44.1 px) — the check that the model is right.
3. **The camera** (`apps/console/src/render/garden/camera.ts`, `scripts/garden/cam.py`): a pinhole camera over the ground plane. Pitch 40° (the one value that makes the arena **square**, 1440 × 1456 world units, makes a wall as thick in depth as it is wide, and gives a wall's front face ≈ 28 px at 36 units of height). Unprojecting both left corners of the boundary gives the same arena x (−800.4) at the top and the bottom edge: the lines really are straight lines in the world.
4. **Walls.** Each wall's top face (north edge, at wall height 36) and ground edge (south edge) was read from the mask and unprojected: `docs/garden/measured-walls.md` lists every wall in **normalised image coordinates** (x / 1999, y / 1138). Boulders were measured the same way at height 80.
5. **Overlay check** (`docs/garden/overlay.png`): the measured walls, projected back through the camera, sit on the reference's walls.

### The measured layout (summary; full table in `docs/garden/measured-walls.md`)

* **Playable boundary:** the dashed rectangle, 1440 × 1456 world units.
* **Wall runs: 36** (33 chunky lavender stone, 3 olive barricades): 18 horizontal and 18 vertical. Top-left L (H1+V1), top-centre L (H2+V2), top-right bracket (olive HO1, V3, H3, H4, V4), the central maze of T's (H6/V8/V12, H7/V10, V9, HO2/V11), the left bar (H8) with the U (V6, H9, V7), the central-right T (H10/V13), the long right wall (V14), the bottom wall (H14) with the left return (V15), the bottom stubs (H11/V16, H12/VO18, H13, H15/V17).
* **Boulders: 8 colliding pieces** in 4 groups: R1 (top-left, with its stub H5), R2a–c (left, with the portal), R3a–c (right, with the portal), R4 (bottom, by V17/H15); plus 2 decorative boulders outside the boundary.
* **Portals: 2** (on the east face of R2 and the west face of R3). **Levers: 4.** **Plants / tufts / sand patches / trees** as listed in `apps/console/src/render/garden/gardenArt.ts` (presentation data, canvas pixels).

## 3. The authoritative geometry

`games/foomerang-fu/src/rules/gardenArena.ts`: `GARDEN_ARENA` (1440 × 1456), `GARDEN_WALLS` (36), `GARDEN_ROCKS` (8), `GARDEN_SPAWNS` (6), `GARDEN_BOOK_SPOTS` (8). The rules only know axis-aligned rectangles, so:

* every wall is a rectangle **36 units thick** (the rules' own minimum, one player radius; the reference measured 30–34, rounded up: the one place the layout was nudged to satisfy an existing rule, not the other way round);
* every boulder is **two overlapping rectangles** (a cross with its corners cut by 16 units), covering > 85% of the visible footprint — the largest invisible-or-missing sliver is a few units at a chamfered corner;
* two measurements were nudged where they closed a gap a body needs: the bottom wall H14 sits 6 units further north than measured (keeping the strip beneath it 84 units wide for a 72-unit body; within the measurement error).
* The renderer receives the arena's walls from the same data (`ArenaView.walls`), and e2e checks that **what Phaser draws is exactly the rules' wall list**.

### Spawn design

Six spawns, one per slot, chosen by search on a navigation grid (`scripts/garden/build.py`): all on open floor with ≥ 66 units of clearance; no two within 400 units; **no two within 660 units have a clear line** (nobody can be hit at the start of a round); and **ordered so every prefix (2 … 6 players) is well spread** — slot 0 top-left, slot 1 the far bottom-left (path distance 1,808 for two players), and each next slot the farthest from those chosen. Path distances to the others (mean) are within ≈ 220 of each other (no spawn is systematically safer or more exposed). The match's slot assignment and rotation are the platform's, unchanged. Book spots: 8 open places, each > 200 units from every spawn.

### Arena systems used

**None.** The reference contains no timed gates, platforms or hazard floor that the approved Slice 6 systems could represent without changing its layout, so Garden uses **no gates, platforms or hazards** (they remain available to future maps). The three olive barricades are permanent solid walls.

## 4. Portals and levers (visual only — an explicit status)

* **Portals:** rendered and animated (cyan swirl, glow, a dark recess in the rock face). **Gameplay-inactive**: no approved mechanic maps cleanly to a teleporter, Phase Dash was not touched, and no teleportation was invented.
* **Levers:** rendered at their measured places (pink base, handle, glowing orb). **Gameplay-inactive**: the approved gates are *timed*, not switched, so no lever drives anything; no switch mechanic was invented.

## 5. Rendering approach

**Master fidelity pass (supersedes the first vector-only renderer).** `foomerang-fu gameplay.mp4` is the master reference for the whole game's look; `Garden Map - Fu.jpeg` still owns only Garden's layout. The analysis is in `docs/VISUAL_REFERENCE.md`, the derived frames in `docs/reference/video/`.

Garden is now **painted once at scene start into Canvas2D textures** and Phaser only places and animates them (`paint.ts` toolkit, `environment.ts` ground/walls/rocks/trees/portals/vignette, `charArt.ts` plush characters, `vfx.ts` effects). Nothing is downloaded and nothing is a reference image: every texture is generated from code; no frame of the video or the map is used as a background, overlay or sprite. One key light from the upper left gives every solid a lit top, a shaded flank, a cool rim and a long soft shadow to the lower right; ambient-occlusion bands darken the ground where walls meet it. The fitted camera (`camera.ts`) and the rules geometry are unchanged. No new dependency. Code lives in `apps/console/src/render/phaser/garden/` and loads as its own lazy chunk.

## 6. Characters (Bread Slice, Coffee Cup, Orange, Green Fruit)

`charArt.ts` bakes four plush toys (2x supersampled): soft-shaded bodies, glossy eyes, blush, stubby limbs. `characters.ts` animates them with Phaser transforms only (squash and stretch while running, lean into the movement, a hop on the throw, a wind-up and swing on the slash, a flattened death pose) and gives each a soft contact shadow, a colour ring, a facing chevron and a name. **Which character a player is is cosmetic and follows their seat** (seats 1-4: Bread, Coffee, Orange, Fruit; seats 5-6 repeat Bread and Coffee, told apart by their colour ring and name). **Every character is the same gameplay body**: the rules never hear of them, no hitbox changed.

## 7. Combat presentation

`vfx.ts`, in the video's language (flat saturated shapes, short, over everything): **slash** = a faint truthful wedge (exactly the rules' arc and reach) under a feathered orange/gold crescent with a white-hot core and sparks; **hit** = a star flash, a shock ring and the victim bursting into its own colours (bread crumbs, coffee-cup china and beans, pumpkin and fruit pieces) that tumble with shadows; **CLANK** = a big star, two rings and sparks thrown the way the boomerang was knocked; **blast** = a hot disc to exactly the rules' radius, an edge ring, a scorch, a ring of dark debris, then specks; **dash** = streak sparks and dust; **shield/phase/pickup/fatigue/spawn** = rings and sparks in their colours. Effects follow events and never decide anything.

## 8. Readability: the occlusion rule

Walls are low (36 units) but boulders are tall. A wall or boulder that stands **in front of a living player and overlaps their silhouette** fades to 45% *while it does*, smoothly; nothing else is ever transparent. (`render/garden/occlusion.ts`, pure and tested with several people at once.) The player is also always marked by the colour ring and name, which are drawn with them.

## 9. CPUs on Garden

The Slice 7 calibration is untouched. CPUs plan on the rules' wall list, so Garden's corridors, corners, dead ends and boulders are just geometry: tests show every difficulty finds and reaches an opponent standing at every Book spot and every other spawn; in 15 seeded matches (4 and 6 CPUs, every mix) **no CPU is ever inside a wall and the longest a CPU stood idle with no foe near was 4.1 s** (Easy; Hard ≤ 1.0 s); complete 2-, 4- and 6-CPU Free For All matches on Garden end at 14 kills (91 s / 61 s / 67 s in the test seeds) and replay identically.

## 10. Visual fidelity — measured, and not claimed as pixel-perfect

`docs/garden/`: `reference-small.png` (the reference scaled to the screenshot size), `implementation.png` (the canonical camera, from a real match), `overlay.png` (50/50 blend), `diff.png` (absolute difference ×3), `wallmask.png` (stone in red = reference, green = implementation, yellow = both), `metrics.json`. Regenerate: `FOOMERANG_GARDEN_SHOTS=1 pnpm --filter @foomerang/integration exec playwright test -c e2e/playwright.config.ts e2e/garden.visual.e2e.ts`, then `python3 scripts/garden/compare.py`.

| Measure | Value |
| --- | --- |
| Stone mask overlap (IoU) | 0.75 |
| Stone pixels within 5 px of the reference's | **95.4%** |
| Mean absolute colour difference | 18.0 / 255 (palette, shading and the four characters differ) |

These numbers say the **large shapes, framing and proportions line up**; they say nothing about whether it looks like the reference. **The project owner makes the visual judgement.**

**Superseded list (first renderer):** the boulders are lumpy prisms, not the reference's softly modelled stacked boulders; wall edges are crisper and more regular than the reference's slightly broken stone; trees and plants are simplified (no leaf detail); the ground's tonal variation is a smooth gradient plus blobs, not the reference's painted patches; lighting is flat-shaded with a soft cast shadow, not the reference's diffuse global lighting; the characters are vector toys with no real shading; the three non-requested creatures in the reference (the eggplant, the teal bud, the second bread) are not drawn; the portals' recess is a flat dark ellipse; the slash crescents are three strokes, not the reference's feathered fire.

## 11. Tests and evidence

Rules (`games/foomerang-fu/test/garden.test.ts`, 29 tests; `gardenCpu.test.ts`, 5): arena data validity and boundary, wall thickness, rock obstacles, spawns (clearance, no overlap, no instant line of fire, every prefix), Book spots, **one connected floor** and routes between every spawn and Book spot, MOVE/boundary/player and wall collision, THROW with RETURNING wall-following, SLASH cover, deflection, DASH, Phase Dash, Blast cover, Twin Throw, Shield, Overdrive, Books, round and match reset, six-player determinism and a fuzz that never puts a body in a wall. Console: the camera (corners, perspective, invertibility), occlusion. End to end (real phones → server → console → rules → renderer, `integration/e2e/garden.e2e.ts`): the drawn walls are the rules' walls; MOVE and wall collision; player collision after walking through the corridors; THROW → RETURNING → caught, DASH, SLASH; a kill fills a hole and the next round starts; a timed deflection; a Book collected and **Phase Dash through a Garden wall**. The CPU Free For All lifecycle (CPU-only, rematch, return to lobby, latecomer, reload) in `killrace.e2e.ts` runs on Garden. **Mutation testing** of the Garden data, camera and occlusion: 11 faults, all killed (one only after a test that every boulder is an obstacle was added).

## 12. Performance (headless Chrome, development console, 60 s unless noted)

| Case | FPS min / median | mean frame | worst frame in any 2 s window | catch-up frames | discarded simulation |
| --- | --- | --- | --- | --- | --- |
| 2 Hard CPUs (30 s) | 59.95 / 59.99 | 16.67 ms | 18.8 ms | 5 | 16.7 ms |
| 4 Hard CPUs (30 s) | 59.95 / 60.00 | 16.67 ms | 33.1 ms | 9 | 50 ms |
| **6 Hard CPUs, Books high** | 59.95 / 60.00 | 16.66 ms | 34.2 ms | 15 | 16.7 ms |
| (6 Hard CPUs, the primitive arena, for reference) | 59.95 / 60.00 | 16.67 ms | 30.1 ms | 224 | 33.3 ms |

CPU decisions on Garden: 21,900 in a minute, **mean 0.010 ms, worst 8.4 ms** (one outlier: the first path field). The rendering has no measured bottleneck here; the static scenery is vector geometry redrawn by Phaser each frame, and the first thing to optimise if a weak device struggles is baking it to a texture. The six-phone case has the same bodies as six CPUs; real iPhones and the TV are the owner's to judge.

**Bundle** (gzip): initial JS 126.9 kB (budget 130, +0.3 kB), lazy JS **359.0 kB** (budget 380, unchanged; +10.6 kB for Garden: its renderer chunk is 8.3 kB, the rest is the shared effect code, now one module for both renderers).

## 13. Physical playtest

See the Slice 9 section of `docs/FOOMERANG_FU.md`.

## 14. Master fidelity pass: evidence and honest limits

- Reference analysis: `docs/VISUAL_REFERENCE.md`; frames: `docs/reference/video/` (derived JPEGs; the MP4 is untouched).
- Capture: dev-only showcase (`apps/console/showcase.html`, scripted scenarios through the real rules and renderer on a virtual 30 fps clock); `FOOMERANG_GARDEN_MOTION=1 pnpm --filter @foomerang/integration exec playwright test -c e2e/playwright.config.ts e2e/garden.motion.e2e.ts` (frames to the git-ignored `docs/garden/motion/`; `FOOMERANG_GARDEN_ONLY=a,b` limits it).
- Comparison: `python3 scripts/garden/motion_strips.py` writes strips and reference-above-ours pairs to `docs/garden/compare/`. They are for eyes; no similarity number is claimed.
- 6 Hard CPUs on Garden, 60 s: 60.02 median fps, 16.66 ms mean frame, worst window 24.4 ms.
- Remaining discrepancies: our world is calmer and more saturated green than the video's pastel sandy ground; the video's grain/painterly smear is only approximated; blast debris is smaller and less chunky than the video's; character animation is transform-based, not frame-by-frame; the HUD is restrained but still the DOM HUD.
