# ARCHITECTURE

Status: Draft v0.2 — incorporates review of v0.1. Nothing here is implemented.

## Systems — three clients, one server
```
                 FOOMERANG PLATFORM
                       SERVER
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
     CONSOLE       WEB CONTROLLER     NATIVE APP
  Vite/React/Phaser   Vite/React     iOS/Android
     (M1)               (M1)        (FUTURE — boundary only)
```
Games plug in via the game SDK; the platform never imports a game.

**Native client:** an architectural boundary only. No framework (Flutter / React Native / Swift+Kotlin) is approved. After the web controller works we compare options on touch latency, haptics, networking, platform behavior, dev cost, app size/startup, deep linking and ergonomics, then write an ADR. Consequence now: `protocol` must not depend on React, browser APIs, or Socket.IO types, so a native client can implement it cleanly.

## Repository
```
apps/
  console/      Vite + React + Phaser. The machine that runs the game. React renders chrome only; it never drives the game loop. See CONSOLE.md.
  controller/   Vite + React. Must be extremely lean (QR scan → interactive is a tracked metric).
  server/       Node + TypeScript realtime server
website/        (future) Next.js marketing/discovery site — a different product, not part of M1
games/
  foomerang-fu/ assets, scenes, entities, systems, maps, audio, tests
packages/
  protocol/        Zod schemas + inferred types for every message; protocolVersion
  game-core/       Deterministic pure-TS simulation primitives
  controller-sdk/  ControllerTransport abstraction, joystick/button input → protocol messages, haptics wrapper
  room-engine/     Pure room/player/session logic (no I/O)
  ui/              Shared design-system components/tokens
  config/          Shared tsconfig / eslint / vitest config
docs/
```
Dependency rule: `apps → packages`, `games → game-core + protocol`. Packages never import apps or games.

## game-core purity (hard rule)
`game-core` has **zero dependency** on DOM, React, Phaser, Socket.IO, Node, or any browser/Node API (no `Date.now`, `Math.random`, `performance`, timers). Time and randomness are inputs. Enforced by lint (restricted globals/imports) and tsconfig `lib` without DOM.
```ts
const nextState = simulation.step(previousState, inputs, deltaTime);
```
M1: Phone → Server → Host (game-core + render). Future: Phone → authoritative server simulation → host renderer, with no rewrite of game rules.

## Transport abstraction
Game and UI code never call `socket.emit`. Everything goes through `ControllerTransport` / `HostTransport` interfaces (in `controller-sdk` / `protocol`). `SocketIOTransport` is the M1 implementation. Alternatives (WebRTC, WebTransport, raw ws) are evaluated only if measurements justify, and slot in without touching games.

## Identity model
```
Room ── roomId (UUID), joinCode (6 chars), hostId, hostToken
  └── Player ── playerId (stable), reconnectToken (secret), connectionId (changes), status
```
`connectionId` changes on reconnect; `playerId` never does; the token proves "I am that player." Tokens are unpredictable (CSPRNG, ≥128 bits), never logged, never broadcast, and invalidated when the room expires. The host is also a session participant: a host refresh restores ownership of the existing room via `hostToken`.

## Session lifecycle (connection status ≠ seat lifetime)
Player: `Connected → Reconnecting (character inactive, ~10 s) → Disconnected (seat still reserved, longer) → Removed`. Seat-hold duration is a tunable determined by testing (Wi-Fi/cellular switching, Safari reopen, iOS interruptions). Room: `Open → Starting → InMatch → Closed | Expired`. Later: Match `Lobby → Countdown → Playing → RoundEnd → MatchEnd → Results`; Boomerang `Held → Thrown → Travelling → Returning → Caught | Dropped`. All explicit state machines.

