# DEVICE TESTING — Milestone 1's physical gate

**Result: Milestone 1 PASSED** on the reviewer's physical run; what was and was not recorded is in [MILESTONE_1_VALIDATION.md](MILESTONE_1_VALIDATION.md). The procedure below stays the reference for any re-test.

**Automated tests never complete Milestone 1.** Milestone 1 needed a physical iPhone running Safari, over a real network, against an HTTPS (production-representative) deployment, plus a second physical phone or browser where available, plus recorded performance observations. As of this slice **none of that has been done**.

Two separate statuses, kept apart on purpose:

| Status | Meaning | Today |
| --- | --- | --- |
| **Slice 8 engineering** | The automated flow passes (unit, component, Playwright against the real server + console + two controllers, production-build check, clean clone). | **Complete.** |
| **Milestone 1** | The above **plus** the physical-device evidence below. | **PASS** (reviewer-declared; see the validation report for exactly what was recorded). |

## What counts as evidence

1. iPhone, **Safari** (not Chrome-on-iOS, not an emulator), phone on a real network (Wi-Fi), laptop as host.
2. **HTTPS** for the controller and `wss://` for the server. Plain HTTP over the LAN is a development convenience, not a production-representative result.
3. A second physical phone or browser if available (an Android phone is ideal).
4. Observations written down with conditions: device and iOS version, laptop, network, what was run, what was seen.

## Setting up HTTPS on a LAN

Use a certificate your devices actually trust. **Do not turn off certificate checking** on the phone or the browser — the test is meaningless if you do.

1. On the laptop (needs Homebrew): `brew install mkcert && mkcert -install` (adds a local certificate authority to this laptop's trust store; it may ask for your password).
2. Make a certificate for the address phones will use, in the git-ignored `certs/` directory:
   `mkdir -p certs && mkcert -cert-file certs/dev.pem -key-file certs/dev-key.pem <laptop-address> localhost`
3. **Trust the same authority on the iPhone** — this is the awkward part: AirDrop (or email) the file `mkcert -CAROOT` points to (`rootCA.pem`) to the phone, open it (Settings → "Profile Downloaded" → Install), then **Settings → General → About → Certificate Trust Settings → enable full trust for the mkcert root**. Without step 3 Safari will refuse the page.
4. Start everything: `pnpm dev:demo --host <laptop-address> --tls-cert certs/dev.pem --tls-key certs/dev-key.pem`.
5. Open the console URL it prints on the laptop (it will say `https://…:5174`). Scan the QR with the phone's camera.

If that is more than you want to do: a tunnel that provides a publicly trusted certificate also works, but it exposes the development servers to the internet — do not do that casually. And if the trust steps defeat you, **report that honestly** rather than weakening anything; "HTTPS not achievable locally, plain HTTP result only" is a valid, labelled finding.

These steps were written from the tools' documented behavior; they have **not** been run on a physical iPhone in this repository. Treat them as a starting point and correct them.

## Plain HTTP (development convenience)

`pnpm dev:demo --host <laptop-address>`, then open the printed console URL. Good for checking the flow; it does not satisfy the HTTPS requirement.

## Record everything in one place

Fill in [MILESTONE_1_VALIDATION.md](MILESTONE_1_VALIDATION.md) as you go; it is the report skeleton (setup, ten QR→control timings, interruption matrix, performance, Phaser load, video latency, defects, acceptance table). The checklist below is the short version.

## Tools that need no code changes

- **Where the QR→interactive time goes:** on a Mac, enable Safari → Settings → Advanced → "Show features for web developers", and on the iPhone Settings → Safari → Advanced → Web Inspector. Plug the phone in, then Safari → Develop → *your iPhone* → the controller page → Network/Timelines.
- **Android:** `chrome://inspect` on a desktop Chrome with USB debugging.
- **Phaser load on the host:** the host browser's Network panel while pressing Start.
- **Six players on hardware you don't have:** `pnpm e2e:six` runs six simulated players (real controller SDK, random thumbs) against the production console; set `FOOMERANG_E2E_SIX_SECONDS` for the duration. It is not a phone test.
- **Port problems:** if `dev:demo` says a port is in use, an earlier run is still going: `pkill -f scripts/dev.mjs; pkill -f vite; pkill -f "tsx src/main.ts"`.

## Checklist to run and record

- [ ] Scan → controller loads → name → Join: how long did it feel? (count seconds with a stopwatch; QR-to-interactive is an *unmeasured* hypothesis today)
- [ ] The player appears in the lobby with the right name, number and shape.
- [ ] Start. Thumb moves the circle in the right direction (right, down).
- [ ] Release: it stops at once.
- [ ] Lock the phone / switch app for 5 s, return: reconnects, same circle.
- [ ] Walk out of Wi-Fi range or toggle Wi-Fi for ~5 s: reconnects, same circle.
- [ ] Two phones at once, independent movement.
- [ ] Rotate the phone: layout and joystick behave.
- [ ] Pull-to-refresh / double-tap zoom / edge swipes do not interfere with steering.
- [ ] Debug overlay (press D on the console): note FPS, frame time, catch-up frames, discarded time, RTT.

## Measuring feel honestly

The in-page overlay can show frame rate, simulation steps, the console's own heartbeat RTT and "host receive → simulation step" (all single-clock). It **cannot** show controller → screen latency or input-to-photon latency. For those, film the phone's thumb and the screen together with a high-speed camera (a second phone in slow-motion works) and count frames between the touch and the circle's first movement. Record the camera frame rate.

## What has been observed so far (and what has not)

Recorded for engineering, **not** a substitute for the above — all on one Apple M1 laptop running macOS 26.2, Google Chrome 154 (headless) and Playwright's WebKit build 2359, loopback networking, with controllers driven by synthetic touch (Chrome DevTools protocol) or mouse (WebKit):

- The journey passes in Chrome over HTTP and over HTTPS/WSS (throwaway certificate trusted by its public-key hash), and the console + a controller pass in Playwright's WebKit engine (opt-in `pnpm e2e:webkit`). WebKit via Playwright is **not iOS Safari** and the WebKit run used a mouse, not a touch screen.
- Production-build console, two controllers moving for ~9 s, debug overlay read afterwards: FPS 60, frame time 16.7 ms mean / 17.0 ms max, 545 simulation steps, 12 catch-up frames, 0 ms discarded, console⇄server RTT 2 ms, host receive → sim step 10.5 ms last / 9.6 ms mean / 31.6 ms max (74 samples; dominated by waiting for the next frame). Loopback, headless, no real network, no real GPU load: these say the software is not the bottleneck in that setting and **nothing about phones**.
- Six **simulated** players (real controller SDK in Node, random thumbs; not phones) against the production console for 300 s: FPS median 60 (min 58 over 150 samples), 3 catch-up frames, 0 ms discarded; full table in MILESTONE_1_VALIDATION.md section 5.
- **Not observed:** physical iPhone, Safari, a real network, HTTPS on a phone, phone lock/background behavior, thermal/battery behavior, true input-to-photon latency, haptics.
