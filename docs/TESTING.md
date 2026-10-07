# TESTING

Status: Draft v0.1

## Method: TDD
Requirement → acceptance criteria → failing test (confirm it fails *for the expected reason*) → minimal implementation → pass → refactor → run full relevant suite. A legitimate failing test is never weakened to make code pass.

## Pyramid
- **Unit (most)**: `room-engine` (create, join, capacity, identity, removal, disconnect/grace/reconnect), `protocol` (schema accept/reject tables), `game-core` (movement, state machines). Pure functions, injected clock, no I/O.
- **Integration**: real Node server + headless socket clients (Vitest). controller→server→room→host routing, invalid rooms, malformed payloads, reconnection with token, server survives garbage.
- **E2E (required in M1)**: Playwright — one host page + two emulated mobile contexts. Verifies code join, joystick → object movement on host, simultaneous control, player and host reconnect.
- **Real-device gate**: emulation never substitutes for physically playing on a real iPhone (Safari) and, if available, another phone/browser. Required for every milestone touching the controller.
- **Component**: React Testing Library for lobby/controller UI behavior only.

## Rules
- No real timers in unit tests; injectable `Clock`.
- Simulation deterministic (fixed step, seeded RNG).
- Network input treated as hostile in every integration suite (fuzz-ish malformed cases).

## Performance measurement
Debug overlay (host): FPS, frame time, RTT per player, input→render latency, input rate, dropped/stale inputs, reconnect count. Performance claims require recorded measurements, with test conditions (device, network, load).

Latency methodology (to refine in M1): RTT via PING/PONG; true controller→pixel latency approximated by timestamping touch events and host render, plus an out-of-band check (slow-motion video) for calibration.

## Gates
Strict `tsc`, lint, unit+integration on every change; E2E on PR; performance check on changes touching input path.

## Layers added in Slice 7
- **Component tests** (jsdom, React Testing Library) drive the REAL pointer-event code path via a minimal `PointerEvent` polyfill.
- **`integration/`** (test-only workspace): the real `controller-sdk` against the real server over real Socket.IO.
- **Real browser engine, ad hoc:** the controller was driven in headless Chrome (iPhone user agent, emulated touch) against the real server through the DevTools protocol. This is a manual verification, not a gate, and it is **not** Safari or a phone.
- **Bundle budget:** `pnpm build` fails if the controller exceeds its gzip budget.

## Layers added in Fu Slice 1
- **Fu rules** (pure, 89 tests) including replay determinism, a 6,000-step invariant fuzz and hostile input; **console runtime/view** tests; **SDK/controller** button tests; **real-socket** tests of the THROW path (including a hostile replay); and `integration/e2e/fu.e2e.ts` — two controllers rendered from the manifest, independent move/throw, a kill, the round ending and the next one starting, a held button sending exactly one press, a reload, and a recorded performance run. See FOOMERANG_FU.md. Mutation-tested (66 unit-level mutants, 7 browser-level defects).

## Layers added with SLASH
- **Slash rules** (pure, 55 tests, `games/foomerang-fu/test/slash.test.ts`): see FOOMERANG_FU.md; includes replay determinism with slashes, the THROW+SLASH same-step rule in both input orders, open-edge geometry and a 6,000-step invariant fuzz. The two long fuzz loops have an explicit 30 s timeout, because under a loaded parallel run they exceeded vitest's 5 s default (it was a timeout, not a failure).
- Console runtime/view, controller layout and real-browser SLASH journeys are described in FOOMERANG_FU.md.

## Layers added with player collision and the control-contract fix
- **Collision** (`games/foomerang-fu/test/collision.test.ts`, 27 tests): head-on, stationary-vs-moving, unequal effort, glancing, sustained opposing input (no jitter), three players, a chain, arena edge and corner, no tunnelling at the fixed step, 2×, and the maximum accepted `dt`, dead players neither blocking nor pushed, rule-state positions feeding hits and slashes, replay determinism (byte-identical), independence from player order and input-Map order, a 6,000-step fuzz of six players huddling, spawn non-overlap and a rejected configuration.
- **Control contract**: the game's own table (`FU_CONTROLS` / `FU_BUTTONS`, `games/foomerang-fu/src/controls.ts`) against the REAL server's manifest (`integration/test/fu-contract.integration.test.ts`), against the console runtime (each advertised button does exactly its own thing and never the other), and against the browser (the rendered THROW/SLASH buttons through the real server and console).