## Controller manifest (seam only; SDK is not built in M1)
On join/game selection the server sends a manifest the controller renders:
```ts
{ gameId, controller: { orientation: "landscape", controls: [
  { id: "MOVE", type: "joystick" }, { id: "PRIMARY", type: "button" }, { id: "SECONDARY", type: "button" } ] } }
```
M1 ships a hard-coded `{ MOVE: joystick }` manifest delivered through the real protocol message, so the controller is already data-driven. `defineGame` is designed in M6 from two real consumers.

## Input semantics
Movement = state, **latest-wins** (seq-ordered, stale dropped). Actions = events, **ordered and reliable**, never coalesced away.

## Latency model
The player-facing metric is **finger movement → visible response** (input-to-photon, approximated). Pipeline to instrument: controller processing → upload → server routing → download → host processing → render scheduling → display. M1 reports separately: RTT, input age at host (needs clock-offset estimation), server routing time, host processing time, frame time, FPS. RTT alone is insufficient.

## Layering: simulation / rules / renderer
```
game-core        PURE SIMULATION PRIMITIVES (no Phaser, DOM, network, framework)
games/foomerang-fu/src/rules   GAME RULES (depends on game-core only so far; pure and deterministic)
games/foomerang-fu/src/render  PHASER — reads state, draws it (Foomerang Fu's renderer)
apps/console/src/render/phaser  PHASER — the console's primitive-arena renderer; the only other Phaser-allowed zone (lint-enforced, lazy-loaded)
```
`simulation.step(...)` produces state; `renderer.render(simulation.state)` draws it. Phaser never enters `game-core` or game rules. If Phaser vanished, only the renderer changes. React is chrome only.

## Determinism (design toward it)
Same initial state + same seed + same input sequence ⇒ same result. Fixed timestep, seeded PRNG passed in, no wall-clock reads. Unlocks replays, debugging, match reproduction, spectator sync and deterministic tests. Not enforced by tests in M1 beyond "no hidden time/randomness."

## Room state machine (explicit; invalid transitions are impossible)
```
CREATING → LOBBY → STARTING → PLAYING → RESULTS → LOBBY
any state → CLOSING → CLOSED
```
Implemented as a transition table; an illegal transition (e.g. `CLOSED → PLAYING`) returns/throws a typed error and is covered by tests. No `isStarted`-style boolean flags. Same rule for matches, rounds, players, projectiles.

## IDs
`roomId` (UUID, machine identity) is separate from `joinCode` (6-char human code, temporary, recyclable/regenerable). Internal references and logs use `roomId`; `joinCode` exists only for discovery.

## Input pipeline
```
touch events → current input state → sampler (~30–60 Hz, measured) → transport
```
Do not send every `touchmove`. Every input packet has a `seq`; stale `seq` is dropped (never rely on cross-device clocks for ordering).
- **InputState** (MOVE, AIM…): latest-wins, loss-tolerant.
- **InputEvent** (THROW_PRESSED, DASH_PRESSED…): each has a unique `eventId`, delivered reliably/ordered; the game **deduplicates by eventId** so a retried/duplicated press can never throw twice. Packet duplication is a tested case.

## Liveness
Heartbeats live in *our* session layer. Socket.IO's idea of "alive" is not our domain model. Distinguishes "hasn't moved the stick" from "disappeared from the network," feeds GOOD/UNSTABLE/RECONNECTING.

## Security posture (threat model, M1 baseline)
Every client is hostile or broken. Server-enforced: schema validation at the boundary, payload-size limits, per-connection rate limits (input spam, join spam), room capacity, authorization of every event (host-only vs player), malformed-packet tolerance, no trust in client-reported state. Out of scope: sophisticated anti-cheat. Tests include spam/flood cases.

**Credentials.** Authentication/reconnection credentials (`ReconnectToken`, `HostToken`) must not appear in routine logs, analytics, error messages, or consumer-facing state. In the domain they are redacting `Credential` objects (see ROOM_ENGINE.md); any future structured logging needs explicit, tested redaction. Tokens are unpredictable (CSPRNG, ≥128 bits) and expire with the room.

