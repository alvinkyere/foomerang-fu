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

## Deaths (2026-10-19; applied in `apps/console/src/render/deathMotion.ts`)

**The donut, 1:03** (`stab.py` → `donut`, then `halves.py`; yardstick: the donut's own width before the hit, 49 px = 1 W):

- It is cut into the pink frosting half and the dough half. Neither flies: both stay on the ground.
- The pink (far) half slides from (2.61, 1.66) W to (0.70, 3.49) W, about 2.6 W, over about 2.3 s, slowing down. It is still
  creeping (~0.3 W/s) at the end of the clip.
  - Between 1.13 and 1.6 s it speeds up again (~2.6 W/s, against ~1.2 W/s before). A second character walks through at that
    moment, so this may be a push, not part of the death. **The owner confirmed it is a push; not modelled.**
  - Applied: one constant deceleration, 2.6 W in 2.3 s (μ = 2d/T² ≈ 0.98 W/s²).
- The dough (near) half stays about where it died. Its exact drift is unmeasured, because the tan mask mixes with the paving;
  by eye it is ≲ 0.2 W. Applied: 0.2 W.
- The pink half turns as it slides, by eye about a quarter turn. **Read by eye.**
- Pink bits: up to 14 pieces, out to ~70 px (≈ 1.4 W), still visible at 1.27 s, a few at 1.4 s, none at 1.6 s. Applied: 12
  bits out to 1.4 W, gone by 1.6 s.
  - The 0.3 s burst-out time is **by eye**: they are already spread at frame 6 (~0.2 s).

**The mug, 2:21** (`puddle.py`, registered plaza footage, so world units; hit at frame 718):

- A splash of r ≈ 9 u at 0–0.1 s, then ≈ 21–28 u from 0.2 to 1.2 s.
- The puddle then grows almost linearly to its full size (an equivalent radius of 50 u, about 121 × 104 u) between 1.2 and
  1.9 s, and stays.
- Coffee droplets: 6–14 of them, starting ~35 u out and drifting outward slowly (median 35→60 u, max 45→127 u over 1.3 s,
  ≲ 70 u/s), absorbed by ~1.6 s. Applied: 12, speeds 0–70 u/s.
- Shards: 3–5 grey ceramic pieces resting 40–60 u out (low confidence: faint on the paving). Applied: 4.

**Owner decisions (2026-10-19):**

- The pink half's second speed-up (1.13–1.6 s) is a push from the passing character, not part of the death, so it stays
  out.
- The milk carton is liquid too. Cut in two like the donut, it also spills milk with the mug's splash, droplets and puddle
  (milk white `#f6f4ee`). Not seen in the video.

**Still not from the video, flagged for the owner:**

- the shards' 0.3 s settle time and their size;
- the droplets' size;
- each half's exact turn.

## The dropped boomerang and the charge (2026-10-19)

**Pull back (applied).** In the tutorial at 0:16.9–0:19.4, the banana's yellow boomerang lies in the river and the prompt reads
"PULL BACK". `stab.py 17.6 19.4 pull`, then yellow blobs tracked per frame. The yardstick is the banana's body width, 24 px = 72 u
(one player diameter, ±30%).

- The boomerang lies still until 18.70 s.
- It then leaves from rest and flies straight to the banana: about 178 px (≈ 530 u) in about 0.45 s, caught at about 19.17 s.
- Its speed rises steadily: ~240 px/s at 18.85, ~350 px/s at 19.0, ~600 px/s just before the catch. A constant acceleration
  of ≈ 1,490 px/s² (≈ 4,500 u/s²) fits the whole path.
- No speed cap is reached: it is still speeding up at ≈ 1,800 u/s when caught.
- Applied: `recallAcceleration` 4,500 u/s². `recallSpeed` is 1,800 u/s, the fastest seen; the video shows no cap.
- The ring that appears at 17.9 s stays in the water after the boomerang has gone, so it is a ripple or marker, not the
  boomerang shaking. The video shows no shake; the shake and the phone buzz are the owner's spec.

**Not measurable, still proposals:**

- **`recallDelaySeconds` (0.25 s).** The video can't show when the button was first held. The boomerang lay still for ≥ 1.1 s
  while the prompt was up.
- **`groundFriction` (2,500 u/s²).** There is one candidate, plaza frames 750–790: a pink boomerang lands at the pink
  character's feet and slides ~150–200 u to rest in ~1.2 s. That would mean μ ≈ 250 u/s² from ~280 u/s. But its pale colour
  makes the centroid jump, and it isn't clear how it fell (it may be a second boomerang). Too weak to apply: **flagged.**
- **`fullChargeSeconds` (0.6 s).** The plaza's charged throw (frames 760–819) shows the character raising the boomerang by
  ~frame 770 and holding it until the release at 819, ~1.6–2.0 s, with no visible charge meter. A full charge therefore takes
  at most ~2 s; the true time isn't shown.
- **The ricochet count (3).** Only single bounces are seen: unverified.

**The charged throw's range (checked; consistent).** Plaza frames 822–846 (`wide.py`; positions read on gridded crops, converted by
`world.py`):

