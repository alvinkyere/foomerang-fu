# Visual reference: `foomerang-fu gameplay.mp4` (the master production reference)

Two references, two jobs (the hierarchy the project owner set for the Master Gameplay Fidelity Pass):

* ~~`Garden Map - Fu.jpeg`~~: the Garden arena and its reference image were **removed** on 2026-10-15 at the owner's request.
* **`foomerang-fu gameplay.mp4`** is authoritative for **how Foomerang Fu looks, moves and presents itself**: camera feel, character construction and animation, effects, lighting, shadows, materials, depth, pacing, and the restraint of the interface. The video's own arenas do **not** replace Garden. *Garden image → where things are. Gameplay video → how the game looks, moves and presents itself.*

## 1. The file

| | |
| --- | --- |
| File | `foomerang-fu gameplay.mp4` in the repository root (not modified; **untracked** in git; SHA-256 `a442030035bca1aae5e5a57b7465f7f01f2395d6ec0d1d86f30a80e8f76a1947`) |
| Container / codecs | MP4; H.264 (yuv420p) video, AAC audio |
| Resolution | **640 × 360** (16 : 9) |
| Frame rate | **29.99 fps** (30000/1001-class); 1,487 decoded frames |
| Duration | **49.57 s** |
| Bit rate | ≈ 323 kb/s total (≈ 195 kb/s video): **heavily compressed** |

What that means for fidelity: characters are only **≈ 20–40 px** tall in gameplay shots, so their *construction* is read from the couch shots (frames 840–930, where they are large), and their *motion* from the small gameplay figures, their smear trails and their effects. Compression smears fine detail; claims below are about shape, volume, colour, timing and layering, not texture.

It is a **trailer**, not a recording of a session: title cards ("LOCAL MULTIPLAYER CHAOS" 5–7 s, "RIDICULOUS POWER-UPS" 12.5–15 s, "UP TO 6 PLAYERS" 28–31 s), eight different arenas in 1–4 s cuts, and a couch scene. **There is no HUD, score, name, meter or health bar anywhere in the gameplay** (§ UI). It contains **no clean close-up of a melee swing or a thrown boomerang**; the closest evidence of attacks and impacts is the power-up and explosion effects, the death burst and the movement smear. Where the video is silent, this document says so, and the implementation says which reference it follows instead (the Garden image shows a slash: golden crescents).

## 2. The reference frame set

Stored (JPEG q92, 640 × 360, derived from the video; the video is untouched) in `docs/reference/video/`. Frame numbers are decoded-frame indices (t = n / 30 s).

| # | Needed | Frame file |
| --- | --- | --- |
| 1 | neutral arena | `1020-maze-wide-neutral` (the maze, wide), `1440-neutral-arena-logs`, `0480-environment-depth-cliffs` |
| 2 | player idle | `0060-movement-smear-island` (eggplant standing), `1230-rocks-depth-characters` |
| 3 | player movement | `0300-movement-multi-courtyard` (cup, toast, strawberry running with smear trails), `0060-…` (banana with a long streak) |
| 4 | multiple players moving | `0300-…`, `1020-…`, `1440-…` |
| 5 | close combat / impact | `0510-blast-orange-wall-eggplant`, `1463-blast-rings-sequence` |
| 6 | SLASH-like attack | **not present**; the sweeping orange arc + dark debris in `0510` and the Garden image's golden crescents are the nearest evidence |
| 7 | projectile / boomerang | **not present** (the logs in `1440` are arena obstacles; the glowing white/yellow orbs in `1438–1460` are the only travelling projectiles) |
| 8 | impact | `1463`, `1470` (disc, shock ring, debris ring) |
| 9 | death | `0780-death-burst-watermelon`, `0810-death-aftermath-avocado` |
| 10 | environmental depth | `0480` (cliff pillars fading into mist), `1260-bridge-water-depth`, `0630-water-tiles-burst` |
| 11 | character behind scenery | `0630`, `1230` (small figures among boulders; low walls do not hide them) |
| 12 | high action | `1200-high-action-fire-field`, `1320-dash-trails-explosion-dots` |
| 13 | transition / state change | `0150-title-card-yellow`, `0420-title-card-pink` (flat colour, radial burst, bold type), the orange flash edge in `1440` |
| 14 | HUD / UI | none in gameplay (title cards and the couch scene are not HUD) |
| 15 | victory / result | none as such; `0870-character-construction-couch` and `0900-six-players-card-couch` show the cast relaxed and happy on a sofa: the *character* language for a celebration |

