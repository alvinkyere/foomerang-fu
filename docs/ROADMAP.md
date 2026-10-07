# ROADMAP

Status: Draft v0.4. Do not start a milestone without explicit approval.

| M | Deliverable |
|---|---|
| 0 | Specification + architecture (done; v0.3 approved for Slice 1) |
| 1 | Multiplayer input prototype |
| 2 | Room lifecycle: ready, start, kick, expiry |
| 3 | Controller: actions/buttons, orientation, reconnect UX |
| 4 | Primitive multiplayer game (two circles, throw, hit) |
| 5 | Foomerang Fu core gameplay |
| 6 | Game SDK / platform separation (`defineGame`) |
| 7 | Art, audio, animation, branding |
| 8 | Reliability + performance hardening |
| 9 | Production launch |
| later | Native controller app (framework chosen by ADR after web controller is proven) |

## Milestone 1 — the gate (30 approved criteria)
Foomerang Fu does not start until all pass.
1. Host can create a room with an internal `roomId` and a **6-character human-friendly join code**.
2. QR contains enough information to join that room.
3. Two real phones can join simultaneously.
4. Each receives a stable `playerId`.
5. Each receives an independent controller.
6. Each controller moves only its corresponding host object.
7. Simultaneous movement works.
8. Input messages contain sequence information.
9. Stale movement inputs are discarded.
10. Action-event architecture supports reliable/deduplicated delivery.
11. Malformed messages cannot crash the server.
12. Room capacity is enforced.
13. Invalid room joins fail cleanly.
14. Controller reconnection preserves player identity.
15. Host refresh/reconnection preserves room ownership.
16. Connection health is represented.
17. RTT is measurable.
18. Input age / server processing / frame timing can be instrumented.
19. Host maintains approximately 60 FPS with six simulated players.
20. Real iPhone Safari is tested.
21. At least one second physical phone/browser configuration is tested where available.
22. Playwright automatically tests host + two controller contexts (flow below).
23. Unit tests cover room/session/protocol behavior.
24. Integration tests cover controller → server → host.
25. Protocol version is negotiated/validated.
26. `game-core` contains no rendering/network/framework dependencies.
27. Socket.IO is hidden behind transport boundaries.
28. No application accounts are required.
29. Controller manifest concept is represented in the protocol.
30. Results of physical latency testing are documented.

Additional M1 requirements carried from review: explicit room state machine with impossible invalid transitions; `roomId` ≠ `joinCode`; handshake with `protocolVersion`/`clientType`/`clientVersion`; input sampler (not raw touchmove); heartbeats in our session layer; basic hostile-client protections (rate limits, size limits, authorization); tokens never logged.

### Required Playwright E2E (Definition of Done, not a stretch goal)
Three contexts: HOST, Controller A, Controller B.
create room → A joins → B joins → host sees A+B → A sends RIGHT → only A moves → B sends LEFT → only B moves → A disconnects → host shows A reconnecting → A reconnects → same `playerId`, same player object.
Physical-device testing remains separate: Playwright cannot judge feel.