## Input normalization ownership
Joystick handling is reusable platform infrastructure, not per-game logic:
```
raw touch → controller joystick mapping → normalized protocol axes (finite, each in [-1,1])
          → game-input normalization (unit-disc magnitude clamp, dead zone) → game movement
```
The protocol validates only the per-axis range. Magnitude clamping and dead-zone policy live in a reusable `game-core` input primitive (built with `game-core`, Slice 5) so no individual game has to remember diagonal normalization; Foomerang Fu consumes already-normalized input.

## Room model
The room/session domain model — identity types, credentials, state machine, invariants, atomicity, join-code allocation and concurrency notes — is specified in [ROOM_ENGINE.md](ROOM_ENGINE.md). Principles: Room ≠ connection; Host ≠ WebSocket; Player ≠ WebSocket; expected failures are results, not exceptions; failed operations never partially mutate state.

## Controller design principle
The phone should psychologically disappear; the TV is the source of truth. Controller = large tactile zones (stick + a few buttons), no stats/menus/text to read mid-game, haptic/audio feedback where available. Layout scales to the actual usable viewport (never device names); architecture must not assume one screen size. Future: button size/position, left-handed layout, sensitivity, dead zone (not M1).

## Decisions resolved in review (v0.2)
| Topic | Decision |
|---|---|
| M1 simulation location | Host browser; boundary above |
| Controller | Vite + React |
| Console | Vite + React + Phaser (not Next.js); Next.js reserved for future marketing site (ADR-003) |
| Realtime | Socket.IO, WebSocket-only transport, behind abstraction; no predetermined WebRTC fallback — measure first (ADR-002) |
| Room code | 6 chars, unambiguous alphabet |
| Host | First-class identity with `hostToken`; refresh must restore room |

## Remaining open questions
| # | Question | Leaning |
|---|---|---|
| Q5 | How do phones reach the dev server? | LAN IP baked into QR URL for M1; HTTPS needs revisited if a required API needs a secure context |
| Q6 | Clock-offset estimation method for input age | Ping-derived offset (NTP-style, median of N samples) |
| Q7 | Seat-hold duration beyond the 10 s inactive window | Start at 60 s, tune by testing |
| Q8 | Input send rate / coalescing | Send on change, capped ~60 Hz, tune by measurement |
| Q9 | Playwright simulation of iOS | Emulation for CI regressions only; **real-device play is the gate**, never emulation |

## Major technical risks / constraints
1. **iOS Safari is a first-class constraint**, not just a risk. No Vibration API; touch/gesture defaults; orientation and wake-lock limits; sockets suspended on lock/background; browser chrome. Verified on a real iPhone early and in every milestone touching the controller.
2. Phone→screen latency/jitter (Wi-Fi, TCP head-of-line blocking) — measure first.
3. Reconnection quality (Wi-Fi/cellular switch, Safari reopen).
4. Controller load time (bundle size budget, tracked).
5. Scope creep into SDK/art before the input feel is proven.
6. Realtime test flakiness — injectable clocks, deterministic sim.
7. Dev-time device access (phones reaching the dev machine).
8. **Host loss = simulation loss (Milestone 1).** Because the M1 simulation runs in the host browser, losing the host stops the game, unlike a controller drop. The room, players and seats are preserved by the domain (see ROOM_ENGINE.md), but pause/recover/restart behavior is an open product policy. This is exactly why `game-core` is kept portable to a server-authoritative model.

## Server-layer obligations from the room-engine
The pure domain cannot enforce these; the server must. **Implemented and tested in Slice 6** — see [SERVER.md](SERVER.md):
- On reconnect/host-reconnect with `replacedActiveConnection`, replace the stale transport and **ignore its late close event**; map each connection to `(roomId, playerId | host)` and only report a disconnect for the connection currently bound to that identity.
- Decide when to call `registry.reconcile()` (cadence), and broadcast the rooms it returns.
- Supply a **monotonic** clock (not wall-clock) and CSPRNG-backed ids/tokens (≥128 bits).
- Deliver rotated credentials to their owner (the only `reveal()` sites) and never log them.

