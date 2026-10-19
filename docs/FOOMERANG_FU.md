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

**Baseline.** The gameplay values in `DEFAULT_FU_CONFIG` as of the Slice 1 commit are the **Slice 1 baseline**, deliberately preserved, not retuned because they are provisional: arena 1600 × 900 · player radius 36 · player speed 420 (**retuned to 360 on 2026-10-19**, measured from the owner's reference video: `art/physics_reference/README.md`) · boomerang radius 14 · throw speed 900 · throw range 520 · return speed 1000 · slash reach 130 · slash arc 120° · slash active 0.12 s · slash recovery 0.38 s · slash move factor 0.6 · round-end pause 2.5 s. The behaviour decisions in the table further down (including that a walker shoves a stationary player at half speed) are likewise the baseline. Any change to them must be driven by later playtesting, not by this document's “hypothesis” wording.

What the pass does **not** establish: balance with more than two players, or with players of different skill; long-session feel; Safari/iOS behaviour or other phone models (the physical devices used are not recorded here); and anything beyond Slice 1's scope. No Slice 2 work has started, and none will without separate authorization.

## Slice 2: Arena Combat — **PASS**

**Foomerang Fu Slice 2 — Arena Combat: PASS**, on a physical human playtest after the returning-boomerang fix. The owner's verdict: the arena feels good, and the returning boomerang now behaves naturally around solid geometry.

**What play changed.** The first Slice 2 playtest found that a RETURNING boomerang phased through walls to reach its owner, and that felt unfair. The rule became **cover means cover in both directions**: solid geometry blocks a boomerang whether it is THROWN or RETURNING, and a returning boomerang keeps homing on its owner by sliding round the walls (local wall-following, no pathfinding). That decision came from actual play and is part of the baseline.

**Baseline.** The approved Slice 1 and Slice 2 behaviour is the gameplay baseline for what follows: the Slice 1 values in `DEFAULT_FU_CONFIG`, the primitive arena, wall solidity for players and boomerangs (both states), the slash line-of-sight rule, and the return-wall algorithm. **`returnWallSeconds = 3` is a defensive failsafe, not established balance tuning:** a normal, reachable production arena should not rely on recall for ordinary returns, and in the primitive arena it never fires (tested).

The design notes for Slice 2 follow.


Slice 2 asks one question: *does deliberate arena geometry make the existing combat substantially deeper and more fun?* It adds geometry and nothing else: no new abilities, no new tuning.

**Arena = data** (`rules/arena.ts`). A `FuArena` is `{ width, height, walls?, spawns? }`; a wall is an axis-aligned rectangle, a **disc** (`{ shape: 'disc', x, y, radius }`, centre) or a **turned box** (`{ shape: 'box', x, y, halfWidth, halfHeight, angle }`, centre; radians, clockwise on screen) — the plaza's real shapes (see below); `spawns` is one point per slot. The rules own all of it; Phaser only draws it. `DEFAULT_FU_CONFIG.arena` is still the **open Slice 1 arena** (no walls, ellipse spawns), which is why every Slice 1 test runs unchanged and passes; the console plays `PRIMITIVE_ARENA` by passing it explicitly (`FuRuntime`).

**The one primitive test arena** (`PRIMITIVE_ARENA`, 1600 × 900, mirrored left–right and top–bottom so no seat is better): a central block with a way round every side; four *gate* walls leaving a **120-wide chokepoint** (one body, not two) in the top and bottom lanes; two **100-wide, 300-long corridors** down the flanks, open at both ends; four free-standing cover blocks between corridors and middle; open corners, edges and middle. Spawns: top-left and bottom-right first (two players start opposite), then the other corners, then the two lane ends. A test walks a player through a corridor and a chokepoint and checks every spawn can reach every other.

```
 TL ·  ┌──gate──┐  ┌──gate──┐  · TR
       │        └──┘        │
   ┃ ┃   ■                ■   ┃ ┃        ┃ ┃ = corridors (100 wide)
   ┃ ┃        ┌──────┐        ┃ ┃        ■   = cover
   ┃ ┃   ■    └──────┘    ■   ┃ ┃        gap in a gate = chokepoint (120)
 BL ·  └──gate──┐  ┌──gate──┘  · BR
```

**Players vs walls.** Living players are solid against walls, resolved by the same deterministic separation that handles player-vs-player (`rules/collision.ts`): a circle is pushed straight out of a rectangle (away from its nearest point; out by the nearest face if its centre got inside); out of a disc radially; out of a turned box the same way as out of a rectangle, in the box's own frame. Only the contact normal is corrected, so a player **slides** along a wall at full tangential speed, rounds a convex corner smoothly, and is held by a concave one. Walls are fixed and win over player shoves, so a shove can never put anyone inside one. Movement still runs in sub-steps no longer than the fixed step, so no accepted `dt` tunnels. Walls must be at least one player radius thick (validated), so nothing pushed by contact can end up on the far side of one. Dead players are not solid (unchanged).

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
| Wall shape | Axis-aligned rectangles, discs and turned boxes (2026-10-19, for the plaza's models), at least one player radius thick (a disc's diameter, a box's shorter side). | Polygons: not needed yet. |
| Default config | Stays the open Slice 1 arena; the console plays the primitive arena. | Making walls the default would have meant editing Slice 1's tests. |

**Presentation.** Walls are drawn from the rules' data as slate slabs with a bright edge on a darker floor, under the players. `drawnWalls()` lets a browser test prove what is on screen is what the rules define.

**Not in this slice (and not started):** dash, parry, deflection, ricochet, powerups, hazards, portals, moving or destructible geometry, pickups, more maps, art, scoring, new round systems, host-loss redesign.

**The playtest will answer:** is chasing around cover fun? are chokepoints interesting? does body-blocking become useful? are corridors too restrictive? does SLASH get more interesting around corners? does THROW gain risk/reward around cover? are returning-boomerang trajectories understandable? do walls create strategy rather than annoyance?

## Slice 3: Defensive Mastery — **PASS**

**Fu Slice 3: Defensive Mastery — PASS**, on a physical human playtest (the project owner, real controllers, 2026-10-06): the deflection mechanic works well and feels good in real play. Slices 1–3 together are the **approved gameplay baseline**. `deflectRange` and `maxDeflections` (and the other values Slice 3 introduced) are the approved *current* baseline but remain **playtest-derived candidates, not immutable constants**.


Slice 3 asks one question: *can a skilled player actively defend against an incoming boomerang through timing, while keeping the controls as simple as they are?* It adds exactly one interaction and **no new button**: **an ACTIVE SLASH deflects an enemy boomerang.** SLASH still kills players; now the same action has a second use.

**The rule.** During a swing's existing 0.12 s ACTIVE window, an enemy boomerang (THROWN, RETURNING or already DEFLECTED) whose position is inside the slash region, with a clear line from the defender (a wall is cover), is **deflected instead of being lethal**. Outside the window nothing changes: a boomerang kills as before, and SLASH in recovery defends nothing, so it cannot be a permanent shield. The slash's reach, arc, active and recovery times are unchanged (all Slice 1 values stand).

**Ownership.** Deflection never transfers ownership: the boomerang stays its thrower's, still counts as their one boomerang, and is not duplicated. There is no catching or stealing. The thrower cannot slash it away themselves (a player must hold their own boomerang to slash, so it cannot be both away and in their hand).

**The deflection direction, exactly.** Let `v` be the unit vector of the boomerang's travel (its actual movement this step; falling back to its flight direction, then to the line to its owner) and `s` the defender's slash direction (locked when the swing began). Then

```
out = normalize( reflect(v, s) + s + rot90(s) )
      reflect(v, s) = v − 2 (v·s) s          the boomerang bounces off the blade's face (a plane perpendicular to the swing)
      + s                                      the blade's push along the swing
      rot90(s) = (−s.y, s.x)                   the blade is sweeping across its arc, towards increasing angle (the way the swoosh is drawn), so it also carries things sideways
```

Properties (all tested): `out` is a unit vector; `out·s = 1 − v·s ≥ 0`, so a boomerang is **never knocked back through the defender**; the sum can never be zero; and a head-on throw is **not returned straight at the thrower**: for `v = (1,0)` and `s = (−1,0)` the result is `(−2,−1)/√5`, about 27° off the line it came down. Where the thrower stood (it fixes `v`) and which way the defender faces (it fixes `s`) therefore decide where it goes. It is a model, not physics: no mass, spin or solver.

**Lifecycle.** A new explicit state, **DEFLECTED** (`THROWN | RETURNING | DEFLECTED → DEFLECTED`; `DEFLECTED → RETURNING | DEFLECTED`; never straight to HELD). It carries `direction`, `deflections` (how many times this throw has been knocked off course) and `deflectedBy`. A DEFLECTED boomerang flies straight at throw speed in `direction`, stopped by walls exactly like a thrown one (flush, no penetration, no tunnelling), for at most **`deflectRange` = 300** world units (a *new* value, not a retune), then turns RETURNING and goes home by the Slice 2 wall-following rule, where it is caught as usual (the counters reset when it is back in hand). **It cannot live forever:** one throw can be deflected at most **`maxDeflections` = 3** times (the fourth contact is simply lethal, as normal), each deflected leg is at most 300 units, and the return is bounded by the Slice 2 failsafe. The Slice 1 transition table is unchanged; the deflection transitions are a separate table.

**Resolution order** (one simulation step; positions are end-of-step; nothing depends on collection or input order):

| Situation | Rule |
| --- | --- |
| Boomerang vs an active slash | Deflection is judged **after the boomerangs have flown and before anyone is killed**, so a slash pressed on the very step a boomerang would have killed still saves; one pressed a step later is too late. |
| Boomerang vs player on the same step | A boomerang deflected on a step **kills nobody on that step** (the clank absorbs it), even a bystander right beside it. |
| A slash that reaches a player and a boomerang | Both happen on the same step: the player dies, the boomerang is deflected. |
| Two players able to deflect the same boomerang | Exactly one does: **the nearer to it; an exact tie goes to the earlier player in the match.** Never input order. |
| The defender's own safety | The boomerang you knock away cannot kill you, nor be deflected by you again, **on that deflected leg** (`deflectedBy`); once it has turned RETURNING, normal rules resume. |
| Deflection beside a wall | The boomerang keeps its position and takes its new direction; if that points into the wall its next move is blocked at once and it turns RETURNING. It never enters the wall. |
| Sequential deflections | A different defender can deflect a DEFLECTED boomerang again (`deflections` 2, 3); the same defender must wait for a new leg. The fourth is refused. |
| Simultaneous interactions elsewhere | Independent boomerangs are resolved independently (two defenders each deflect a different boomerang on the same step). Mutual kills are Slice 1's: both die, a draw. |
| Dead players | Their swing was reset on death; they deflect nothing. A dead owner's boomerang can still be deflected. |

**Presentation (primitive).** A successful deflection plays a **CLANK**: a white burst, eight spokes, a ring in the **defender's** colour, and a bright streak pointing the way the boomerang was sent; the deflected boomerang then flies on with a **white trail** (still the owner's colour). About 0.4 s. No production VFX or audio.

**Decisions made (provisional, to be judged by play):** the formula above; `deflectRange` 300 and `maxDeflections` 3 (new values); the clank neutralises the boomerang for the step it is deflected; the deflector is immune on that leg; deflection needs a clear line (cover works against it too); a slash must be ACTIVE (not recovering); only enemy boomerangs, never your own.

**Not in this slice (and not started):** DASH, blocking, shields, another defensive button, catching, ownership stealing, powerups, hazards, additional arenas, scoring changes, production art or audio, CPU players (Slice 7: a bot will use this defence through the same ordinary input interface, a SLASH press, because the rules take it as one input like a human's).

**The playtest will answer:** can you defend by timing rather than only by running? Is the window learnable but not trivial? Is the deflection direction readable and does your facing/position change where it goes? Does a deflected boomerang feel like your opponent's weapon gone wrong? Do three deflections feel like a rally or a mess? Is the clank unmistakable? Does it make throwing riskier in a good way, or does it make throwing pointless?

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

## Slice 4: Mobility — DASH (engineering complete, **not yet played**; an experiment that may be deleted)

Slice 4 asks one question: *does a short, skillful burst of movement make combat better without making positioning, walls, throws and deflections less important?* **DASH is an experiment, not a feature. If it turns the game into everybody constantly zooming around, it is deleted.** Nothing here is validated: every number is a tuning hypothesis, and no Slice 1–3 value was changed to make room for it.

**Controls.** One new manifest-driven button, `DASH` (generic action `TERTIARY`, a protocol addition: `ACTIONS` is now `PRIMARY | SECONDARY | TERTIARY`; nothing that sent the old two changes). The controller has no Fu code: with a TERTIARY button present it lays the cluster out as SLASH across the top, THROW bottom-left, DASH bottom-right (a generic fact about the actions in the manifest; manifests without one keep the old layout). The server advertises it and the console maps it through the one shared table (`FU_BUTTONS`), pinned by the contract test.

```
            MOVE joystick          ┌───────── SLASH ─────────┐
                                   │  THROW   │      DASH    │
```

**The state machine** (`rules/dash.ts`, a `dash` field on every player):

```
READY ──press──► DASHING ──time is up, or blocked by a living player──► READY
```

| Phase | Meaning |
| --- | --- |
| READY | A press starts a dash. **There is no cooldown**: after a burst a press dashes again on the very next step. |
| DASHING `{ direction, remaining, speed }` | The player is carried along `direction` at `speed`. Direction is **locked**: the thumb neither steers nor turns the player. SLASH, THROW and a new DASH are refused. |

**Fatigue replaces the cooldown (playtest change, 2026-10-06).** *Players may spam DASH; repeated use is controlled by fatigue, not by refusing the press.* It is deterministic gameplay state (`fatigue: { dashes, recoverIn }` on every player, `rules/dash.ts`), counted by the rules and nowhere else: not by the controller, the server or the console. No stamina points, no stamina bar, no charges, no multi-second cooldown.

- `dashes` counts **successful** dashes: ones the rules actually started. Button presses, duplicate or stale events, presses refused by the rules (mid-dash, mid-swing, losing to a same-step SLASH or THROW, a dead player), and presses the console dropped never count. A dash that is blocked the moment it starts (against a wall or body) still started, so it counts.
- The first `dashFreeCount` (**8**) dashes are normal. **The 9th triggers FATIGUED** and is itself already a fatigued dash (we read "triggers FATIGUED" as: entering the state at that dash). Dash 10 and beyond are allowed, and fatigued.
- While FATIGUED: **walking is 70%** of normal (`fatiguedMoveFactor`; it multiplies with the slash slowdown while swinging) and **dashes are 70%** (`fatiguedDashFactor`): a fatigued dash lasts as long but goes 70% as fast, so 70% as far. DASH is never disabled. Collision and vulnerability are unchanged.
- **Recovery**: every successful dash restarts a **5 s** clock (`fatigueRecoverySeconds`), counted from the start of the step the dash began in (so it never depends on how time was cut into steps). When it runs out the player is rested: fatigue clears and `dashes` resets to 0. Walking normally does not interrupt it; the next successful dash does. A press on the very step recovery completes counts as dash number 1, at full power.
- Death and a new round reset fatigue. A round ending mid-dash shows everyone READY; fatigue is kept until the reset.
- Events: `FATIGUED` (once, on the dash that tips them over) and `RECOVERED` (when a fatigued player's recovery completes).

**Initial tuning (all unvalidated playtest hypotheses, not balance constants):** `dashSpeed` **1100** u/s · `dashSeconds` **0.16** s (a full-power dash covers **176** units, about 4.9 player radii, 1.35× a slash's reach, a third of a throw; a fatigued one **123**) · `dashFreeCount` **8** · `fatigueRecoverySeconds` **5** · `fatiguedMoveFactor` **0.7** · `fatiguedDashFactor` **0.7**. A dash is 10 steps at 60/s (the last partial). Configuration is validated: speeds and times positive and finite; `dashFreeCount` a positive integer; both factors in (0, 1]; `dashSpeed × step < playerRadius` (a dash is swept in steps shorter than a body, so it cannot tunnel); and `(boomerang speed + dashSpeed) × step < reach` (a boomerang and a dashing player cannot jump past each other between two steps).

**Direction.** The thumb's meaningful direction when the press arrives (outside the dead zone); otherwise the player's current facing; if neither exists (which no real player has) **right**, deterministically. A thumb direction also becomes the facing, exactly as walking does.

**No invulnerability.** A dashing player is hit by boomerangs and by an ACTIVE slash exactly like a walking one, on the same end-of-step positions. Dashing into a boomerang's path, or into an active slash, is a death. A dash can dodge a boomerang only by *being somewhere else* when it arrives. There is no dodge-roll, no stamina, no second charge, and a dash does no damage and no knock-back to anybody.

**Action resolution** (one step; the state at the start of the step decides; nothing depends on the order inputs arrived in):

| Situation | Result |
| --- | --- |
| SLASH + DASH on one step | **SLASH wins**; the dash is dropped, not delayed. |
| THROW + DASH on one step | **THROW wins**; the dash is dropped. |
| SLASH + THROW + DASH | SLASH only (SLASH, then THROW, then DASH). |
| A SLASH or THROW that *could not* happen (boomerang away; a swing in progress) + DASH | The dash happens: an action that cannot happen costs nothing. |
| DASH while the boomerang is away | Allowed; the boomerang flies on, and a returning one still comes home to its (moving) owner and never kills them. |
| DASH while a slash is ACTIVE or RECOVERING | **Refused** (so a swing stays a commitment and DASH cannot cancel its recovery). Accepted on the very step the recovery ends. |
| SLASH or THROW while DASHING | **Refused** for the burst (no dash-attacks); fine the step after. |
| DASH immediately after a THROW | Allowed (the next step). Immediately after a SLASH: refused until it has recovered. |
| Repeated presses while DASHING | Nothing: not queued, not extended, not counted. A held button sends one press (the controller never repeats). Between dashes there is nothing to wait for: the next press dashes. |
| Both players DASH on one step | Both dash, independently. |
| Death during a dash | The dash ends on that very step (state READY); the dead are not solid and do not move. |
| The round ends during a dash | Everybody is shown READY (no half-finished burst frozen on screen); the next round starts all READY and rested at the spawns. |

**Collision** (a dash obeys the geometry walking obeys; nobody is teleported):

- It is carried in sub-steps no longer than the fixed step (so a large accepted `dt`, up to 0.1 s, cannot make it skip anything), each moving a body less than its radius; the distance covered is `dashSpeed × time spent dashing`, whatever way time was cut.
- **Walls**: the same push-out as walking, so a dash at a wall ends flush against it, and one at an angle slides along it. A wall at least one radius thick (the arena's rule) cannot be crossed. The burst's timer keeps running while pinned.
- **Arena boundary**: clamped per axis (slides, like walking).
- **Living players**: a dash stops the instant it would touch one (contact, not overlap), the burst ends, and **nobody is shoved**. A dash that starts already touching a player and pointing at them goes nowhere; pointing away is free. The dead are not solid.
- **Two dashers at each other**: each is judged against the same snapshot of positions, so neither is favoured and who is first in the match never matters; they end in contact, symmetric about the midpoint, never overlapping.
- A player who walks into a dasher is separated by the ordinary equal-bodies rule; nobody overlaps or passes through.
- **Known limit:** hits are judged on end-of-step positions, as for everything in Fu. At the fixed step (what the console runs) a dash moves 18 units per step, far less than a body, so nothing can be skipped; at a large test-only `dt` a dash could cross an ACTIVE slash's region between two steps without being seen. The console never runs a larger step.

**Not trivializing the arena — what fatigue does and does not do (measured).** Corridors stay one body wide, walls stop a dash, bodies stop it; a dash is a burst, not a lane change, and costs 0.16 s of being unable to steer, slash or throw. **But the fatigue model, as specified, does not cap spamming; it only taxes everything except spamming.** Measured in open ground along a lane (a thumb held forward):

| | walking only | spamming DASH the moment it is possible |
| --- | --- | --- |
| 2 s | 840 u | 1,901 u (12 dashes) |
| 5 s | 2,100 u | 4,118 u (30 dashes) |
| 10 s | 4,200 u | 7,814 u (60 dashes) |

Once fatigued, a spammer sustains ≈ 770 u/s (a 70% dash is 770 u/s, back to back) against 360 u/s walking (420 when this was written), and 252 u/s if they stop dashing and walk while tired. So fatigue punishes the *pauses*, not the spam: after the first 8 dashes the best play is to keep dashing. Whether that is the intended design is the question the playtest should answer. If it turns the game into everybody zooming, the levers are a lower `fatiguedDashFactor`, a dash-to-dash gap, fatigue that lengthens the lock-out, or deleting DASH. Nothing was changed to address this; it is as specified.

**Presentation (primitive, no production VFX or audio).** A burst (a ring and three speed lines trailing back) where the dash begins, and while the rules say a player is DASHING, a streak of fading ghosts behind them in their colour. **Fatigue**: when it begins, an amber ring collapses onto the player with falling blue drops, and while the player is FATIGUED a **pulsing amber ring with three sweat drops** stays on them; when they recover, a **green flash and an opening ring** play. All of it is drawn from the rules' state and events (`fatigued`, `FATIGUED`, `RECOVERED`), and decides nothing. No controller feedback beyond the existing button-press tick (the platform has no console→controller state channel; adding one would be a protocol change for a cosmetic), and the controller keeps accepting DASH while you are fatigued.

**Not in this slice:** invincibility frames, dodge-roll, stamina, multiple charges, dash attacks, wall jumping, wall phasing, powerups, hazards, new arenas, production art or audio, CPU players, Slice 5.

**The playtest will answer:** does DASH make *you* feel more skilful, or is it just a button you hold down? Do you still need cover, corridors and chokepoints? Do you dash to commit to a kill or to flee, and which one wins? Do you ever die *because* of a dash (into a slash, into a boomerang) and does it feel fair? Is the 0.16 s lock-out (no slash, throw or steering) a real price? Do 8 free dashes feel like a burst you save for something? When the amber ring appears, do you stop dashing, or keep going because it is still the fastest thing you can do? Is 5 s the right wait, and does one late dash that restarts it feel fair or like a trap? Can you tell, without looking for it, when you are tired and when you are back? Does the arena get *smaller*? Would you miss it if it were gone? (If not, delete it.)

## Slice 5: Powerups — **PASS**

**Slice 5 — Powerups: PASS** on a physical human playtest (the project owner, 2026-10-06), after the lifecycle revision: powerups are **persistent match upgrades**, not round pickups with timers and charges. Frozen as the approved baseline: the mystery blue-book/red-bookmark Powerup Book, scarce spawning, the persistent three-slot FIFO inventory across the nine-round match, persistent PHASE_DASH / OVERDRIVE / BLAST_BOOMERANG / TWIN_THROW, a SHIELD that breaks on a lethal hit, and TWIN_THROW launching **two simultaneous angled boomerangs** from one press. The rules below are what is built and tested.

> **TWIN_THROW correction (after Slice 6 review).** An earlier build threw the twin sequentially (one boomerang per press). That was wrong; the approved rule is the simultaneous angled pair below, and the build, tests and this document now agree.


**Principle: ownership grants the ability.** A power is lost only when (1) it consumes itself by its nature (a SHIELD that blocks a hit), (2) it is FIFO-evicted by a newer one, or (3) the match ends. No arbitrary charges, timers or once-per-round limits.

**1. Inventory.** `FuPlayer.inventory: readonly PowerKind[]` — what a player OWNS, oldest first, at most `MAX_POWERS` = 3. Awarding appends; with three owned the **oldest is removed** (FIFO, no prompt): `[OVERDRIVE, GUARD, PHASE_DASH]` + TWIN_THROW → `[GUARD, PHASE_DASH, TWIN_THROW]`, then + BLAST → `[PHASE_DASH, TWIN_THROW, BLAST_BOOMERANG]`. Removing a power (a broken shield) frees its slot at once and keeps the order of the rest. **No duplicates:** a power a player already owns is never awarded to them (a Book with nothing left to award them stays for someone else).

**2. Ownership vs charge/effect state.** Ownership is only the inventory entry. Anything per-round or per-use lives on the thing it belongs to: a boomerang's `blast` flag (armed for one flight), a swing's `spared` list, the dash's `phasing` line. Nothing about a power is stored on the player except that they own it.

**3. Lifecycle of each power**

| Power | While owned | Per-use / per-round state | Ends |
| --- | --- | --- | --- |
| OVERDRIVE | Walking ×1.4, a dash that starts under it ×1.3 (multiplying with fatigue and the slash slowdown); fatigue accounting untouched. **No expiry.** | none | FIFO eviction, match end |
| BLAST_BOOMERANG | **Every** boomerang the owner throws is armed. Each armed throw detonates once (first enemy contact or wall/arena-edge impact; not at range end, not when deflected); walls are cover; owner and the player who just deflected it are immune. | The *projectile's* `blast` flag is spent by its explosion; the next throw is armed again. The power is never spent. | FIFO eviction, match end |
| GUARD (shown as **SHIELD**) | Absorbs exactly one lethal contact. No timer; unused it stays for the whole match. | none: breaking IS the consumption | **Blocking a hit** (the slot is freed; `POWER_LOST` / `SHIELD_BROKEN`), FIFO eviction, match end |
| TWIN_THROW | A second boomerang. **One THROW press launches BOTH on the same step**, in a symmetric spread about the facing `d`: the player's own boomerang at `rotate(d, −θ)` (left) and the twin at `rotate(d, +θ)` (right), **θ = 13°** (`twinSpreadRadians`, the middle of the approved 12–15°). **Both must be home** before the next Twin throw (no separate ammunition controls). | Each round restores both boomerangs to hand; death, throwing and catching never remove it. Once launched each boomerang is fully independent (walls and gates, deflection, blast, RETURNING wall-following, catch); both keep the same owner and both are armed while BLAST is owned. SLASH still needs just one in hand. | FIFO eviction (the twin goes with it), match end |
| PHASE_DASH | **Every** DASH may cross internal walls. **No charges, no counter, no per-round limit, no cooldown** beyond ordinary DASH and fatigue (every phase dash counts for the 8/9 allowance; fatigued ones are 70%). | the dash's own planned line | FIFO eviction, match end |

*Simultaneous hits and the shield:* all lethal contacts in a step are collected per victim in a fixed order (attacker's place in the match, boomerang/blast before slash, then weapon); a shield absorbs the **first**, the rest kill, and the absorbed weapon/swing cannot hit that player again on that leg/swing. No i-frames: the next step's contact kills.

**4. Persistence across rounds, and the match.** `startRound(..., carried, awards)` carries every inventory (and the count of Books taken) into the next round; death and round end change nothing. `config.matchRounds` (9 in the real game; absent = rounds go on forever, which is exactly Slices 1–4) makes a match: when its last round ends the rules emit `MATCH_OVER` and start a fresh match at round 1 with every inventory cleared. This is the minimum lifecycle needed to prove persistence; scoring and the real match system are Slice 8. Round 9 of the worked example: R1 OVERDRIVE, R4 PHASE_DASH, R6 TWIN_THROW, R8 GUARD (the 4th evicts OVERDRIVE) → round 9 begins with `[PHASE_DASH, TWIN_THROW, GUARD]` (a test).

**5. The Powerup Book (mystery pickup).** One generic object for every power: a blue book with a red bookmark and a "?", the same for all. A Book in the state is `{ id, position }` — **no kind**; its spawn event names nothing; Phaser's view of it carries nothing. The award is decided only when a player takes it, by the rules: `pool` = enabled powers (`config.enabledPowers`, default all five) the collector can still be awarded (not owned, allowed with what they own); `award = pool[mix(seed, n) mod pool.length]` where `n` is how many Books have been taken this match (`FuState.awards`) and `mix` is a small pure integer hash. Same seed + same match = same powers; nothing random is read. The reveal is the `PICKED_UP` event and the on-screen text "NAME GOT PHASE DASH!". If the pool is empty the Book simply stays.

**6. Spawn model (scarce, deterministic).** At most **one** Book in the arena. Nothing at round start. The first appears **15 s of active play** into a round (`SPAWN_RATES.NORMAL.first`); after it is **taken**, the next can appear **45 s** later (the clock is frozen while a Book lies there and counts from the take; it restarts each round). Rates: LOW 25 s / 90 s, NORMAL 15 s / 45 s, HIGH 10 s / 25 s, OFF none. Spot: the four fixed spots in rotation `(n + round − 1) mod 4`, skipping an occupied one. Pickups do not expire. A round may end with nobody getting a power. **Estimate (not measured):** if a typical round lasts 30–60 s of active play, a Book appears in roughly 0.5–1 of them and a second in the same round almost never, so about **4–9 Books across nine rounds for the whole table**, i.e. one or two powers per player in a four-player game — scarce, and nobody is meant to reach three quickly. The accelerated mode (`?powerups=fast`, a Book a second, up to five lying around) is **developer-only**; `?enable=GUARD,PHASE_DASH` narrows the pool for testing one power; `?powerups=low|high|off` select the other rates.

**7. Resolution order (one step).** timers (fatigue, slash) → plan actions (SLASH > THROW > DASH) → dash start (plans a phase line if PHASE_DASH is owned) → movement → **Book collection** (end-of-movement positions; nearest eligible player, ties to the earlier player in the match; one per player per step; cover applies) → slash starts, then throws (a power taken this step already counts) → flight → deflection → hits (contacts, explosions, then shields, then kills) → round end → Book spawn (a new Book cannot be taken the step it appears). Nothing depends on array, set or object order.

**8. PHASE_DASH algorithm (unchanged geometry).** Walls stay solid for walking, slash line of sight, boomerangs and blasts; only the owner's body, only while DASHING, only inside internal walls. A straight line is planned at dash start (cut short by the arena boundary and the first living player; pulled back to the last valid place if the endpoint would be in a wall); the body really moves along it, wall push-out skipped; a dash that cannot clear a wall stops flush; one that ends embedded is pulled back; a living player at the exit is never passed, shoved or embedded; the boundary is not phaseable. No invulnerability: a wall a phasing player overlaps does not shelter them from a slash or blast. Walls are solid again the step the dash ends.

**9. Presentation (primitive).** The Book is a blue book with a red bookmark and "?"; a Book spawn pops a white ring. Taking one announces **"NAME GOT <POWER>!"** over the player; a power leaving shows "<POWER> REPLACED" (FIFO) or "NAME SHIELD BROKE". Each player has three slot circles under their name (oldest on the left, empty slots dim) and the top-left list shows `Name [A] [B] [C]` for everyone; GUARD adds a cyan ring; armed boomerangs have a red-orange ring; a phasing player is see-through with a dashed violet ring and violet portals. All from rules state and events; Phaser decides nothing.

**Tuning hypotheses (unvalidated):** OVERDRIVE ×1.4 walk / ×1.3 dash · blast radius 170 · NORMAL Book rate 15 s / 45 s, one at a time · pickup radius 28.

**Not in this slice:** teleport-to-boomerang, more boomerangs than TWIN, trails, camouflage, shrinking arenas, boomerang control, control scrambling, decoys, hazards, arenas, CPU players, scoring and the match system (Slice 8), production art or audio.

**The Slice 5 playtest asked:** is a mystery Book exciting or frustrating? Is one Book a round-ish scarce enough, too scarce? Do you feel the three-slot FIFO (does losing the oldest hurt, does it create decisions)? Which powers are fun to *keep* for nine rounds and which become the only thing that matters? Is OVERDRIVE a build or just a faster game? Does PHASE_DASH without charges trivialise the arena? Is BLAST on every throw too much? Does the SHIELD feel right as a one-hit buffer that you can lose and refill?

## Slice 6: Arena Systems — **PASS**

**Slice 6 — Arena Systems: PASS** on a physical human playtest (the project owner). Frozen as the approved baseline together with Slices 1–5: timed gates (wait while occupied), moving platforms (carry riders, never crush), the SAFE → WARNING → ACTIVE lethal floor, the platform-over-hazard shelter, and the experimental arena. Slice 6 asked: *can interactive arena elements deepen positioning, timing and combat without making the arena unpredictable, confusing or more important than the players?* One experimental arena (`SYSTEMS_ARENA`; the Slice 2 arena is untouched and remains the regression baseline) with exactly three families: **timed gates**, **moving platforms** and **one hazard type**. No portals, destructible terrain, switches, random hazards, turrets, conveyors, wind, water, ice, trails or new powerups. Play it with `?arena=systems` on the console address (the baseline arena is the default).

**Everything is a pure function of `roundTime`** — simulated seconds of *active play* since the round began (`FuState.roundTime`, frozen while the round is over, 0 again at every round start). The same time gives the same gate phase, platform place and hazard phase at any dt; nothing reads a wall clock; Phaser only draws (`systemsView`). The only extra state: `gatesShut` (whether each gate has actually shut) and `hazardSpared` (shield passes).

**1. Timed gates.** `GateSpec { rect, openSeconds, warnSeconds, closedSeconds, offsetSeconds }`. The schedule over one cycle (`openSeconds + closedSeconds`): **OPEN** for `openSeconds − warnSeconds`, **CLOSING** for the last `warnSeconds` (still passable, flagged), **CLOSED** (solid wall) for `closedSeconds`; a boundary instant belongs to the new phase. Experiment values: open 6 s (the last 2 s CLOSING) then closed 6 s: OPEN 0–4 s, CLOSING 4–6 s, CLOSED 6–12 s, repeating; both gates share them. **A gate that comes due to close waits while anything overlaps it** — a living player (standing, walking or DASHING), a PHASE_DASH player crossing it, or a boomerang in flight — and shuts on the first sub-step nothing is in it (shown as CLOSING, flagged *held*), so nobody is ever embedded in newly solid geometry. A shut gate is ordinary solid wall: walking and normal DASH stop flush, boomerangs stop and turn back, SLASH line of sight and blast explosions are blocked, a RETURNING boomerang goes round. **PHASE_DASH treats a CLOSED gate as internal solid wall** and can phase through it under the normal traversal rules. (Hypothesis to watch: a player standing in a doorway keeps it open.)

**2. Moving platforms.** `PlatformSpec { size, from, to, travelSeconds, pauseSeconds, offsetSeconds }`: one axis only, there and back, waiting `pauseSeconds` at each end; position is a function of time (cycle `2 × (travel + pause)`). A platform is **rideable floor, not solid**. **A body whose centre is on it at the start of a sub-step is carried by the platform's displacement for that sub-step**; movement relative to the platform stays fully controllable (the thumb adds to the ride); a body whose centre is off it is not carried; a **DASHING player is not carried** (the burst is their own). After carrying, the normal separation pass resolves everything: a rider carried into a wall or into another player is pushed clear (walls win, as always) — **a platform never crushes or kills anybody**; several riders keep their relative places. Boomerangs do not inherit platform motion (world-space rules unchanged). A platform over a hazard is a **bridge**: its riders are not touched by the floor under it. **This protection was not in the original Slice 6 specification: it is an experimental behaviour recorded as a Slice 6 human-playtest hypothesis, not an approved baseline; the owner decides after playing whether it survives.** Experiment values: 100×90, travel 4 s, pause 1.5 s, the two platforms running in opposite directions.

**3. Hazard: a periodically lethal floor.** `HazardSpec { rect, safeSeconds, warnSeconds, activeSeconds, offsetSeconds }`: **SAFE → WARNING → ACTIVE → SAFE**, no randomness. Experiment values: SAFE 5 s, **WARNING 2 s**, ACTIVE 3 s (SAFE 0–5, WARNING 5–7, ACTIVE 7–10 s, repeating); both strips share them. While ACTIVE a living body whose **centre** is on the strip dies (credited to `HAZARD`), unless it is riding a platform. Judged at the end of every sub-step, so no accepted dt can skip a thin strip. **Shield:** a hazard is an otherwise lethal contact, so an owned SHIELD absorbs it **once** and breaks (slot freed, `POWER_LOST`); the player is then spared by that hazard for the rest of that ACTIVE window (the same one-hit rule as a slash: it cannot hit them again on that swing) but **not** the next window. In the fixed contact order the arena comes after every player's boomerang, blast and slash. **No power grants hazard immunity:** PHASE_DASH and OVERDRIVE cross a strip like anyone, and a dead player's powers persist as always.

**4. Resolution order.** Within each sub-step: gate latching (a gate scheduled CLOSED shuts only if nothing overlaps it; a gate no longer scheduled closed re-opens) → solid geometry rebuilt → riders found (start-of-sub-step positions) → walkers move → riders carried → dashers / overdriven walkers carried → dash timers, phase settle → separation (static walls + shut gates; players apart) → hazard contacts recorded. After the sub-steps the rest of the Slice 5 order runs with the end-of-step solid set (Book collection, slash/throw, flight, deflection, hits: contacts from boomerangs/blasts/slashes/hazards collected per victim in a fixed order, shields, kills), then the round clock advances.

**5. The five powers.** OVERDRIVE: no immunity; an overdriven rider walks 1.4× on top of the ride; stopped flush by a closed gate. BLAST_BOOMERANG: a closed gate is cover from an explosion, an open one is not; a blast boomerang in a doorway holds the gate open. SHIELD: absorbs one hazard contact (above). TWIN_THROW: both boomerangs of the pair stop at a closed gate, each independently. PHASE_DASH: phases a closed gate (and waits-open if it would close on a phaser), crosses a hazard lethally.

**6. The arena (`SYSTEMS_ARENA`, 1600 × 900, mirrored left–right and top–bottom).** Walls: the central block (700,390,200×120), four dividers at x 470–520 and 1080–1130 (y 200–400 and 500–700) and two flank covers. A gate (y 400–500) sits in the middle of each divider pair: the short route from a flank to the middle; the **alternate routes** are the open top and bottom lanes and the open ground beside the hazards (a test floods the map to prove every spawn reaches every other with all gates closed and without touching a hazard). Two hazard strips (x 640–960; y 240–350 and 550–660) above and below the central block, each with a platform shuttling along it. Spawns: the baseline arena's six corner/lane points (all clear of every system, validated). Everything is symmetric (a test checks it); the platforms run opposite directions, so the only asymmetry is *time* (which way each is moving when a given player arrives). Book spots: four open places clear of every system. Plenty of ordinary open ground; PHASE_DASH is never required.

**7. Presentation (primitive).** Gate: OPEN = green dashed frame; CLOSING = amber blinking frame (red and faster when held open by something in it); CLOSED = dark barred slab. Platform: blue slab with chevrons in its direction of travel, pause bars while it waits at an end. Hazard: SAFE = faint dashed red outline; WARNING = amber striped fill blinking faster as ACTIVE nears; ACTIVE = solid red with bright moving stripes. All from the rules' state.

**Tuning hypotheses (unvalidated):** gate 4 s open + 2 s warning + 6 s closed · hazard 5 s safe + 2 s warning + 3 s active · platform 4 s travel + 1.5 s pause.

**The playtest will answer:** can you read a gate before you commit to it? Is the warning long enough everywhere (gate 2 s, hazard 2 s)? Do you ever die *surprised*? Does the platform-bridge protection (a hypothesis, not baseline) make riding a fun risk, or a fixed best route — and should it stay? Does camping a gate doorway (which keeps it open) become a problem? Do the hazards shape fights, or just get ignored? Does anything make the arena matter more than the players?

## Slice 7: CPU Players + Difficulty (recalibrated after Human Playtest #1; **not PASS**; every number is a playtest hypothesis)

Slice 7 asked: *can software players make a room playable when there are not enough people, without breaking the rules or feeling fake?* **A CPU is a player whose controller happens to be software.** It has no combat rules of its own: every step it produces exactly what a phone produces — a MOVE thumb vector and the SLASH / THROW / DASH button presses (`FuPlayerInput`) — and `stepFu` treats it like anyone else. It is slowed by fatigue, stopped by walls and closed gates, killed by the floor, deflected, shielded, phased and Book-fed by the same rules. Slice 7 adds no mechanic, powerup, arena system, map, scoring change, art or audio, and the Slice 1–6 baselines are untouched.

```
Human phone ─► network ─► InputBuffer ─┐
                                       ├─► FuPlayerInput ─► stepFu (the rules) ─► FuState
CpuController (software) ──────────────┘
```

**Where it lives.** `games/foomerang-fu/src/cpu` (`controller.ts`, `nav.ts`, `profile.ts`, `rng.ts`) — pure and deterministic like the rules: no Node, DOM, Phaser, Socket.IO, clock or `Math.random`; the lint boundaries apply. The console wires it: `apps/console/src/runtime/cpuRoster.ts` (the CPUs the host added), `matchDirector.ts` (CPU bodies, slots, activity), `fuRuntime.ts` (asks each `CpuController` for its input each step and puts it in the same `inputs` map the network path fills), `ui/Lobby.tsx`. The CPU code is in the lazy Fu chunk; the lobby never downloads it. **No CPU is a socket:** the server only ever knows people.

**Participants.** A participant is a human (seat, connection, network input) or a CPU (a difficulty, no seat, no connection). A CPU has the same stable identity as anyone: a slot (spawn point, colour, number, marker), a name (`CPU 1` …) and an id that cannot collide with a person's (`cpu:N`; ids are never reused). Up to **six** participants, humans and CPUs together. Supported: human-only, human vs CPU, several of each, per-CPU difficulty, filling empty slots (e.g. Human, Human, CPU Easy, CPU Medium, CPU Hard, CPU Hard). A CPU-only match is exercised by the tests and the evaluation harness; the lobby always needs one person (the server's `minPlayers` for Fu is now 1; the console requires at least two participants and at most six).

**Lobby.** Add CPU (with a difficulty chooser: Easy / Medium / Hard), per-CPU difficulty selector, per-CPU Remove, CPUs listed in the roster with their marker and number and the label “CPU”. Start is disabled with fewer than two or more than six participants (and says why). No settings screen, personalities or names.

**Difficulty is decision quality, never physics.** The three profiles (`profile.ts`) differ in how stale the world it sees is, how often it re-decides, aim error, how much it leads a moving target, how well it defends, how it uses DASH, hazards, Books and routes. None changes speed, dash allowance, boomerang speed, hitbox, recovery, powerups, shields or what it may know.

**Perception and reaction.** Each step a CPU sees a snapshot of the world **delayed** by its own reaction time, drawn once per CPU from its difficulty's band with its seeded generator: **Easy 550–850 ms (33–51 ticks), Medium 300–450 ms (18–27), Hard 180–280 ms (11–17)** (recalibrated, see below; the first build had 400–650 / 200–350 / 100–180). It sees what a player on screen sees: positions, boomerang states, facings, inventories, Books (as unknown objects), walls, gates, hazards and platforms — never a Book's award, another player's future input, the future or the random generator. Velocities are *inferred* from successive delayed snapshots, and stale positions are extrapolated by the delay (scaled by the profile's `lead`), so a CPU aims where something *was* plus what it can infer, not where it is. At the start of every round it observes nothing for `delay + 6` ticks (it cannot act on a world it has not seen yet). It decides every `decisionTicks` (Easy 18, Medium 14, Hard 8; first build 12 / 8 / 4) with a per-CPU phase so a table does not think in lockstep, and Easy sometimes lapses (wanders) or skips a decision.

**Navigation.** The smallest thing that works: a 25-unit grid over the arena (`nav.ts`) with walls and *currently shut or about-to-shut gates* as obstacles, a breadth-first distance field from the goal (cached for 20 ticks), steered by walking down the field with a line-of-sight shortcut. Hazards are avoided by their phase (ACTIVE always; WARNING and an imminent ACTIVE by the profile's lookahead; Easy ignores the schedule), gates are read by their status and the time to the next change, platforms are used (Hard only) as bridges over a hazard it must cross. **PHASE_DASH is used only through the ordinary DASH press, only when it owns the power:** `planPhaseDash` (the rules' own planner) over 16 directions to see whether a phased dash reaches the goal sooner than walking. No teleporting, no steering of its own.

**Combat.** Weapon state: with a boomerang in hand it looks for a throw (in range, line of sight, aimed with the profile's lead and error; the aim is a small thumb vector toward the aim point sent on the same step as THROW, because a boomerang flies where you last pointed); with it away it seeks cover and avoids pressing an armed enemy, and it presses an opponent whose boomerangs are away (Hard only). Incoming boomerangs (thrown, RETURNING or DEFLECTED, anyone's but its own) are projected along their inferred path; it then chooses — with the profile's probabilities — a timed SLASH deflection (the press is scheduled for when the boomerang will be in reach, allowing for its own walking speed, with timing jitter), a sidestep, or a dodging DASH; a CPU can mistime a deflection and die. In reach of an opponent it slashes (Hard slashes eagerly, Easy half the time). A pursuit DASH never runs down the line of fire of an armed enemy. DASH is fatigue-aware (Medium/Hard stop dashing before they would be FATIGUED; Easy does not, and sometimes dashes for no reason).

**Powerups.** The same mystery Book as everyone: a CPU goes to a Book it can see (its interest and range by profile; Hard skips a Book when a foe is on top of it), has no idea what it will award, and plays whatever it now owns through the same buttons: OVERDRIVE (more reach in walking and dashing), PHASE_DASH (route shortcuts above), TWIN_THROW (one press, two boomerangs: aimed so the pair brackets the target), BLAST_BOOMERANG (a blast shot near walls/cover is acceptable), SHIELD (it presses closer, “bold”). The persistent three-slot FIFO inventory, the match-long persistence and the clearing at match end are the rules'.

**Arena systems.** Avoids an ACTIVE floor, reacts to WARNING (leaves the strip), treats a closed gate as a wall and a CLOSING one as shutting, and a gate it would hold open is just a doorway to it. Hard uses a platform as a bridge; Easy ignores the schedule entirely and may die to it.

**Target selection.** Among living opponents, score = proximity, exposure (a foe whose boomerangs are away, or who is in line of sight), threat (grudge against whoever last attacked it) with the rule *a strictly better score wins, an exact tie keeps the earlier opponent in match order*; kept for `retarget` ticks (Easy 90, Medium 60, Hard 30) unless the target dies.

**Hard is smart, not psychic.** Its limits are measurable: it reacts 180–280 ms late; it aims with a 0.08 rad standard deviation (and one throw in sixteen is badly aimed, ×2.5) and leads 80% of what it can infer from delayed snapshots (a target that jinks after the throw is missed: it hits 30 of 60 first throws against one); it decides every 8 ticks and then commits to a heading for 0.17–0.37 s; it hesitates 7% of the time, holds back 8% of the throws it could take, takes a merely reasonable heading (±0.12 rad), notices 85% of returning boomerangs, deflects 55% of the shots it sees in time, with a 3-tick timing error, and lapses 3% of decisions. Easy leads nothing, aims 0.30 rad off (a quarter of its throws far worse), reacts 550–850 ms late, ignores the hazard schedule, commits to a heading for 0.7–1.2 s, stops to look 40% of the time and holds back 35% of its throws.

**Determinism.** Every bit of variability comes from one seeded generator per CPU (`Rng`, mulberry32; `seedFor(matchSeed, index)`). No `Math.random`, no `Date`, no wall clock; the same seed, arena, participants and human inputs replay to the identical state and events (tested, including the full 4-participant mixed match). A different seed plays a different game. (The console seeds each CPU from the match's seed and its seat; the host measures decision cost with `performance.now`, which never feeds back into a decision.)

### Profiles (all hypotheses; **recalibrated** — first build in brackets where it changed)

| | Easy | Medium | Hard |
| --- | --- | --- | --- |
| reaction (ms / ticks) | 550–850 / 33–51 [400–650] | 300–450 / 18–27 [200–350] | 180–280 / 11–17 [100–180] |
| decides every | 18 ticks [12] | 14 [8] | 8 [4] |
| **commits to a heading for** | 0.7–1.2 s | 0.33–0.7 s | 0.17–0.37 s |
| **hesitates (stops to look)** | 40% of new decisions, 0.33–0.8 s | 18%, 0.2–0.47 s | 7%, 0.13–0.3 s |
| **route slack (rad)** | ±0.5 | ±0.35 | ±0.12 |
| aim error σ (rad) / badly-aimed throws | 0.30 [0.24] / 25% | 0.20 [0.10] / 15% | 0.08 [0.035] / 6% |
| target lead | none | 35% [60%] | 80% [100%] |
| **a ready throw held back / min. ticks between throws** | 35% / 60 | 20% / 36 | 8% / 20 |
| deflect attempt / timing σ | 6% [12%] / 11 | 30% [50%] / 6 | 55% [85%] / 3 |
| dodge | 15% [25%] | 40% [60%] | 70% [90%] |
| **notices a RETURNING boomerang** | 25% | 55% | 85% |
| dash use / **min. ticks between dashes** / fatigue-aware | 10% / 420 / no (+3% misuse) | 30% [50%] / 200 / yes | 60% [90%] / 90 / yes |
| hazard lookahead | none | 0.35 s [0.5] | 1.2 s [1.5] |
| Book interest / range | 25% / 300 | 60% [70%] / 600 [700] | 100% / 1200 [1600] |
| throws from at most (× throw range) | 0.6 [0.7] | 0.75 [0.85] | 0.9 [0.95] |
| PHASE routes, platforms | no, no | yes, no | yes, yes |
| pressure an unarmed foe, cover | no, no | no, yes | yes, yes |
| lapses | 15% | 8% [5%] | 3% [1.5%] |

### Playtest #1 and the recalibration

**Human Playtest #1 (the project owner, Easy and Medium):** the CPU system works extremely well, but **Medium was far too strong and too fast** (“an esports bot”); Hard was not yet judged. Slice 7 is **not PASS**. The brief for the correction: do *not* touch physics (speed, collision, projectiles, dash rules are identical for every participant); reduce tempo and decision quality instead; add deterministic decision commitment and hesitation; audit DASH; measure which dimension causes the felt speed *before* changing values; report before/after; Medium ≈ 300–450 ms to start, Hard ≈ 180–280 ms, Easy beginner-friendly.

**What the measurement showed (before any change).** Medium used DASH rarely in duels (1.1 per minute; Hard 10.2), so DASH was not Medium's problem. Against a plausible human proxy (wanders, sidesteps a boomerang after 250 ms, misses it one time in three), a Medium CPU killed it within 10 s 98.8% of the time, on average after 2.5 s, its first throw landing 1.47 s into the round and hitting 62.5% of the time — Easy was not far behind (98.8%, 3.3 s, 47.5%). Changing one dimension of Medium at a time (aim error ×2, lead ÷3, dash use ÷5, lapses ×5, retargeting ×2) moved kill time by well under 0.3 s each: **the boomerang is so forgiving that aim, lead and dashing hardly matter; what decides a fight is how soon, and how often, the CPU throws.** The dimensions that moved it were reaction time, decision rate and how far it will throw from (first throw 1.47 s → 1.63 / 1.77 / 1.86 s), and — in the human's felt experience — the absence of any hesitation: it never paused, re-aimed every few ticks and re-threw the instant its boomerang was home.

**What changed (decision quality only; `profile.ts`, `controller.ts`):** slower reaction bands (Medium 300–450 ms, Hard 180–280 ms, Easy 550–850 ms) and slower decision rates; **decision commitment** (`#settle`): once it has chosen a heading (chase, cover, a Book, a position) it keeps it for a difficulty-dependent time before reconsidering, and with some probability stops to look instead; only danger it has noticed (the floor, a boomerang), a chance to strike, or a heading that now walks it onto a hazard it knows to be deadly interrupt a commitment; route slack (a merely reasonable heading, never into a known hazard); a ready throw is sometimes held back and throws are spaced; a fraction of throws are badly aimed; less lead; a slower, less certain defence; returning boomerangs are noticed less often; dashes are spaced out (`dashGap`) on top of the unchanged fatigue rules. Hard keeps its competencies (lead, cover, pressure on a weaponless foe, powerups, fatigue management, arena systems) but is slower, commits and errs.

**Before → after (deterministic bot evaluation; diagnostics, nothing tuned to a figure).** Reaction latency, mean over CPUs: Easy 521 → 704 ms, Medium 274 → 377 ms, Hard 141 → 234 ms. Vs the human proxy: Medium killed within 10 s 98.8% → 88.3%, mean kill time 2.51 → 4.30 s, first throw 1.47 → 2.19 s, first throw hits 62.5% → 46.7%; Easy 98.8% → 61.7%, 3.26 → 6.99 s, 47.5% → 31.7%; Hard 100% → 98.3%, 2.01 → 2.60 s. Duels (60 matches, ≈1,200–1,900 rounds per pairing, sides alternated): Easy vs Medium 0.8% / 99.1% → **14.8% / 85.0%**; Medium vs Hard 4.7% / 95.3% → **8.2% / 91.3%**; Easy vs Hard 0% / 100% → 2.6% / 97.4%; mirrors still ≈ even; mean round 1.4 → 1.6 s (Medium), 1.4 → 3.4 s (Easy), 1.4 s (Hard). Heading changes per second (a change of heading by more than ≈ 30°, or stopping/starting): duels Easy 0.69 → 0.89, Medium 1.08 → 0.90, Hard 1.26 → 0.99; systems table Easy 0.93 → 0.89, Medium 1.43 → 1.22, Hard 2.77 → 1.73 (Easy's figure includes its hesitations, which are stops). **DASH per minute alive:** duels Easy 0.0 → 0.5, Medium 1.1 → 0.1, Hard 10.2 → 2.0; systems table Easy 0.9 → 0.7, Medium 4.3 → 1.1, Hard 37.7 → 6.8. **Throw accuracy** (kills per throw): duels Easy 87.5% → 43.4%, Medium 46.2% → 56.9%, Hard 63.4% → 57.3% (against far less evasive opponents the Easy figure was inflated by late throws at standing targets; in the systems table Easy 26.4% → 25.7%, Medium 54.5% → 48.7%, Hard 47.3% → 49.0%). **Defensive deflection success** (deflections ÷ boomerangs thrown at it): duels Easy 0.0 → 0.4%, Medium 0.3 → 0.2%, Hard 1.8 → 0.2%; in the targeted scenario (a boomerang already 500 away, tired CPU) Hard deflects 48.8% → 37.5%, Medium 35% → 2.5%, Easy 0% → 0%. A slower Medium can almost never deflect a 900-units/s boomerang thrown from half a screen away — a believable consequence of 300–450 ms; whether it makes Medium too soft is a playtest question. **Hazard deaths per 100 rounds** (systems table): Easy 0.00 → 0.08, Medium 0.00 → 0.17, Hard 0.00 → 0.08 (a handful of deaths; a committed heading is the cause, and is now cut short when it points at a known hazard). Mixed tables, systems arena (E M H H): Easy 0.7% → 2.6%, Medium 36.1% → 21.8%, Hard 26.9% / 35.4% → 34.1% / 40.7%; (E E M M H H): Easy 9.7% / 11.7% → 6.7% / 5.7%, Medium 21.2% / 15.1% → 18.2% / 10.5%, Hard 17.5% / 23.9% → 27.5% / 30.4%. Honest reading: Medium is clearly slower, hesitant and less lethal (and Easy much more beatable by the proxy), the ordering Easy < Medium < Hard holds, but the CPU-vs-CPU gaps are still large because a faster first throw still wins; and **bots measure bots, not you.** Candidate next knobs, not applied: a longer minimum opening delay, Medium throwing from still shorter range, Hard's reaction a little higher.

### Evaluation (first build, diagnostic only; superseded by the table above)



`pnpm --filter @foomerang/foomerang-fu eval:cpu` plays CPU-vs-CPU matches (two minutes each, deterministic, Books on, sides alternated), prints the statistics and asserts nothing. 60 matches per matchup (≈1,800–2,100 rounds each), baseline arena:

| Matchup | A wins | B wins | no winner | mean round |
| --- | --- | --- | --- | --- |
| Easy vs Easy | 55.0% | 40.2% | 4.8% | 1.4 s |
| Medium vs Medium | 45.7% | 52.8% | 1.6% | 1.4 s |
| Hard vs Hard | 49.0% | 47.4% | 3.6% | 1.4 s |
| Easy vs Medium | 1.0% | 98.9% | 0.1% | 1.2 s |
| Medium vs Hard | 4.5% | 95.5% | 0.0% | 1.0 s |
| Easy vs Hard | 0.0% | 100% | 0.0% | 1.0 s |

Honest reading: **the ordering is strictly Easy < Medium < Hard, and mirror matchups are about even (no seat bias); but the gaps are very large and rounds are short (≈1–1.4 s) because the first throw usually decides them.** The reaction delay therefore dominates: a faster CPU throws first. That says little about *humans* (who react however they react, and can dodge a late Easy throw); the playtest decides whether Easy is gentle enough and whether Hard is fair. Candidate knobs after play (not applied): narrower reaction bands, a minimum opening delay, more Easy hesitation. Defensive and Book behaviours (deflects, dashes, Books, guard blocks) appear in the per-round counts only when the first throw misses (e.g. Hard vs Hard: 0.06 deflects, 2.08 dashes, 0.09 Books per round). Tables in the systems arena (60 matches, seats rotated): four (E M H H): Easy 0.7%, Medium 36.4%, Hard 26.7% / 35.2%; six (E E M M H H): Easy 10.3% / 10.6%, Medium 22.4% / 15.0%, Hard 18.1% / 22.4% — in a free-for-all the weak survive by being ignored.

### Tests

`games/foomerang-fu/test/cpu.test.ts` (behaviour, through the real rules, never the CPU's internals): the CPU's output is only the legal inputs; MOVE/THROW/SLASH/DASH really happen in the rules; no better physics (speed, dash length, allowance, recovery) for any difficulty; reaction differs by difficulty and a CPU does not know the present or the future (the opponent's change is noticed no earlier than its delay; with the Book award changed its inputs are identical until the Book is taken); aim and prediction differ by difficulty (first-throw kill rate on a target that jinks: Easy 2/51, Medium 6/60, Hard 30/60 — and Hard misses); defence: timed deflection works and can be mistimed, dodging, fatigue-aware dashing; walls, corridors, gates (open/closing/closed), hazards (WARNING, ACTIVE), platforms; PHASE only when owned and only through DASH; Books taken through the normal rules and an unknown award; builds up to three, TWIN, BLAST, SHIELD; multi-CPU target selection and ties; a mixed match; six CPUs; death/reset; nine-round persistence; deterministic replay; seeded-generator purity. Console: `test/cpuRuntime.test.ts` (roster, six at the table, same input path, a CPU is always active, hostile input addressed to a CPU is ignored, slots) and the lobby tests in `test/app.test.tsx`. End to end (`integration/e2e/cpu.e2e.ts`): one real controller plays a Medium and a Hard CPU from the lobby; remove/difficulty/limit of six.

**Mutation testing of the CPU (first build)** (24 hand-made faults in the profiles, perception, aim, deflection, hazards, fatigue, Books, tie rule and seeding; each run against `cpu.test.ts` + `cpuProfiles.test.ts`): **21 killed, 3 survive.** Killed include: Hard with zero reaction time; Easy as fast as Hard; Hard aiming perfectly / no aim error; Easy leading fully; Hard deflecting perfectly; Medium never deflecting; Easy reading the hazard schedule; WARNING not avoided; Hard ignoring fatigue / dashing while fatigued; Hard ignoring Books; Hard never planning PHASE routes; no observation window at round start; observing the present instead of the delayed past; the tie rule going to the later opponent; stale shot positions not advanced; an inverted chance; a seed (or seat) ignored by `seedFor`; dashing on every decision. **Survivors, stated honestly:** (a) Easy never misusing DASH (the misuse is 6% of decisions on top of its ordinary dash use; not separable in a scenario); (b) no extrapolation of a stale observation (about 30 units of lead; the lead tests are insensitive to it); (c) the aim-internal range check (the throw decision already enforces the same range first, so it is a redundant guard). The survivors' mutants were found by the first run and the missing tests for the rest (aim spread, deflection frequency, the warning floor, fatigue, Books, seat seeding, dash frequency) were added in `cpuProfiles.test.ts`.

**Mutation testing of the recalibration** (12 more faults: commitment off, no throw gap, no dash gap, throws never held back, always noticing returning boomerangs, never hesitating, no route noise, no aim lapses, Medium reacting like the old Hard, Hard at machine speed, Medium dash gap 0, Medium never committing): **12 killed** (4 of them only after tests were added for held-back throws, returning-boomerang awareness, hesitation and aim lapses). Tests added in `cpuProfiles.test.ts`: commitment (no heading shorter than the profile's shortest commitment; Easy commits longest), throw gap and hold, dash gap, hesitation share, returning-boomerang awareness at equal reaction time, a monotone ladder in every tempo dimension, and the playtest's reaction bands.

### Performance (measured)

`pnpm e2e:cpu6`: one idle controller and five Hard CPUs (six participants), dev console, headless Chrome on the development Mac, 60 s: **FPS 59.97 / 60.00 / 60.09 (min / median / max of 30 two-second samples)**; CPU decisions 18,245, **mean 0.019 ms, worst 6.9 ms** (one outlier; includes the first path-field build); **3,649 simulation steps, 8 catch-up frames, 1 discard event, 16.7 ms of simulation discarded in total** (re-measured after the recalibration). Six Hard CPUs with no person at the table are not reachable from the lobby (a person is needed to start); they are covered by the evaluation harness and tests. Bundle (`pnpm build`, gzip): initial JS **124.3 kB** (budget 130), lazy JS **346.3 kB** (budget 380, unchanged); the CPU controller adds about 4.7 kB to the lazy Fu chunk and the lobby roster about 2 kB to the initial one. Budgets were not raised; the headroom comes from the arcade-physics-only Phaser build.

### How to play it (the playtest)

Start the demo, open the console (Foomerang Fu), join from your phone, **Add CPU** with *Easy*, Start; then again with *Medium*, then *Hard*; then a table: you + Easy + Medium + Hard, and the systems arena (`?arena=systems`) and Books (`?powerups=high`). Judge: does Easy feel gentle and *slightly silly*, Medium fair, Hard sharp but not psychic? Does any CPU do something a person could not (see through walls, dodge instantly, never miss a deflect)? Do they get stuck, wander forever, or camp? Do they use Books, dashes, gates, the floor sensibly? Is a round against a CPU too short (the first throw tends to decide it)? **Slice 7 is not PASS until you have played Easy, Medium and Hard.** After the recalibration, replay Easy and Medium first (does Medium feel like a competent friend you can beat if you play well? does it pause, commit, overshoot, miss, mistime a deflection, dash only now and then?), then Hard.

## Slice 8: Game Modes + Kill-Race Match Structure — **PASS**

**Slice 8 — Match Structure / Free For All: PASS** on a physical human playtest (the project owner). Frozen as the approved gameplay baseline together with Slices 1–7: the 14-hole kill race, attribution and the self-kill penalty, immediate victory, the same-step tiebreak, regulation/overtime, rematch and return to lobby, late join and the host lifecycle. Slices 1–8 are the regression baseline for all production content.

(The engineering record of the slice follows.)

The proposed round-win scoring (*last survivor → +1 round point*) is **rejected and not implemented**. Standard Free For All is a persistent **kill race**: every credited enemy elimination fills one of fourteen holes in the killer's meter; the first meter to fill ends the match **at once**. Rounds still exist (they restore combat state, never the match's progression), but surviving a round is worth nothing.

### Game modes (console; `apps/console/src/runtime/gameMode.ts`)

A mode is an id in a short list, chosen by the host before starting: `FREE_FOR_ALL` (available) and `HIDE_AND_SEEK` (listed, **COMING SOON**). The server and room model know only `foomerang-fu`; the mode is console-side configuration that selects a rules configuration (`FREE_FOR_ALL = { targetKills: 14, regulationRounds: 9 }`), so a later mode is one more entry, not a rewrite. Hide & Seek is genuinely unavailable: its radio is a disabled `<input>` (not focusable or choosable), `ModeSelection.select` refuses it (returns `false`, the selection does not change), the director will not begin a match for a mode that is not available, and the game runtime throws if asked to play it. No Hide & Seek gameplay exists.

### Free For All configuration

Two to six participants, any mix: **humans only, CPUs only, or both**; the host decides and nothing adds a CPU unless the host does. Each CPU keeps its own Easy / Medium / Hard (also through a rematch). Start is disabled with fewer than two or more than six participants, with the reason shown. To let a match start with nobody on a phone the server's `minPlayers` for Foomerang Fu is 0 (room-engine accepts 0; the console still requires two participants).

### The kill-race rules (`rules/scoring.ts`, `rules/step.ts`; the UI decides nothing)

- **State:** `FuState.scores` (kills per player), `tiebreak`, `matchOver`; phase `MATCH_OVER`; config `targetKills` (absent = Slices 1–7 behaviour: rounds forever) and `regulationRounds`.
- **Events:** `HIT` now carries `source` (SLASH / BOOMERANG / BLAST / HAZARD) and `creditedTo`; `SCORE` (`playerId`, `victimId`, `delta` +1 / −1 / 0, `reason` KILL / SELF_KILL / ENVIRONMENT, `kills`); `MATCH_WON`; `TIEBREAK_START`.
- **Each step**, after all simultaneous contacts are resolved (shields first), the deaths of that step are scored in player order from the same starting scores (so mutual kills both score), then victory is evaluated.

**The complete attribution table**

| What killed the victim | Credited to | Score | Notes |
| --- | --- | --- | --- |
| SLASH (an ACTIVE swing) | the swinger | killer +1 | A player killed on the step they swing still lands that swing (Slice 3), so mutual slash kills both score |
| Boomerang, THROWN | its owner | owner +1 | |
| Boomerang, RETURNING | its owner | owner +1 | a boomerang coming home kills like any other |
| Boomerang, DEFLECTED | **the deflector** (`deflectedBy`) | deflector +1, the thrower nothing | the deflector sent it; its owner and the deflector are immune to it (Slice 3). After the deflected leg ends it is RETURNING again and credited to the owner |
| TWIN_THROW (either boomerang) | the owner | owner +1 **per victim** | both boomerangs hitting one victim on one step is one kill (a victim dies once) |
| BLAST (an explosion) | the blast boomerang's owner, or its deflector if it was deflected (same rule as above) | +1 per victim killed | a shield breaks instead (below) |
| Several lethal contacts on one victim on one step | the first in the fixed contact order (attacker's place in the match, then boomerang/blast before slash) | +1, once | deterministic, as since Slice 5; it is **not** used to decide a victory |
| SHIELD (GUARD) absorbs the blow | nobody | none | the victim did not die |
| Hazard (the lethal floor) | **nobody** (environmental death) | the victim **−1** (never below 0) | never credits the last player to touch anybody |
| A weapon of the victim's own | — (impossible) | — | see below |

**Self-kill definition.** A death is a self-kill if the credited player *is* the victim: the victim loses one hole, never below zero, and **nobody else is ever credited**. Under the approved owner policy (Slices 1–5) a boomerang, a blast or a slash **never kills its owner** (and a deflected boomerang never kills its deflector), so no weapon can produce a self-kill; the scoring function nevertheless handles it (tested directly). The **lethal floor** is the only way to die by your own movement: it is classed as an **environmental death**, credits nobody, and — **a decision to be reviewed** — costs the victim one hole, the same penalty as a self-kill (standing on a strip you can see is warning is your own doing). If you'd rather the floor cost nothing, it is one line in `applyDeaths`. A shield that absorbs a floor death costs nothing.

**Victory.** On the step in which a player *gains* a kill and thereby has `targetKills` (14), the match is over at once: phase `MATCH_OVER`, `matchOver.winnerId`, event `MATCH_WON`, no `ROUND_OVER`, the round does not finish, and from then on `stepFu` returns the state untouched with no events, so nothing after the winning step can be processed (a later kill by a player at 13 never happens). The first player to fill the meter wins even if others are still alive and even in round 2.

**Same-step 14 / 14 (tie).** Two or more players filling their last hole on the same simulation step is a tie, not a matter of array order: **no winner is named**; the round ends (the usual pause); the next round is a **tiebreak between only those players** (everyone else sits it out, dead, keeping their kills and inventory). In a tiebreak the first credited kill wins at once (each is already at 14, so any gain wins); if two land on the same step it is a tiebreak again. If a tiebreak round ends with exactly one meter still full (the other lost a hole to the floor) that player wins; if none is full, normal rounds resume.

**Rounds.** A round ends as before (one or none left alive). Kills and owned powers persist (Slice 5 rules, unchanged). `ROUND n / 9` are regulation; if nobody has 14 after round 9 the match goes on (`OVERTIME ROUND 1`, 2, …): there is no award for leading. A **rematch** (`rematchOf`) is a new match: round 1, empty meters, empty inventories, `awards` 0, all combat state reset, same participants, slots and settings.

### Presentation (primitive; `ui/Hud.tsx`, from the rules' state through the view model)

A slim **score strip above the arena** (never over it): the round label, then per player their marker, number, name (CPUs tagged) and a meter of fourteen circles (● filled, ○ empty: shape, not colour) with `8 / 14`. Between rounds a large **Standings** panel (best first, a tiebreak announced). A change of a meter is a CSS pop of the one hole that filled (accent), a flash of the one that emptied (red), and a line of words (`Alvin +1 (Bea)`, `Bea −1 (the floor)`). The match end is a **champion screen** with the final meters and **Rematch** / **Return to lobby**; people who joined mid-match are listed as waiting. No VFX or audio.

### CPUs

A CPU is a participant like any other: its kills fill its holes, a floor death empties one, it can win at 14, difficulty never touches scoring. They do not yet play the race strategically (a possible later step; no new capability was added).

### Match lifecycle and the host

- **Late join:** the room now accepts a person while the match is running (`room-engine` `joinRoom`: LOBBY or PLAYING). They hold a seat and a slot but **no body**; their input is ignored; the champion screen lists them as waiting. A rematch takes them in when the table has room (it never turns a CPU or an earlier player away); otherwise they wait for the lobby.
- **Rematch** is local to the console (the room stays PLAYING). **Return to lobby** sends the new host message `MATCH_END` (PLAYING → RESULTS → LOBBY on the server).
- **Host loses its server connection, page alive:** the match **pauses** (nothing steps; the clock is rebased on resume so the time away is not simulated or counted as discarded) and resumes where it was. Controllers are still not told.
- **Host page reloads (simulation gone):** the reclaiming console sees the room PLAYING, ends the match (`MATCH_END`), shows the lobby and says why. It never restarts round 1 silently.
- **A reconnecting person** keeps their body, kills and powerups (the simulation never rebuilt anything).
- `?kills=N` on the console address (1–13; test/playtest only) shortens the race; the game is 14.

### Tests

`test/scoring.test.ts` (the pure scoring), `test/killrace.test.ts` (32 rules tests: one kill fills one hole; three in a round; no survival bonus; persistence; self-kill and zero; the floor; attribution for SLASH / THROWN / RETURNING / DEFLECTED / TWIN / BLAST / deflected blast / shield; mutual kills; 13 → 14 immediate victory with the round still on; no post-victory processing; the earlier of two at 13 wins; same-step tie and the tiebreak; regulation, overtime and no award for leading; rematch), `test/cpuKillRace.test.ts` (CPU scoring, floor death, a complete match and its replay, six CPUs, rematch). Console: `test/slice8.test.ts` (modes, composition, late join, rematch, pause, reload), `test/hud.test.tsx`, lobby tests in `test/app.test.tsx`. Platform: room-engine (joining PLAYING, min 0), protocol (`MATCH_END`), server. End to end (`integration/e2e/killrace.e2e.ts`): modes in the lobby; a CPU-only race to a winner with Rematch and Return to lobby; a latecomer; a reload mid-match. **Mutation testing** of the kill-race rules (16 faults: penalty at zero, below zero, a self-kill credited, 14 not winning, a full meter winning without gaining, a deflected kill credited to the thrower, same-step ties resolved by array order, kills processed after victory, victory also ending the round, a tie not ending the round, no tiebreak, a tiebreak including everyone, overtime a round early, the floor crediting a player, scores never stored): **16 killed** (one only after a test for the two-player winning kill was added).

### Evaluation (diagnostic)

Full CPU-only Free For All matches (Easy, Medium, two Hard; the arena with systems; seats rotated; 30 matches): all 30 ended at 14 kills, **mean length 61 s (45–92 s), mean 10.3 rounds**, wins Hard 28 / Medium 2 / Easy 0; one hole lost to the floor in 30 matches, no tiebreaks. (`pnpm --filter @foomerang/foomerang-fu eval:cpu`.) Human pacing is the playtest's to judge.

### Performance and bundle

Bundle (`pnpm build`, gzip): initial JS **126.6 kB** (budget 130; +2.3 kB for the mode list and the HUD components), lazy JS **348.0 kB** (budget 380; +1.7 kB), budgets unchanged. `pnpm e2e:cpu6` (one idle controller and five Hard CPUs, the strip and standings on screen, 60 s, dev console, headless Chrome): FPS min / median / max **59.99 / 60.00 / 60.03**; CPU decisions 18,185, **mean 0.013 ms, worst 4.4 ms**; 3,637 steps, 5 catch-up frames, 1 discard event, **33 ms** of simulation discarded in total. (A match can end during the run; the champion screen is then up.) The HUD re-renders React only when a meter, the round or the phase changes, not per frame.

### The playtest will answer

Is 14 the right number, and is a match of a few minutes the right length? Do you feel the race (whose meter is closest) without staring at the strip? Is the strip readable from the couch without cluttering the arena? Does the floor penalty feel fair? Does the champion screen, rematch and return flow feel right? Does a latecomer waiting feel acceptable?

## Slice 9: Production Content — Garden (**REMOVED 2026-10-15** at the owner's request; kept below as history only)

> The Garden map and everything specific to it (rules arena, renderer, code-drawn characters, tests, tooling, reference image) were
> deleted: its characters were not the supplied models. Foomerang Fu has the 14 maps reconstructed from the reference video,
> and, from 2026-10-16, **only the market plaza** until it is perfected (see docs/SLICE9_INTEGRATION.md).

**Slice 9 — Garden: engineering complete. Not PASS.** One production arena, **Garden**, reconstructed from the repository's `Garden Map - Fu.jpeg` (2752 × 1566, 1.757 : 1) — see **docs/GARDEN.md** for the measurement method, the measured layout, the camera, the geometry, the characters, the combat presentation, the occlusion rule, the CPU results, the screenshot comparison, the known visual discrepancies and the performance numbers. Two independent gates: **(A) gameplay/engineering** — Garden behaves as a Foomerang Fu arena (all approved mechanics, the full Free For All, CPUs); **(B) visual fidelity** — does it look like the reference. Passing tests does not imply passing (B); the owner judges it.

Summary: 36 solid walls (33 stone, 3 olive) and 8 boulder pieces measured from the image and made real rules geometry (arena 1440 × 1456); six spawns ordered so every 2–6 player prefix is fair; **no arena systems** (the reference has none the approved ones could represent); portals and levers **drawn but gameplay-inactive**; four characters (Bread Slice, Coffee Cup, Orange, Green Fruit), purely cosmetic, animated; the shared combat effects projected onto Garden's ground; a camera fitted to the reference; walls that hide a player fade while they do. **Gameplay baseline untouched** (Slices 1–8 unchanged; the only existing test edits were the console's default arena becoming Garden, `?arena=primitive` for the old test arena, and view events gaining an `actor`). The console now defaults to Garden (`?arena=garden`; `?arena=primitive` and `?arena=systems` remain).

### Play it on phones (the physical playtest)

1. `pnpm dev:demo`, open the console it prints (Foomerang Fu opens in **Garden** by default), create a room, join from two to six phones in landscape, add CPUs if you like (Add CPU → Easy / Medium / Hard), press **Start**.
2. Put `Garden Map - Fu.jpeg` next to the TV. **First look:** does it immediately look like the reference — the framing, the camera angle, the arena filling the same share of the screen, the lavender walls and mustard barricades, the boulders with the two blue portals, the levers, the trees in the corners? Note anything that does not.
3. **Characters:** can you tell the four apart and read their faces and animation at couch distance (waddle, dash stretch, slash spin, throw wind-up, death, the champion's hop)? Are the colour ring and name enough to find yourself?
4. **Collision matches what you see:** walk into every kind of wall, along corridors, around corners and boulders; does anything block you that looks open, or let you through something solid?
5. **Combat in the corridors:** throw down a lane and around a corner; watch the boomerang **return along the walls**; deflect one; use Twin Throw, Blast and Shield; take a Book (`?powerups=fast` shows them quickly; `&enable=PHASE_DASH` makes every Book a Phase Dash) and **Phase Dash through a wall**. Are the golden slash crescents, the clank, the blast radius and the shield readable? Does a wall fading when it hides someone feel right, or distracting?
6. **CPUs:** Easy, Medium and Hard (the Slice 7 calibration, unchanged) in Garden's corridors: do they get stuck, loop, or hesitate oddly?
7. **Books** (the blue book with the red bookmark): is it clearly a mystery until taken, and clearly visible in the grass?
8. **Portals and levers:** they are decoration in this slice. Do they look right, and do you read them as non-functional or as a promise?
9. **Performance:** is it smooth on your TV and phones? Anything that stutters during a six-player fight?
10. Play a whole Free For All to 14 (`?kills=3` for a quick one) with rematch and return to lobby.

Report anything that does not look like the reference, with where it is.

## State (`FuState`, plain data)

`config` · `round` · `phase` (`PLAYING` | `ROUND_OVER`) · `elapsed` · `world` (game-core bodies = player positions) · `players` (`id`, `slot`, `alive`, `facing`, `slash`, `dash`, `fatigue`) · `boomerangs` (one per player: `ownerId`, `state`, `position`, `direction`, `travelled`) · `roundOver` (`winnerId` or undefined for a draw, `resetInSeconds`).

Death is the rules fact `alive: false`. How it looks (dimming, the cross, rings) is the renderer's business and is never read back.

## The boomerang state machine

`HELD → THROWN → RETURNING → HELD`, and nothing else. The simulation moves a boomerang only through `transition()`, which throws on an impossible move (a bug, never a game state); `BOOMERANG_TRANSITIONS` is exported and tested. There is deliberately no "caught" or "dead" state: catching *is* RETURNING → HELD, and a dead owner's boomerang keeps its state.

## The slash state machine

`READY → ACTIVE → RECOVERING → READY` (`SlashState` in `rules/slash.ts`). The swing is the player's **boomerang used as a close-range weapon**: it can only start while the boomerang is **HELD**, and while it is ACTIVE the boomerang is HELD (a tested invariant). Pressing during ACTIVE or RECOVERING does nothing and is **not queued**; that — not any UI throttling — is what prevents spam. `direction` is the facing at the moment the swing starts and does not turn while it lasts; `remaining` is the time left in the phase.

The hit region is a circular sector from the attacker's centre along `direction`: strictly nearer than `slashReach` (centre to centre) and strictly inside half of `slashArc`. Like every hit in Fu the region is open — touching the edge is a miss. A target exactly on top of the attacker is inside. Only ACTIVE hurts, and it hurts on **every** step of the window, so someone who walks into the arc mid-swing dies and someone who arrives after it does not. A slash never kills its owner or a dead player. The renderer is handed the swing (position, direction, reach, arc, duration) and draws a wedge of exactly that size; it never decides what was hit.

## Step order (`stepFu(state, inputs, dt) → { state, events }`)

0. **Plan the actions** from the state at the start of the step: SLASH, then THROW, then DASH (Slice 4; see above). A refused action is dropped, never remembered.
1. **Movement and facing** (alive players only; game-core moves the walkers; a DASHING player is carried along their locked direction instead and takes no thumb steering). A player who is swinging or recovering walks at `slashMoveFactor` of normal speed.
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
| Speed / range | Player 360 u/s (420 until 2026-10-19; the reference video's, measured) · outbound 900 u/s · return 1000 u/s · range 520 u · arena 1600 × 900 u. Out ≈ 0.58 s, back ≈ 0.6 s. | The knobs most likely to need changing. All in `DEFAULT_FU_CONFIG`. |

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

## Charging a throw (owner, 2026-10-19; the reference video)

Hold THROW to charge, let go to throw (`art/physics_reference/README.md`). A boomerang carries the `power` it was thrown with, 0
to 1 = `min(1, seconds held / fullChargeSeconds)`; its outbound speed and range are interpolated between the plain throw
(`throwSpeed` 900, `throwRange` 520) and the full charge (`chargedThrowSpeed` 2,450, measured; `chargedThrowRange` 1,000, a
proposal). `fullChargeSeconds` is 0.6 s, a proposal: the video does not show it. A tap (press and release before a step runs:
`throw: true`) is a plain throw, power 0. The charge builds only while every boomerang the throw needs is in hand (held while
it is away, it starts when it is caught); a throw spends it; a **dash cancels it**: letting go then throws nothing, and holding
on does not charge again until THROW is pressed afresh. The dead do not charge. The rules see THROW held step by step
(`throwHeld`); the console turns a phone's press and release into that.

Hits are **swept**: a boomerang hits a player if the two came within reach at any moment of the step, both moving in straight
lines (a charged throw moves 41 u a step, and judged only where it ends it could pass someone by). A shield the boomerang met on
its leg still covers the step it is caught in. A charged throw must not cross a whole slash reach in one step (validated), so a
deflecting swing still sees it.

On the TV a charging player shows an aim line as long as the throw would fly, turning pink as it fills; a fully charged throw
leaves the pink trail (`render/three/chargeVisuals.ts`).

## The plaza's physics (market plaza; owner, 2026-10-19)

**Real shapes.** Every solid on the plaza is one of the 3D models the game draws, in its own shape, generated from `plaza.glb`
by `art/reconstruction/environ2/blender/collision.py` (the rules module says so in its header; never edit the walls by hand):
pots, the banner poles, the bunting's posts, the sign's post and the fountain's rim are discs; crates, stalls (plinth, body and
posts, not the roof) and the side fences are boxes turned as they stand; the terrace and its stairs are rectangles. Posts
thinner than a player radius are widened to one (the rules require it). Trees, the bunting's rope and the rugs stay walkable.
This replaced the image's 40-unit wall cells, which joined the bottom-left crates and pots into one block twice their size,
filled every gap narrower than a body, and laid an invisible strip along the bottom of the plaza: the owner felt it as a
barrier. `plazaPhysics.e2e.ts` walks a player into that corner in the real game.

**Standing on the floor.** A character is a flat picture facing the camera, so all of it lies at the depth of the point it
stands on, and the floor in front of that point is nearer the camera: tested against the floor's depth, the lower part of
every body (about a fifth of it, more mid-dash) vanished into the ground and players looked sunk. The floor is under
everything, so it is drawn first and keeps no depth (`render/three/plazaFloor.ts`); the models still hide a character
standing behind them.

**Breakables** (owner, 2026-10-17; the reference video at 02:21). The plaza's crates and pots are `breakables`
(`FuArena.breakables`, `MARKET_PLAZA_BREAKABLES`): solid to bodies like any wall until something breaks them, never a wall to a
boomerang. A boomerang (thrown, returning or deflected) breaks every prop its path touches that step and flies straight on; a
slash breaks a prop whose nearest point is inside its arc with a clear line; a blast breaks every prop within its radius. A dash
never breaks one: it stops against it. Each break is a `PROP_BROKEN` event (`id`, `byId`, `cause`, centre), and the state's
`broken` list holds this round's; a new round puts every prop back. Props are not cover: lines of sight pass them (a slash or
blast that reaches one breaks it). CPUs route round props (their planning treats every prop as solid) and see the standing ones
as cover. On the TV the model vanishes and bursts into pieces of its own colour that pop up, scatter away from whoever broke it,
land and stay until the round ends (`render/propDebris.ts`, `render/three/plazaProps.ts`); a crate stacked on a broken one goes
with it. `plazaPhysics.e2e.ts` breaks a crate in the real game.

## The border (market plaza; owner, 2026-10-17)

An arena may have a **safe zone** (`FuArena.safeZone`). On the plaza it is the strip between the two dashed lines on the sand;
beyond them lies open sand, about three character widths deep, that players may walk onto. A living player whose centre stays
outside the safe zone for `outsideLimitSeconds` (5 s) **explodes**: an environment death (`HIT` with source `OUT_OF_BOUNDS`,
nobody credited, the victim loses a kill like any environment death). No shield stops it. The timer (`FuPlayer.outsideFor`)
counts continuous time outside and resets the moment the player steps back in, on death and at each round. Spawns and Book
spots are always inside the safe zone. CPUs never walk out, and one that finds itself outside heads straight back in. The 3D
plaza's camera slides sideways to keep a player who walks out in view.

The warning: on the TV the character pulses light red, faster as the limit nears, and a red arrow above its head points the
way back in. The phone feels it too: about four times a second the TV sends that player a rumble whose strength rises with the
time outside (0.2 at once, 1 at the limit), then the strongest, longest one when they explode (`PLAYER_RUMBLE` → `RUMBLE`,
docs/PROTOCOL.md). Android phones vibrate; an iPhone, which cannot vibrate from a web page, shows a red glow over the controls
at the same strength instead. CPUs have no phone and get none.

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

- DASH (Slice 4) is an unvalidated experiment; see its section for the numbers and the one big risk (spamming DASH sustains about 1.8–1.9× walking speed indefinitely; fatigue does not cap it).
- One movement joystick per manifest (protocol limitation, unchanged). There is no aim stick.
- The simulation runs in the host browser: a console reload restarts the round state (host-loss policy: see CONSOLE.md).
- Collision is circle-vs-circle between living players only. Boomerangs and slashes pass through bodies exactly as before.
- Geometry is rectangles, discs and turned boxes. A RETURNING boomerang uses local wall-following, not a map: it is deterministic and tested to get home from everywhere in the primitive arena, but in an arena with a sealed-off owner it would be recalled by the failsafe (see below).
- A boomerang in flight at round end freezes in the rules until the reset (the renderer fades it out; the state itself is not advanced).
- The slash numbers and the SLASH/THROW button layout were played by one human (Playtest #2) and passed as the baseline; they have not been measured, and more players, other devices and longer sessions are untested.
- **Not built, on purpose:** slashing an incoming boomerang (deflect / destroy / redirect / parry). It could become the deepest interaction in the game, but only after the simpler loop has been played.
- No sound, art, maps, animation system or polish — by design.

## Play review checklist (what a human should judge)

**Slash** (does the swing feel instant? reach and arc: can you hit what you aimed at, do you hit what you did not mean to? can you tell *why* you died to one? is the ≈ 0.5 s cycle and the ×0.6 walk fair? is losing the slash while the boomerang is away a real decision? do you ever press THROW and get a slash, or the reverse?) · Movement (speed, turning) · throwing (is "last movement direction" right? does the button feel immediate?) · projectile speed · range · return timing and whether it feels like a threat · hit readability (can you tell *why* you died?) · round pause length · controller ergonomics (two thumbs: stick left, SLASH big on the right, THROW smaller and lower; button size; accidental presses; which one the thumb finds without looking) · whether you ever throw the wrong way · anything that feels unfair.
