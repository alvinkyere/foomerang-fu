# Exact master-video reconstruction — courtyard sequence (f201–f368, 5.73 s)

Status: **Pass 6 (blender/build_courtyard7.py) rendered for review; Pass 5 not approved. Slice 9 gate is NOT passed; nothing here is integrated into Phaser.**

Source of truth: `foomerang-fu gameplay.mp4` — 640×360, 30 fps, 49.57 s, 1488 frames (H.264). The sequence reconstructed here is the
plaza ("courtyard") shot: take A f201–f263 and take B f264–f372 (a hard cut, which is also a jump in time).

## Method (measure → reconstruct → render → align → difference → correct)

1. `tools/vextract.swift` decodes every frame losslessly (AVFoundation; no ffmpeg dependency). `analysis/shots.py` finds the 20 shots.
2. **Camera** (`analysis/track_ground.py`, `solve_pose_fixedK.py`): SIFT + RANSAC + ECC chain the dominant ground plane through each shot
   (1000–1800 inliers/frame, ECC ≥ 0.98). Poses are solved per frame for a **fixed lens**. Findings:
   - Plane self-calibration alone is degenerate (focal length and height trade off). Cues that broke the degeneracy: the fountain's imaged
     aspect ratio, pavilion faces, and the circularity of the fountain in the rectified plan view.
   - Result: **f ≈ 900 px (≈50.6 mm on a 36 mm sensor, ≈38° horizontal FOV), pitch ≈ 55–57°**, a dolly-in of ≈22 % (camera height
     1.00 → 0.78 in take B) plus a small pitch/yaw/roll drift. Uncertainty: f 800–1100 px, pitch 55–58°.
   - Ground-track reprojection error: mean 1.6 px (take B), 2.0 px (take A). Take A was registered into take B's world frame across the
     cut (SIFT, 277 inliers); its independently solved pitch (55.1°) agrees with take B's.
   - Independent re-measurement of the fountain from both takes agrees to 0.3 BU (centre) and 0.6 % (radius).
3. **Layout** (`analysis/build_plan.py`, `extract_layout.py`, `merge_layouts.py`): median ground-plan views (analysis aid only, never
   used at runtime) give the measured palette and plan geometry in world units (1 unit = reference camera height = 100 Blender units).
   Ground classes are vectorised into flat polygons and geometrically unioned (overlapping coplanar polygons render black in Cycles).
4. **Scene** (`blender/build_courtyard.py`, headless Blender 5.0.1): fitted animated camera, ground vector layers, fountain, four market
   stalls (positions recovered by ray from the blob in the plan view), tree canopies, the licensed characters, placeholders, burst VFX.
5. **Diagnostics** (`analysis/compare.py`, `make_comparison.py`): reference | reconstruction | 50/50 overlay | |difference|×3, synchronized
   clips and a blink comparison. No similarity score is computed or used as a gate.

Character positions are hand-read from gridded keyframes every 8th frame (±4 px) and interpolated.

## Pass 2 (what changed; camera and ground registration frozen)

`blender/build_courtyard2.py` replaces the pass-1 builder. All inputs are measurements in `analysis/`:

- **Stalls**: thick roof slab with corner finials, four posts, magenta counter with pale lip, striped fringed carpet; footprints recovered from the rectified plan by ray correction, front faces the fountain.
- **Fountain**: slim purple stone ring, cyan water, low scallop-shell statue (dome, side lobes, rib fan); dimensions from a radial profile measured in the plan.
- **Trees**: canopy silhouettes measured per tree from the rectified plan (`extract_trees.py`), extruded into one mesh each, purple trunks, drips; one large golden tree.
- **Props**: purple bone-shaped fence rails, crates, pots, stair landing, bunting, dashed boundary line (positions from the plan, `props_takeA.json`).
- **Lighting**: sun/ambient fractions solved from measured lit-vs-shadow patch ratios (shadow = 0.75/0.84/0.95 of lit in R/G/B on pavement), sun toward +X/+Y so shadows fall left and toward the viewer, elevation 58 deg; measured screen-space vignette (about 10 % sideways, 7 % bottom) and 0.7 px softness in `analysis/post.py`.
- **Characters**: per-frame tracks (`refine_tracks.py`: keyframe template matching, then colour-centroid refinement), heading from motion, hop/lean/squash, limbs added to Bread and Coffee (the supplied models have none), drop-in landings (closest-approach height solve), landing squash.
- **VFX**: spawn rings are EXPANDING, FADING rings (coffee f203-213, teal f222-234, bread f236-248; radii read from crops); the coffee-death burst is rebuilt per frame from segmented brown/white regions (`measure_vfx.py`); motion trails for teal, watermelon and the boomerangs.
- **Teal creature and boomerang** reconstructed from footage (bean/hooded body with face; thick brown crescent).

## Licensed assets used (as supplied, unmodified)

