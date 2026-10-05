# DESIGN SYSTEM

Status: Draft v0.1 — principles and state inventories only. Visual identity (type, palette, logo) is deferred to Milestone 7; M1 uses plain placeholders.

## Principles
1. Play without looking: controller uses large touch regions, minimal text.
2. Every state change has feedback (visual + audio/haptic where supported).
3. Color is never the only identifier — pair with shape/symbol/name (NFR-009).
4. Motion is purposeful; respects `prefers-reduced-motion`.
5. Original assets only.

## Tokens (placeholders, to be defined)
Color, type scale, spacing, radius, elevation, motion durations/easings, z-layers. Lives in `packages/ui`.

## State inventories
- **Buttons**: idle, hover, pressed, disabled, loading
- **Player**: idle, run, dash, throw, hit, death, victory
- **Screens**: enter, exit, modal, countdown, results
- **Game feel**: anticipation, impact frames, hit stop, screen shake, particles, trails, squash/stretch, audio cues, haptics

## Controller UX
Landscape primary, portrait handled gracefully. Left-thumb joystick (dynamic origin), right-thumb action buttons. Always-visible connection/latency indicator. Prevent scroll/zoom/selection (`touch-action: none`). Haptics via Vibration API are Android-only; iOS gets visual/audio feedback instead.

## Connection status UX (two layers)
- **Players see** `● GOOD`, `● UNSTABLE`, `● RECONNECTING` on the controller; on the host, a per-player dot with "Reconnecting" label. Never raw milliseconds.
- **Engineers see** RTT / input age / routing / frame time / FPS in the debug overlay only.

## Join moment
Joining is a celebration (character drop-in, name bounce, particles, sound, controller buzz) — implemented in Milestone 7, specified here so earlier code leaves room for it.
