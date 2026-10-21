/**
 * A slash, as the reference video shows it (the mug at 0:39.93–40.30, read frame by frame; art/physics_reference/README.md,
 * "The slash"). Pure timing; the 3D plaza moves the boomerang hand and draws the crescent.
 *
 * - 39.97: the boomerang hand swings down from its side and a white crescent appears at its feet.
 * - 40.00–40.07: the crescent sweeps round the front of the body (≈ a half circle, ≈ a body width out); the hand goes across the
 *   front to the other side; the crescent thins and fades.
 * - 40.10: the crescent is gone (≈ the rules' 0.12 s swing); the boomerang is held out at the far side (40.13–40.30), then
 *   comes back.
 */
export const SLASH_LOOK = Object.freeze({
  /** The swing's sweep, radians: from one side, across the front, to the other. */
  sweep: Math.PI,
  /** The crescent: inner and outer radius, world units (the body's edge, and ≈ a body width out). */
  inner: 38,
  outer: 80,
  /** Its opacity at its strongest. */
  opacity: 0.95,
  /** The part of the recovery the hand stays out at the far side before coming back. */
  hold: 0.35,
});

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp = (t: number) => Math.min(1, Math.max(0, t));

/** Where the boomerang hand is round the body, radians from the swing's direction (negative: the side it starts from). */
export function swingAngle(phase: 'ACTIVE' | 'RECOVERING', progress: number): number {
  const half = SLASH_LOOK.sweep / 2;
  const p = clamp(progress);
  if (phase === 'ACTIVE') return -half + SLASH_LOOK.sweep * easeOut(p);
  if (p <= SLASH_LOOK.hold) return half;
  return half - SLASH_LOOK.sweep * easeInOut((p - SLASH_LOOK.hold) / (1 - SLASH_LOOK.hold));
}

/** The crescent: from the swing's start side, how much of the sweep is drawn (radians), and how opaque it is. */
export function swoosh(
  phase: 'ACTIVE' | 'RECOVERING',
  progress: number,
): { readonly length: number; readonly opacity: number } {
  if (phase === 'RECOVERING') return { length: SLASH_LOOK.sweep, opacity: 0 };
  const p = clamp(progress);
  return { length: SLASH_LOOK.sweep * easeOut(p), opacity: SLASH_LOOK.opacity * (1 - 0.5 * p) };
}
