# Reconstructed maps — status and discrepancy audit

Slice 9 is **OPEN**. Nothing here is a PASS; the owner judges by playing and by reference playback. Fidelity labels: **MEASURED** (from the
footage), **REFERENCE-CONSTRAINED** (fitted to the footage or constrained by the rules), **INFERRED** (the footage never shows it /
a prior). Discrepancies: BLOCKER / MAJOR / MINOR — what differs → why → next correction. Hazards, drops and moving props are
presentation only and only block (GAMEPLAY INTERACTION: DEFERRED — REQUIRES RULE APPROVAL). Performance: PERFORMANCE.md.

All 14 maps are selectable with `?arena=<map>`, draw in the real game (rules → console → Phaser) with six CPUs and no errors
(`integration/e2e/reconstructedMaps.e2e.ts`), and their rules data pass the six-player fuzz (`games/foomerang-fu/test`).

## Build modes

- **3D reconstruction** (market_plaza): passes 1–6, frozen.
- **Proxy kit** (harbour_fort): measured primitives textured by projecting the footage; panning follow view.
- **Frame mode** (the other 12): the game camera is one reference frame's own camera; the ground is that frame with movers removed
  (window median or inpainting); tall objects are cut-outs of the frame with ground contacts; moving props are measured sheets.
  Only what that frame shows exists (framing OBSERVED). Ground hidden behind cut-outs is INFERRED walkable.

## Cameras and scale

Character scale is MEASURED per map from the footage's characters (pack models are one size), except hedge_maze (rules-constrained).

| Map           | Shot / ref | Camera f @640, pitch | Camera evidence      | Char. scale  | Moving props                          |
| ------------- | ---------- | -------------------- | -------------------- | ------------ | ------------------------------------- |
| market_plaza  | S4/S5 f233 | 900, 55              | frozen; **DISPUTED** | 1.0 (fit)    | —                                     |
| harbour_fort  | S9 pan     | 1540, 56.2           | MEASURED             | 1.1          | —                                     |
| sky_islands   | S7 f470    | 1240, 57.8           | MEDIUM               | 0.80         | croissant 75.6°/s (MEASURED)          |
| pond_garden   | S0 f16     | 1240, 57.8           | INFERRED prior       | 1.0          | —                                     |
| lakeshore     | S1 f58     | 1240, 57.8           | INFERRED prior       | 1.0          | —                                     |
| farm_plots    | S2 f114    | 1837, 55.2           | MEASURED (MEDIUM)    | 0.70         | —                                     |
| flooded_ruins | S8 f598    | 1240, 57.8           | INFERRED prior       | 1.0          | —                                     |
| hedge_maze    | S11 f958   | 1240, 57.8           | INFERRED prior       | 0.62 (rules) | —                                     |
| toaster_dock  | S12 f1055  | 1225, 63.9           | MEASURED (MEDIUM)    | 0.90         | —                                     |
| twin_log_rink | S18 f1423  | 959, 66.9            | MEASURED             | 0.75         | two logs 34.9 / −37.9°/s (MEASURED)   |
| hex_grove     | S14 f1150  | 1240, 57.8           | INFERRED prior       | 0.75         | fire spread: not reconstructed        |
| stone_ruins   | S15 f1231  | 1240, 57.8           | INFERRED prior, LOW  | 0.83         | —                                     |
| cross_pond    | S16 f1276  | 1240, 57.8           | INFERRED prior       | 0.65         | raft ~24°/s MEASURED, kept **static** |
| diamond_walls | S17 f1359  | 1240, 57.8           | INFERRED prior       | 0.65         | —                                     |

The prior (f 1240, pitch 57.8) is the median of the maps measured with confidence; on organic scenes (lawns, shorelines) the
vanishing-point scans disagree across segments, so those cameras are INFERRED. In frame mode the camera mainly sets character and
prop perspective and the world scale; the drawn map is the footage frame itself.

## Owner decisions open

1. **market_plaza camera** — frozen at f = 900 (DISPUTED; VP evidence ~1500). Revisit only with an A/B at the same checkpoints.
2. **Drops and gaps** (sky_islands, flooded_ruins, stone_ruins) — void/water only block, so islands are pockets; spawns go to the
   largest region. Falling / crossing gaps would need a rule.
3. **cross_pond raft** — rotates in the footage (MEASURED ~24°/s clockwise) and bridges the banks; a moving platform is a mechanic,
   so it is static here and the banks are partly cut off (edge strips narrower than a body).
4. **hedge_maze scale** — at the footage's character scale (0.95) the corridors cannot admit the rules' fixed player body; 0.62 makes
   them playable but draws characters ~35% smaller than the footage.
5. **Hazards** — sky_islands' croissant, twin_log_rink's logs: drawn moving, no collision. hex_grove's fire: not reconstructed.
6. **Eggplant and sushi** — no pack model; footage characters in 9 shots. Reference-fitted reconstruction not done yet.

## Discrepancies (all maps)

- MAJOR — frame-mode maps show exactly one frame: nothing outside it, and the game view does not pan as the footage camera does →
  by design (OBSERVED framing) → a wider build (proxy kit / mosaic, as harbour_fort) per map where the shot pans.
- MAJOR — INFERRED cameras on 8 maps → weak vertical evidence in those shots → a landmark-based solve (known object sizes / right
  angles) per map.
- MINOR — residues of removed movers and effects (faint trails, glows, small stubs) on several maps → median/inpaint limits → hand
  masks per map.
- MINOR — twin_log_rink: a small fixed log stub on each pivot stump; sky_islands: croissant far side is its near side's texture.
- MINOR — harbour_fort: brightness seams in the floor median, keying marks near props, roof caps flat colour (never in frame).
- Engine finding (not changed): a wall one rules-cell from the arena edge let the collision solver leave a body 0.013 units past the
  boundary; the generator now treats the boundary as solid when closing sub-body gaps.
