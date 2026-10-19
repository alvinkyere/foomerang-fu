# environ2 — the market plaza, from the owner's still

`market_plaza` in the game is `environ2.avif` (repo root, 1280×720): the owner's reference image, rebuilt so that the map
with no players on it IS the image, every object is its own layer with its own depth, and the rules' collision comes from
the image. The owner chose this route ("exact image + object layers") and that it replaces the previous video plaza.

Run in order (OpenCV 4.11, NumPy; Python 3):

| Step | Script                | Output                                                       | Result                                                                                                                                                                                                         |
| ---- | --------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | (vanishing points)    | `camera.json`, `step1_camera_check.png`                      | f = 2577.4 px at 1280 wide (bootstrap 2569–2641), pitch 56.17° (55.6–56.3), yaw 0, roll 0                                                                                                                      |
| 2    | `clean_environ2.py`   | `step2_clean.png`, `step2_changed.png`, `step2_closeups.png` | 6 characters, their effects and 17 dust specks removed; 4.185% of pixels changed, every other pixel byte-identical. Fill: mirror copies (axis x = 651.25), the sand ring rebuilt by radius under the ice cloud |
| 3    | `layers_environ2.py`  | `step3_layers/` (+ review sheets)                            | 31 lossless cut-outs (the 6 rugs stay in the ground), 386 depth slices; ground + layers = the plate, max difference 0                                                                                          |
| 4    | `arena_environ2.py`   | `step4_arena.json`, `step4_arena_overlay.png`, rules module  | 1729 × 1108 arena, 51 wall rectangles by kind, 6 spawns ≥ 736 apart, 8 Book spots                                                                                                                              |
| 5    | `package_environ2.py` | `apps/console/public/maps/market_plaza/`                     | the 1920×1080 canvas (Lanczos ×1.5 once; ground + layers still reproduce it exactly), camera ×1.5, character scale 1.144                                                                                       |

Step 6 (the final comparison, 2026-10-16), from the running game's own canvas pixels (WebGL, 1920 × 1080, two CPU players,
`?arena=market_plaza`): away from what the game draws on top (players, rings, boomerangs, hit effects), the canvas equals the
packaged plate exactly (0 pixels differ). Against `environ2.avif` itself, 2.74% of pixels differ by more than 12 levels:
20,305 of them where environ2's characters and effects were removed, the rest the two game players (`step6_comparison.png`).
Performance: `../PERFORMANCE.md`.

Measured, not chosen:

- **World scale.** A player's circle (radius 36) is as large against environ2's characters (45 px tall at the fountain) as it
  is against the other maps' characters: 2748 world units per plan unit, radius 36 = 26 px at the fountain at 1280 wide.
- **Edges.** The three side fences stand on two ground lines (X = const in the camera's ground plane), which fixes the
  arena's west and east edges; the far wall's base and the bottom of the frame fix the rest. The terrace, its stairs and the
  archway legs are out of play.
- **Solid objects.** SUPERSEDED 2026-10-19 by `blender/collision.py` (run after `arena_environ2.py`, which still writes the
  arena's size, spawns, Book spots and border): the walls now come from the 3D models the game draws (`plaza.glb`), one solid
  per model in its real shape: pots, posts, the sign's post and the fountain's rim as discs; crates, stalls (plinth, body and
  posts) and fences as boxes turned as they stand; the terrace and its stairs as rectangles. The image-cell walls (40-unit
  cells, gaps narrower than a body filled, an EDGE strip along the bottom) made the bottom-left crates and pots one block
  twice their size, which the owner felt as a barrier. (Before: stalls from their post tops, the fountain from a circle fitted
  to its base outline, crates and pots one object deep behind their base line, poles and the sign at their feet.)
- **Depth.** A layer's depth is its ground-contact line, column by column: the base for things that stand on the ground, the
  line through trunk, post and pole feet for things held up in the air (canopies, the bunting's rope, banners, the sign).

Owner decisions (2026-10-16): the yellow light over hex tree 28 is scene lighting and stays; pots, poles and signs are solid;
trees, the bunting's rope and the rugs are not.

Known limits: removed areas are rebuilt from real texture elsewhere in the image (mirror copies), not the true hidden pixels;
the sand ring's edge under the ice cloud is interpolated. Character atlases are the previous plaza bake (pitch 55.0° vs
56.2°). Rules cells are 40 units, so collision edges are within half a cell of the footprints, and a ~20 px strip along the
bottom of the frame is not walkable. `art/reconstruction/runtime/gen_arena_frame.py` (the other frame-mode maps) closes and
opens its grid with even kernels, which shifts OpenCV's result by one cell; this map's generator does not.