## Layers added in Slice 2 (arena geometry)
- **Arena rules** (`games/foomerang-fu/test/arena.test.ts`, 57 tests): walking into a wall, sustained push (no creep or jitter), diagonal sliding at full tangential speed, convex and concave corners, the arena boundary with walls, a one-body corridor walked end to end, a gap too narrow to enter, player + player + wall, four players at a chokepoint, no tunnelling at the fixed step, 3× and the maximum `dt`, a player found inside a wall expelled by the nearest face, a lone player, dead players ignored; boomerang: THROWN → RETURNING on the impact step, flush and never inside, no bounce, caught at home, never kills its owner, point-blank throws, no tunnelling at any start offset at the longest `dt`, exact corner radius; the documented return rule (flies through walls, still lethal); slash line of sight (blocked, clear, grazing, diagonal); invalid arena data; the primitive arena (valid, six clear spawns, mirror-symmetric, has a corridor and a chokepoint, connected, walkable); round reset to the arena's spawns; byte-identical replay with geometry; an 8,000-step six-player fuzz on the real arena.
- **Slice 1 intact:** every Slice 1 test (rules, slash, collision) passes **unmodified**, because the default arena is still the open one.
- **Console**: the runtime plays the primitive arena; the view hands the renderer the rules' walls.
- **Browser**: two controllers fight in the primitive arena (a kill by throw along the open bottom lane, a kill by slash, players solid, a wall stops a walking player and a thrown boomerang, the walls on screen equal the rules' walls).

## Layers added with the return-wall fix
- **Returning boomerang vs geometry** (`games/foomerang-fu/test/homing.test.ts`, 28 tests): opposite sides of a wall; head-on tie (fixed side, no oscillation); an owner who ducks behind cover after throwing; hugging a wall flush; convex corner; concave corners (including one that forces the hand flip, found by mutation testing to be a real bug in the first version: a slide clamped to nothing by the arena edge was not noticed); corridors; chokepoints; several walls in a row; no penetration and no tunnelling at 1×, 2×, 3× and the maximum `dt` through the thinnest wall; no catch through a wall; lethality and owner safety; **every boomerang from ~150 points to every spawn gets home with no failsafe**; the failsafe in a sealed box (recalled at 3 s, never inside a wall, deterministic); the failsafe clock never runs in open ground; byte-identical replay; an 8,000-step six-player fuzz where no boomerang in any state is ever inside a wall.
- **Browser:** a returning boomerang with its owner ducking behind the left corridor wall never enters a wall at any sampled moment, is seen wall-following, and gets home. The test fails against the old pass-through behaviour.

## Layers added in Slice 3 (deflection)
- **Deflection rules** (`games/foomerang-fu/test/deflect.test.ts`, 46 tests): the direction formula (head-on, depends on both inputs, unit and never backward over 2,000 random pairs, never zero); the timing window (the set of saving press times is one contiguous, bounded interval, with a death on either side; early, late and recovery fail; a press on the step of death still saves); facing and arc; cover (a wall in the way blocks it, a clear line does not); not your own boomerang; ownership kept, never duplicated; the flight along the stated direction for at most `deflectRange`, then RETURNING and caught, counters reset; the deflector's immunity, with the path that would have clipped them; a deflected boomerang still kills a third player and never its owner; walls after a deflection (adjacent wall, thinnest wall, 1×, 3× and the maximum `dt`); resolution order (nearest wins, tie goes to the earlier player, input order irrelevant, a slash hitting a player and a boomerang, the clank absorbing the hit, two independent deflections on one step, no immediate re-deflection by the same defender); sequential deflections, the cap, cap 0 turns it off, bounded lifetime when two defenders bat it back and forth; configuration; a byte-identical replay with reactive players; a 24,000-step six-player fuzz on the real arena.
- **Slice 1 and Slice 2 tests pass unmodified** (rules, slash, collision, arena, homing).
- **Browser:** a real controller performs a deflection: Bob's phone SLASH, timed by a reflex that fires when Alice's boomerang is 200 away, over the real network and the real console; Bob lives, the boomerang stays Alice's (`deflectedBy` Bob, count 1), Phaser draws it flying, and it gets home. The test fails if deflection is switched off.

## Layers added in Slice 8
- **Unit/component (console):** accumulator, input freshness, slots, game runtime, view model, config/QR (including the QR's ISO 18004 format information), `HostSession` against a scripted fake server with manual time, `MatchDirector`, React screens with a fake renderer.
- **Playwright (`pnpm e2e`, part of `pnpm validate`):** the real server, the real console and the real controller as Vite dev servers on **ephemeral ports**, system Chrome, one console context and two iPhone-sized touch contexts driven by real touch events (Chrome DevTools protocol). Proves: create room → two controllers join → lobby → start → independent movement and isolation → release stops at once → **input freshness** (uplink cut while the thumb is held: the circle stops, nobody is disconnected, it resumes when refreshes return) → controller reload and console reload reclaim identity → network loss and reconnect keep the same player, slot, body and position → Phaser is not downloaded in the lobby → no console errors anywhere. Teardown signals every process group, awaits it, and **fails the run** if a process or port is left behind.
- **Production black-box (`production.e2e.ts`):** the same journey against `vite build` output, where there is no debug hook: the circle is read from the canvas **pixels**.
- **`pnpm e2e:tls`:** the whole suite over https/wss with a throwaway certificate; the browser is told to trust that one public key only. Not part of `validate`.
- **`pnpm e2e:webkit`:** console + controller in Playwright's WebKit build (mouse-driven). Opt-in; needs `playwright install webkit`. **Not iOS Safari.**
- **Mutation testing** of the console modules and of the E2E suite itself (inject a real defect; the right test must fail) — survivors became tests.
- **Not coverable by automated tests:** a physical phone, Safari, a real network, input-to-photon latency. Milestone 1 passed on a physical run (MILESTONE_1_VALIDATION.md); what was measured there is recorded, and what was not is marked so.

## OPEN DEFECT — intermittent timing-sensitive e2e failures (recorded 2026-10-07)

**Status: OPEN. Not fixed; no assertion loosened, no sleep added.**

Seen in full `pnpm e2e` runs, never the same ones twice, none in isolation:

| Test | Failure |
| --- | --- |
| `fu.e2e.ts` "holding THROW throws once…" | `actionsReceived - before` was 1, expected 2 (the release had not been counted yet) |
| `fu.e2e.ts` "DASH is refused while swinging, and SLASH is refused while dashing" | slash was `RECOVERING`, expected `READY` (the mid-dash tap was not refused) |
| `powerups.e2e.ts` PHASE_DASH, TWIN_THROW + BLAST | `never reached {x,y}` (steering did not converge) |

**Evidence** (measured, then the probe deleted):

- Press → host, **product path** (phone `pointerdown` → host has counted it): p50 11 ms, p90 ≤ 24 ms, max ≤ 54 ms over 240 samples in three runs. Host frame rate 60 fps, worst frame 18.7 ms, ≤ 66 ms of simulation discarded.
- Press → host, **including the test driver** (Playwright → Chrome DevTools touch injection into the phone page): p50 ~14 ms, **p90 50–200 ms, max 100–580 ms**. The tail is in the driver, not the app.
- Eight busy-loop processes on an 8-core machine did **not** reproduce any of the three failures (12 of 12 passed). It is not plain CPU saturation.
- At the time of these measurements the shell was not mounted during a match (the arena replaced it), and the failing steps are all inside matches, so shell workload was not involved. The failures also pre-date the shell: one uncaptured first-run failure was seen before it. **Since Checkpoint B slice 2 this no longer holds as stated:** the arena now mounts its own `FocusManager` (keyboard listeners and a per-frame gamepad poll) and the pause menu, so in-match shell workload is no longer ruled out by construction; it has not been measured.

**Cause, as far as it is established:** test timing assumptions. Each failing assertion treats touch injection as bounded and immediate, and it is not:
- hold-THROW reads the counter with no slack right after `touchEnd` resolves, while the release still needs ~10–50 ms to reach the host. It fails when injection latency spikes enough that the 2.6 s watcher has already ended.
- DASH/SLASH relies on a fixed ~60 ms gap between two injected taps landing inside a swing/dash window.
- Powerup steering is a closed loop (read position → inject thumb → repeat) whose lag grows with injection latency.

**Not yet explained:** *why* injection latency has a tail (suspects: the single Node process that forwards every WebSocket frame for every phone plus the CDP commands, and phone contexts rendered at device scale 3). Frame scheduling, simulation timing and shell workload are ruled out by the numbers above.

**Observed during Checkpoint B slice 2 (2026-10-07):**

| Run | `fu.e2e.ts:737` (DASH/SLASH commitment) and `garden.e2e.ts:244` (Garden timed SLASH deflect) |
| --- | --- |
| Initial full `pnpm e2e` with slice 2 | both failed |
| Targeted reruns of the two, slice 2 tree | 15 of 16 passed |
| Targeted reruns of the two, clean checkout of the slice-1 commit `3943a4e` | 10 of 10 passed |
| Subsequent full `pnpm e2e` with slice 2 | 58 / 58 passed |

This is consistent with the known timing-sensitive problem above, but it is **not proof that slice 2 has no effect on it**. Separately, during slice 1 one full run had 19 tests fail in about 200 ms each and an immediate rerun passed 57 / 57; that may indicate test-server / environment instability, but the cause was not established.

**Direction for a real fix (own slice, reviewed):** make the assertions race-free by waiting on host state rather than on elapsed time (poll until the count reaches 2, then require it stays 2), and make the dash/slash ordering depend on observed host state instead of a fixed gap; consider injecting touches from inside the phone page instead of over CDP. Do not add sleeps or widen tolerances.