`~/Downloads/characters-from-boomerang-fu` → bread, coffee, watermelon (meshes + 2k diffuse/normal/roughness). Copied to
`art/reconstruction/licensed/` (git-ignored). **The archive contains no licence text; its only note says "Thank you very much for
purchasing"** (marketplace sale). The user confirmed they hold the rights; the actual terms have not been seen.

## Not in the licensed archive (placeholders, flagged)

- the **teal jelly-like creature** (placeholder sphere),
- the **boomerangs** (placeholder bent bar),
- all environment art (stalls, fountain, trees, props, ground) — rebuilt from measurements of the video, not supplied assets,
- VFX (burst, spawn rings).

## Tools

`tools/vprobe.swift`, `vextract.swift`, `vmake.swift` (MP4 encoder). Analysis uses an isolated Python venv (opencv-python-headless 4.11.0.86,
numpy, scipy) kept **outside the repo**; no JS dependency was added.

## Pass 3 (materials / light / characters / burst)

- Projective texture capture (`analysis/capture_textures.py`, `fill_ground.py`): flat surfaces (ground, roofs, fountain top, bushes) are rectified from the footage at parallax-measured heights (`height_fit.py`: roof 6.0 BU; orange 'canopies' are ground-level bushes, ~0) with the measured light field divided out, and re-lit by the scene.
- Light: measured per-take screen-space light field on lit ground only (`light_field2.py` -> `lightfield_take?.npy`, applied in `post3.py`), near-ambient scene lighting (reference stall shadows are ~0.93 of lit), painted grey-green ground shadows kept in the ground albedo.
- Characters: tilted back so the face points at the camera (the key pose finding), per-frame facing yaw from apparent width (`measure_facing.py`, `facing_yaw.py`), per-character scale from silhouette areas, bbox-centre placement with measured bias (`track_bias.py`), rebuilt teal slab character.
- Burst: temporal differencing in world coordinates (`measure_burst.py`) -> per-frame colour-class polygons.

## Pass 4 (characters, burst, stall, fountain, motion)

- Characters: hop/squash/limb phase from each track's own vertical oscillation (`build_courtyard4.py: hop_bu`), contact shadows, tilt outermost with spin about the tilted body, limbs reduced to measured tiny dark nubs, Bread brightness gain from face colours (251,229,150 vs albedo 230,200,125).
- Burst: dark classified directly (not by difference threshold), white halo class, world-space per-frame polygons (`measure_burst.py`).
- Stall: roofs from the captured roof plane (`extract_roofs.py`: ~10 x 9.4 BU rectangles, rotated, snapped to 45 deg), front elements keep the matched footprint; a silhouette-IoU fit that grew the roof box was REJECTED because it made the image worse.
- Fountain: shell silhouette extracted from the captured plane (`shell_outline.json`), ribs as a bump map (no spike geometry).
- Motion: boomerang spin measured from the crescent open side per frame (`boomerang_angle.json`).
  Honest statistic: mean |diff| and the >40 share are flat from Pass 3 to Pass 4 (no numeric convergence).

## Pass 5

- Far end of the plaza (take-A top band): purple wall either side of the stair opening, two viewer-facing stalls, notice board (`far_end.json`).
- Burst dark material compensated for the ~1.6x brightening under near-ambient light.
- Screen-space character roll was tested (`build_courtyard6.py`) and rejected: it improved an orientation metric, not the image.

## Pass 6 (character experiment + subsystem fixes; one change -> render -> compare -> accept/reject)

- **Bread 3D orientation** (`blender/bread_yaw_search.py`, `analysis/solve_bread_yaw.py`): the licensed Bread is rendered through every take-B frame's
  solved camera at 24 headings (fixed backward tilt, 36 deg), scored against the reference by VISIBLE SURFACE (crumb / crust / eye presence),
  and a continuous trajectory is solved with a Viterbi turn penalty -> `bread_yaw_solved.json`. Root cause found: facing from silhouette width
  cannot tell face from back. Bread scale corrected (x1.25 of the old value; reference area was ~1.9x) and separate crust/crumb colour gains.
- **Far stalls**: one geometry that projects correctly from both cameras (facade ground line unprojected in take A f233 and take B f264/288/312
  agrees at y~0.927; facade ~5 BU; roof 6 BU starting at the facade; carpet in front).
- **Near stalls**: roof footprint from roof-red unprojected at 6 BU in both takes (the old fit had absorbed the red carpet and was ~3 BU too wide);
  full-footprint magenta counter body, short dark posts, carpet at the roof's front edge (both takes agree within 0.3 BU).
- **Burst**: measured masks stored as exact pixel runs in the world plan (holes/specks survive; polygon tessellation had silently failed);
  dark threshold matched to the evaluation threshold.
- **Teal**: classified REBUILD (geometry), not solved by rotation.
