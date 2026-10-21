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

**Explosive, applied (2026-10-19).** The owner decided the three things the video doesn't show:

- **Kill radius:** the drawn ring kills. A sample every frame along a ray from the 10:17.4 blast's centre shows the ring still
  growing as it fades: 177 px at 0.4 s, **197 px at the end**. Against the 30 px character that is ≈ 6.6 widths, ≈ **470 u**
  (±30%), so `blastRadius` is 470. The ~420 u figure in the question was read at 0.4 s, before the ring had finished.
- **An enemy touched in flight:** the boomerang explodes on them.
- **Getting it back:** a new boomerang is in hand **1.5 s** after the blast (`explosiveRespawnSeconds`).

The TV draws the sampled timeline (`apps/console/src/render/blastMotion.ts`), with t from the puff:

| t         | What it draws                                                                         |
| --------- | ------------------------------------------------------------------------------------- |
| 0–0.10    | a white puff, 0.3 R (by eye)                                                          |
| 0.10–0.20 | a yellow flash filling out to 0.63 R                                                  |
| 0.20–0.74 | the ring, its outer edge sampled: 0.84 R at 0.3 s, 0.90 at 0.4, 0.96 at 0.5, R at 0.6 |

- **The ring's colour:** yellow `#fdfd8c` until 0.43 s, then orange, then red-pink `#f3857f`, fading out from 0.6 s.
- **Its band:** about 0.1 R thick (by eye) until 0.5 s. After that it thins from the inside, per the samples.
- **Smoke:** three dark lumps near the middle from 0.3 s (positions and sizes by eye).

**Not modelled:** the boomerang's brief rest before it goes off (≈ 0.2 s at 10:17.2; a slower crawl at 5:20.6). In ours it
explodes the moment its flight ends.

**Explosive radius, corrected (2026-10-19, owner: "way too big").** The 470 u came from treating a character's drawn width as
our 72 u collision circle. On our plaza, characters are drawn ≈ 46 u wide (corrected 2026-10-21: ≈ 76 u, see "How big our
characters are drawn"): the manifest calibration is 36 u = 26 px at
1280, and the video's plaza characters are ≈ 33 px wide. Measured against the drawn characters:

- the ring at 10:17.4 is ≈ 4.7 widths of the donut standing beside it (197 px against 42 px), and 4.7 × 46 ≈ 215 u;
- the market camera is ≈ 1.27× closer than the plaza's, so 197 px ≈ 155 plaza px ≈ 215 u.

`blastRadius` is now 215 (it was 170 before the video work).

## The boomerang's flight, studied throw by throw (2026-10-20; applied)

The owner: "the trajectory makes no sense, study exactly from the video". The clip is 0:36.8–0:43.6 (`stab.py 36.8 43.6 t368`,
read on 50 px gridded crops). The pink donut and the brown mug each throw. Lengths are in the donut's width (≈ 27 px there,
≈ 46 u as our characters are drawn, ±30%; corrected 2026-10-21: ≈ 76 u). Times are exact.

1. **Out: a straight line.** The pink throw goes straight north through the banana (a kill, 37.33) and bounces off the
   top-right platform's diagonal edge to the west. The brown throw goes straight up-right, bounces off the bamboo planter,
   then off the left wall. Neither curves on the way out. The arc fitted earlier to the plaza tracks (≈ 300 u) was the turn
   home. Applied: `throwCurvature` 0.
2. **How far out:** both quick throws fly out for **≈ 0.9 s** (pink 36.93 → 37.87, brown 36.87 → ~37.8) before turning, at
   the quick-throw speed already measured on the plaza (900 u/s). Applied: `throwRange` 810 (was 520).
3. **The turn home: a tight hook.** The pink one reverses within ≈ 0.2 s (37.87–38.07), a radius of ≈ 60–75 px of path at
   ≈ 760 px/s. Scaled to our 1,000 u/s return, that's ≈ 70 u. Applied: `returnTurnRadius` 70 (was 150). It then homes on the
   thrower on a gentle curve, killing the eggplant on the way (38.13, DOUBLE KILL).
