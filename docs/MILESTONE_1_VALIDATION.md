# MILESTONE 1 — Physical Validation Report (template)

Fill this in during the hardware run. Leave a cell blank or write **not measured** rather than guessing. Procedure and setup: [DEVICE_TESTING.md](DEVICE_TESTING.md). Gate criteria: [ROADMAP.md](ROADMAP.md) / the review table at the bottom.

## 1. Setup (exact)

| Item | Value |
| --- | --- |
| Date | |
| Host machine / OS | |
| Host browser + version | |
| iPhone model / iOS version | |
| iPhone browser | Safari (version = iOS version) |
| Second device model / OS | |
| Second device browser + version | |
| Network (router/SSID type, 2.4/5 GHz, anything unusual such as campus/hotspot) | |
| Host address used (`--host`) | |
| Commit (`git rev-parse --short HEAD`) | |
| HTTPS/WSS? How was trust established (mkcert / other)? Any browser security disabled? (must be **no**) | |

## 2. QR → controller interactive (iPhone, ≥ 10 runs)

Start = camera recognises / you tap the QR banner. End = the joystick actually moves your circle. Use screen recording or a stopwatch; note which.

| # | Seconds | Slowest phase (load / join / lobby wait) | Notes |
| --- | --- | --- | --- |
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |
| 9 | | | |
| 10 | | | |

Median: ___ s  Worst: ___ s. Target ≈ < 5 s page usable, ≈ < 10 s scan → control. To see *where* the time goes use Safari Web Inspector on the Mac (Develop → your iPhone → the page → Network) and note HTML/JS/WebSocket timings.

## 3. Play (10–15 minutes, iPhone + a second player)

Small movements · fast direction changes · circles · rapid left/right · release and re-engage · two players at once · screen edges · a reconnect. Does the phone feel *attached* to the object?

Observations:

## 4. Interruption matrix (iPhone)

"Stuck" = the circle kept moving after the thumb stopped touching. **Any stuck case is a serious failure.**

| # | Action | Controller showed | Console showed | Recovery time | Identity kept? | Stuck movement? |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Lock phone briefly, unlock | | | | | |
| 2 | Switch to another app, return | | | | | |
| 3 | Wi-Fi off, then on | | | | | |
| 4 | Reload the controller page | | | | | |
| 5 | Rotate portrait → landscape → portrait | | | | | |
| 6 | Pull Notification/Control Center, return | | | | | |
| 7 | Background Safari beyond the reconnecting window (> 10 s) | | | | | |
| 8 | Background beyond the seat reservation (> 60 s) if practical | | | | | |
| 9 | Try to reconnect after the seat genuinely expired | | | | | |
| 10 | Rejoin through the intended reload/takeover path | | | | | |

## 5. Host performance (physical controllers moving continuously, several minutes)

Press **D** on the console and photograph or copy the overlay at the end. Note spikes — do not hide them.

| Metric | Value |
| --- | --- |
| FPS | |
| Frame time mean / max | |
| Catch-up frames | |
| Discarded simulation time | |
| Console ⇄ server RTT | |
| Host receive → sim step (host clock; not network latency) | |

Reference, **simulated** six players (real controller SDK in Node, random thumbs; not phones), production console, headless Chrome 154 on an Apple M1, loopback, 300 s (`pnpm e2e:six`, 2026-10-05):

| Metric | Value |
| --- | --- |
| FPS (150 samples, each a 120-frame mean) | min 58, median 60, max 60 |
| Frame time mean / max at the end | 16.7 / 18.7 ms (worst window anywhere: 82.6 ms) |
| Simulation steps | 18,035 |
| Catch-up frames | 3 |
| Discarded simulation time | 0 ms |
| Console ⇄ server RTT | 2 ms |
| Host receive → sim step | 8.4 ms mean, 78.2 ms max (n = 9,438) |

## 6. Phaser lazy-load (host)

Press **Start** and watch. Open the host browser's Network panel first (disable "Disable cache" off so it behaves like a first visit; note whether cache was cold).

| Item | Observation |
| --- | --- |
| Perceptible pause / blank arena after Start? How long? | |
| Time to fetch the Phaser chunk (`PhaserArena-*.js`, ≈ 357 kB gzip) | |
| Time from Start to first circle on screen | |

Do **not** optimise from bundle size alone: only if players visibly stare at a blank screen.

## 7. Physical input-to-visible-response latency (video)

Film the finger on the phone **and** the host display in one shot at the highest frame rate available (240 / 120 fps slow-motion; 60 fps is coarse but usable). Count frames from first visible finger movement to the circle's first visible movement. Take ≥ 20 samples; no cherry-picking. If you cannot make a credible measurement write **not measured**.

| | Value |
| --- | --- |
| Camera / frame rate (1 frame = ___ ms) | |
| n | |
| Median | |
| p90 | |
| Worst | |

Interpretation bands (not pass/fail): < 50 / 50–100 / 100–150 / > 150 ms. What matters is how it feels.

## 8. Second physical configuration

(Another physical phone/browser, e.g. Android + Chrome. Desktop WebKit does not count.) Repeat sections 2–4 as far as practical.

## 9. Defects found, fixes required

| # | Defect | Severity | Fix (commit) | Regression test | Before → after |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

Fix **only what Milestone 1 requires**; add the regression test; rerun the relevant clean-clone gates. No Foomerang Fu features.

## 10. Acceptance (reviewer's table)

| Area | Gate | Evidence / result |
| --- | --- | --- |
| Join | QR → playable reliably succeeds | |
| iPhone | Real Safari controller functions correctly | |
| Second device | Another physical configuration works | |
| Movement | Two controllers independently control their objects | |
| Release | No persistent stuck movement | |
| Reconnect | Brief interruption recovers with identity intact | |
| Reload | Controller reload reclaims player | |
| Isolation | One controller never controls another body | |
| Performance | Host stays near 60 FPS during ordinary play | |
| Simulation | No meaningful discarded time under normal load | |
| Latency | Subjectively responsive; physical measurement compatible with a fast action game | |
| Lifecycle | Lock/background/rotation behaviour understood and documented | |
| Security | HTTPS/WSS physical flow works without disabling browser security | |
| UX | Join/reconnect/error states understandable without developer help | |
