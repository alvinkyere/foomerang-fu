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
7. `controller`: manifest-driven joystick + sampler + join flow.
8. `console`: lobby, QR, host arena, debug overlay. **Playwright is introduced here** — as soon as host + server + controller exist — with a smoke test (host creates room, a controller joins), then grows each slice toward the full two-phone flow below. It is not deferred to the end, and it is **not earlier either**: there is nothing meaningful to drive before slice 8. From slice 8 on it is a **hard integration gate**, not a stretch goal.
9. Complete the required Playwright E2E (two controllers, simultaneous movement, reconnect).
10. Real-device measurement and write-up.

## Process requirements
- **CI is required before significant application behavior accumulates.** At minimum: install → `format:check` → `lint` → `typecheck` → unit/integration tests; E2E added when Playwright arrives. **Status (honest):** the workflow exists (`.github/workflows/ci.yml`) and a local clean-checkout reproduction of the same commands passes. **GitHub Actions execution is unverified until a remote is configured and the workflow has actually run.** Do not report CI as passing before then.
- A TDD project whose tests only run on one developer's laptop does not meet our standard.

## Technical housekeeping (not blocking)
- Include Markdown in Prettier formatting and add docs validation to CI (broken links; docs-vs-code assumptions where practical). Docs are currently excluded from Prettier.
- Ratchet remaining empty `test/` directories out as real tests arrive.