## Milestone 1 slice order (TDD, one at a time; report to reviewer after each)
1. **Tooling skeleton** — done.
2. `protocol` foundations: version, client types, handshake, join-code *schema*, error codes, movement/event/heartbeat messages, envelopes (Zod at the boundary).
3. `room-engine`: room state machine, create/join/capacity/identity/tokens, join-code generation + collision handling — **done**. CI workflow added.
4. `room-engine`: connection vs. seat lifecycle, reconcile against injected monotonic time, credential rotation, player + host reconnect — **done**.
5. `game-core`: pure `step(state, inputs, dt)` for circles — 60 Hz, radial dead zone, unit-disc clamp, arena bounds with radius, seeded RNG — **done**.
6. `server`: transport adapter, session layer, room coordination, real-socket integration tests — **done** (see SERVER.md).
7. `controller`: manifest-driven joystick + sampler + join flow — **done** (see CONTROLLER.md). Physical-device (iPhone Safari) testing is still **open**; it needs HTTPS before it counts as production-representative.
8. `console`: lobby, QR, host arena, debug overlay (Playwright specs live in the existing `integration/` workspace). **Status:** Slice 8 *engineering* is complete when the automated flow passes (see CONSOLE.md, TESTING.md); **Milestone 1: PASS** — physical-device validation completed and recorded in MILESTONE_1_VALIDATION.md. Documented limitations: the arena restarts on a console reload; host-loss policy decided but two gaps unimplemented — known post-Milestone-1 limitations (docs/CONSOLE.md, MILESTONE_1_VALIDATION.md §10); one movement joystick (protocol). **Playwright is introduced here** — as soon as host + server + controller exist — with a smoke test (host creates room, a controller joins), then grows each slice toward the full two-phone flow below. It is not deferred to the end, and it is **not earlier either**: there is nothing meaningful to drive before slice 8. From slice 8 on it is a **hard integration gate**, not a stretch goal.
9. Complete the required Playwright E2E (two controllers, simultaneous movement, reconnect).
10. Real-device measurement and write-up.

## Foomerang Fu
1. **Fu Slice 1 — combat skeleton: engineering complete, awaiting a human play review** (docs/FOOMERANG_FU.md). Move + throw + returning boomerang + hit + death + round reset, primitive visuals. **Do not add dash, catch, powerups, hazards, maps or art until it has been played and reviewed.**

## Console platform checkpoints (A → B → C; each its own commit, in order)

Phones are first-class console controllers: if an ordinary couch-flow action needs the laptop's mouse, that is a UX defect. The work is split so that each step can be validated, and committed, alone.

### Checkpoint A — production shell (built, **uncommitted**, gated)
The console shell is the root route, wired to the live session through an adapter (docs/SHELL.md). **Gate: the physical-phone smoke test** (docs/PHYSICAL_PHONE_GATE.md) — status **NOT RUN**; physical phone and physical gamepad are **UNVERIFIED**. If it passes, record the results and commit only the shell migration (nothing from the Garden / reconstruction work, `.gitignore`, `art/`). Frozen: initial JS 145 kB gzip, initial CSS 10 kB gzip. Open engineering defect: intermittent timing-sensitive e2e failures (docs/TESTING.md).

### Checkpoint B — phone as console input (approved design, **in progress**)
**Slice 1 — runtime (committed):** protocol message, server storage / delivery / staleness, controller labels, and the host runtime that derives the context (lobby → `CONSOLE`, match → `GAMEPLAY`, pause open → `PAUSED`, match over → `RESULTS`), routes phone input by it (navigate / select / back / secondary outside gameplay), truly freezes the match on pause, and neutralizes every transition (Resume cannot leak into SLASH; SELECT / BACK never become gameplay; a held stick or press does not carry into a new context; stale pre-transition input never executes). DASH is wired through as the secondary action, but nothing on the console offers one yet. Validation at that commit: typecheck PASS, app lint PASS, unit tests PASS, build PASS, E2E 57/57 PASS; **full `pnpm validate` NOT PASSING** for reasons outside this work (untracked `art/` content fails format / lint; one E2E run had its servers crash, and a clean rerun passed). **Known gap, not a consumer-visible state:** phones show NAVIGATE / SELECT / BACK in the lobby, but the shell does not consume that input yet.
**Slice 2 — next:** phone input drives the shell's one FocusManager (the TV stays the source of truth; the phone has no menu of its own), plus the production pause screen. Couch test after it: laptop across the room, never touched; navigate the shell, enter Fu, run the lobby, start, play, pause, resume, finish, rematch / return, keep navigating, all from a phone.
Add the small additive `CONTROLLER_CONTEXT` message (host → server → phones): `GAMEPLAY | CONSOLE | PAUSED | RESULTS`, semantic and never a screen name, with an optional bounded secondary-action label. The host is authoritative; the server accepts it only from the host, stores it per room, delivers it on every join/reconnect after identity and manifest (so no wrong labels ever flash), and ignores stale versions. The manifest stays the controller's physical layout; the context says what the controls mean now (never abuse manifest updates for labels).
Outside gameplay: stick = navigate (threshold, hysteresis, delay-then-repeat), SLASH = select, THROW = back, DASH = secondary only when one exists. Focus is shared on the TV; semantic actions are serialized, deduplicated, and ordered. Destructive host actions (close room, restart round, global settings) need host authority or an on-TV confirmation. Every context change requires release / neutral before the controls count under the new context, with no leakage of a held press across the boundary (Resume must never become a slash).
**Lifecycle is unchanged in B:** Home → Fu → PLAY → room created → phones join → phones drive the UI that exists → START → play → pause / results from phones. B does not redesign `ROOM_CREATE`, game binding or manifests. Also in this checkpoint's neighbourhood (separate commits as appropriate): in-game HUD, host pause, round-over and champion screens in the shell's design language, operable with no mouse.

