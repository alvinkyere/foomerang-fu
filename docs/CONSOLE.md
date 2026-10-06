# CONSOLE — the host screen

Status: v0.1 (Slice 8). Package: `apps/console` (Vite + React + Phaser). It is the screen everyone watches: it creates the room, shows how to join, runs the primitive arena, and draws it.

## The journey it implements

```
HOME ──Create room──► LOBBY (QR + room code + roster) ──Start──► ARENA (primitive) 
                          ▲   players appear as phones join           │
                          └────────── reload reclaims the room ───────┘
```

One test game ("primitive arena": circles, labels, bounds, movement) is all there is. There is deliberately **no game catalogue**, no Foomerang Fu combat/art/maps/boomerangs/powerups.

## Who owns what

```
React (chrome only)        Lobby, QR, roster, banners, debug overlay. Never drives the game loop.
   │ reads state
HostSession ──HostTransport──► SocketIOTransport ──► server     (React and Phaser never see a socket)
   │ roster, room state, authenticated movement
MatchDirector              room PARTICIPANTS ⇄ game BODIES (slots, who is active)
   │
GameRuntime                fixed-step accumulator + latest-input buffer ──► game-core step(state, inputs, 1/60)
   │ WorldState
buildArenaView (pure)      WorldState + roster ──► ArenaView   ("what to draw")
   │
ArenaRenderer (interface)  ◄── PhaserArena (lazy chunk; the only file that imports Phaser)
```

`game-core` is authoritative for simulation. **Phaser renders positions from `WorldState` and never simulates**: it has no physics, no movement code, and every coordinate on screen was handed to it. The composition root is `src/consoleRuntime.ts`; it knows nothing about React or Phaser.

Simulation runs in the **host browser** for Milestone 1. The server relays and authorizes; it does not simulate. (Whether that stays true is a later architecture decision, not a Slice 8 one.)

## Configuration (explicit, validated, never guessed)

| Variable                   | Meaning                                                                 | Default                                   |
| -------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| `FOOMERANG_CONTROLLER_URL` | Where a **phone** reaches the controller app. This is what the QR carries. | `<console's protocol>//<console's host>:5173` |
| `FOOMERANG_SERVER_URL`     | Where **this browser** reaches the game server.                         | `<console's protocol>//<console's host>:3001` |

Validated at startup (`src/config.ts`): must be `http`/`https`; no credentials, query or fragment; the server URL has no path. Every problem is reported at once on a configuration screen. If the controller URL resolves to `localhost`/loopback the lobby shows a warning, because a phone scanning that QR code could never connect. **No LAN address is ever inferred from network interfaces** — you say which address phones use. These are the only two variables the page can read (`test/viteConfig.test.ts`): TLS key locations are not among them.

`pnpm dev:demo --host <address-phones-use>` sets all of this for you (see README).

## The QR code

It encodes `controllerBaseUrl/?room=CODE` and **nothing else** — no token, credential, player or host identity (asserted in unit tests, in the browser, and by decoding the rendered pixels with an independent decoder). **Scanning the QR identifies the room. It does not authenticate a player.** The six-character room code is always shown beside it for anyone who cannot scan.

