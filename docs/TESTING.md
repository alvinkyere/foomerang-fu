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

## Layers added in Slice 8
- **Unit/component (console):** accumulator, input freshness, slots, game runtime, view model, config/QR (including the QR's ISO 18004 format information), `HostSession` against a scripted fake server with manual time, `MatchDirector`, React screens with a fake renderer.
- **Playwright (`pnpm e2e`, part of `pnpm validate`):** the real server, the real console and the real controller as Vite dev servers on **ephemeral ports**, system Chrome, one console context and two iPhone-sized touch contexts driven by real touch events (Chrome DevTools protocol). Proves: create room → two controllers join → lobby → start → independent movement and isolation → release stops at once → **input freshness** (uplink cut while the thumb is held: the circle stops, nobody is disconnected, it resumes when refreshes return) → controller reload and console reload reclaim identity → network loss and reconnect keep the same player, slot, body and position → Phaser is not downloaded in the lobby → no console errors anywhere. Teardown signals every process group, awaits it, and **fails the run** if a process or port is left behind.
- **Production black-box (`production.e2e.ts`):** the same journey against `vite build` output, where there is no debug hook: the circle is read from the canvas **pixels**.
- **`pnpm e2e:tls`:** the whole suite over https/wss with a throwaway certificate; the browser is told to trust that one public key only. Not part of `validate`.
- **`pnpm e2e:webkit`:** console + controller in Playwright's WebKit build (mouse-driven). Opt-in; needs `playwright install webkit`. **Not iOS Safari.**
- **Mutation testing** of the console modules and of the E2E suite itself (inject a real defect; the right test must fail) — survivors became tests.
- **Not coverable by automated tests:** a physical phone, Safari, a real network, input-to-photon latency. Milestone 1 passed on a physical run (MILESTONE_1_VALIDATION.md); what was measured there is recorded, and what was not is marked so.