## 3. Visual breakdown

### Camera

* **High-angle, 3/4 top-down, long lens** (little perspective distortion): ground rectangles stay close to rectangles with a slight trapezoid; vertical things lean away from the frame centre only a little. It is **not** a flat orthographic top-down: boulders, cliffs, roofs and logs show their top *and* their south face, and cliffs in `0480` are clearly tall.
* The camera is **tilted ≈ 55–65° from the horizontal** in most shots (a little steeper than Garden's 40° fit from the Garden image; Garden's framing stays the Garden image's).
* Shots are **close framed** (islands, `0060`, `0480`) or **wide** (maze, `1020`; logs, `1440`). Players are **small**: 3–6% of frame width in gameplay shots.
* **Depth-of-field / vignette:** every shot has a soft darker, slightly blurred rim (strong in `0060`, `0480`, `1020`): a vignette that also dims saturation toward the corners. Cliff pillars fade to a pale mist toward their base.

### Characters

* **Construction** (couch shots): **soft plush/clay volumes**, rounded-square or ovoid bodies; matte material with a *small* specular glint (`0870`: a white tick on the black cube's shoulder, a sheen on the banana); **big round glossy black eyes with one or two white highlights**, a thin one-line smile (a dash for a stern one), no nose; stubby cylinder limbs and short feet in a darker shade of the body colour; a small accessory per character (eggplant cap, cherries on the cube, banana peel flaps). Shading is a soft ambient gradient: lighter top, darker underside, warm bounce from the floor.
* **Proportions** in play: roughly as wide as tall, ≈ 1–1.2 head-heights of body; limbs read as 2–3 px stubs.
* **Grounding:** **every character has a soft, dark contact shadow** directly under and slightly offset to the lower right, and a longer faint cast shadow; no outlines.
* **Orientation:** characters turn to face the direction of travel (the banana in `0060` leans into its motion).

### Motion

* **Smear trails:** a moving figure leaves a **translucent elongated streak** behind it (a faded copy of its colour, 2–4 body-lengths long, tapering): `0060` (banana, eggplant), `0300` (cup, toast, strawberry), `1320` (carrot, banana). This is the video's main sign of speed and it is **soft, low-opacity, and in the character's own colour**.
* **Squash/stretch and lean** in running figures: the toast in `0300` (4-frame strip) leans forward ≈ 15–20° and its silhouette changes frame to frame (stride bounce); the cup tilts.
* Acceleration is quick (figures appear to start at speed within a few frames); stops are short.

### Environment

* **Dimensionality:** chunky low-poly-feeling volumes with **rounded bevelled edges**: boulders, walls, crates, logs, roofs. Walls and rocks have a **cool blue-lavender rim** along their top edge and where they meet the ground; faces are flat-shaded with a soft gradient.
* **Materials:** hand-painted, matte, no gloss; ground has **large soft tonal patches** (darker/lighter green blotches, orange leaf scatter, pale sand), **tiny grass tick marks**, scattered small props.
* **Lighting:** a single **key from the upper left**, soft; cast shadows fall to the **lower right**, long (≈ 1.5× object height) and **soft-edged, blue-grey, low-opacity** on pale ground (`0300`) and **darker green** on grass (`0060`). Strong **ambient occlusion** at every wall/ground contact (a thin darker band). Overall a warm, hazy, pastel key with a cool shadow colour.
* **Palette (sampled):** courtyard floor (240, 227, 188); warm ground (235, 212, 140); grass (192, 220, 139); lavender wall (138, 153, 177 in shade, lighter on top); roof red (211, 93, 80); water (99, 134, 157); wood (103, 147, 163 under water tint). Saturation is modest, values high.
* **Secondary motion:** water ripples and lily pads, swaying bamboo and leaves, a hovering glow on pickups; restrained.

### Effects (the video's VFX language)

* **Flat, shape-driven, saturated, no photoreal smoke.** An explosion (`1451–1484`) is: (1) a **bright yellow hot disc** (≈ 6 frames), growing, with a white core; (2) an **orange then red expanding shock ring** (the disc's edge brightens) over ≈ 8 frames; (3) a **ring of chunky dark-purple debris blobs** (rounded polygons, ≈ 10–14 px) thrown outward, drifting for ≈ 1 s while their opacity decays; (4) a thin **scatter of tiny dark specks** left behind; the ring edge and blobs pick up a pink/orange rim on the lit side.
* **Impact of a wall blast** (`0490–0540`): an **orange fan-shaped arc** (the blast's reach, bright at the leading edge, fading toward the origin) over brown debris chunks and dark dots; it decays over ≈ 1.5 s.
* **Death** (`0780`, 26 s): the character **bursts into its own pieces**: a spray of **small red globs** (juice), **green rind chunks**, and the body tumbling apart in the next frames, with a few brown bits; a soft contact shadow stays; then the floor is left clean (`0810`). Readable even at 20 px because the burst is in the character's colours.
* **Power-up fire** (`1160–1204`): a stream of **yellow-orange flame petals** from a point, turning into a field of petals with dark ash specks.
* **Glows:** pickups and projectiles are **soft glowing orbs** (white/yellow core, translucent halo).
* **Layering:** effects are drawn **on top of everything including walls**, with soft opacity; no screen shake is evident; a brief **orange glow** frames the screen at a transition (`1440`).

### Pacing and transitions

Hard cuts every 1–4 s, title cards on flat colour with a radial burst and heavy rounded type, a couch scene for the cast. Gameplay moments are **short and punchy**: bursts of motion, then a clean floor.

### UI / HUD

**None.** Not a name, a score or a bar in any gameplay frame: the arena and the characters carry all the information. Foomerang Fu's own information (names, the 14-hole race, powers, rounds) must therefore be expressed with extreme restraint: small, on the edge, high contrast, never over the arena.

### Combat readability

Colour and **silhouette** carry it: each character is a distinct hue; effects are brighter and more saturated than the ground; shadows sit directly under players so position reads at a glance; clean pale floors in the courtyard keep small figures visible; overlapping debris never covers a character for more than a few frames.

## 4. What the reconstruction must achieve (the translation into our game)

1. **Painterly environment:** soft tonal ground patches and grain, large soft cast shadows to the lower right (blue-grey on pale ground, deep green on grass), ambient-occlusion bands at every contact, lavender rim light on stone, mist and vignette. *(Garden's layout stays the Garden image's.)*
2. **Plush volumetric characters** (our four): soft ambient shading, glossy round eyes with highlights, one-line mouths, stubby limbs, **always** a soft contact shadow, motion smear trail in their colour, lean/squash on moving, a burst into their own colours on death.
3. **Effects in the video's language:** bright flat shapes with soft opacity: the BLAST as disc → shock ring → dark debris ring → specks; SLASH as a swept bright fan with a hot core, feathered outer arc and sparks (Garden-image crescents); CLANK and HIT as star bursts with chunky sparks; boomerangs as spinning toys with a ground shadow and a tapering streak; Dash as a coloured smear.
4. **HUD with video-level restraint** (§ UI).
5. **Pacing:** effects are short and clean; the floor is left clean after.

## 5. Honest limits of this reference

The video is 640 × 360 and compressed, so *pixel-level* equality of character detail cannot be established from it, and there is no melee/boomerang close-up to copy; those are reconstructions from the nearest evidence, flagged wherever they occur. Any claim of fidelity in the completion report is about the qualities listed above, shown in side-by-side frames and motion strips, never about a single similarity number.