`qrcode-generator` supplies only the module matrix; Foomerang draws it as one SVG path with a 4-module quiet zone, dark on white (`src/qr.ts`, `src/ui/QrCode.tsx`). No library markup is injected into the page. Error correction is level M (verified through the matrix's ISO 18004 format bits).

## Simulation timing

`GameRuntime` turns each rendered frame's real elapsed time into **fixed 1/60 s steps**:

- at most **5 catch-up steps per rendered frame**; anything beyond is **discarded, not simulated** (a stalled tab must not cause a 120-step burst);
- game-core only ever receives `FIXED_TIMESTEP_SECONDS`;
- counted and visible: `simulationSteps`, `catchUpFrames` (frames that ran >1 step), `discardEvents` and `discardedSimulationMs`.

The accumulator lives in the console runtime layer, **not** in game-core.

## Input

- **Latest movement per `PlayerId`** is held at the console adapter (`InputBuffer`). `PlayerId` is the `EntityId`, mapped by `MatchDirector`.
- **Freshness (default 500 ms, configurable):** movement not refreshed within the window becomes **neutral**. The controller refreshes every 250 ms while the thumb is held, so a live thumb never goes stale, while a lost release stops a character instead of letting it run forever. **This is an input decision only: it does not disconnect anybody.** Connection state is a separate concept.
- A player who is **reconnecting is frozen** in this primitive arena (neutral input, same body, same position, resumes on reconnect). That is a rule of *this arena*, set in `MatchDirector`; it is **not** a universal game-rule policy, and future games decide for themselves.
- Release (`0,0`) is a normal message and stops the circle immediately; it does not wait for freshness to expire (E2E-tested).
- **Temporary protocol limitation:** the protocol has exactly one movement message, so the **first joystick in a manifest** drives movement. This is a limitation of the protocol today, not a design decision (docs/CONTROLLER.md).

## Participants vs bodies, slots

A **participant** is a person in the room (seat, connection state, slot). A **body** exists only inside a running match, created once at its start for the seated players. Reconnects change whether a body is *active*, never whether it exists; a late arrival never conjures a body (the server refuses mid-match joins anyway).

Slots (`SlotAllocator`) are stable: lowest free slot, kept through reconnects and roster reordering, freed only when the seat is released. Each slot is a colour (Okabe–Ito, colour-vision-safe), a number, a **shape** and a marker — **colour is never the only identifier**, and the player's name is always drawn. Slot 0 spawns at the top, then clockwise on an ellipse.

## Phaser and bundle size

Phaser lives only in `src/render/phaser/` (lint-enforced) and is a **separate chunk fetched when the arena first appears**: someone sitting in the lobby pays nothing for it (E2E: no Phaser request until Start).

Measured with `pnpm build` (gzip; budgets are ratchets checked by `scripts/check-bundle-size.mjs`):

| Part                              | Size       | Budget |
| --------------------------------- | ---------- | ------ |
| Initial JS (lobby: React, protocol, session, QR) | 122.2 kB | 130 kB |
| Initial CSS                       | 1.2 kB     | 5 kB   |
| Lazy chunk (Phaser + arena)       | 357.0 kB   | 380 kB |

The controller's own budget (130 kB JS) is unchanged and untouched by the console.

## Debug overlay (press **D**)

Only honestly measurable numbers. **"—" means not measured, never zero.**

| Shown                        | Where it comes from                                                      |
| ---------------------------- | ------------------------------------------------------------------------ |
| FPS, frame time mean/max     | real frame deltas over the last 120 frames, on this device's clock        |
| Simulation steps, catch-up frames, discarded time | the accumulator's counters                          |
| Stale input → neutral        | count of non-neutral movements that expired                              |
| Host receive → sim step      | the console's own clock: from a movement message arriving to the first step that used it |
| Console ⇄ server round trip  | the console's own heartbeat: request and response timed on **one** clock |
| Movement messages, reconnects, players | counters                                                       |

Never shown, on purpose: **one-way controller → screen latency** and **input-to-photon latency**. Two devices' clocks do not agree and display latency is not observable from inside the page; those need an external camera method (docs/DEVICE_TESTING.md). "Host receive → sim step" is **not** network latency and is labelled as such. The host cannot measure each controller's RTT (the controller measures its own and the host does not receive it); the console reports its own.

## Development hook (`window.__FOOMERANG__`)

Playwright reads authoritative state through one read-only function that returns a deep copy (phase, roster, body positions, what the renderer has drawn, metrics). It exists **only in development builds**: `main.tsx` imports it under `import.meta.env.DEV`, so production bundles contain none of it; `scripts/check-bundle-size.mjs` **fails the build** if the global's name appears in `dist`, and `production.e2e.ts` runs the same journey against the production build with no hook, reading the circle from canvas pixels. It carries no credential (the host token never leaves `HostSession`) and exposes no mutable object.

## Reload and failure behavior

- **Console reload** reclaims the same room (join code + rotating host credential in `sessionStorage`). Players stay seated. **The arena simulation restarts** (circles return to their spawn points) because the simulation lives in the browser; that is a documented limitation.
- **Host loss:** see the policy table below; its two gaps are known and unimplemented.
- Losing the console's own connection shows a banner, keeps the roster visible, retries with backoff for 70 s, then ends with an explanation.
- A renderer that cannot start (no WebGL) shows a message; the simulation keeps running.

## Host-loss policy (approved at the Slice 8 review; partly NOT implemented yet — known post-Milestone-1 limitations)

Separate **ownership survival** from **gameplay survival**. While the simulation runs in the host browser, *host browser = authoritative simulation*, and we do not pretend to support match recovery.

| Situation | Approved policy | What the code does today |
| --- | --- | --- |
| Host loses its server connection, page and simulation still alive | **Pause** the match, show "Reconnecting…", keep the local `WorldState`, reconnect the host, **resume**. Room, memberships and host ownership survive. | Banner shown and the host reconnects. The simulation is **not truly paused**: frames keep stepping, but movement stops arriving, so circles go neutral within the 500 ms freshness window. Controllers are not told the host is away. |
| Host page reloads / browser dies (simulation lost) | Recover **room ownership**, **return to the lobby**, **tell the players the match ended**, allow a new match. Never reconstruct the old match. | Ownership is recovered, but the console sees the room still `PLAYING` and **silently restarts the arena at the spawn points**; players are not told. **Gap.** |
| Host gone for a long time | Never keep zombie rooms. Hypothesis: absent < 60 s → preserve; ≥ 60 s → eligible for closure. | Room survives the host's absence indefinitely (room-engine: host loss never closes a room). **Not implemented, and the number is deliberately not set before physical testing** (laptop sleep and Safari/Chrome background behaviour will inform it). |

The two gaps need a way for a match to end back to the lobby and for controllers to be told (a room-engine transition plus a protocol message). That is a design change, not a Milestone-1 patch, and is not started. Moving the authoritative simulation to the server later changes all of this.

## Known rendering caveat

Phaser draws on its own animation frame; the runtime steps on ours. The view is applied immediately when we render, so a circle is at most about one display frame behind the simulation. This is not measured separately and is part of why input-to-photon latency needs the external method in DEVICE_TESTING.md.
