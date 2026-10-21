/**
 * Charging a throw, as the reference video shows it (the donut, 2:00.60–2:01.47, read frame by frame; art/physics_reference/
 * README.md, "Charging a throw"). Pure numbers; three/chargeVisuals.ts and three/hands.ts draw them.
 *
 * - An arrowhead in the thrower's colour lies flat on the ground ahead of it, pointing where it aims: two strokes meeting at
 *   about a right angle, ≈ 12 px across in the video: about half a body width, ≈ 34 u. It starts at the body (120.60) and
 *   slides out as the charge builds, fast at first and slowing, still from ≈ 121.24 (0.64 s: a full charge), ≈ 1.4 body
 *   widths out (≈ 37 px from the donut's middle).
 * - The boomerang is drawn back behind the body in its hand the whole time (the pink shape at the donut's back).
 */
export const AIM_LOOK = Object.freeze({
  /** The arrowhead's distance from the body's middle, world units: at the start of a charge (its edge), and at a full one. */
  from: 40,
  to: 1.4 * 72,
  /** Its size across, and its strokes' width, world units. */
  size: 34,
  stroke: 9,
  /** How opaque it is. */
  opacity: 0.9,
});

const easeOut = (t: number) => 1 - (1 - t) ** 2;
const clamp = (t: number) => Math.min(1, Math.max(0, t));

/** How far ahead of the body's middle the arrowhead lies at charge `power` (0–1), world units. */
export const chevronDistance = (power: number): number =>
  AIM_LOOK.from + (AIM_LOOK.to - AIM_LOOK.from) * easeOut(clamp(power));

/** How far drawn back the boomerang is at charge `power` (0–1): 0 not at all, 1 all the way. */
export const windUp = (power: number): number => easeOut(clamp(power));