### Checkpoint C — Foomerang console session (direction decided, **not started; architecture needs approval first**)
Phones connect to **Foomerang itself, before any game is chosen**, and survive every transition:

```
Home → Controllers (QR + code, "Controllers · 3") → phones join Foomerang → phones navigate Home
→ choose a game → PLAY → configure that game's participants / CPUs → START → play → results
→ back to Foomerang (same phones) → choose another game
```

Goal: separate **console / session membership** from **game participation and configuration**. A phone joining Foomerang no longer means "this player has joined a Foomerang Fu room".

```
Foomerang Console Session
├── connected controllers, controller identities, host ownership
├── connection / reconnect state, controller context
└── Active Game (e.g. Foomerang Fu)
    ├── participants, CPUs, game-specific config and controls
    └── match / round
```

Rules for the design:
- Do **not** rename `Room` to `ConsoleSession` and call it solved. First decide, responsibility by responsibility, what belongs to the console session, the controller connection, player identity, the game instance and the match/round.
- Manifest: split the **base controller capability** (enough for a phone at Home to render the console controller before any game exists) from the **active game's control presentation**; a game becoming active changes controls without a disconnect / rejoin. Config- and protocol-driven; never `if (game === "foomerang-fu")` in the controller.
- Home gets a first-class **Controllers** action with compact status ("Controllers · 3"), the QR, the code, connected controllers and enough identity to tell them apart. Controllers that are already connected or reclaimed need no visit to it.
- `CONTROLLER_CONTEXT` is **not** redesigned by C: B establishes physical input → semantic context → console / game action; C changes *when and what the controller connects to*, not what SLASH / THROW mean.
- Design for the **second** game: a phone joins once, any game can be chosen, the game supplies its controls and config, play, return, choose another.
**Process:** no C implementation until A and B are passed and committed. Then **stop and present** the room / session migration design (state machines, protocol changes, compatibility strategy, migration plan) for review **before any existing room semantics change**.

## Process requirements
- **CI is required before significant application behavior accumulates.** At minimum: install → `format:check` → `lint` → `typecheck` → unit/integration tests; E2E added when Playwright arrives. **Status (honest):** the workflow exists (`.github/workflows/ci.yml`) and a local clean-checkout reproduction of the same commands passes. **GitHub Actions execution is unverified until a remote is configured and the workflow has actually run.** Do not report CI as passing before then.
- A TDD project whose tests only run on one developer's laptop does not meet our standard.

## Technical housekeeping (not blocking)
- Include Markdown in Prettier formatting and add docs validation to CI (broken links; docs-vs-code assumptions where practical). Docs are currently excluded from Prettier.
- Ratchet remaining empty `test/` directories out as real tests arrive.
