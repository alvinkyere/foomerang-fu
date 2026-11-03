# The autumn glade (`autumn_glade`, `?arena=glade`)

The map of `ff physics hq 2.mp4` at 10:26 (626.0 s, the READY frame: the camera is still). `output/reference.png` is that frame
(git-ignored, never shipped). Everything else is our own geometry, measured from it.

**Run order** (from the repository root; Python = `art/audio/output/venv/bin/python`, Blender = `/Applications/Blender.app`):

    layout.py -> props.py -> [fit_trees.py] -> sand.py -> lift.py -> arena.py      (run.sh does all but the fits)
    [fit_rocks.py] [fit_logs.py] [fit_portal.py]                                                     (slow fits; their json is committed)
    Blender -b --python art/autumn_glade/blender/build.py -- <tmp> render
    package.py <tmp>/glade.glb      (then npx prettier --write the manifest, the arena .ts and the json)

`run.sh [package]` runs the cheap steps, the Blender build, the render and `compare.py`.

| Step                             | What it measures or makes                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `measure.py`                     | the camera: the plaza's rig (`art/sky_islands/camera.json`) at its reference zoom; `plan()` / `plan_at(z)` put pixels on the ground       |
| `layout.py`                      | colour masks: rocks, portals, logs (first guess), ground colour                                                                           |
| `props.py`                       | trees (trunk bases by hand), shadow patches, leaves, portals (foot, height, glow), logs lifted to their axis, corner foliage, pale stones |
| `fit_trees.py`                   | the canopies' lumps, fitted to the red and gold masks (hill-climb on the umbrella's silhouette): `lumps.json`                             |
| `fit_rocks.py`                   | each rock as two flat-topped superellipsoid blocks fitted to the rock mask: `rocks.json`                                                  |
| `fit_logs.py`                    | each log as a cylinder fitted to its body and cut end: `logs.json` (the third, pale in the shafts, keeps its measured ends)               |
| `sand.py`                        | the sand's shading: inpainted, quantised in Lab, traced as flat polygons                                                                  |
| `lift.py`                        | the light shafts' lift field (they ADD light over everything: canopy #c8645d -> #e17a5f), baked into the canopies, trunks and leaves      |
| `arena.py`                       | the rules data: `games/foomerang-fu/src/rules/autumnGladeArena.ts` (border, walls, portal pads, spawns)                                   |
| `compare.py`, `heat.py`          | render vs frame: mask IoUs, colour medians, a per-pixel Lab difference map                                                                |
| `shoot_hq.sh`, `compare_game.py` | the real game at 1920x1080 (`?arena=glade&frame=hq`) vs the render / the frame                                                            |

**Camera:** the game's camera is the HQ rig's own zoom (0.9326) with no offset: the game's shot equals the Blender render to within 1 px
at the logs and the rocks. So render-vs-frame numbers are game-vs-frame numbers.

**Last measured (2026-11-03, the render with the game's light beams vs the frame, all but the names and READY):** mean Lab
difference 5.5 (median 1.3): sand 2.1, canopies 10.4 (red canopy IoU ~0.8). The game's shot equals the emulated render (mean 1 level).
Approach: the frame's outlines for canopies, rocks, trunks, shadows and leaves (`*_mass.py`), surfaces from the fits, our own shading;
outlines smoothed and leaf-tipped so they hold up at the follow camera's zoom. Known gaps: the canopies' inner leaf pattern (only our
shading model: painting them from the frame would ship its image), the east portal's ring shape, the corners' vignette.
