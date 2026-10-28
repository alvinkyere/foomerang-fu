# Agent playbook: how the Foomerang Fu look, feel and sound get built

For an agent joining this repository. It is the working method behind the plaza, the gong islands, the characters' animation, the
powers' effects and the sound, written down as steps you can follow. Read `AGENTS.md` and `README.md` first: they are the rules;
this is the craft. Where this file and `AGENTS.md` disagree, `AGENTS.md` wins.

The owner's standing aim is **to match the reference videos exactly** (the HQ videos, `game-setting.mp4`, the physics videos in
the repository root) **with our own art, models and sound**. The standard is that of an animation engineer on a first-party
console title: every timing, size and colour is measured, not guessed; every motion has a reason you can state in frames.

## 0. Ground rules that cost the most when broken

1. **Never ship the reference's pixels or audio.** Measure them, then build our own. Frames and audio extracted from the videos
   stay in git-ignored `output/` folders (`art/<map>/output/`, `art/audio/output/`) and are never committed or served.
2. **One small vertical slice at a time**, test first, `pnpm validate` before you call anything done. Stop at each slice boundary
   when `AGENTS.md` says to.
3. **Report outcomes as they are.** A failing test is reported with its output. A guess is called a guess (the music's tempo is
   "probably 120 bpm", not "120 bpm"). Never claim a check you did not run: read the validation's result before committing.
4. **Money and budgets belong to the owner.** A raise of a size budget (`apps/console/scripts/check-bundle-size.mjs`) or any
   `minimumReleaseAgeExclude` change needs the owner's say-so, noted in the code ("owner-approved <date>"). Ask with one clear
   question and a recommended option, then proceed.
5. **Spend tokens like they are scarce** (the owner has said so more than once): short tool output (`| tail`, `grep -E`, `cut -c`),
   few images (one contact sheet beats ten frames), no re-deriving what a memory note or this file already says, no
   narration of options you will not take.
6. **Treat edits to your own files as yours, edits to the owner's as theirs.** The working tree has untracked local media
   (`*.mp4`, `*.jpg`) that must never be committed. Never `git add -A`.

## 1. The loop, for any visual or motion target

1. **Pin the reference.** Name the file and the time (`foomerang-fu physics hq.mp4 4:27`, `game-setting.mp4 f463`). Video is
   30 fps in the files we have; frame `f` is `f / 30` seconds. Say which video: the HQ ones differ from the 640x360 ones.
2. **Extract, do not eyeball.** Decode frames with OpenCV (`cv2.VideoCapture`, set `CAP_PROP_POS_FRAMES`), crop to the object,
   enlarge with nearest-neighbour, and lay out a contact sheet of the frames around the event. Look at the sheet once, then
   measure.
3. **Measure in units that survive a zoom change**: pixels as a fraction of the character's size (the game-setting hover is
   ~5 px of a 53-65 px character: about 8-9%), angles in degrees, times in frames. Record the numbers in a memory note or in the
   code comment that uses them, with the video time they came from. A number without its source is a guess.
