# PHYSICAL PHONE GATE — console shell checkpoint

**Status: reviewer-approved (PASS), details not recorded.** On 2026-10-07 the reviewer tested the production shell and approved Checkpoint A. The reviewer did not supply the fields below (phone model, OS, browsers, trust workaround, per-item results), so they are **left blank rather than guessed**. **Physical gamepad: UNVERIFIED.** iOS Safari validation is **not** claimed.

Whoever repeats this should fill the table in. The automated suite drives *emulated* phones (Chrome, iPhone-sized, touch injected over DevTools). It is not evidence for this gate.

## Setup (plain HTTP, the existing development setup)

1. Phone and this computer on the same Wi-Fi (guest networks often isolate devices from each other: if the QR opens but the page never loads, that is why).
2. Find the address the phone will use for this computer (System Settings → Wi-Fi → Details, or `ipconfig getifaddr en0`). `ipconfig` reported `153.106.214.192` on en0 when this was written: confirm it is the Wi-Fi address and be aware that `dev:demo` listens on all interfaces, so the dev servers are reachable by anything on that network while it runs.
3. In a terminal: `pnpm dev:demo --host <that address>` (add `--tls-cert/--tls-key` only for the HTTPS variant in [DEVICE_TESTING.md](DEVICE_TESTING.md)).
4. On the computer, open the **console URL it prints** (root `/`, nothing else). Stop with Ctrl-C when done.

## Run, in order (tick as you go)

- [ ] Home appears at `/`, Foomerang Fu focused.
- [ ] Foomerang Fu → PLAY → Join with a QR and a room code.
- [ ] No warning bar about phones not reaching the screen (there should be none with a real `--host`).
- [ ] Scan the QR with the phone's camera → the controller (not the console Home) opens.
- [ ] Name → Join → the player appears on Join **immediately**, shown as **Connected**.
- [ ] Joystick moves; SLASH / THROW / DASH respond (start a match to see it).
- [ ] Add a CPU (Select on an empty seat) → START GAME → the Fu match launches.
- [ ] **Interruption:** with the phone connected, lock it or switch app for ~5 s, return. The **same** player recovers (same seat, name, number); no second seat appears.

## Record

| Field | Value |
| --- | --- |
| Phone model | |
| OS and version | |
| Phone browser (and version) | |
| Host computer / host browser | |
| QR needed a certificate / trust workaround? | |
| Join | PASS / FAIL |
| Reconnect (no duplicate seat) | PASS / FAIL |
| Controller input | PASS / FAIL |
| Notes (timings, anything odd) | |

Do not call this iOS Safari validation unless the phone was an iPhone and the browser was Safari.
