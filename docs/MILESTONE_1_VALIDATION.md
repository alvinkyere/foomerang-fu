# MILESTONE 1 — Physical Validation Report

**Result: PASS**, declared by the reviewer after running the physical-device validation.

This report records **only what was actually reported or observed**. Anything not supplied is marked **not recorded** (the detail exists but was not written down) or **not measured** (it was not measured). No value here has been estimated or back-filled. Procedure: [DEVICE_TESTING.md](DEVICE_TESTING.md).

## What the reviewer reported

- A physical phone scanned / joined the Foomerang room, became the controller, and controlled its assigned primitive player on the host.
- Movement felt responsive; the overall phone-to-screen interaction worked well.
- The **HTTPS/WSS physical flow worked**.
- The interruption / reconnect scenarios that were tested **behaved acceptably**, with no blocking issue found in the fundamental controller experience.

## 1. Setup

| Item | Value |
| --- | --- |
| Date | recorded 2026-10-05; exact run time **not recorded** |
| Host machine | iMac (hostname `Alvins-iMac-8`), Apple M1 — observed from the host itself |
| Host OS | macOS 26.2 — observed from the host itself |
| Host Wi-Fi address used (`--host`) | `153.106.214.192` (interface `en1`) — as printed by `ipconfig` on the host |
| Host browser + version | **not recorded** (the automated runs used Google Chrome 154) |
| Phone model / OS version | **not recorded** (reported only as "a physical phone") |
| Phone browser | **not recorded** |
| Second physical phone/device | **not reported** |
| Network type / SSID / band | **not recorded**. Note: `153.106.x.x` is not a typical home-router range; whether the network isolated clients is moot because the phone connected |
| Commit under test | the commit that was checked out when the run happened is **not recorded**; the repository state at validation sign-off is listed under "Repository status" below |
| HTTPS / WSS | **worked** (reported). How trust was established (mkcert or other) **not recorded**. Reported with no browser security disabled? **not recorded** — it was the stated requirement |

## 2. QR → controller interactive

Reported qualitatively: the phone scanned and joined successfully. **The 10 timed runs, median and worst case were not measured.** Where the delay occurs (load / join / lobby wait) is **not measured**.

## 3. Play

"Movement felt responsive; the phone-to-screen interaction worked well." Duration of play, specific manoeuvres tried, two-player behaviour: **not recorded**.

## 4. Interruption matrix

Reported in aggregate: *"the interruption/reconnect scenarios tested behaved acceptably, with no blocking issue."* **Which of the ten cases were run, and the per-case controller display, console display, recovery time, identity result and stuck-movement result, were not recorded.** No stuck-movement failure was reported.

## 5. Host performance

| Metric | Physical run |
| --- | --- |
| FPS / frame time / catch-up / discarded time / RTT with real phones | **not measured** |

Reference only — **simulated** six players (real controller SDK in Node, random thumbs; not phones), production console, headless Chrome 154 on the Apple M1 above, loopback, 300 s (`pnpm e2e:six`):

| Metric | Value |
| --- | --- |
| FPS (150 samples, each a 120-frame mean) | min 58, median 60, max 60 |
| Frame time mean / max at the end | 16.7 / 18.7 ms (worst window anywhere: 82.6 ms) |
| Simulation steps | 18,035 |
| Catch-up frames | 3 |
| Discarded simulation time | 0 ms |
| Console ⇄ server RTT | 2 ms |
| Host receive → sim step (host clock; not network latency) | 8.4 ms mean, 78.2 ms max (n = 9,438) |

Also from automated runs on loopback (not phones): one 9-second two-player run showed 60 FPS, 16.7 / 17.0 ms frame time, 12 catch-up frames, 0 ms discarded.

## 6. Phaser lazy-load on the host

Whether pressing **Start** caused a perceptible pause, and the chunk's load time on the real network: **not recorded / not measured.** No problem was reported.

## 7. Physical input-to-visible-response latency

**Not measured.** No high-frame-rate video was reported. Subjective response: "responsive" (reported).

## 8. Second physical configuration

