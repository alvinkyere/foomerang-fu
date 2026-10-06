# FOOMERANG FU — combat skeleton (Fu Slice 1, plus SLASH)

Status: v1.0 — **Slice 1 PASSED human play (Human Playtest #2).** See “Slice 1 result” below. Package: `games/foomerang-fu`. This is the smallest loop that can answer one question — *is running around, slashing someone up close, throwing your weapon across the arena, losing access to slash while it is gone, and getting it back fun?* — and nothing more. No dash, block, parry, slash-vs-boomerang interaction, catch mechanic, powerups, hazards, maps, character art, music, scoring, accounts or menus.

Presentation is primitive and original: circles/shapes, a chevron, a triangle, rings and a banner. Nothing is taken from Boomerang Fu.

## Slice 1 result

**Fu Slice 1: Combat Skeleton — PASS**, on human play (Human Playtest #2, 2026-10-06, played on physical controllers by the project owner). The owner's verdict: the combat feels excellent; THROW and SLASH behave correctly; player-to-player collision feels good; and the combined movement and combat loop is fun to play. That answers the question this slice was built to ask.

How it got there:

| Step | What happened |
| --- | --- |
| Playtest on the first skeleton | Movement and THROW felt good; **SLASH was missing** from the minimum combat vocabulary. SLASH was added (melee swing from the held boomerang), together with a name/aim label fix and a fade for the projectile frozen at round end. |
| **Human Playtest #1** (with SLASH) | Exposed two blocking defects, so it is **not valid evidence for balance**: (1) the control labelled THROW performed SLASH — root cause a **stale game server** still advertising the old action pairing while the hot-reloaded console read the new one (details below); (2) players passed through each other — **player collision was missing**. |
| Corrections | The THROW/SLASH pairing is defined once in the game package and pinned to the real server's manifest by test; `pnpm dev:demo` runs the server under `tsx watch`; living players became solid through deterministic rules-level circle separation. Both were fixed and validated in a clean clone **before** the pass was awarded. |
| **Human Playtest #2** | Replayed after both fixes: **PASS**. |

**Baseline.** The gameplay values in `DEFAULT_FU_CONFIG` as of the Slice 1 commit are the **Slice 1 baseline**, deliberately preserved, not retuned because they are provisional: arena 1600 × 900 · player radius 36 · player speed 420 · boomerang radius 14 · throw speed 900 · throw range 520 · return speed 1000 · slash reach 130 · slash arc 120° · slash active 0.12 s · slash recovery 0.38 s · slash move factor 0.6 · round-end pause 2.5 s. The behaviour decisions in the table further down (including that a walker shoves a stationary player at half speed) are likewise the baseline. Any change to them must be driven by later playtesting, not by this document's “hypothesis” wording.

What the pass does **not** establish: balance with more than two players, or with players of different skill; long-session feel; Safari/iOS behaviour or other phone models (the physical devices used are not recorded here); and anything beyond Slice 1's scope. No Slice 2 work has started, and none will without separate authorization.

## Slice 2: Arena Combat — **PASS**

**Foomerang Fu Slice 2 — Arena Combat: PASS**, on a physical human playtest after the returning-boomerang fix. The owner's verdict: the arena feels good, and the returning boomerang now behaves naturally around solid geometry.

**What play changed.** The first Slice 2 playtest found that a RETURNING boomerang phased through walls to reach its owner, and that felt unfair. The rule became **cover means cover in both directions**: solid geometry blocks a boomerang whether it is THROWN or RETURNING, and a returning boomerang keeps homing on its owner by sliding round the walls (local wall-following, no pathfinding). That decision came from actual play and is part of the baseline.

**Baseline.** The approved Slice 1 and Slice 2 behaviour is the gameplay baseline for what follows: the Slice 1 values in `DEFAULT_FU_CONFIG`, the primitive arena, wall solidity for players and boomerangs (both states), the slash line-of-sight rule, and the return-wall algorithm. **`returnWallSeconds = 3` is a defensive failsafe, not established balance tuning:** a normal, reachable production arena should not rely on recall for ordinary returns, and in the primitive arena it never fires (tested).

The design notes for Slice 2 follow.


Slice 2 asks one question: *does deliberate arena geometry make the existing combat substantially deeper and more fun?* It adds geometry and nothing else: no new abilities, no new tuning.

**Arena = data** (`rules/arena.ts`). A `FuArena` is `{ width, height, walls?, spawns? }`; a wall is an axis-aligned rectangle; `spawns` is one point per slot. The rules own all of it; Phaser only draws it. `DEFAULT_FU_CONFIG.arena` is still the **open Slice 1 arena** (no walls, ellipse spawns), which is why every Slice 1 test runs unchanged and passes; the console plays `PRIMITIVE_ARENA` by passing it explicitly (`FuRuntime`).

**The one primitive test arena** (`PRIMITIVE_ARENA`, 1600 × 900, mirrored left–right and top–bottom so no seat is better): a central block with a way round every side; four *gate* walls leaving a **120-wide chokepoint** (one body, not two) in the top and bottom lanes; two **100-wide, 300-long corridors** down the flanks, open at both ends; four free-standing cover blocks between corridors and middle; open corners, edges and middle. Spawns: top-left and bottom-right first (two players start opposite), then the other corners, then the two lane ends. A test walks a player through a corridor and a chokepoint and checks every spawn can reach every other.

```
 TL ·  ┌──gate──┐  ┌──gate──┐  · TR
       │        └──┘        │
   ┃ ┃   ■                ■   ┃ ┃        ┃ ┃ = corridors (100 wide)
   ┃ ┃        ┌──────┐        ┃ ┃        ■   = cover
   ┃ ┃   ■    └──────┘    ■   ┃ ┃        gap in a gate = chokepoint (120)
 BL ·  └──gate──┐  ┌──gate──┘  · BR
```

**Players vs walls.** Living players are solid against walls, resolved by the same deterministic separation that handles player-vs-player (`rules/collision.ts`): a circle is pushed straight out of a rectangle (away from its nearest point; out by the nearest face if its centre got inside). Only the contact normal is corrected, so a player **slides** along a wall at full tangential speed, rounds a convex corner smoothly, and is held by a concave one. Walls are fixed and win over player shoves, so a shove can never put anyone inside one. Movement still runs in sub-steps no longer than the fixed step, so no accepted `dt` tunnels. Walls must be at least one player radius thick (validated), so nothing pushed by contact can end up on the far side of one. Dead players are not solid (unchanged).

**Boomerangs vs walls.** Solid geometry blocks a boomerang in **both** states. A **THROWN** boomerang is swept along its step against the walls (cut into pieces no longer than its radius, then bisected to the touching point): it stops flush against the wall, turns **RETURNING** on that very step, and never penetrates, bounces, ricochets or tunnels. A throw made pressed against a wall starts as close to its owner as the wall allows and turns straight back.

### The return-wall algorithm (`rules/homing.ts`)

*Human-play decision (Slice 2 playtest #1): a RETURNING boomerang must not phase through cover, including when its owner moves behind cover after throwing.* Solid geometry now blocks a boomerang in **both** THROWN and RETURNING; THROWN + impact → RETURNING is unchanged. Slice 1's open-arena return is byte-for-byte the old straight line (an arena with no walls takes the old code path).

Each simulation step, a RETURNING boomerang has `returnSpeed × dt` of travel. That is cut into **pieces of at most 10 world units** (so a long accepted `dt` steers as finely as a short one). For each piece, aiming at the owner's *current* position:

1. **Try the straight heading.** Sweep the boomerang's circle towards the owner (the same sweep a thrown boomerang uses: pieces no longer than its radius, then bisected to the touching point). If nothing is in the way, move, and **let go of any wall** (`follow = 0`).
2. **If a wall is in the way:** move up flush against it, then **slide** along it with the rest of the piece. The slide direction is the wall's tangent: the contact normal turned a quarter turn by `follow` (±1). The first time it meets a wall `follow` takes the sign that makes the slide point at least partly towards the owner (an exact tie takes **+1**). It then **keeps that hand** until its heading is free again; this memory is what stops it jittering back and forth over a wall the owner is directly behind, and it makes the boomerang hug a wall round a convex corner. Up to three contacts are handled per piece (sequential contacts).
3. **If the slide is wedged** (no movement at all: a concave corner, or the arena's edge clamping the slide to nothing) the hand is **flipped once** and the other way tried; if that is wedged too that piece goes nowhere.

It only ever moves to places the sweep says are free, so it cannot penetrate, tunnel or teleport. Lethality, the catch radius (50), and "never kills its owner" are unchanged. Catching is judged on the boomerang's real position; because walls are at least one body thick, a boomerang pressed to one face cannot be "caught" by an owner pressed to the other.

**The failsafe (deterministic, explicit, new config `returnWallSeconds = 3`).** The boomerang carries a clock (`wallSeconds`) that advances only on steps where it slid along a wall. If it reaches 3 s without arriving, the boomerang is **recalled**: it ends the trip in its owner's hand, a `RECALLED` event is emitted (drawn like a catch), and the owner has their weapon again. Nothing is moved through geometry; the trip simply ends. The clock never runs in open ground, so it cannot affect Slice 1 play. **In the primitive arena it never fires:** a test flies a boomerang from ~150 points across the arena to every spawn point (>500 flights, also at the longest accepted `dt`), every one gets home, none is recalled, and the slowest takes well under the limit. It exists for arenas (and positions) where wall-following cannot reach the owner, e.g. an owner sealed in a box, which a test uses to prove it ends at 3 s without entering any wall.

**Edge cases and honest limits.**
- Wall-following is *local*: the route it finds around a big obstacle may be the longer one (a head-on tie always goes the same way: down), and the owner can change which way is shorter while it travels. It always continues with the hand it chose until its heading is free.
- A boomerang can still be slow around complicated cover while the owner keeps moving; the failsafe bounds that at 3 s of sliding.
- If the failsafe fires you have lost nothing but the throw: you are re-armed.
- Not covered: arenas with non-rectangular or overlapping-with-boundary geometry (validation forbids walls thinner than a body).

**Decisions made (each a hypothesis for the playtest, none of it retuning):**

| Decision | Choice | Alternatives not taken |
| --- | --- | --- |
| **RETURNING near geometry** | **Bound by walls exactly like THROWN, and homes on its owner with local wall-following (see the algorithm below).** *Changed after Human Playtest, Slice 2 #1: the first version let it fly through cover, which felt unfair.* | Pathfinding / navmeshes (not needed in this arena, demonstrated by test); retracing the outbound path (changes Slice 1's homing). |
| Slash vs walls | A slash needs a **clear line** between the two centres; a wall between attacker and victim blocks it (a line that merely touches a wall's edge is blocked). Reach, arc and timings are unchanged. | A slash that cuts through walls would have made cover meaningless against it. |
| Boomerang kills vs walls | Unchanged: a boomerang kills by proximity at its own position; a stopped THROWN boomerang is a wall's thickness away from anyone behind it. | — |
| Shoving into walls | A shove cannot push a player into or through a wall; the pusher is held behind them. | — |
| Dead players | Not solid to walls or players (Slice 1 policy). | — |
| Wall shape | Axis-aligned rectangles only, at least one player radius thick. | Polygons/circles: not needed for the question. |
| Default config | Stays the open Slice 1 arena; the console plays the primitive arena. | Making walls the default would have meant editing Slice 1's tests. |

**Presentation.** Walls are drawn from the rules' data as slate slabs with a bright edge on a darker floor, under the players. `drawnWalls()` lets a browser test prove what is on screen is what the rules define.

**Not in this slice (and not started):** dash, parry, deflection, ricochet, powerups, hazards, portals, moving or destructible geometry, pickups, more maps, art, scoring, new round systems, host-loss redesign.

**The playtest will answer:** is chasing around cover fun? are chokepoints interesting? does body-blocking become useful? are corridors too restrictive? does SLASH get more interesting around corners? does THROW gain risk/reward around cover? are returning-boomerang trajectories understandable? do walls create strategy rather than annoyance?

## The loop

```
MOVE (joystick)  +  SLASH (button)  +  THROW (button)
        │
        ▼
 boomerang HELD ─throw─► THROWN ─range reached / wall─► RETURNING ─touches owner─► HELD
        │                    │                              │
        └──── kills an enemy it overlaps (never its owner; never while HELD) ────┘
        ▼
   SLASH (only while HELD): READY ─► ACTIVE ─► RECOVERING ─► READY — a short, fast arc in front of you
        ▼
 DEATH ─► last one standing wins the round ─► 2.5 s ─► deterministic reset ─► next round
```

## Where things live

| Concern | Where | Rule |
| --- | --- | --- |
| Rules (state, step, boomerang machine, rounds) | `games/foomerang-fu/src/rules` | Pure and deterministic: no DOM, React, Phaser, Socket.IO, clock or randomness (lint-enforced). Depends on `game-core` only. |
| Player movement | `game-core` `step` | Fu composes it; it does not reimplement movement. |
| Input freshness, who is connected, button event ids, the 1/60 s accumulator | `apps/console/src/runtime/fuRuntime.ts` | The rules never see a clock or an event id. |
| What to draw | `apps/console/src/render/fuView.ts` (pure) | Rules state → view. |
| Drawing | `apps/console/src/render/phaser/PhaserArena.ts` | Presentation only; reads the view, never the rules. |
| The SLASH and THROW buttons | manifest → `ActionButton` in the controller | Rendered because the manifest says so; no per-game branch. Laid out by the generic action they send: PRIMARY is the big one. |

Deviation to note: Fu's drawing lives in the console's existing Phaser module (shared with the primitive arena, which uses the same circles and labels) rather than `games/foomerang-fu/src/render`. The boundary is the same (view model in, pixels out). Moving Fu-specific drawing into the game package later is a mechanical change.

## State (`FuState`, plain data)

`config` · `round` · `phase` (`PLAYING` | `ROUND_OVER`) · `elapsed` · `world` (game-core bodies = player positions) · `players` (`id`, `slot`, `alive`, `facing`, `slash`) · `boomerangs` (one per player: `ownerId`, `state`, `position`, `direction`, `travelled`) · `roundOver` (`winnerId` or undefined for a draw, `resetInSeconds`).

Death is the rules fact `alive: false`. How it looks (dimming, the cross, rings) is the renderer's business and is never read back.

## The boomerang state machine

`HELD → THROWN → RETURNING → HELD`, and nothing else. The simulation moves a boomerang only through `transition()`, which throws on an impossible move (a bug, never a game state); `BOOMERANG_TRANSITIONS` is exported and tested. There is deliberately no "caught" or "dead" state: catching *is* RETURNING → HELD, and a dead owner's boomerang keeps its state.

## The slash state machine

`READY → ACTIVE → RECOVERING → READY` (`SlashState` in `rules/slash.ts`). The swing is the player's **boomerang used as a close-range weapon**: it can only start while the boomerang is **HELD**, and while it is ACTIVE the boomerang is HELD (a tested invariant). Pressing during ACTIVE or RECOVERING does nothing and is **not queued**; that — not any UI throttling — is what prevents spam. `direction` is the facing at the moment the swing starts and does not turn while it lasts; `remaining` is the time left in the phase.

The hit region is a circular sector from the attacker's centre along `direction`: strictly nearer than `slashReach` (centre to centre) and strictly inside half of `slashArc`. Like every hit in Fu the region is open — touching the edge is a miss. A target exactly on top of the attacker is inside. Only ACTIVE hurts, and it hurts on **every** step of the window, so someone who walks into the arc mid-swing dies and someone who arrives after it does not. A slash never kills its owner or a dead player. The renderer is handed the swing (position, direction, reach, arc, duration) and draws a wedge of exactly that size; it never decides what was hit.

## Step order (`stepFu(state, inputs, dt) → { state, events }`)

1. **Movement and facing** (alive players only; game-core moves the bodies). A player who is swinging or recovering walks at `slashMoveFactor` of normal speed.
2. **Slash timers advance, new slashes start, then throws.** A slash starts only from READY with the boomerang HELD, for the boolean `true`, for a living player. A throw works only from HELD, for the boolean `true`, for a living player, **and not during an ACTIVE swing**. The boomerang starts just outside its owner, in their facing direction.
3. **Flight**: a boomerang thrown this step does not also move this step.
4. **Hits** — boomerangs and ACTIVE slashes alike — resolved *simultaneously* against end-of-step positions.
5. **Round end.**

`dt` follows game-core's contract (0 is a no-op; negative/non-finite/too large is a `RangeError`). Inputs are keyed by player id, unknown ids are ignored, and the order of the input `Map` never changes the outcome (players are processed in the order the match was created).

## Players are solid (`rules/collision.ts`)

Living players cannot overlap. Equal circles, **split the overlap**: after movement, every overlapping pair of living players is pushed apart along the line between their centres, each by half the overlap; a player touched by several others receives the sum, computed from the positions the pass started with (so the order pairs are examined in cannot matter). Bodies are then kept inside the arena, which can create a small overlap again, so passes repeat (at most 64; normally one or none) until none is left. Movement is only along the contact normal, so a glancing contact slides. Movement is applied in sub-steps no longer than the fixed 1/60 s with a separation after each, so no accepted `dt` can carry one player through another. The dead are neither solid nor pushed. Spawn points are checked at configuration time (never overlapping, and a player cannot move farther than their radius in one fixed step). It is rules code only; Phaser draws where the rules say.

Behaviour you will feel: two players pushing at each other with equal effort stop dead in contact; one pushing a stationary player **shoves them along at half speed** (the alternative, a stationary player who cannot be moved at all, was not chosen — see decisions); a player pinned against a wall blocks the one pushing them.

## Defect found in Human Playtest #1: THROW arrived as SLASH

**Cause (proven):** a stale game server. The demo was started at 22:57:42, before SLASH existed; Vite hot-reloaded the console and controller, but the server (`tsx src/main.ts`, no watch) kept running its old code. A probe of the live server returned `MOVE`, `THROW → PRIMARY` and no SLASH. The new console reads `PRIMARY` as SLASH, so the one button the phone showed, labelled THROW, slashed. The PRIMARY/SECONDARY swap was not wrong in itself, but it made the label→action pairing a contract held in two places (server manifest, console runtime) with nothing to notice when they disagreed.

**Fix:** (1) the console now reads the pairing from the game package's own table, `FU_BUTTONS` (`games/foomerang-fu/src/controls.ts`); (2) an integration test pins the REAL server's manifest to that table, so the two can no longer drift unnoticed (the server stays game-agnostic and cannot import it; the boundary test forbids that and was not touched); (3) `pnpm dev:demo` now runs the server under `tsx watch`, so it restarts when server or game code changes.

## Decisions (each a hypothesis to be judged by playing)

| Decision | Current value | Why / what to watch |
| --- | --- | --- |
| Throw direction | The last **meaningful** movement direction (outside the dead zone). A player who has never moved faces the **centre of the arena**. | No aim stick yet. Does "throw where I last walked" feel natural, or do you keep throwing the wrong way? |
| Owner policy | A boomerang **never kills its owner** — at the throw, in flight, or on the way back. | The simplest safe rule. Is self-kill-on-return a missing source of tension? |
| Hit geometry | Circle overlap, distance **strictly less than** player radius + boomerang radius (36 + 14). Exactly touching is a miss. | Is the hitbox readable and fair? |
| Death | Any hit by an enemy boomerang in THROWN or RETURNING kills. A boomerang flies on through a hit. | A dead owner's boomerang in flight stays lethal to others. |
| Simultaneous hits | All resolved together: both can die in the same step, which is a **draw**. | Rare, but must be unambiguous. |
| Player collision | Equal bodies split the overlap, so a walker **shoves** a stationary player at half speed; equal opposing pushes stop dead. | Alternatives: the stationary player is immovable (mover simply stops), or movers push in proportion to effort. Does shoving feel good, or is it exploitable (shoving someone into a slash)? |
| SLASH and THROW on the same step | **SLASH wins; the throw is dropped, not deferred.** Decided inside the rules from the two inputs, so neither the order the events crossed the network nor the order they reached the console can change it. If the slash cannot start (recovering) the throw goes through as usual. | The slash is the panic button. Does losing a simultaneous throw ever feel wrong? |
| THROW during an ACTIVE swing | Ignored (the weapon is mid-swing, ≈ 0.12 s). Allowed during RECOVERING; the recovery keeps counting while the boomerang is away. | Does ignoring a throw pressed right after a swing feel like a dropped input? |
| Slash geometry | Reach 130 u centre to centre (a body is 36 u, so a victim's edge can be ≈ 58 u away); arc 120° centred on the facing; active 0.12 s; recovery 0.38 s (a swing every ≈ 0.5 s); movement ×0.6 while swinging and recovering. | The reach must be clearly shorter than a throw and clearly longer than touching. Is the arc forgiving enough? Is ×0.6 a fair price? |
| Slash vs. a victim's body | Only the victim's **centre** has to be inside the region. | Too stingy? Too generous? |
| Simultaneous slashes | Both resolve together: two players who slash each other on the same step both die (a draw); a player killed on the step they swing still lands that swing. | Same rule as boomerangs. |
| Return | Straight line toward the owner's **current** position; caught on touching distance (≤ 50). | Does returning feel like a threat the opponent must watch? |
| Rounds | Over when ≤ 1 player is alive (needs ≥ 2 players at the start; one player never ends a round). 2.5 s later everyone is reset to spawn, alive, boomerang in hand. | Is 2.5 s the right pause? Everything is frozen during it, including a boomerang caught mid-air. |
| Speed / range | Player 420 u/s · outbound 900 u/s · return 1000 u/s · range 520 u · arena 1600 × 900 u. Out ≈ 0.58 s, back ≈ 0.6 s. | The knobs most likely to need changing. All in `DEFAULT_FU_CONFIG`. |

No randomness is used yet, so there is no seed; when randomness arrives it must come in through explicit state, as with everything else.

## SLASH and THROW through the platform

`SLASH` is a manifest button whose `action` is `PRIMARY`, and `THROW` is one whose `action` is `SECONDARY`. **This changes the earlier mapping (THROW was PRIMARY).** The reason: the controller lays buttons out by the *generic* action, never by game, and PRIMARY is the one it makes biggest and easiest to reach. SLASH is the close-range panic button, so it gets PRIMARY. The protocol did not change. Both buttons behave exactly as THROW did — pressing sends one `INPUT_EVENT` (pressed), releasing sends one (released), each with its own event id:

- **Holding sends nothing more** (no auto-repeat). A 2.4-second hold in the browser sends exactly one press and one release.
- The controller **never retries or queues**: a press made while the connection is down is dropped, not fired later.
- The server drops any event id it has already seen (a hostile replay of one id reaches the host once); the console remembers the last 64 ids per player as a second line of defence, and the rules are idempotent anyway (a throw while the boomerang is away does nothing).
- A press becomes a one-step `throw: true` request on the next simulation step that actually runs; a press from a player who is reconnecting is dropped, never remembered.
- RELEASE does nothing for Fu (it is carried for games that need it).
- A press becomes `slash: true` or `throw: true` for exactly one step. If both are pending before one step, both are passed in and the rules resolve it (SLASH wins).
- A controller reload or reconnect starts with nothing held and sends nothing until a finger presses: a test proves no action is manufactured.

## Presentation (all derived, none fed back)

- Each player: colour + number + **shape** + name (colour is never the only cue).
- **Aim indicator** (triangle at the facing direction): solid while the boomerang is in hand, an outline while it is away. The player's name sits below the longest reach of the indicator, so facing down no longer overlaps it (`render/layout.ts`, tested).
- **The swoosh**: a bright wedge in the owner's colour, exactly the size of the rules' hit region, that sweeps open across the arc in about 0.1 s and fades by 0.24 s. Distinct from THROW's ring and from the flying chevron.
- **Round end**: a projectile in flight when the round ends is marked `spent` in the view; the renderer stops spinning it and fades it (and its trail) out over ≈ 0.3 s instead of leaving it frozen on the victim for the 2.5 s pause.
- A flying boomerang: a spinning chevron in its owner's colour with a short fading trail.
- Brief rings for throw, catch, hit (plus a flash) and round start; the dead are dimmed with a cross; a banner names the round's winner (or "Draw"); "Round N" top-left.

## Tests

- **Slash** (`games/foomerang-fu/test/slash.test.ts`, 55 tests): kill inside the region, survive outside it; every direction of facing; the direction locks for the swing; the active window versus a late arrival; never the owner or the dead; several victims; unavailable while THROWN / RETURNING (and nothing is buffered); not on the catch step, available the step after; a dead player cannot slash and stops swinging on death; the full ACTIVE → RECOVERING → READY timing; spam capped at one swing per cycle; the movement modifier (full and half thumb); THROW + SLASH on one step in either input order; a throw during ACTIVE; simultaneous slashes (draw), a victim who still lands their swing, slash and boomerang on one victim; the open edge of the reach and of the arc, a target exactly on top, a full circle; round end, freeze and reset; 3,000-step replay determinism with slashes; hostile non-boolean input; a 6,000-step fuzz of the slash invariants.
- **Rules** (`games/foomerang-fu/test/rules.test.ts`, 89 tests): creation and validation; movement and facing; throw from HELD, the deterministic direction and fallback, duplicate/invalid throw requests; the explicit transition table; travel and range over fixed steps; wall behaviour; homing; reacquisition; enemy, owner, dead-owner, simultaneous, multi-victim and touching-exactly hits; death blocks movement and actions; round end, freezing, the exact reset step, deterministic reset and multi-round play; replay determinism (3,000 steps, identical state, events and JSON); purity; invalid `dt`; garbage movement; a 6,000-step fuzz of invariants.
- **Console** (`fu.test.ts` and friends): the runtime (freshness, activity, throw requests, dedup, stalls, rounds, event delivery) and the pure view model.
- **SDK / controller**: `setButton` (no repeat, no queue, unique ids, interruptions) and the `ActionButton` (every way a press can end releases it).
- **Real sockets** (`integration`): button path through the real SDK and server, including a hostile replay.
- **Browser** (`integration/e2e/fu.e2e.ts`, real Chrome, real touches, real Phaser): one player walks up to another and kills them with a real SLASH tap (nothing is thrown; the next round resets the swing); SLASH does nothing while the boomerang is away and works once it is back; a held SLASH swings once and sends one press and one release; a reload manufactures no action and the new page can slash and throw. The original journey — two controllers render MOVE + SLASH + THROW from the manifest → move independently → throw independently (only the thrower's boomerang leaves their hand; Phaser draws it) → aim and kill → round over → the next round starts from the same fresh start → a held button sends one press → a reload keeps the player → performance recorded.
- Mutation testing: 66 mutants across rules, runtime, view model, SDK and controller (62 killed; 4 equivalent — see below), and 7 injected defects in the browser journey (all killed).

Equivalent mutants (no observable difference): duplicate ids and a too-small arena are also rejected by game-core's own validation; `winnerId` when nobody is alive; the director's in-match guard on actions (the runtime ignores them anyway).

## Known limits (deliberate)

- One movement joystick per manifest (protocol limitation, unchanged). There is no aim stick.
- The simulation runs in the host browser: a console reload restarts the round state (host-loss policy: see CONSOLE.md).
- Collision is circle-vs-circle between living players only. Boomerangs and slashes pass through bodies exactly as before.
- Geometry is axis-aligned rectangles. A RETURNING boomerang uses local wall-following, not a map: it is deterministic and tested to get home from everywhere in the primitive arena, but in an arena with a sealed-off owner it would be recalled by the failsafe (see below).
- A boomerang in flight at round end freezes in the rules until the reset (the renderer fades it out; the state itself is not advanced).
- The slash numbers and the SLASH/THROW button layout were played by one human (Playtest #2) and passed as the baseline; they have not been measured, and more players, other devices and longer sessions are untested.
- **Not built, on purpose:** slashing an incoming boomerang (deflect / destroy / redirect / parry). It could become the deepest interaction in the game, but only after the simpler loop has been played.
- No sound, art, maps, animation system or polish — by design.

## Play review checklist (what a human should judge)

**Slash** (does the swing feel instant? reach and arc: can you hit what you aimed at, do you hit what you did not mean to? can you tell *why* you died to one? is the ≈ 0.5 s cycle and the ×0.6 walk fair? is losing the slash while the boomerang is away a real decision? do you ever press THROW and get a slash, or the reverse?) · Movement (speed, turning) · throwing (is "last movement direction" right? does the button feel immediate?) · projectile speed · range · return timing and whether it feels like a threat · hit readability (can you tell *why* you died?) · round pause length · controller ergonomics (two thumbs: stick left, SLASH big on the right, THROW smaller and lower; button size; accidental presses; which one the thumb finds without looking) · whether you ever throw the wrong way · anything that feels unfair.