- The throw goes dead straight from the thrower to the fountain's rim (~595 u, at ≈ 2,490 u/s), bounces once, and crosses the
  orange tree.
- It reaches the bottom of the plaza and turns home on a curve at about frame 840, after **≈ 1,030 u of path**, bounce included.
- `chargedThrowRange` 1,000 u is within reading error, so it stays.
- **Flagged:** after the bounce (and through the tree) it is visibly slower, ≈ 1,000–1,700 u/s against 2,490 before. Ours keeps
  full speed through a bounce. One throw can't say whether the bounce or the foliage slows it.

## Explosive boomerang (2026-10-19; not yet applied)

Two armed throws, both charged (pink trails), read at 0.1 s on 2× crops: 5:20.0–5:21.9 (a floating-islands map) and
10:16.3–10:18.2 (a market map with planters). The 4:09 "explosion" is a **Shield** bubble popping round the banana, not a blast.

- **It bounces off walls without exploding.** It ricochets 3 times off the planters at 10:16.3–10:16.8. At 5:20.1–5:20.5 it
  zigzags off the rocks at least 3 times, possibly 4. Ours explodes at the first wall impact, so that **contradicts the
  video**.
- **It explodes where its flight ends.** It slows, comes to rest for a moment (10:17.2–17.3; at 5:20.6–5:21.1 it crawls ~0.5 s
  first), then explodes on the spot instead of coming home. Ours doesn't explode at the range end, which also **contradicts the
  video**.
- **The blast, frame by frame** (t = 0 at the first puff):

  | t       | What shows                                                         |
  | ------- | ------------------------------------------------------------------ |
  | 0       | a white puff                                                       |
  | 0.1     | a yellow flash                                                     |
  | 0.2–0.4 | a thick yellow ring grows to its full size                         |
  | 0.4–0.6 | the ring turns orange, then red-pink, while dark smoke balls drift |
  | 0.7–0.8 | it fades; gone by 0.8 s                                            |

  The ring is drawn in perspective, so it looks about 12% shorter top to bottom than side to side.

- **The ring's size:** a radius of ≈ 175 px at 1280-wide in both blasts, ≈ 5.8 widths of the banana standing nearby (30 px).
  At our 72 u per character width that is **≈ 420 u (±30%)**. Ours is `blastRadius` 170.
- **Not shown (owner's call):**
  - whether the kill radius equals the drawn ring (nobody stood inside one);
  - what an armed boomerang does when it meets an enemy in flight;
  - when the thrower gets the boomerang back. At 10:19.05 the donut throws again, ≈ 1.7 s after its blast, so it is back in
    ≤ 1.7 s; the video doesn't show how.

**Ricochets, seen again:** both throws bounce at least 3 times, so `maxRicochets` 3 is the least the video allows. It may be 4
or more.
