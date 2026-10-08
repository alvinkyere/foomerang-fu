# Reconstructed maps — status and discrepancy audit

Slice 9 is **OPEN**. Nothing here is a PASS; the owner judges by playing and by reference playback. Fidelity labels: **MEASURED** (from the
footage), **REFERENCE-CONSTRAINED** (fitted to the footage, not directly measured), **INFERRED** (the footage never shows it).
Discrepancies: BLOCKER / MAJOR / MINOR — what differs → why → next correction. Hazards and drops are presentation only and only block
(GAMEPLAY INTERACTION: DEFERRED — REQUIRES RULE APPROVAL). Performance: see PERFORMANCE.md.

| Map           | Build mode                     | Camera (f @640, pitch)                   | World scale                 | In game | Reference comparison                  |
| ------------- | ------------------------------ | ---------------------------------------- | --------------------------- | ------- | ------------------------------------- |
| market_plaza  | 3D reconstruction (passes 1–6) | 900, 55 (frozen; **DISPUTED**, VP ~1500) | plaza fit (reference)       | yes     | passes 1–6 sheets                     |
| harbour_fort  | proxy kit + panning view       | 1540, 56.2 (MEASURED)                    | characters 1.1 (MEASURED)   | yes     | `output/harbour_fort_compare.png`     |
| sky_islands   | frame mode (f470)              | 1240, 57.8 (MEDIUM)                      | carrot size 0.80 (MEASURED) | yes     | reference frame + runtime screenshots |
| 11 other maps | not started                    |                                          |                             | no      |                                       |

## harbour_fort (S9)

Framing REFERENCE-CONSTRAINED: shot height/lens/pitch, panning follow view (zoom-out rule INFERRED). Gatehouse towers MEASURED (front,
width, eave); roof caps INFERRED (never fully in frame, shaded fallback); gate depth/height REFERENCE-CONSTRAINED (image fit). North of
y 0.93 and west of x −0.27: INFERRED (class fills, repeated observed texture). Reference MAD through the shot's own camera 9.0–14.3
(includes live characters/effects, which the game draws itself).

- MAJOR — tower roof caps and the gate top are flat/shaded colour → never in frame → only better evidence (another shot of this map) fixes it.
- MINOR — faint brightness seams in the observed floor → per-frame exposure/vignette differences in the median → add a light-field
  correction as on the plaza.
- MINOR — small dark marks near some keyed pots/crates → keying tolerance → tighten per prop.
- MINOR — a faint purple patch low on the south wall's middle face (its unseen lower edge) → fallback colour → borrow texture.
- Rules: SOLID footprints + WATER; the gate passage (water through the arch) blocks.

## sky_islands (S7)

FRAME MODE from f470 (a whole-shot track was not clean: islands at several heights, void parallax, a rotating hazard). Everything shown is
the observed frame (framing OBSERVED); ground hidden behind rocks is INFERRED walkable in the rules. The croissant rotates at the MEASURED
rate (75.6°/s CCW, 4.8 s period); the disc under it is INFERRED (its own texture half a turn away).

- MAJOR — islands are separate pockets because the void only blocks; the largest connected region holds every spawn and Book →
  falling / dashing across gaps is an **owner decision** (not an approved mechanic).
- MAJOR — the eggplant in this shot has no pack model (reference-fitted reconstruction pending; CHARACTER_INVENTORY.md).
- MINOR — a short bamboo stalk was removed with the carrot cleanup; a faint trace of the pink character remains.
- MINOR — the croissant sprite is re-projected from one view; its far side as it turns is the near side's texture (INFERRED).
