# Reconstructed maps — performance record

Measured with `integration/e2e/cpu.e2e.ts` (opt-in: `FOOMERANG_E2E_CPU6=1 FOOMERANG_E2E_ARENA=<map> FOOMERANG_E2E_VIEWPORT=WxH
FOOMERANG_E2E_CPU_THROTTLE=n FOOMERANG_E2E_CPU6_SECONDS=30`): one idle controller + six Hard CPUs, Powerups high, kill race to 14,
the real game (rules → console → Phaser). Per-frame intervals come from the page's own `requestAnimationFrame`; "worst frame in any
window" is the console's own frame metric (2 s windows).

**These are not universal performance claims.** They hold for this machine and these conditions only. Headless Chrome paces frames to
60 Hz, so frame-time percentiles saturate at 16.7 ms and show only whether 60 is held, not the headroom above it.

Conditions common to every row (2026-10-08): iMac21,2 (Apple M1, 8 CPU cores, 7-core integrated GPU, 8 GB RAM; verified with sysctl / system_profiler), HeadlessChrome
154.0.0.0, **dev console build** (Vite dev server, React dev mode), DPR 1, Phaser game 1920 × 1080 scaled to the viewport (`Scale.FIT`),
30 s per run, effects on (Powerups high), no other heavy process running.

| Map          | Viewport  | Canvas backing | CPU throttle | Avg FPS | 1% low FPS | p50 / p95 / p99 ms | Worst frame (2 s windows) |
| ------------ | --------- | -------------- | ------------ | ------- | ---------- | ------------------ | ------------------------- |
| harbour_fort | 1920×1080 | 1920×1080      | 1×           | 60.00   | 59.52      | 16.7 / 16.7 / 16.8 | 25.7                      |
| market_plaza | 1920×1080 | 1920×1080      | 1×           | 60.00   | 59.52      | 16.7 / 16.7 / 16.8 | 36.1                      |
| garden       | 1920×1080 | 1999×1138      | 1×           | 59.97   | 56.60      | 16.7 / 16.8 / 16.8 | 24.5                      |
| harbour_fort | 3840×2160 | 1920×1080      | 1×           | 60.00   | 59.52      | 16.7 / 16.8 / 16.8 | 28.2                      |
| market_plaza | 3840×2160 | 1920×1080      | 1×           | 60.00   | 59.52      | 16.7 / 16.7 / 16.8 | 33.0                      |
| harbour_fort | 1920×1080 | 1920×1080      | 6×           | 58.85   | 25.70      | 16.7 / 16.8 / 33.3 | 138.2                     |
| market_plaza | 1920×1080 | 1920×1080      | 6×           | 59.34   | 28.40      | 16.7 / 16.8 / 16.8 | 80.1                      |

Findings:

- At 1×, both reconstructed maps hold 60 FPS with six CPUs; their 1% lows are at least Garden's.
- **The 4K rows are NOT a 4K test.** The canvas backing stays 1920 × 1080 (the browser upscales it), so GPU fill at 4K was never
  exercised. A real TV/4K measurement needs a 4K backing (or the actual TV) and is still owed.
- **Under 6× CPU throttling (a slow-TV proxy) both maps hitch:** 1% lows of 26–28 FPS and worst frames of 80–138 ms, although the
  average stays ~59. harbour_fort's p99 doubles (33 ms). The previously reported TV / high-player slowdown is **unresolved** and
  remains a **release blocker** until tested on that hardware and resolution.
- Not yet profiled per map (the earlier plaza CPU profile found React dev re-renders of the console UI as the top app-level cost).

## All 14 maps (2026-10-08)

Same machine and conditions as above: six Hard CPUs + one idle controller, viewport 1920×1080, canvas backing 1920×1080, CPU throttle
1×, dev console, 20 s per map. "Worst" is the console's worst frame over 2 s windows.

| Map           | Avg FPS | 1% low | p50 / p95 / p99 ms | Worst ms |
| ------------- | ------- | ------ | ------------------ | -------- |
| market_plaza  | 60.00   | 59.52  | 16.7 / 16.8 / 16.8 | 32.4     |
| harbour_fort  | 60.00   | 59.52  | 16.7 / 16.7 / 16.8 | 30.7     |
| sky_islands   | 60.00   | 59.52  | 16.7 / 16.7 / 16.8 | 18.7     |
| pond_garden   | 60.00   | 59.52  | 16.7 / 16.8 / 16.8 | 33.6     |
| lakeshore     | 60.00   | 59.52  | 16.7 / 16.7 / 16.8 | 39.3     |
| farm_plots    | 60.00   | 59.52  | 16.7 / 16.8 / 16.8 | 34.8     |
| flooded_ruins | 60.00   | 59.52  | 16.7 / 16.8 / 16.8 | 33.8     |
| hedge_maze    | 60.00   | 59.52  | 16.7 / 16.8 / 16.8 | 23.1     |
| toaster_dock  | 60.00   | 59.52  | 16.7 / 16.8 / 16.8 | 31.2     |
| twin_log_rink | 60.00   | 59.52  | 16.7 / 16.7 / 16.8 | 31.3     |
| hex_grove     | 60.00   | 59.52  | 16.7 / 16.7 / 16.8 | 32.7     |
| stone_ruins   | 60.00   | 59.52  | 16.7 / 16.7 / 16.8 | 20.7     |
| cross_pond    | 60.00   | 59.52  | 16.7 / 16.8 / 16.8 | 30.9     |
| diamond_walls | 60.00   | 59.52  | 16.7 / 16.8 / 16.8 | 19.7     |

On this machine at 1× every map holds 60 with six CPUs. This does not cover the TV / 4K backing / slow-CPU case: that remains
unmeasured on target hardware and is still a **release blocker** (the 6× throttle runs above already showed hitches).
