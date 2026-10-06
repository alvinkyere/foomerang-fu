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

## Layers added in Slice 8
- **Unit/component (console):** accumulator, input freshness, slots, game runtime, view model, config/QR (including the QR's ISO 18004 format information), `HostSession` against a scripted fake server with manual time, `MatchDirector`, React screens with a fake renderer.
- **Playwright (`pnpm e2e`, part of `pnpm validate`):** the real server, the real console and the real controller as Vite dev servers on **ephemeral ports**, system Chrome, one console context and two iPhone-sized touch contexts driven by real touch events (Chrome DevTools protocol). Proves: create room → two controllers join → lobby → start → independent movement and isolation → release stops at once → **input freshness** (uplink cut while the thumb is held: the circle stops, nobody is disconnected, it resumes when refreshes return) → controller reload and console reload reclaim identity → network loss and reconnect keep the same player, slot, body and position → Phaser is not downloaded in the lobby → no console errors anywhere. Teardown signals every process group, awaits it, and **fails the run** if a process or port is left behind.
- **Production black-box (`production.e2e.ts`):** the same journey against `vite build` output, where there is no debug hook: the circle is read from the canvas **pixels**.
- **`pnpm e2e:tls`:** the whole suite over https/wss with a throwaway certificate; the browser is told to trust that one public key only. Not part of `validate`.
- **`pnpm e2e:webkit`:** console + controller in Playwright's WebKit build (mouse-driven). Opt-in; needs `playwright install webkit`. **Not iOS Safari.**
- **Mutation testing** of the console modules and of the E2E suite itself (inject a real defect; the right test must fail) — survivors became tests.
- **Not coverable by automated tests:** a physical phone, Safari, a real network, input-to-photon latency. Milestone 1 passed on a physical run (MILESTONE_1_VALIDATION.md); what was measured there is recorded, and what was not is marked so.
