# Slice 9 visual integration: known limitations and follow-up backlog

The owner-approved Slice 9 visual work (`slice9-market-plaza` at `dfb17d5`) was merged onto main (`30d77a3`) in `integrate/slice9-visuals`.
This page records what that work does **not** do yet, so nobody mistakes it for finished. Slice 9 stays OPEN. The per-map detail is in
`art/reconstruction/MAPS_STATUS.md`, and performance figures are in `art/reconstruction/PERFORMANCE.md`.

## Arenas

**Every match is on a different map, always** (2026-10-15, owner decision): a shuffle bag over the 14 reconstructed maps, so every map
is played before any comes back, and never the same map twice in a row (rematches included). The **Garden map was removed** at the
owner's request (its characters were not the supplied models); `?arena=garden` no longer exists. `?arena=<name>` remains only as a
development/test pin (it disables rotation). The 14 reconstructed maps: `market_plaza`,
`harbour_fort`, `sky_islands`, `pond_garden`, `lakeshore`, `farm_plots`, `flooded_ruins`, `hedge_maze`, `toaster_dock`,
`twin_log_rink`, `hex_grove`, `stone_ruins`, `cross_pond` and `diamond_walls`. There is no map selection screen (rotation instead).

- 12 maps are **frame mode**: each is one 640×360 frame of the reference video, upscaled to the game view. They are visibly soft at
  1080p, and more so on a TV. The view does not pan.
- 8 frame-mode cameras are INFERRED (a shared prior).
- `market_plaza` is now **environ2** (the owner's reference still, `environ2.avif`), built image-exact with its own
  vanishing-point camera, object layers with per-column depth, and collision from the image: see
  `art/reconstruction/environ2/README.md`. The previous video plaza and its DISPUTED camera are retired.
- Hazards and moving props (croissant, logs) are presentation only. Drops and water only block. The cross_pond raft is static. The
  hex_grove fire is not reconstructed.
- **harbour_fort defect:** a character walking through the gate is drawn on top of the gatehouse roof (depth order).

## Characters

- The game draws **sprite sheets rendered from the 10 supplied models**. It does not use the models themselves. Each sheet has 16
  headings × 2 tilts (standing, and a 70-degree airborne tilt used for dash and death). The supplied models have no rig or animation,
  so there are no arms or feet and no walk, throw, slash, hit, death or victory poses. Movement is a code hop, squash and lean.
- All characters are rendered matte (specular 0, roughness 1). **Bread's crumb is paler and yellower, with an olive crust. Icecream is
  desaturated** (×0.79 saturation). Both were tuned to the video. Other colours match the supplied textures.
- **Donut and milk** have sheets but no map seats them, so they never appear. Bacon appears only on hex_grove. Avocado appears only on
  harbour_fort and diamond_walls.
- Characters are about 40–65 px tall at 1920×1080.
- The licensed models (`art/reconstruction/licensed`) and the reference video are not in git. Rebuilding the sprite sheets or map art
  needs them. A backup is kept outside the repository.

## Performance

At 1920×1080 on an Apple M1 iMac, every arena holds 60 FPS with six CPUs. TV, 4K-backing and slow-CPU hardware are **unmeasured and
remain a release blocker**. Earlier 6× CPU-throttle runs showed hitches.

## Follow-up backlog (separate tasks, not part of the integration)

1. (Done 2026-10-15 by removal: the Garden map is gone.)
2. Make all 10 supplied characters selectable (donut and milk currently never appear).
3. Fix the harbour_fort gatehouse roof-occlusion defect.
4. Improve character animation and on-screen readability (size, poses).
5. ~~Add an in-game map selection screen~~ superseded: the map changes every match (owner decision, 2026-10-15).
6. Improve the low-resolution frame-mode maps.
7. Validate on a physical TV and with physical phone controllers.
8. Owner decisions still open: drops and gaps, the cross_pond raft, the hedge_maze character scale,
   hazard collision, and eggplant and sushi (no supplied model).
