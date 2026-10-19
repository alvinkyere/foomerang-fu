# The reference video's physics, measured

What `foomerang - fu physics.mp4` (repo root, 13:45, 640×360, 30 fps; original Boomerang Fu footage) shows about movement and
throwing, in **our world units** (the rules' units: a player's radius is 36). The owner asked for our physics to be "exactly like
this" (2026-10-19); these numbers are the evidence for the tuning, measured before anything was changed.

## Method

The video's plaza (1:56–2:28) is the map our `market_plaza` was rebuilt from (environ2), so its pixels convert exactly to our
world units:

1. `track1.py` registers every plaza frame to environ2 (ORB features + RANSAC homography, 150+ inliers on every frame; the video's
   camera pans and zooms) and builds a median background of the registered frames (it removes everything that moves).
2. `track2.py` finds what moves: pixels outside the background's range over a 7×7 neighbourhood (so 1–2 px of registration jitter
   on edges is ignored), as blobs.
3. `world.py` converts environ2 pixels to world units through the solved map camera, exactly as
   `apps/console/src/render/reconstructed/mapCamera.ts` projects (round trip exact; the fountain's centre lands on the image's
   mirror axis).
4. `track3.py` + `link.py` link blobs into tracks; `speed.py` measures walking; `boom.py` finds small fast blobs (boomerangs).
5. Throws and dashes were read frame by frame on gridded registered crops (`wide.py`). `stab.py` stabilises any other stretch of
   the video to its first frame (used for the tutorial throw at 0:21, where the only yardstick is a character's size).

Run from the repo root with the OpenCV venv (`opencv-python-headless` 4.11); outputs go to `output/` (ignored).

## Results

| What                    | Reference                                                                                                                                            | Ours (`DEFAULT_FU_CONFIG`)                       | How sure                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| Walking speed           | **about 360 u/s** (straight half-second runs: median 334, p25–p75 305–370; per-track tops cluster 340–400)                                           | 420                                              | good: 42 player tracks                                                     |
| Dash                    | 1,000–1,300 u/s for about 4 frames, then easing over 2–3 frames; about 165 u in about 0.2 s (plaza frames 379–386)                                   | 1,100 u/s × 0.16 s = 176 u                       | fair: one clean dash; matches ours within noise                            |
| Quick (uncharged) throw | about 740–1,090 u/s in the plaza; flies a **wide curve** and swings round the thrower before the catch (tutorial, 0:21–0:22.6)                       | 900 out, 1,000 back; straight out, straight home | speed fair; the curve is clear by eye, its radius only rough (about 220 u) |
| Charged throw           | **about 2,450 u/s**, dead straight (still straight 500+ u out, 0.17 s after release), pink trail, **ricochets** off obstacles (plaza frames 821–835) | no charge                                        | speed good (one clear throw); the ricochet is clear by eye                 |
| Return                  | the quick throw comes home fast (about 1,300 u/s at the start of the return, easing to about 560 as it curls round the thrower)                      | 1,000, straight                                  | low: tutorial footage, character-size yardstick (±30%)                     |

**The curve, re-measured (2026-10-19, for the curved-flight step).** Circle fits to the ten plaza boomerang tracks (`boom.py`'s
tracks; 6–10 points each, so noisy) give radii from 140 to 460 u, centred around 270–390: **about 300 u (± 100)**. Seven of the
ten turn clockwise on screen, as does the tutorial throw at 0:21 (out to the right, curving down and round); the anticlockwise ones
are most likely boomerangs on their way home. Used: curvature 1/300, clockwise.

Not measured (the footage does not show it clearly enough): how long a full charge takes, and the quick throw's exact range.

## What this suggests (not yet applied)

- Walking: 420 → about **360** u/s.
- Dash: keep (it already matches).
- Quick throw: keep its speeds; add the **curve** on the way out and the swing round the thrower on the way home.
- Charged throw: new. Holding the throw charges it; a full charge flies straight at about **2,450** u/s with the pink trail and
  ricochets (both in the owner's brief, 2026-10-19).