4. **Something in the way home knocks it down.** The pink one hits the L block at 39.13, reflects west, keeps nearly its
   speed for ~0.4 s, slows, and lies still by ~40.2: ≈ 410 px in ≈ 1.1 s. One constant friction fits: d = v₀T/2 gives v₀ ≈
   745 px/s, its flight speed. Then it **lies there** until called at ~42.6, 2.4 s later.
   - Applied: a homeward impact bounces it off and drops it (GROUNDED, sliding the way it bounced); it doesn't follow walls
     home any more.
   - Friction: `groundFriction` = returnSpeed / 1.1 s ≈ 900 u/s² (was 2,500).
   - Out of bounces on the way out (the owner: "bounces against a lot of objects"), the next impact knocks it down the same
     way.
5. **Calling it home** (the tutorial, 0:17.6–0:19.2). The banana walks toward its boomerang until ~18.4, then **stands still,
   facing the camera, both hands out to the sides** (18.53–18.93). The boomerang lifts at 18.70 and flies home.
   - Applied: `recallDelaySeconds` 0.2 (stood at ~18.5, lifted at 18.7).
   - A caller holding THROW stands still. The video shows the banana standing; this is the closest rule.
   - The boomerang's aura: a pale cyan-white ring ≈ 1.5 boomerang lengths across, flashing (lit 17.90–18.13, dark
     18.20–18.27, lit 18.33–18.60): `render/callAura.ts`, lit 0.3 s and dark 0.15 s. It leaves a ripple on the water as it
     lifts.
   - The hands' aura is too small to see at 640 × 360. It follows the owner ("the same aura is on the hand"), using the
     boomerang's ring.

**Not reproduced:**

- **The pose itself.** Every licensed character is one static mesh, with no armature and no separate hands, so an arms-out
  pose needs new modelling and rigging, then a re-bake of the sprites. For now the caller faces the camera and stands still,
  with the hand auras at its sides.
- **The 0.4 s at near flight speed before the slide slows.** One constant friction is applied instead.

## The power Book and its badge (2026-10-20; applied)

**The Book on the ground** (4:10.4, 10:15.0): a bright cyan book standing on end, glowing, with a white "?" on its cover and a
red gem on its top. It is about half a character wide and nearly a character tall (8 × 23 px against a 17 × 27 px character at
4:10). Drawn on the plaza at 23 × 52 u, with a faint cyan glow on the ground.

**Taking it** (4:11.0–4:12.9, 10:15.0):

- A bar in the power's colour shows the power's name in white bold capitals: EXPLOSIVE BOOMERANG on red (sampled ≈ `#cf2427`),
  SHIELD on blue (≈ `#6397e9`).
- Above the bar, a disc of the same colour carries the power's white icon: a burst for Explosive, a shield for Shield.
- It stays over the player's head for ≈ 1.9 s (detected 4:11.24–4:12.91, and visible from 4:11.0), and shards in the power's
  colour burst round them.
- Applied: `render/powerBadge.ts` and `render/three/pickupBadges.ts`.

**Not from the video yet, flagged:**

- **The font.** The lettering is a heavy rounded sans; the exact face can't be identified at 640 × 360, and none is bundled.
  The system's rounded font is used (`ui-rounded`, i.e. SF Pro Rounded on a Mac).
- **Caffeinated's and Twin's badge colours and icons.** The video hasn't been studied for them yet; they keep their old colours.

## A round's start (2026-10-20; applied)

