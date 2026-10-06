# CONTROLLER — the phone, the SDK and the manifest

Status: v0.1 (Slice 7). Packages: `packages/controller-sdk` (everything between the UI and the wire), `apps/controller` (Vite + React). This slice builds the **Foomerang controller platform**, not a Foomerang Fu controller.

## Layers

```
React UI (apps/controller)         says: join(), setControlValue(), neutralize()
        │   SessionPort — a narrow interface; the UI cannot see a socket or a sequence number
        ▼
ControllerSession (controller-sdk) owns: protocol, handshake, seq numbers, 60 Hz sampler,
        │                                heartbeat, reconnection, credential rotation, storage
        ▼
ControllerTransport                one transport object = one connection (a new epoch per reconnect)
        ▼
SocketIOTransport                  the only SDK file that knows Socket.IO (WebSocket-only)
        ▼
Server
```

A native app later provides its own `ControllerTransport` (and UI) against the same SDK semantics; neither Foomerang Fu nor the protocol cares.

## The manifest: the controller is rendered from data

The server sends `CONTROLLER_MANIFEST { gameId, orientation, controls[] }` after `ROOM_JOINED` / `PLAYER_RECONNECTED`, taken from the **game's** definition (validated when the server starts). The controller renders what it says; there is no `if (gameId === ...)` anywhere (a test proves two games with the same controls render identically). A control type this build cannot draw is skipped, never fatal.

