/**
 * The boomerang as the reference video draws it ("foomerang - fu physics.mp4"; art/physics_reference/README.md, "The
 * boomerang's look"). Pure numbers and shapes, in world units; the 3D plaza draws from them.
 *
 * - At rest (lying on the ground, 0:40.2–42.6): a flat V, its arms opening at ≈ 105° and ≈ 0.35 of its span thick, ≈ 22 u tip
 *   to tip (13 × 9 px against the 27 px donut), solid in its thrower's colour with a lighter rim.
 * - In flight (0:36.9–37.1): it spins too fast to see its shape: a pale disc ≈ 21 u across (12.5 px) with a rim and a dot in
 *   its thrower's colour.
 * - Behind every throw, quick or charged (the pink and the brown at 0:36.9): a band ≈ 0.8 of the disc wide, part see-through in
 *   that colour, fading evenly; gone ≈ 0.85 s after the boomerang passed (0.65–0.95 s at three points of the pink one).
 */
export const BOOMERANG_LOOK = Object.freeze({
  /** Tip to tip at rest, world units. */
  span: 22,
  /** The angle its two arms open at. */
  bendDegrees: 105,
  /** How wide an arm is, as a fraction of the span (≈ 4.5 px of its 13 px at rest, 0:40.4). */
  armWidth: 0.35,
  /** Its rim: its colour lightened by this much towards white. */
  rimLighten: 0.45,
  /** In flight: the disc a fast spin makes. */
  disc: Object.freeze({
    diameter: 21,
    /** How pale its face is (mixed towards white). */
    pale: 0.8,
    /** Its coloured rim, as a fraction of its radius, and the dot at its middle. */
    rim: 0.2,
    dot: 0.25,
  }),
  trail: Object.freeze({
    seconds: 0.85,
    width: 0.8 * 21,
    /** Where the boomerang has just been. */
    opacity: 0.7,
  }),
});

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * The V's outline in world units, centred on its middle line (x = 0), its elbow pointing +y: the outer edge of one arm, round
 * its tip, back along the inner edge, then the same for the other arm.
 */
export function boomerangOutline(look = BOOMERANG_LOOK, tipSegments = 8): Point[] {
  const h = (look.bendDegrees * Math.PI) / 360;
  const w = look.span * look.armWidth;
  // the span is the tips' centres apart plus the two round ends
  const arm = (look.span - w) / (2 * Math.sin(h));
  const half = w / 2;
  const outerElbow = { x: 0, y: half / Math.sin(h) };
  const innerElbow = { x: 0, y: -half / Math.sin(h) };
  const tip = { x: arm * Math.sin(h), y: -arm * Math.cos(h) };
  // across the right arm, towards its outer (elbow) side
  const n = { x: Math.cos(h), y: Math.sin(h) };
  const right: Point[] = [outerElbow];
  for (let i = 0; i <= tipSegments; i += 1) {
    const a = Math.atan2(n.y, n.x) - (Math.PI * i) / tipSegments;
    right.push({ x: tip.x + half * Math.cos(a), y: tip.y + half * Math.sin(a) });
  }
  right.push(innerElbow);
  const left = right
    .slice(1, -1)
    .reverse()
    .map((p) => ({ x: -p.x, y: p.y }));
  return [...right, ...left];
}

/** How opaque the trail is where the boomerang passed `age` seconds ago: fading evenly to nothing. */
export const trailOpacity = (age: number, look = BOOMERANG_LOOK): number =>
  age >= look.trail.seconds ? 0 : look.trail.opacity * (1 - Math.max(0, age) / look.trail.seconds);
