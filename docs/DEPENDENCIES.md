# DEPENDENCIES — policy and review record

## Rules

- **Justify every new dependency.** Pick versions from verified registry data (publish date, license, dependency tree), not "latest".
- pnpm's package-age protection (`minimumReleaseAge`) is **on** and stays on.
- **STANDING RULE:** `minimumReleaseAgeExclude` must **never** be added or modified merely to make dependency installation succeed. Any exception to the repository's package-age / supply-chain policy requires **explicit engineering review and documented justification** in this file.
  - `packages/config/test/supply-chain-policy.test.ts` enforces it mechanically: it fails on any `minimumReleaseAge*` key in `pnpm-workspace.yaml`, and on any install script approved to run. If an install fails because a version is too new, choose an older version. If an exception is genuinely warranted, record the review here first.
- Install scripts are denied by default (`allowBuilds: esbuild: false`; nothing here needs it).
- No secrets in the repository; TLS keys live outside it (`certs/`, `*.pem` are git-ignored).

## Slice 8 additions (registry facts verified 2026-10-05)

| Package | Version | Where | Why | Registry facts |
| --- | --- | --- | --- | --- |
| `phaser` | 4.2.1 (exact) | console | Renders the arena; lazy-loaded; confined to `src/render/phaser`. | MIT; one dependency (`eventemitter3`); published 2026-07-09. 357 kB gzip as a separate chunk. |
| `qrcode-generator` | 2.0.4 (exact) | console | QR module matrix only; we draw the SVG. | MIT; **no dependencies**; published 2025-08-07; ~200 kB unpacked in `dist`, a few kB in the bundle. |
| `@playwright/test` | 1.63.0 (exact) | integration (dev) | The required browser end-to-end gate. | Apache-2.0; published 2026-09-04. Uses the system Chrome (no browser download for the default run); WebKit is an opt-in extra. |
| `react`, `react-dom`, `vite`, `vitest`, `jsdom`, Testing Library, `@vitejs/plugin-react` | as in `package.json` | console | Same stack as the controller (ADR-003). | `@vitejs/plugin-react` is pinned to **6.1.1** because 6.1.2 was published 2026-10-05, inside the package-age window — see below. |

### Deviation record: `qrcode-generator` rather than `qrcode`

`qrcode` (1.5.4) is the more popular choice, but it depends on `pngjs`, `yargs` and `dijkstrajs` (a command-line parser and a PNG encoder for a feature we do not use) and renders its own output. `qrcode-generator` has **zero dependencies** and exposes the module matrix, which is all we need and lets us own the rendering. **Risk accepted:** it was last published in 2025 and may see little maintenance; QR encoding is a stable specification, the matrix is pinned by tests (finder patterns, ISO 18004 format bits for EC level and orientation), and the rendered pixels were independently decoded with a separate decoder (outside the repository) to the exact join URL.

### Incident record: the package-age rule

During Slice 7's clean-clone verification `pnpm install` had silently added a `minimumReleaseAgeExclude` entry for `@vitejs/plugin-react@6.1.2`. That was removed; the version was pinned to the aged 6.1.1 and the lockfile re-resolved. The standing rule above and its guard test exist because of it. (Slice 8 hit the same situation: 6.1.2 is only hours old today. The answer is the pin, not an exclusion.)

## The plaza in real-time 3D (owner-approved 2026-10-17; registry facts verified 2026-10-17)

| Package | Version | Where | Why | Registry facts |
| --- | --- | --- | --- | --- |
| `three` | 0.185.1 (exact) | console | Draws the market plaza in real-time 3D (our own lit models, real shadows, characters standing in the scene); lazy-loaded; confined to `src/render/three` (lint-enforced, tested). | MIT; **no dependencies**; published 2026-07-01 (0.186.x exists, not needed). ~156 kB gzip as its own lazy chunk (with GLTFLoader). |
| `@types/three` | 0.185.1 (exact) | console (dev) | Type declarations for `three`. Never bundled. | MIT; published 2026-07-09. Pulls in, as declared dependencies: `fflate` 0.8.3, `meshoptimizer` 1.1.1, `@tweenjs/tween.js` 23.1.3, `@dimforge/rapier3d-compat` 0.12.0, `@types/webxr`, `@types/stats.js` — installed for typing only; none is imported or bundled. No install scripts. |

The console's lazy-chunk budget was raised deliberately (380 → 540 kB gzip, `scripts/check-bundle-size.mjs`): the total now holds two
alternative renderers (three.js for the plaza, Phaser for every other map), and a match downloads only one of them.

## Not dependencies (tools run outside the repository)

During verification, a throwaway QR decoder and the system `openssl` were used to check the QR pixels and to create throwaway TLS certificates for tests. Neither is a repository dependency; `openssl` is required by the TLS tests and the TLS E2E variant (present on macOS and the CI image).