V1 knows two control types, `joystick` and `button`, because that is all the controller implements. A `button` names the generic action it sends (`PRIMARY` / `SECONDARY` / `TERTIARY`); its `id` is only the label the player sees, and two buttons may not send the same action. Adding a type is an additive protocol change made together with its implementation (`button` arrived with Foomerang Fu's THROW). **Temporary protocol limitation, not a design decision:** the protocol has exactly one movement message (`INPUT_MOVE`), so the **first joystick in a manifest** drives movement, whatever the game calls it; any other joystick is ignored until the protocol has messages for it (e.g. an `INPUT_AIM`). Do not build a game that depends on a second analogue control before that protocol change is made and reviewed. Foomerang Fu's manifest is `MOVE → joystick`, `SLASH → button (PRIMARY)`, `THROW → button (SECONDARY)` and `DASH → button (TERTIARY)` (Slice 4, an experiment). Buttons are laid out by the generic action they send, never by game: the PRIMARY button is the biggest and easiest to reach, a SECONDARY button is smaller, lower and nearer the middle; when a TERTIARY button is present too, the cluster is PRIMARY across the top with SECONDARY bottom-left and TERTIARY bottom-right (`data-layout="tertiary"`, chosen from the actions in the manifest, never from the game). The button sends one pressed and one released `INPUT_EVENT` per press with a fresh event id, **never repeats while held, never retries and never queues** (a press made while the connection is down is dropped, not fired later), and releases on every interruption (lift, cancel, lost capture, blur, page hidden, unmount). Details in FOOMERANG_FU.md.

## Coordinates (a permanent convention)

**+X is right and +Y is down** — browser screen coordinates, everywhere: joystick → protocol → `game-core` → Phaser. Thumb right `(1,0)`, left `(-1,0)`, **down `(0,1)`**, up `(0,-1)`. Nothing flips an axis, ever. Tested at the geometry level, through the DOM, and observed on a real browser engine.

## Input: three rates kept apart

```
pointer events  ──►  current state  ──►  sampler @ 60 Hz  ──►  send only what matters
(irregular)          (cheap, any rate)   (fixed loop)           │
                                                                ├─ changed more than epsilon (0.01) vs what was LAST SENT → send
                                                                ├─ released to neutral (0,0) → send on the very next sample
                                                                ├─ unchanged, refresh due (250 ms) → send  (self-healing)
                                                                └─ otherwise → nothing
```

- Holding full-right sends ~4 messages/s, not 60 — but the host never leans on one ancient packet. Measured: 10 s of holding ≈ 41 messages.
- **Release is significant**: neutral goes out on the next sample (≤ ~17 ms), even when the last-sent value was within epsilon of neutral. Neutral is refreshed too, so a lost release heals itself.
- **Interruptions** (page hidden, `pagehide`, window blur, pointercancel, lost capture, unmount) call `neutralize()`, which sends neutral **immediately** — a hidden page's timers may be throttled — through the same sampler (one input path, not two).
- A **new connection** is a new epoch: sequence numbers restart at 0 and the sampler re-announces the current state, so a reconnected host/server never guesses.
- **Sequence numbers belong to the SDK**, never React. Heartbeat (every **2 s**) is a separate stream.
- Defaults (`epsilon 0.01`, `refreshMs 250`, 60 Hz, 2 s) are configurable hypotheses to be tuned from measurement.

## Joystick

Pointer Events (touch, mouse, pen) with pointer capture. A **floating** stick: the base appears where the thumb lands (clamped to stay inside the area), so a player never has to look for it; the value is the thumb's distance from there divided by a radius derived from the control area (30% of its short side, 40–110 px) — independent of any phone's resolution. One finger drives it; a second is ignored. Arrow keys / WASD steer too (accessibility, and the desktop way to try it). Gestures are blocked inline (`touch-action: none`) and in CSS.

## What the player sees

| Phase | Screen |
| --- | --- |
| IDLE (also after a failed join) | Join: room code (prefilled from `?room=`), your name, **Join**. A failure shows human words. |
| CONNECTING / JOINING | The same form, busy ("Joining…"), not submittable twice |
| READY | The control(s) from the manifest, the player's name, a calm "Connected" badge. Nothing to read mid-game. |
| RECONNECTING | Controls stay up, a pulsing "Reconnecting…" badge, a dim veil. The thumb still works; state is re-announced on return. |
| ENDED | Why (seat given up / replaced by another device / connection lost) and **Join again** |

No accounts, e-mail, sign-up or onboarding. No milliseconds, ping or "socket" in the UI — those are `session.diagnostics()`. Server codes become words in one place (`copy.ts`, a `Record` over every `ErrorCode`, so a new code without copy cannot compile).

**A reload or accidental swipe-away resumes the same player**: the rotating reconnect credential is kept in per-tab `sessionStorage` (the only copy), saved *before* anything else on every rotation, ignored if corrupt, and never breaks the controller if storage is blocked. A second device presenting the credential **takes over**; the first finds its credential dead and ends with a clear reason (verified end to end against the real server).

## Accessibility, layout and motion

Labelled fields and a real `<form>` (Enter submits); errors in `role="alert"`; one `role="status"` per screen; focus starts on the field the player has to fill; 56 px tap targets; visible `:focus-visible`; 20 px inputs (iOS zooms the page when a field is under 16 px); `viewport-fit=cover` with every `env(safe-area-inset-*)`; `100dvh`; pinch-zoom is **not** disabled on the join form; `prefers-reduced-motion` disables animation. Portrait and landscape both work: the manifest's orientation is a **preference** shown as a gentle, non-blocking hint that follows rotation live — nothing assumes `width > height`. Haptics (a light tick on engage) are used only where the platform has them (iPhone Safari has no Vibration API); the controller is identical without.

## Running it on a phone (LAN, plain HTTP)

```
pnpm --filter @foomerang/server start          # :3001, WebSocket only, binds 0.0.0.0 (development only)
pnpm --filter @foomerang/controller dev        # :5173 on the LAN
pnpm --filter @foomerang/controller dev:host   # stand-in for the TV: opens a room, prints join links, logs input
```

Open the printed link (`http://<lan-ip>:5173/?room=ABC123`) on a phone on the same Wi-Fi. In development `?server=http://host:port` overrides the server (production builds ignore it). **Plain HTTP is for Slice 7 development only. HTTPS/TLS is required before any physical-iPhone result is called production-representative** (secure-context APIs, representative Safari behavior, deployment).

## Bundle (tracked, with a budget)

Production build: **JS 111.6 kB gzip, CSS 1.6 kB gzip** (budget 130 kB / 10 kB, enforced by `pnpm build`, which `pnpm validate` runs). Where it goes (approx.): React + ReactDOM ≈ 67 kB (60%), the protocol parser's zod ≈ 25 kB (23%), socket.io-client ≈ 15 kB, our code ≈ 5 kB. React is the dominant cost — a lighter UI library or a smaller parser are decisions for later, measured against QR-scan→interactive time, which is not yet measured.

## What was verified, and what was NOT

- Unit/component tests: geometry, sampler, session (lifecycle, reconnection, rotation, resume, storage), joystick via real pointer events, manifest rendering, join flow, interruption safety, stylesheet contract.
- Real-socket tests (`integration/`): the real SDK against the real server — join, ordered input, release, neutralize, drop/reconnect with rotation and sequence restart, repeated drops, reload resume, second-device takeover.
- **Real browser engine (Chrome 154, headless, iPhone user agent, emulated touch), scripted over the DevTools protocol against the real server:** the join flow, prefilled room and focus, the play screen in portrait (with the rotate hint) and landscape (no hint), touch drags (`x` partial → clamped `1.00` → `y=1.00` for down), release → `0,0`, and a second tab hiding the page mid-drag → the page really became `hidden`, the stick released, and the host received neutral. The host's log is the evidence.
- **Not done: a physical iPhone, Safari/WebKit, any real phone, real Wi-Fi, haptics, or the QR→interactive timing.** Chrome emulating an iPhone is not Safari. This is the milestone gate and remains open.

## Unresolved

1. QR-scan → interactive time is unmeasured; the bundle is dominated by React and zod.
2. Real iPhone Safari behavior (gestures, page lifecycle, bfcache, socket suspension on lock) is untested.
3. **Temporary protocol limitation:** only the first joystick is wired (one movement message); a second needs a protocol message (e.g. `INPUT_AIM`).
4. A hidden page's timers may be throttled, so the heartbeat and refresh can slow while backgrounded; the neutral on hide is immediate, but the server's view of a backgrounded phone is "quiet", not "gone", until Socket.IO's ping decides.
5. Reconnect gives up after 70 s, just past the 60 s seat hold; both are configurable hypotheses.
6. `?server=` and the dev host are development tools only.
