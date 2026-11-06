# The hex meadow (`hex_meadow`, `?arena=meadow`)

The map of `ff physics hq 2.mp4` at 20:02 (1202.0 s, the READY frame; the camera is still). `output/reference.png` is that frame and
`output/reference_fill.png` the same with the READY box filled from 1201.6 s (git-ignored, never shipped). Everything else is our own
geometry, measured from it.

**Run order** (from the repository root; Python = `art/audio/output/venv/bin/python`): `run.sh [package]`, after the slow fits
(`fit_lattice.py`, `fit_rocks.py`, `fit_trees.py`, whose json is committed).

| Step              | What it measures or makes                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `measure.py`      | the camera: the plaza's rig at its reference zoom; `plan()` / `plan_at(z)` put pixels on the ground                       |
| `hud_mask.py`     | the players' names' letters (hidden; the frame between them is used)                                                      |
| `layout.py`       | the frame's footprint, the dashed border, the measured palette                                                            |
| `fit_lattice.py`  | the pads' hexagonal lattice at the pads' height 2.9: circumradius 0.675, turn 0.04°, by edge darkness                     |
| `pads.py`         | every cell: pad or not, its shade, its flower (975 pads, 269 flowers); none where a rock is seen                          |
| `props.py`        | the trees' feet and trunks (read by hand along their middles), their starting lumps                                       |
| `fit_trees.py`    | the gold clumps fitted to the gold mask (IoU 0.72)                                                                        |
| `fit_rocks.py`    | each rock a turned superellipsoid block                                                                                   |
| `rock_mass.py`    | the rocks: the frame's outline on the fitted blocks, five traced tones (hidden parts: a shading model fitted to the seen) |
| `canopy_mass.py`  | the canopies: the frame's outline on the fitted clumps                                                                    |
| `shadow_mass.py`  | the still shadows (trees, rocks, bamboo): the frame's shadow minus what the pads' own shadows explain                     |
| `ground_field.py` | the lit lime as a smooth measured field                                                                                   |
| `leaf_mass.py`    | the fallen gold leaves                                                                                                    |
| `bamboo.py`       | the bamboo stalks (feet and cut tops by hand)                                                                             |
| `arena.py`        | the rules data: `games/foomerang-fu/src/rules/hexMeadowArena.ts` (border, rocks, trunks, bamboo, spawns)                  |
| `package.py`      | `apps/console/public/maps/hex_meadow/` (model, manifest with `plants`)                                                    |

## The plants (drawn by the game: `apps/console/src/render/hexPlants.ts`, `render/three/hexPlantsView.ts`)

Measured on the HQ (1202–1215 s):

- **Shape:** flat-topped hexagonal pads (circumradius 0.675 plan units) on thin stems 2.9 tall; whitish flower dots on ~28%. Each
  pad at its own height and lean (matched pad by pad to the frame's edges: heights sd ~0.2, leans sd ~0.1), so they overlap.
- **Shadow:** each pad's hexagon on the ground, shifted (-0.75, +1.4) plan units (fitted: the shift that best lays the pads'
  footprints on the frame's shadowed lime), `#a1d07d`.
- **Pushed:** players and flying boomerangs shove the pads aside (1204.75 a player stands in its own gap; 1205.50 a boomerang's
  path opens a lane, stems tilted 40–60°). They stay bent ~1 s (the lane still open at 1206.5) and are upright within ~3 s.
- **Fire:** a fire boomerang's path, a burning player and a blast light the pads they touch (1206.25, 1207.0, 1208.5); a burning pad
  lights each touching pad 0.25–0.5 s later (the band one pad wider each side in ~0.5 s, 1207.0 → 1207.6); it blazes yellow
  `#f7e91f`, `#f2db50`, golden `#f3b625`, orange `#ef9a3a`, turns to dark smoke `#6b6e60` ~1 s in and is gone with its stem; smoke
  gone by ~1.8 s. The whole meadow burnt away by ~1215 s. Fields do not light each other across bare ground.
- **Not shown, so presentation only:** whether burning plants set players alight (the rules know nothing of the plants).

**Last measured (2026-11-06, the game at `?arena=meadow&frame=hq` vs the frame):** mean Lab difference 13.4 (median 3.0; players,
badges and names differ); pad pixels IoU 0.86, pad colour percentiles within ~5 levels; canopy L p10/50/90 153/175/197 vs the
frame's 164/178/193.