## Slice 1 notes (tooling)
- Lint-enforced boundaries (tested in `packages/config/test`): pure packages (`game-core`, `protocol`, `room-engine`) and Foomerang Fu rules may not import React/Phaser/Socket.IO/Node/apps, may not use DOM/runtime globals, and may not call `Date.now`/`Math.random`/`performance.now`. Socket.IO is importable only in `SocketIOTransport*` files.
- **Resolved (review of Slice 1):** the game is split into `src/rules/` (pure) and `src/render/` (the only place Phaser is allowed). Empty placeholder folders were deleted; architectural folders are created when real code needs them. Target shape, evolving as needed:
  ```
  games/foomerang-fu/src/
    rules/   match/ player/ boomerang/ collision/ scoring/ powerups/   (+ map definitions & geometry as data)
    render/  scenes/ sprites/ animation/ effects/ audio/ camera/       (+ map artwork, tilemaps, render assets)
    index.ts
  ```
  Map *geometry/definitions* belong with rules/data; map *artwork/tilemaps* belong with rendering. No generic `entities/` or `systems/` folders just because engines have them.

## Injected time and randomness (not "no time, no randomness")
Deterministic packages must not read nondeterminism from platform globals — the lint rule forbids `Date.now`, `Math.random`, `performance.now`, timers. Two different needs, two different answers:

- **Simulation time is state, not a clock.** `game-core` has no clock dependency: `nextState = step(previousState, inputs, dt)` advances `state.time` by `dt` and nothing else. Wall-clock reads (and the accumulator that turns real elapsed time into fixed 60 Hz steps) belong in the loop *around* the simulation, never inside `step`. *(This supersedes the earlier idea of injecting a `SimulationClock` into the simulation: determinism wins.)*
- **Randomness is injected where a rule needs it:** a seeded `RandomSource` (implemented in `game-core`), never `Math.random`.
- **Real elapsed time** is only needed by `room-engine` (reconnect windows), which has its own injected monotonic `RoomEnvironment.now()`. Different problem, different clock.

Do not work around the lint rules with hacks — inject or advance state instead. See [GAME_CORE.md](GAME_CORE.md).

## Ownership: protocol vs room-engine
`protocol` owns wire formats: schemas, versioning, validation semantics, and the *representation* of a `JoinCode` (six characters from the allowed alphabet). `room-engine` owns *behavior*: generating an available join code, collision handling against active rooms. Validation (Zod) happens at trust boundaries only; internal code carries the guarantee in TypeScript types and does not re-parse.

## Document authority
```
SRS / ARCHITECTURE / ADRs   (authoritative)
          ↓
      AGENTS.md              (operational guidance for coding agents; must never contradict ADRs — ADR wins)
          ↓
     implementation
```

## Toolchain policy
Pin to a *supported, reproducible* combination, not the newest version number. Version claims in reports must be verified against the registry/compatibility data at the time. Current: TypeScript 5.9.x (typescript-eslint supports `<6.1`), ESLint 10, Vitest 5, pnpm pinned via `packageManager`. See README for setup.

## Controller platform and the integration workspace (Slice 7)
- The phone controller is specified in [CONTROLLER.md](CONTROLLER.md): a React UI over `controller-sdk` (session, sampler, geometry, storage) over a `ControllerTransport`. React never touches a socket, a sequence number or a reconnect.
- **World coordinates: +X right, +Y down**, end to end. No layer flips an axis.
- `integration/` is a **test-only workspace** that may depend on any package (nothing may depend on it). It exercises the real packages together over real sockets, and is where Playwright joins in Slice 8. The boundary test lists it explicitly.
- **TLS/HTTPS:** plain HTTP over the LAN is accepted for Slice 7 development. HTTPS becomes required before any physical-iPhone result is called production-representative.
- The build is now part of `pnpm validate` (`pnpm build`): it runs the production build and enforces the controller's bundle budget.