**Not reported.**

## 9. Defects found

| # | Defect | Severity | Status | Fix | Regression test |
| --- | --- | --- | --- | --- | --- |
| 1 | **`dev:demo` failed under Corepack**: `spawn pnpm ENOENT`, because the launcher ran a bare `pnpm` that is not on `PATH` when invoked as `corepack pnpm`. (A first attempt that ran `npm_execpath` through `node` also failed: under Corepack it is a native executable.) | blocking for the launcher on this machine | **Fixed** — the launcher now executes the same pnpm that started it (`node` only for `.js` entry points) and reports spawn errors clearly | `c74de7c` | **None automated** — the launcher is a development script with no test harness. Verified by hand with `pnpm` hidden from `PATH` and started through `corepack pnpm`: all three services answered, Ctrl-C stopped them. |
| 2 | `dev:demo` did not notice a previous run still holding ports 3001/5173/5174, and Vite silently moved to other ports (the QR and server address would then have pointed at the wrong place) | blocking for a correct demo | **Fixed** — pre-flight port check refuses to start with a clear message; Vite runs with `--strictPort` | `e765b07` | None automated; verified by hand (second launch refuses, exit non-zero) |
| 3 | The console's connection error did not say which server address it tried, so a wrong `--host` (the documentation's example address) was hard to diagnose | UX | **Fixed** — the message names the address | `5e769e6` | `apps/console/test/app.test.tsx` |
| 4 | `pnpm e2e:tls` / `e2e:webkit` were documented at the repo root but only existed in the `integration` workspace | tooling | **Fixed** | `840909b` | The commands are exercised in the validation below |

No defect was reported from the physical run itself.

## 10. Known limitations after Milestone 1 (do not block it)

These are documented, approved-policy gaps, deliberately **not** implemented in this milestone (details in [CONSOLE.md](CONSOLE.md), "Host-loss policy"):

1. **Host page reload:** the room is reclaimed, but the arena silently restarts at the spawn points and players are not told the match ended. Policy: return to the lobby and tell players.
2. **True pause:** when the host's server connection drops with the page alive, the simulation is not truly paused (circles go neutral within the 500 ms freshness window). Policy: pause, then resume.
3. **Long-absent host:** no room-expiry is implemented; the ~60 s figure is an unmeasured hypothesis.
4. One movement joystick per manifest (protocol limitation); the "frozen while reconnecting" rule is specific to the primitive arena.

## 11. Acceptance

The reviewer declared **Milestone 1: PASS**. Evidence behind each gate, as recorded:

| Area | Gate | Evidence recorded |
| --- | --- | --- |
| Join | QR → playable reliably succeeds | Reported working on a physical phone. Reliability across repeated runs: **not measured** |
| iPhone | Real Safari controller functions correctly | Reported: "a physical phone"; model and browser **not recorded** |
| Second device | Another physical configuration works | **Not reported** |
| Movement | Two controllers independently control their objects | Physical: one phone reported working. Two independent controllers: proven by automated tests (two touch contexts), **not recorded on hardware** |
| Release | No persistent stuck movement | None reported. Automated tests cover release and lost-release (input freshness) |
| Reconnect | Brief interruption recovers with identity intact | Reported acceptable; per-case detail **not recorded**. Automated tests cover identity-preserving reconnect |
| Reload | Controller reload reclaims player | Automated tests; physical **not recorded** |
| Isolation | One controller never controls another body | Automated tests; physical **not recorded** |
| Performance | Host near 60 FPS in ordinary play | Physical **not measured**; simulated six-player soak: median 60 FPS |
| Simulation | No meaningful discarded time | Physical **not measured**; simulated soak: 0 ms discarded |
| Latency | Subjectively responsive; physical measurement compatible | Subjectively responsive (reported); physical measurement **not measured** |
| Lifecycle | Lock/background/rotation understood and documented | Reported acceptable in aggregate; detail **not recorded** |
| Security | HTTPS/WSS works without disabling browser security | HTTPS/WSS reported working |
| UX | Join/reconnect/error states understandable | Reported working well |