4. **Segment, then fit.** Colour masks in HSV (grass, stone, wood, water), contours, `approxPolyDP`, then unproject to the
   ground plane with the solved camera (`art/sky_islands/camera.json`; the plaza rig at the map's zoom). Fit shapes to the
   mask (a cross to a raft's outline), do not trace it by hand.
5. **Build our own** in Blender (headless, scripted: `Blender -b --python build.py -- <out>`), export a glTF, and package it into
   `apps/console/public/maps/<map>/` with a manifest. Models are lit by the game's soft light; flat props are unlit with
   vertex colours. Everything is a script so a rerun regenerates it.
6. **Compare by overlay**, not by memory: render the same view through the same camera and blend it 50/50 with the reference
   frame. Differences you can see in the blend are the to-do list. Colour is checked numerically (median of a mask's pixels,
   as `#rrggbb`), because the eye is fooled by the surroundings.
7. **Put it in the game and shoot the game**, not only the Blender render: a Playwright run at 1920x1080 with the real
   renderer, one screenshot, compared to the reference again. Many bugs only show there (a sheet of water too small, a
   boulder pinching a bank).
8. **Tests, validation, commit** (section 5).

## 2. Animation: how to read and rebuild a motion

- **Break a motion into phases and time each**: anticipation, action, settle, hold. For the character select that was ARRIVE
  (turned ~27 degrees toward the cursor's move, facing front in ~4 frames, that side's hand leading), IDLE (a 40-frame loop,
  hands rising alternately, body leaning ~3 degrees, a ~1.3 px hop at each hand peak) and READY (the circle fills and pops,
  the face goes happy, one hand thrown up for ~0.8 s). Write the table before writing code.
- **Loops are measured by autocorrelation or by finding the repeating frame**; do not assume a period.
- **Easing is read off the curve**: plot the object's position per frame; a straight line is linear, a flattening one is an
  ease-out. Springs (the camera hold) are fitted by stiffness and damping against the recorded track.
- **Squash, stretch and tilt** are small and relative (a few degrees, a few percent). Exaggerating them is the usual error.
- **Keep motion data in a table module** next to the renderer (`render/*Motion.ts`) and keep the maths pure, so a test can pin
  "the block's chunks land here at 0.25 s" without a GPU.
- **Pre-rendered frames vs live 3D**: the character select uses frames baked in Blender (packed into atlases); the plaza
  characters are billboards from atlases; effects that must vary (fire, ice, shards) are built live from our own geometry.
  Decide by whether the look can be baked once.
- **Performance is part of the animation**: the owner plays on a TV browser. Merge static meshes by look, instance repeated
  shapes, keep flipbooks small, and re-measure FPS at 6x CPU throttle after any change to the plaza.

## 3. Rules and engine: where things may live

- Pure packages (`game-core`, `protocol`, `room-engine`, `games/foomerang-fu/src/rules`) take time and randomness by
  injection and never touch DOM, Node, React, Phaser or Socket.IO. Boundaries are lint- and test-enforced
  (`packages/config/test`): do not work around them.
- The rules emit **events**; presentation turns them into view events (`fuView.ts`), and the renderers and the sound read the
  view. Nothing downstream decides game facts. Add a presentation need to the view model, not to the rules.
- A mechanic that changes physics (a turntable, a portal) goes in the rules with its own test arena (`test/turntable.test.ts`,
  `test/portals.test.ts`), then CPU support (`src/cpu`: the navigation grid and the edge guards), then the renderer.
- **The CPUs are part of every mechanic.** A map or rule that leaves them stuck or walking into water is unfinished. Simulate
  two Hard CPUs for a minute on the new map (`test/support/cpuMatch.ts`): rounds must end and falls must be rare.

## 4. Sound (added 2026-10-28)

- **What the videos give, honestly**: the music and the effects are one mixed track; the effects overlap each other and the
  music, so clean per-effect clips cannot be separated and must not be shipped anyway. What is measurable: loudness over time,
  a steady ~0.5 s pulse in most windows (so ~120 bpm, uncertain: other methods gave 0.44-0.98 s), a bass-heavy bed, effects
  that are bright (energy ~1.3-2.5 kHz) and short (0.15-0.4 s), and a spectrum that matches across maps (0.83-0.97), so one
  music bed serves every map. Treat all of it as design guidance, not as ground truth.
- **How it is built**: `apps/console/src/audio/`. `recipes.ts` is data (a few oscillator/noise voices with a pitch sweep and
  envelope for each event, each with a measured `level`), `synth.ts` plays a recipe with Web Audio, `music.ts` is the pure
  eight-bar pattern, `soundEngine.ts` listens to the view's events and to what the boomerangs did between frames.
  Menu sounds are cues (`shell/sound.ts`), emitted at the one place menu actions arrive (`consoleRuntime.ts` `choose`).
- **Audition and level**: `node art/audio/preview.mjs` renders every sound offline in real Chrome to
  `art/audio/output/preview/*.wav` and prints peak and average loudness with the level that evens them out. Re-run it after
  changing a recipe and paste the printed levels into `recipes.ts`.
- **You cannot hear.** Say so. Ship, then ask the owner to listen and name what is wrong; adjust recipes from their words.
- **Sound is OFF by default** (the owner found the first version bad, 2026-10-28): `?sound=on` turns it on while the sounds are
  tuned. The browser keeps audio locked until a key or tap; the engine resumes on the first one.

## 5. Validate and commit

- `pnpm validate` is the gate: `format:check`, `lint`, `typecheck`, `build` (with the bundle budgets), unit tests per
  package, the game's own tests, then the Playwright e2e suite (~15-20 minutes: run it in the background and wait for its
  notification; do not poll).
- **Validate in a clean worktree at HEAD** with your changes mirrored in, so untracked local files cannot fail or pass it
  by accident. In this repository a few tracked files are not Prettier-clean at HEAD (`index.html`, the Bread payloads) and one
  untracked probe script fails lint: format or move those aside **in the worktree only**, never in the owner's tree.
- A failure is read, not rerun hopefully. A timeout under load may be rerun alone; a changed expectation (a map count, a
  pool) is updated with the reason in the test. Never weaken a test that is right.
- **Commit with the index trick** so a dirty working tree and concurrent sessions cannot interfere: build a temporary index
  (`GIT_INDEX_FILE`), `git read-tree HEAD`, `git add` only your files, `git write-tree`, `git commit-tree ... -p <old HEAD>`,
  then `git update-ref refs/heads/main <new> <old>` (the old value as a guard: it fails if `main` moved). Verify the files in
  the worktree equal the ones in the owner's tree before you do it. End the message with the attribution line the harness gives.
- Do not push unless asked. Do not commit reference media or extracted frames/audio.

## 6. Where the knowledge lives

- **Memory notes** (`~/.claude/projects/.../memory/`, one fact per file, indexed in `MEMORY.md`): owner decisions, measured
  numbers with sources, what is committed and at which hash. Update the note, do not add a duplicate. Record decisions the
  owner made in their words, with the date.
- **Code comments carry the source** ("HQ 4:27", "foomerang-fu physics hq.mp4 6:55.83-6:57.62"), so the next agent can re-check.
- **Art folders are pipelines**: `art/<map>/README.md` or the script docstrings give the run order. Keep them accurate when you
  change a step. Known pipelines: `art/sky_islands` (layout, tops, objects, portals, Blender build, package, arena),
  `art/pond_cross` (layout, Blender build, package, arena), `art/audio` (preview), the character tooling under
  `art/reconstruction`.
- **Tooling that is not in the repository** (a Python venv with OpenCV, NumPy, SciPy and Matplotlib; Blender at
  `/Applications/Blender.app`; macOS `afconvert` to extract a video's audio when there is no ffmpeg) is recreated on demand:
  `python3 -m venv art/audio/output/venv && art/audio/output/venv/bin/pip install numpy scipy matplotlib opencv-python-headless`
  (local tooling, not a repository dependency; new repository dependencies need the owner's review).

## 7. Mistakes already made (do not repeat them)

- **Committing before reading the validation result.** One failure (a CPU test timing out under load) was missed. Read the
  exit code and the failing names every time.
- **Letting a mechanic land without its CPUs.** The turning raft left two Hard CPUs motionless: their plan treated the ground
  under them as water. Always run the CPU simulation.
- **Measuring through noise.** Overlapping effects and music made the first audio analysis look conclusive when it was not.
  Check a measurement against a case where you know the answer before you build on it.
- **A fix that helps one map hurts another.** A "stand still when there is no ground ahead" rule fixed the pond and made the
  gong islands' CPUs finish half as many rounds. Scope a fix to the case it was made for and rerun the other map's tests.
- **Sizing from the wrong thing** (the ice block from the sprite cell instead of the character's width). Size from the object
  the reference sizes it against.
- **Raising a budget or loosening a limit on your own.** Ask first.
- **Over-trusting a screenshot.** The model matched the reference but a boulder pinched a bank shut: check playability, not only
  the picture.

## 8. Working with the owner

- They write briefly and fast, and they judge by playing: expect "this is rubbish" with no detail. Respond with what you think is
  wrong and one question that would pin it down, not a defence.
- Give a recommendation, not a menu. Ask only for decisions that are theirs (look, feel, budgets, what ships).
- Say what is committed, what is only in the working tree, and what you could not check. Keep the summary short enough to read
  on a phone.
