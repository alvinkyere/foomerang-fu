# CONSOLE — the host screen

Status: v0.1 (Slice 8). Package: `apps/console` (Vite + React + Phaser). It is the screen everyone watches: it creates the room, shows how to join, runs the primitive arena, and draws it.

## The journey it implements

```
/  CONSOLE HOME ──select Foomerang Fu──► GAME PAGE ──PLAY──► real room ──► JOIN (QR + code + seats)
   (the shell: no query, no flag)           │                                  │ phones and CPUs take seats
                                            └─ How to Play / Game Settings     └──START GAME──► ARENA (a new map every match)
   system bar: Players · Controllers · Settings · Help · About                      │ match over: Return to lobby
                                                                                     ▼
                                          Close room (asks first) ◄──────────── JOIN again, same room
```

The root route IS the console shell (`src/shell/`, see [SHELL.md](SHELL.md)); there is no separate lobby page. The shell meets the host session in one place, `shell/adapter/` (session state → `ShellModel`, actions back). While a match is being played the arena (`ArenaScreen`) replaces the shell; when the room returns to its lobby the shell is back on Join. A reload reclaims the room and lands straight on Join. Phones never see any of this: the QR points at the controller app, a different origin.

**Foomerang Fu's lobby is character select** (owner, 2026-10-19: "exactly like `game-setting.mp4`"; `shell/screens/CharacterSelectScreen.tsx`, model `runtime/characterSelect.ts`). Six circles at the top (the video has four; we seat six), the video's 2×6 grid of twelve below (eggplant and sushi are COMING SOON tiles until they have models: a cursor may visit them, nobody can be READY on them, a CPU never takes them), portraits baked from the licensed models by `art/reconstruction/runtime/bake_portraits.py` into `public/characters/`. While a Foomerang Fu room is in its lobby **each phone drives its own cursor** (`consoleRuntime.ts` routes its menu actions to `director.picks`, not to the shared focus; `InputRouter`'s `ownCursors` gates each phone separately, so several people steering at once never cancel each other): stick = move, SELECT = READY on that character (refused if someone else is READY on it: a player's colour is their character's), BACK = un-ready. **A phone's BACK never closes the room** there; the TV's Esc does (with the usual confirm). Once no person is still choosing, the begin bar appears: a ready player's ◀ ▶ (or the TV's ←/→) changes the number of bots, and a ready player's SELECT (or the TV's Enter) begins. `MatchDirector.startBlock()` returns `NOT_READY` until every person is READY, the chosen character travels into the match on `MatchPlayer.character`, and the renderers draw it (`characterOf`). Returning to the lobby puts every person back to choosing. Colours are measured from the video (see `shell/adapter/characters.ts`). Deliberate differences from the video: the prompt says **SELECT** (the phone's word), not a gamepad "A"; BACK says Esc (the TV's key); a QR card and room code sit bottom-right so people can still join; the bar says PRESS, not HOLD (hold-to-begin is a later slice). Owner's spec (2026-10-19) on top of the video: a CHOOSE CHARACTERS divider while people choose, corner brackets, a 12-lobe scalloped READY fill, and the spec's colours (paper #F4F2EE, ink #3A3A3A, muted #8E8E8E, coral #EF3E36); badges and fills are the video's measured palette.

**Between rounds, the scoreboard** (owner, 2026-10-19, `ff scoreboard.jpg`; `src/ui/Scoreboard.tsx`): after a round's 2.5 s end beat the match WAITS (rules: `roundAdvance: 'ON_CONTINUE'`, `continueRound`), showing one band per player in seat order (P1… or BOT, the character's portrait, a dot per kill to win, filled per kill, the leader crowned). The phones' context is RESULTS there, so any phone's SELECT (or the TV) presses CONTINUE. Band colours are the image's for the six characters it shows, else its rule (`src/characters/videoPalette.ts`). CPU-only matches need the TV to continue (e2e: `host.autoContinue()`).

**At the end of the match, the results** (owner, 2026-10-19, `foomerang fu results.jpg`; `src/ui/Results.tsx`): "<CHARACTER> WINS!", a column per player in seat order (their character in a soft circle in the image's results colour, a ribbon with their placing: ties share it, 1 2 2 2 5), the winner on a panel of their colour darkened and crowned, REMATCH / BACK TO MENU (BACK TO MENU = character select). Award pills are a later slice. The scoreboard and the results load as their own chunks (prefetched when the arena opens); the bundle check counts a lazy chunk's stylesheet as lazy (2026-10-20).

The **primitive arena** (circles that follow thumbs) is platform **test infrastructure**: it is reachable only by asking for it by exact name in the address (`/?game=primitive-arena`, PLAY then creates that game), is used by the platform's browser tests, and is never offered in the UI.

## Who owns what

```
React (chrome only)        The console shell (home, game page, settings, join), HUD, debug overlay. Never drives the game loop.
   │ reads state
HostSession ──HostTransport──► SocketIOTransport ──► server     (React and Phaser never see a socket)
   │ roster, room state, authenticated movement
MatchDirector              room PARTICIPANTS ⇄ game BODIES (slots, who is active); picks the runtime by gameId
   │
GameRuntime | FuRuntime    fixed-step accumulator + latest-input buffer ──► game-core step / Fu rules stepFu(…, 1/60)
   │ WorldState / FuState
buildArenaView | buildFuView (pure)   state + roster ──► ArenaView   ("what to draw")
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
| Initial JS (lobby: React, protocol, session, QR, CPU roster) | 124.3 kB | 130 kB |
| Initial CSS                       | 1.2 kB     | 5 kB   |
| Lazy chunks (Phaser arcade-physics build + arena 327.6, Fu rules + runtime + CPU controller 18.7) | 346.3 kB   | 380 kB |

Slice 7 adds the lobby's CPU roster to the initial chunk (about 2 kB) and the CPU controller to the lazy Fu chunk; the Phaser chunk uses the arcade-physics-only build of Phaser (`apps/console/vite.config.ts` alias), which is what made room (about 34 kB). The lobby imports no game code: the difficulty list is its own constant.

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

## Host-loss policy (approved at the Slice 8 review; **implemented in Slice 8**, except the long-absence rule)

Separate **ownership survival** from **gameplay survival**. While the simulation runs in the host browser, *host browser = authoritative simulation*, and we do not pretend to support match recovery.

| Situation | Policy | What the code does |
| --- | --- | --- |
| Host loses its server connection, page and simulation still alive | **Pause** the match, show "Reconnecting…", keep the state, reconnect, **resume**. Room, memberships and ownership survive. | `HostSession` goes RECONNECTING → `MatchDirector.setPaused(true)`: frames do not step. On ACTIVE it resumes and the stepper's clock is rebased, so the time away is not simulated or counted as discarded. Controllers are not told the host is away. |
| Host page reloads / browser dies (simulation lost) | Recover **room ownership**, **return to the lobby**, **tell the players the match ended**, allow a new match. Never reconstruct the old match. | A page that reclaims a room which is PLAYING sends `MATCH_END` (server: PLAYING → RESULTS → LOBBY), shows the lobby and a notice that the match was interrupted and kills and powerups were not kept. It never silently restarts round 1. (Controllers are still not told: a protocol message to them is not built.) |
| Host gone for a long time | Never keep zombie rooms. Hypothesis: absent < 60 s → preserve; ≥ 60 s → eligible for closure. | **Not implemented**; the number is deliberately not set before physical testing. |

Late join (Slice 8): a person may join a room whose match is running; they hold a seat and wait for the next match (no body mid-match).

## Known rendering caveat

Phaser draws on its own animation frame; the runtime steps on ours. The view is applied immediately when we render, so a circle is at most about one display frame behind the simulation. This is not measured separately and is part of why input-to-photon latency needs the external method in DEVICE_TESTING.md.
