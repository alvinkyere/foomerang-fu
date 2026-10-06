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

No new dependency and no image asset: Garden is drawn with **Phaser 2D vector graphics through its own camera maths**. Every ground shape, wall face and boulder is projected point by point (`project(x, y, z)`), so walls lean and the near edge widens exactly as in the reference. Code lives in `apps/console/src/render/phaser/garden/` and loads as its own chunk that only Garden players download; the rules package knows nothing of it.

* **Ground:** a bright yellow-green with a soft brightening toward the middle, darker shade under and beyond the trees, pale sandy patches, the dashed boundary drawn *on the ground* in perspective.
* **Walls:** each wall is cut into ≤ 110-unit chunks; each chunk is a lit lavender top (rounded at real ends, with a highlight edge and a seam), a darker south face and, for walls off the camera's column, a side face; soft shadows fall to the lower right. Olive barricades are mustard.
* **Boulders:** lumpy extruded octagons (a nudge per corner from the rock's name), a tapered top with a lit facet, darker lower body.
* **Exterior:** autumn trees with white birch trunks, deep foliage, the two outside boulders, dark corner bushes. **Interior:** leafy plants, grass tufts, lever structures, portals.
* **Depth:** painter's order by the screen row of each object's ground edge, so characters pass in front of and behind walls correctly.

## 6. Characters (Bread Slice, Coffee Cup, Orange, Green Fruit)

`characters.ts`: four little vector toys — Bread Slice (crust, crumb, two bumps), Coffee Cup (rim, coffee, handle), the pumpkin-like Orange (ridges, leaf, stem) and the Green Fruit (stem, two leaves, highlight) — each with a face (dot eyes with a glint, blush, mouth), little feet and arms. **Which character a player is is cosmetic and follows their seat** (seats 1–4: Bread, Coffee, Orange, Fruit; seats 5–6 repeat Bread and Coffee, told apart by their colour ring and name). **Every character is the same gameplay body**: the rules never hear of them, no hitbox changed. A selection screen is not part of Slice 9.

**Animation** (presentation only; it never feeds back): idle breathing; a waddle with a hop and walking feet, scaled by actual speed; DASH (stretch and lean); SLASH (a spin); THROW (a wind-up squash); death (flattened, X eyes); victory (hops, happy eyes, arms up) for the match champion.

## 7. Combat presentation

The approved effects are unchanged in meaning and now lie *on the ground in perspective*: the shared effect code was moved out of the primitive renderer (`effects.ts`) and Garden draws it through a **ground pen** that projects circles into ellipses and arcs into curves. So THROW rings, CAUGHT, HIT flashes, DEFLECT clanks, DASH bursts, BLAST radius, SHIELD break, PHASE rings, FATIGUE rings and Book pickups read exactly as before. Added for Garden: **golden sweeping crescents** along the real swing (the wedge beneath is still the truth), a **colour ring and a facing chevron** at each player's feet (the body's true footprint; solid when armed), a **shield bubble**, a tired ring and sweat, the three power badges, and a **toy boomerang** that spins in the air with a ground shadow and a trail. The **Book** is the same mystery blue book with the red bookmark and a "?", bobbing, with a shadow; it still names nothing until taken.

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

**Known visual discrepancies:** the boulders are lumpy prisms, not the reference's softly modelled stacked boulders; wall edges are crisper and more regular than the reference's slightly broken stone; trees and plants are simplified (no leaf detail); the ground's tonal variation is a smooth gradient plus blobs, not the reference's painted patches; lighting is flat-shaded with a soft cast shadow, not the reference's diffuse global lighting; the characters are vector toys with no real shading; the three non-requested creatures in the reference (the eggplant, the teal bud, the second bread) are not drawn; the portals' recess is a flat dark ellipse; the slash crescents are three strokes, not the reference's feathered fire.

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