Read at 0.1 s steps (and every frame for the donut's landing) at 0:30.6–0:34.8, timed from the iris opening at 30.96:

| t from the iris          | What happens                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 0.82 s                   | the first character lands (the banana)                                                                                         |
| ~0.32 s apart after that | the others land (31.78, 32.03, ~32.4, 32.73), each after ≈ 0.45 s in the air turning two somersaults (the donut: 31.57 → 32.0) |
| on each landing          | a crouch, and a white ring spreading from its feet and fading over ≈ 0.4 s                                                     |
| 1.84–2.74 s              | READY                                                                                                                          |
| 2.84 s                   | GO, shown ≈ 0.6 s; play starts                                                                                                 |

**Applied:**

- `roundIntroSeconds` 2.84 in the console: nobody moves or acts before GO, and the round clock waits. The rules emit GO.
- `render/roundIntro.ts`: the timeline above.
- On the plaza, each character in seat order is hidden until its jump, then somersaults, crouches and shows the ring.
- READY and GO are shown in the banner.
- `?intro=off` turns it off for development.

**Read by eye:**

- the jump's height (1.2 body heights) and the crouch (0.78, 0.12 s);
- the landing order (the video's matches seat order as far as can be told).

**Not reproduced:** the iris (the circular reveal at 30.96–31.4).

## The powers in the video (2026-10-20 survey)

Every power the video shows, found from its badges (frames every 1.5 s, then zoomed): MULTI BOOMERANG (4:04.6, 6:43, 10:40),
EXPLOSIVE BOOMERANG (4:11, 10:58), CAFFEINATED (3:47.4, 6:30, 12:27), BATTLE ROYALE (4:37.7, 11:09), DISGUISE (5:00.1, 10:25),
EXTRA BOOMERANG (5:52, 7:16.6, 11:31), ICE BOOMERANG (5:57.1), FIRE BOOMERANG (6:51, 9:57), SHIELD (8:51, 10:15), TELEKINESIS
(9:09.1), TELEPORT BOOMERANG (9:15.1). **Not in the video:** Bamboozled, Decoy, Dash Through Walls.

Badge bar colours, sampled on the bar beside the lettering: MULTI `#d4c227`, CAFFEINATED `#5acb86`, FIRE `#e29854`,
BATTLE ROYALE `#433065`, DISGUISE `#7470d8`, EXTRA `#9d9a9b`, ICE `#92d8fd`, TELEKINESIS `#c349d7`, TELEPORT `#d73576`
(Explosive `#cf2427` and Shield `#6397e9` as before).

## Extra boomerang (2026-10-20; applied)

7:16.6 the eggplant takes it; 7:18.95 it throws one, and 7:19.15, the first still out, a second. One press throws one boomerang;
the second can go while the first is away. (The old simultaneous ±13° pair is not in the video and is gone.)

## Multi boomerang (2026-10-20; applied)

- **One boomerang leaves the hand.** 10:41.9 the eggplant's throws leave singly.
- **It splits where its flight out ends, or on an enemy.** 5:51.61 the coffee's boomerang flies out alone; 5:51.71 it has burst
  into a star of **six**, 44° ± 5° apart (≈ 220° across, fanned about its heading; read on a 3× crop at 5:51.78–5:51.98).
  6:50.6 the eggplant's (ice) throw bursts into five or six about 40° apart. 10:43.4 another, with fire trails.
- The pieces fly out at about throw speed and curl home; they carry the throw's other powers (ice trails 6:50.7, fire 10:43.5).
- Applied: `games/foomerang-fu/src/rules/multi.ts` (6 pieces, 44°). **Not shown, chosen:** the thrower's own boomerang is out of
  play while its pieces fly and is back in hand once the last is caught or gone (the video shows one in hand again by the next
  throw, not how).

## Ice boomerang (2026-10-20)

- 6:54.55 the eggplant, hit (its shield popped at 6:54.52), is **encased in a pale-cyan ice block** standing where it was, still,
  eyes shut; 6:56.38 the block **shatters** into pale shards that lie on the ground, and it dashes off. **Frozen 1.83 s.** An ice
  hit freezes; it does not kill.
- 6:02.5 an ice throw leaves a **cyan trail on the ground** that is still there 3+ s later.
- Applied: `games/foomerang-fu/src/rules/ice.ts` (1.83 s; a shield pops with it), the block `apps/console/src/render/iceLook.ts`
  (block ≈ #cffbfc, ≈ 1.75 body widths × 2.05 body heights; the body blue ≈ #70c6f6; shards on THAWED). **Not shown:** whether a
  frozen player is killed by a hit (taken as: yes, like anyone); whether a second ice hit lengthens it (taken as: no); whether the
  ground trail does anything (drawn only). (6:21 "ice block" on a raft is a power Book spawning, not ice.)

## The boomerang's flight, checked against the video (2026-10-20; nothing changed)

The owner asked for the trajectory to be checked. Tracked frame by frame: the pink throw at 0:36.9–39.7 (stabilised), and every
pink boomerang on the plaza at 1:56–2:28.5 (registered, so in exact world units).

- **The shape matches.** Straight out for ≈ 0.94 s; bounces off what it meets; a tight hook (≈ 90° in 0.1 s, ≈ 15 rad/s, against
  our 14.3); then a curve home, killing on the way (the DOUBLE KILL at 38.13).
- **The speeds match.** On the plaza: charged ≈ 2,200–2,500 u/s (ours 2,450), quick ≈ 800–1,200 (ours 900), home ≈ 740–1,220
  (ours 1,000).
- The 0:37 clip's return looks slower (≈ 0.45× its way out), but that footage has a moving camera and no exact scale; the plaza's
  registered numbers are used.
- **New evidence (not applied):** a charged throw slows after a bounce and passing through foliage (2:23.4: 2,293 → 1,925 →
  1,126 u/s). The open question about it stays open until more throws are measured.

## The boomerang's look (2026-10-20; applied in `apps/console/src/render/boomerangLook.ts`)

- **At rest** (the pink one lying at 0:40.2–42.6): a flat V, arms opening at ≈ 105° and ≈ 0.35 of its span thick, ≈ 22 u tip to
  tip (13 × 9 px against the 27 px donut), solid in its thrower's colour with a lighter rim. Ours was a curved crescent with a
  darker rim, drawn ≈ 44 u long (from its collision radius): twice the size.
- **In flight** (0:36.9–37.1): it spins too fast to see: a pale disc ≈ 21 u across (12.5 px) with a rim and a dot in its
  thrower's colour.
- **Its trail** follows every throw, quick or charged (the pink and the brown at 0:36.9 are both quick): a band ≈ 0.8 of the disc
  wide and the same width all along, part see-through, fading evenly. Read at three points of the pink one, it is gone 0.65–0.95
  s after the boomerang passed: 0.85 s is used. Ours was only behind a charged throw, narrowed to a point, and lasted 0.3 s.

## The calling aura, frame by frame (2026-10-20; applied in `apps/console/src/render/callAura.ts`)

The owner: the aura on the boomerang and the hands while calling it home must be exactly the video's. Read on every frame of the
tutorial's PULL BACK (0:17.80–18.90), centred on the boomerang and enlarged.

| frames        | the ring round the boomerang                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------ |
| 17.90–17.93   | fades in over two frames, a little larger at first                                               |
| 17.97–18.13   | lit: a thin pale cyan-white outline, ≈ 19 px across against the boomerang's 13 px (1.5 lengths)  |
| 18.17–18.30   | gone, from one frame to the next                                                                 |
| 18.33–18.37   | fades in again, a little larger at first                                                         |
| 18.40–18.90   | lit without a break (past half a second), through the lift and round the boomerang flying home   |
| 18.67–≈ 18.92 | as it lifts, the ring it lay in stays where it was and comes apart (white arcs), gone by ≈ 18.92 |

- **It does not flash.** The earlier reading (lit 0.3 s, dark 0.15 s, over and over) took the gap at 18.17–18.30 for a flash; the
  second lit stretch lasts over 0.5 s. The ring is there while THROW is held for the boomerang (the rules' recall), and the gap is
  where the hold was let go. Applied: lit while called, fading in over 2 frames from 1.12× its size; the ring left behind on the
  lift spreads to 1.3× and fades out over 0.25 s.
- **The hands:** at 640 × 360 the banana's hands show only as small yellow dots; no ring can be seen on them. The owner's rule
  stands (the same aura on the hands), so they now follow the boomerang's: lit while calling, fading in the same way, no flash.

## Fire boomerang (2026-10-20; applied)

- 9:55.8 the eggplant, hit, **catches fire**; it runs on, burning, ≈ 1.7 s, leaving fire on the ground; by 9:57.9 it lies
  charred and still: **the burn kills ≈ 2.1 s after the hit** (`rules/fire.ts`, credited to the thrower).
- Fire on the ground (a flying fire boomerang's path, and a burning player's): yellow (#f2c312–#fff241), **gone ≈ 1.6 s** after
  it is laid (pixel count 9:57.6–9:59.4). Drawn: `apps/console/src/render/three/groundMarks.ts`.
- On foliage (11:56–12:02, a hedge map) the fire spreads through the plants, and an explosive's ring leaves a ring of fire
  (11:59.7): arena features, not modelled.
- **Not shown:** whether ground fire sets anyone else alight (it is drawn, not a rule); whether a shield stops it (taken as: like
  any lethal contact).

## Battle Royale (2026-10-20; applied)

- 4:37.6 the banana takes it: a pink glow appears at the arena's edge; 0.9 s later the dashed border appears and **closes in on
  the middle**, every side (measured against the cross platform's plank width w: 7.6 w across at 4:37.7, 5.2 at 4:40.4, 4.6 at 4:41.8, 4.0 at
  4:43.2, 3.0 at 4:44.6, 2.55 at 4:46.0: ≈ 0.6 w/s across). With w ≈ 5.3 character widths and ours drawn ≈ 76 u wide: **≈ 121 u/s a
  side (±40%)** (`rules/battleRoyale.ts`). A player left outside explodes (4:46.4): our out-of-bounds rule, unchanged.
- It is **not kept**: nobody shows its skull at a later round's start (11:52.5). Taken again at 10:02.2 and 11:09.
- **Not shown:** where it stops (both rounds end first). **The owner's rule (2026-10-21):** it never closes completely: it stops at a
  box 6 character widths (456 u) square, centred on ground people can stand on — the nearest to the middle of the boxes that are
  at least 80% free floor (`finalBox`); on our plaza, beside the fountain (centre ≈ 1417, 722), not on it. A second one while it
  closes changes nothing.

## Caffeinated (2026-10-20)

- The badge (3:48.1, 6:30, 12:26): green #5acb86, two arrowheads. Applied.
- **Its speed is not measurable here:** the banana (3:49–3:53) is hidden in foliage and its own trail most of the time; the donut
  (12:26–12:29, stabilised) reads ≈ 5 widths/s, slower than an ordinary walk, so the reading is broken. The multipliers stay
  (1.4 walk, 1.3 dash), **flagged**.

## Not in the video, or not readable (flagged; not built)

- **Teleport Boomerang:** taken at 9:15 (the eggplant), but never seen used (no jump of the eggplant 9:15–9:46).
- **Telekinesis:** taken at 9:09 (the eggplant); its throw at 9:11.4 bends, but what moves it (the stick) cannot be seen.
- **Disguise:** taken at 5:00.0 (the banana) and held at 11:52; no disguise is seen (5:00–5:08 the banana stays a banana).
- **Bamboozled, Decoy, Dash Through Walls:** not in the video at all.

## The power effects, frame by frame (2026-10-21; applied)

Every effect re-read every frame at 2–8× and written down as a timeline the TV plays (pure modules under
`apps/console/src/render/`, each with its tests). W = a character's width.

- **Taking a power** (`pickupMotion.ts`, 4:03.98 the Multi take): the badge fades in over 0.03–0.10 s and out over its last
  0.1 s (2.07 s in all; it never grows or moves); at the Book a white flash (0.35 W) with ~14 streaks in the power's colour
  (0.03–0.08 s), which become capsules of confetti flying out to 1.0–1.6 W (to 0.17 s) and lying, shrinking, until 0.45 s; the
  Book shrinks away over 0.15 s. (The confetti is the power's colour: yellow for Multi, red for Explosive at 4:10.9.)
- **Ice** (`iceMotion.ts`): the hit turns the body dark blue at once; the block grows from round the body to full by 0.15 s while
  the body brightens to ice-blue (6:54.53–6:54.68). The break (6:56.38): the blue lifts in 0.1 s, a white frost puff
  (0.7 → 1.1 W, 0.17 s), pale chunks lying in the block's footprint until 0.44 s, gone by 0.84 s.
- **Ice on the ground** (`groundMarkMotion.ts`): a solid bright-cyan band (#5fd6f4) ≈ 0.3 W wide right under the boomerang's path
  (6:02.45), solid for ≈ 3 s, then breaking up into pale patches that shrink away, gone by ≈ 4.3 s (±0.5 s: the camera moves).
- **Fire on the ground**: sparks swell into overlapping yellow puffs (0.3 W, a band ≈ 0.5 W wide) in 0.1 s, burn yellow to
  0.9 s, orange to 1.3 s, then red or dark smoke, gone by 1.7 s (10:00.16–10:03.0).
- **Burning** (`fireMotion.ts`, 9:55.9–9:57.6): the body keeps its colours; a column of ~6 fire balls climbs it (0.38 → 0.18 W,
  yellow → orange, each every 0.3 s). **Dying of it** (9:57.62–9:58.3): the body falls whole onto its side in 0.15 s (not cut in
  two), its flames go out in 0.15 s, four dark smoke balls rise off it and are gone by 0.55 s.
- **Shield** (`shieldLook.ts`): a clear bubble ≈ 1.85 W across, half a body up, pale cyan-white rim, pink-lilac on its right with a
  thin magenta line, a white highlight top left (6:54.38). The pop: gone in a frame, ~10 pink fragments fly 0.6 W in 0.1 s
  (8:54.19–8:54.25).
- **Multi split** (5:51.61, 8×): one frame of a pink-red disc (#e7928f, pale heart) ≈ 0.7 W across, then the pieces leave a small
  white puff.
- **Battle Royale** (4:36.98–4:39.0): the glow fades in over 0.05–0.2 s at the arena's edge (it tints what it lies on: pink over
  water, warm yellow over grass); the border **holds 0.9 s** (`BATTLE_ROYALE_HOLD`, in the rules), then the black dashed line
  appears and closes in with the glow.
- **Caffeinated** shows nothing on the body (3:47–3:53, 12:26–12:29): only its badge.
- **Not reproduced:** the frozen and the burning characters' faces (eyes shut, a grimace): our characters are single baked sprites.

## How big our characters are drawn (2026-10-21; a correction)

Measured in the running game (1600 px): the bread's ring (2 × the 36 u radius = 72 u) is 51 px across and its body 54 px wide
and 49 px tall; the ice cream's ring 52 px and its body 55 px tall. **Characters are drawn ≈ 70–76 u tall and ≈ 76 u wide.**
Against the plaza fountain they are the video's size (the donut 45 px against the fountain's 230 px in the video, 0.20; the
bread 48 px against its 215 px in ours, 0.22).

The "≈ 46 u wide" used above (the explosive's radius, the flight study's yardstick) came from a pixel calibration that does not
hold; lengths derived from it are ≈ 1.6× too small. Corrected: the boomerang (below) and the hit body (`hitRadius`
36, was 23; the CPUs re-tuned to keep the video's round lengths). Flagged to the owner: `blastRadius` (≈ 4.7 donut widths would be ≈ 357 u,
not 215; the owner judged 470 "way too big" by eye).

## The boomerang, held, flying and charged (2026-10-21; applied)

From the store's full-HD screenshots (reference only, not in the repo) and the video:

- **Shape** (the yellow one lying at ss05; `render/boomerangShape.ts`): a fat "<", two thick arms (≈ 0.4 of its length) meeting
  at a smoothly rounded elbow, opening ≈ 90°, rounded tips, a real thickness. **Size**: half a character's height, ≈ 36 u (the
  video's flying blur is 0.46 of the donut's width). Ours was a flat 22 u V: the "tiny disc".
- **Held**: every character holds it in one of its two small rounded-cube hands (ss00, ss01, ss06): by one arm, on edge, in its
  right hand (screen-left facing us), pointing out from the body, the elbow at the far end. So the hands are now drawn by the
  game (the bodies re-baked without them: `bake_chars.py` FOO_NO_HANDS, `package_bodies.py`).
- **Flying**: its shape spinning (the video's 30 fps shows the spin as a blur; two fading copies trail the turn).
- **Charging** (the donut, 2:00.60–2:01.47, frame by frame; `render/aimLook.ts`): an arrowhead in the thrower's colour lies on
  the ground ahead of it, pointing where it aims, ≈ half a body width across; it starts at the body and slides out as the charge
  builds, fast then slower, still from ≈ 0.64 s (a full charge: our 0.6 s, until now unmeasured), ≈ 1.4 body widths out. The
  boomerang is drawn back behind the body the whole time; a soft glow in its colour builds round it (the banana, ss11).

## Walking, slashing, calling and dashing (2026-10-21; applied)

- **Walking** (`render/walkMotion.ts`; the banana at 0:17.53–17.83, the full-HD shots of the ice cream and the bread): a step every
  ≈ 0.24 s with a small hop, the body rocking ≈ ±8° to one side then the other and leaning ≈ 12° into its move, the hands swinging
  in turn. The 640 × 360 footage is too small for more than that (a character is ≈ 30 px tall): read by eye, flagged.
- **The slash** (`render/slashMotion.ts`; the mug at 0:39.93–40.30, frame by frame): the boomerang hand sweeps from its side across
  the front to the other side during the swing (≈ 0.12 s, the rules' active time); a white crescent sweeps round the front at its
  feet with it (≈ a half circle, ≈ a body width out), gone as the swing ends; the hand holds out there, then comes back. Not done:
  the angry face the mug shows as it strikes (39.90–39.97; the pack has no such face yet).
- **Calling it home**: two concentric white rings on each hand, ≈ 3 and ≈ 5.4 hand widths across, facing the camera (the burger
  at ss02); lit as the boomerang's ring is (`render/callAura.ts`).
- **The trail**: a light band, strongest down its middle and soft at its edges, a little paler than the thrower's colour (ss00,
  ss11).
- **Dashing** (`render/three/dashTrail.ts`; ss06, ss01): overlapping see-through squares in a light shade of its colour, turned
  ≈ 45° and a little unevenly, ≈ 0.6 of its body across, along the way it dashed, fading over ≈ 0.3 s.

## The camera (2026-10-21; applied in `apps/console/src/render/cameraFraming.ts`)

The plaza stretch (1:56–2:28.5) is registered to our map frame by frame (`track1.py`), so the video camera's view of the map is
exact: its zoom and centre every frame.

- **It frames the living players.** With them spread out it shows the whole plaza, its view 1,250–1,500 map px wide (ours shows
  1,280); its centre drifts with them, ± ≈ 150 px. As players die and the last ones draw together it closes in: 985 px at its
  narrowest (2:28, and 2:38.5–2:39.25 on the last two), ≈ 1.3× closer than the whole plaza. No cuts, no slow motion: the iris
  then closes on the winner.
- **It eases**: a change settles in about a second.
- **Applied**: every living player kept in view with room round them (≈ a quarter of the screen's width on each side; two
  players ≈ 400 px apart give the closest view), between the whole plaza and 1.3× closer, eased with a 0.35 s time constant;
  drawn as a crop of the resting view (a 2D zoom and pan, as the footage's), so the plaza's perspective never changes.
- **Not reproduced**: views wider than our plaza (the video sometimes shows ≈ 15% more round its edges, beyond the art we
  have).
