# Character inventory — `foomerang-fu gameplay.mp4` + purchased character pack

The **pack defines the production roster**. Pack models are used directly; reconstruction work applies only to their presentation
(scale, 3D orientation, tumble, materials where needed for reference fidelity, lighting, shadows, runtime representation).

## Asset pack roster (complete — 10 models)

Source: `~/Downloads/characters-from-boomerang-fu/<name>-boomerang-fu/`, copied to `licensed/<name>/` (git-ignored). Each has a `.blend`
(+ native .blend / FBX / OBJ / STL) and 2k diffuse, normal and roughness textures. Turntables: `blender/pack_turntable.py`.

| Model      | File                                   | Object          | Dimensions (BU, unscaled) | Notes                                   |
| ---------- | -------------------------------------- | --------------- | ------------------------- | --------------------------------------- |
| avocado    | `licensed/avocado/avocado.blend`       | `Avocado`       | 2.59 × 1.61 × 3.18        | half avocado, pit face, mitten feet     |
| bacon      | `licensed/bacon/bacon.blend`           | `bacon`         | 2.60 × 0.90 × 2.84        | wavy rasher, thin                       |
| banana     | `licensed/banana/banana.blend`         | `NurbsPath.001` | 2.40 × 1.66 × 3.95        | half-peeled banana                      |
| bread      | `licensed/bread/bread.blend`           | `bread`         | 2.69 × 0.94 × 2.58        | toast slice                             |
| carrot     | `licensed/carrot/Carrot.blend`         | `carrot`        | 1.94 × 1.93 × 3.72        | carrot with leaf tuft                   |
| coffee     | `licensed/coffee/Coffee.blend`         | `coffee`        | 3.24 × 2.25 × 2.28        | mug with handle, coffee drip            |
| donut      | `licensed/donut/donut.blend`           | `donut`         | 3.33 × 1.13 × 3.42        | pink-frosted ring with sprinkles        |
| icecream   | `licensed/icecream/icecream.blend`     | `Icecream`      | 2.37 × 0.90 × 3.22        | mint ice-lolly, teal dipped base, stick |
| milk       | `licensed/milk/milk.blend`             | `milk`          | 2.36 × 1.33 × 3.12        | blue milk carton                        |
| watermelon | `licensed/watermelon/watermelon.blend` | `watermelon`    | 3.20 × 1.13 × 2.93        | watermelon wedge                        |

## Video roster and match table

Matched by colour regions, silhouette, face placement and thickness across several frames/orientations.

| Video character              | Seen (shot / ref frame)                  | Supplied asset   | Basis of match                                                                  | Status                                                             |
| ---------------------------- | ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Toast                        | S4/S5 plaza, S10 couch, S11 f983         | **bread**        | crust/crumb, slice shape, face                                                  | in plaza; heading solved; pitch/roll open                          |
| Coffee mug                   | S4/S5 plaza (dies f328), S10             | **coffee**       | white mug, brown top, handle                                                    | in plaza; heading solved (weakly constrained)                      |
| Watermelon wedge             | S4/S5 plaza, S10, S9                     | **watermelon**   | red flesh, green rind, wedge                                                    | in plaza; heading solved                                           |
| "Teal jelly" (earlier label) | S4/S5 plaza, S17 f1359                   | **icecream**     | mint dome top, darker teal dipped base, face low, thin edge-on, ~2:1 elongation | **correction**: was being hand-rebuilt; replaced by the pack model |
| Banana                       | S0, S1, S8, S12, S18, S19, S10           | **banana**       | half-peeled yellow                                                              | not started                                                        |
| Carrot                       | S2, S7, S13, S15, S16, S17               | **carrot**       | orange with green tuft                                                          | not started                                                        |
| Avocado                      | S9 f811, S17 f1359                       | **avocado**      | green rim, brown pit                                                            | not started                                                        |
| Donut                        | S13 f1115, S15 f1231                     | **donut**        | pink frosting on tan ring                                                       | not started                                                        |
| Milk carton                  | S15 f1231                                | **milk**         | blue/white carton                                                               | not started                                                        |
| Eggplant                     | S0 f16, S1, S7, S11 f983, S12, S10 couch | **none in pack** | purple body, green calyx                                                        | reference-fitted reconstruction required                           |
| Sushi roll                   | S2 f114, S16, S18 f1423, S10 couch       | **none in pack** | black nori, white rice top, red roe and green garnish                           | reference-fitted reconstruction required                           |
| Bacon                        | S14 f1150 (hex_grove)                    | **bacon**        | red wavy rasher                                                                 | in hex_grove (seat 1); size MEASURED there (0.75)                  |

Characters without a pack model (eggplant, sushi) are **reference-fitted reconstructions**, not exact source models.
