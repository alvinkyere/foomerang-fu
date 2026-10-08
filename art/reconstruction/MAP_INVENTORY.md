# Map inventory — `foomerang-fu gameplay.mp4`

Source: 640×360, 30 fps, 1488 frames, 20 hard-cut shots (`analysis/shots.json`). Inspected end to end (every shot at full resolution,
contact sheets of every shot). Same-map vs distinct-map decisions use SIFT+RANSAC inlier counts between shots (noise floor ≈ 7–15
inliers; same environment ≥ 40), not appearance alone.

Non-gameplay shots (not maps): **S3** f145–200 title card "LOCAL MULTIPLAYER CHAOS" (yellow); **S6** f373–431 title card
"RIDICULOUS POWER-UPS" (pink); **S10** f821–945 couch cinematic "UP TO 6 PLAYERS" (living-room set, cast on a sofa).

| #   | Internal name   | Shots / frames                                 | Status                                     |
| --- | --------------- | ---------------------------------------------- | ------------------------------------------ |
| 1   | `pond_garden`   | S0 f0–33                                       | not started                                |
| 2   | `lakeshore`     | S1 f34–83                                      | not started                                |
| 3   | `farm_plots`    | S2 f84–144                                     | not started                                |
| 4   | `market_plaza`  | S4 f201–263, S5 f264–372                       | reconstructed; in game (camera f DISPUTED) |
| 5   | `sky_islands`   | S7 f432–545                                    | not started                                |
| 6   | `flooded_ruins` | S8 f546–650                                    | not started                                |
| 7   | `harbour_fort`  | S9 f651–820                                    | IN PROGRESS: proxy kit, in game            |
| 8   | `hedge_maze`    | S11 f946–1021                                  | not started                                |
| 9   | `toaster_dock`  | S12 f1022–1088                                 | not started                                |
| 10  | `twin_log_rink` | S13 f1089–1141, S18 f1388–1459, S19 f1460–1487 | not started                                |
| 11  | `hex_grove`     | S14 f1142–1205                                 | not started                                |
| 12  | `stone_ruins`   | S15 f1206–1257                                 | not started                                |
| 13  | `cross_pond`    | S16 f1258–1331                                 | not started                                |
| 14  | `diamond_walls` | S17 f1332–1387                                 | not started                                |

## Per-map records

### 1 `pond_garden` — S0 f0–33 (ref f16)

Light green lawn; raised purple stone path/wall running vertically with a corner plinth; two purple stone benches (one L-shaped);
red maple tree with pots at its base; bamboo clump on a small stone island; stone-rimmed pond edge top-right with a tall figure/statue.
Camera: steep top-down (~55–60°), slow drift. Effects: boomerang pale trail, sparkle impact. S0↔S1 inliers 7 (no shared geometry).

### 2 `lakeshore` — S1 f34–83 (ref f58)

Grass promontory bordered by a purple stone kerb into blue water; lily pads; red maple trees with fallen red leaves; large purple log
bench; crates; bamboo at the water's edge. Camera drifts right. Possibly another part of `pond_garden` — no overlapping geometry, so kept distinct.

### 3 `farm_plots` — S2 f84–144 (ref f114)

Lawn with a purple wooden gate/fence frame; blue water channel with two brown dirt plots (raised beds) inside; purple crates on the plots;
round purple boulders; glowing blue shield pickup at the left. Contains a slash VFX (white arc) and orange impact.

### 4 `market_plaza` — S4/S5 f201–372

Reconstructed; see README.md. Cream pavement cross, central scallop fountain, four near stalls, two far stalls, purple wall with stair
opening, bunting, pots, crates, fence rails, orange bushes, golden tree. Two takes with a hard cut at f264 (camera solved per frame).

### 5 `sky_islands` — S7 f432–545 (ref f488)

Floating grass islands on tall purple cliffs over a pale void; central round stone platform with a **rotating crescent wooden wheel**
(environment animation, also a hazard); bamboo, fences, crates. Large orange/yellow **explosion** VFX (blast power-up) with smoke.

### 6 `flooded_ruins` — S8 f546–650 (ref f598)

Grid of dark purple-grey stone floor tiles in shallow teal water, missing tiles; tilted purple blocks; mossy pillars, bamboo, pink lily
flowers; laser/beam (pink line) and white splash effects; dark, cool lighting (different palette from the warm maps).

### 7 `harbour_fort` — S9 f651–820 (ref f735)

Pale stone ground; dark castle gatehouse with red roofs, lanterns and bunting; wooden drawbridge; moat water; a red market stall with
striped awning; pots, crates. Camera pans; strongest perspective walls in the video.

### 8 `hedge_maze` — S11 f946–1021 (ref f983)

Lawn with thin purple maze walls; purple boulders; cyan crystals; orange trees at the corners; dense multi-character combat (6 players).

### 9 `toaster_dock` — S12 f1022–1088 (ref f1055)

Sand island with a **toaster shrine** (character-faced toaster on a dais with red carpet and white chairs/easels); wooden docks; purple
kerbs into blue water channels; golden trees; pots.

### 10 `twin_log_rink` — S13, S18, S19 (ref f1115, f1423, f1473)

Cream arena with a figure-eight pale-blue ice field; **two rotating wooden logs** on pivots (environment animation + hazard); purple
planter benches; pots; dashed boundary. S18 is wider/zoomed out, S19 close. Heavy VFX: dark smoke-ring explosions, fire, blasts.

### 11 `hex_grove` — S14 f1142–1205 (ref f1173)

Lawn with large teal hex-tile hedge patches; golden trees; purple blocks; **fire spreading across hex tiles** (VFX + mechanic).

### 12 `stone_ruins` — S15 f1206–1257 (ref f1231)

Pale lawn with large purple rock slabs/ruins casting long shadows; wooden logs/barrels; golden bushes; pale void/cliffs at edges.

### 13 `cross_pond` — S16 f1258–1331 (ref f1294)

Square pond with a cross-shaped wooden boardwalk; grass rim with purple stone wall; boulders; lily pads; big **fire-ring explosion**.

### 14 `diamond_walls` — S17 f1332–1387 (ref f1359)

Lawn with diagonal purple walls forming a diamond; dark purple boulders; planters; leafy trees at the edges; strong tilted camera.

## Camera behaviour (all maps)

Fixed-lens follow camera at a steep pitch (market plaza solved: f≈900 px, pitch 55–57°) with slow pans/dollies inside a shot; each shot
needs its own per-frame solve (method in README.md).
