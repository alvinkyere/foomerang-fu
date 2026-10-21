import { describe, expect, it } from 'vitest';
import { BOOMERANG_LOOK, boomerangOutline, trailOpacity } from '../src/render/boomerangLook';

// The boomerang as the reference video draws it ("foomerang - fu physics.mp4"; art/physics_reference/README.md, "The
// boomerang's look"): at rest a flat V in its thrower's colour with a lighter rim, ≈ 22 u tip to tip; in flight a pale disc
// ≈ 21 u across with a rim and a dot in that colour; behind every throw a band ≈ 0.8 of the disc wide, fading over ≈ 0.85 s.

const span = (pts: readonly { x: number; y: number }[]) => {
  let best = 0;
  for (const p of pts) for (const q of pts) best = Math.max(best, Math.hypot(p.x - q.x, p.y - q.y));
  return best;
};

describe('the boomerang’s look, measured from the video', () => {
  it('is drawn the size the video draws it, not from its collision radius', () => {
    expect(BOOMERANG_LOOK.span).toBe(22);
    expect(BOOMERANG_LOOK.disc.diameter).toBe(21);
  });

  it('at rest is a V: two arms meeting at the measured bend, as long tip to tip as measured', () => {
    const outline = boomerangOutline();
    expect(span(outline)).toBeCloseTo(BOOMERANG_LOOK.span, 0);
    // symmetric about its middle (x = 0), the elbow pointing +y
    for (const p of outline)
      expect(outline.some((q) => Math.hypot(q.x + p.x, q.y - p.y) < 1e-6)).toBe(true);
    const elbow = outline.reduce((a, p) => (Math.abs(p.x) < 1e-9 && p.y > a.y ? p : a), {
      x: 0,
      y: -Infinity,
    });
    const tip = outline.reduce((a, p) => (p.x > a.x ? p : a));
    // the arms open at the measured angle (the centre line from the elbow to a tip)
    const half = Math.atan2(tip.x, elbow.y - tip.y);
    expect((2 * half * 180) / Math.PI).toBeGreaterThan(BOOMERANG_LOOK.bendDegrees - 15);
    expect((2 * half * 180) / Math.PI).toBeLessThan(BOOMERANG_LOOK.bendDegrees + 15);
  });

  it('leaves a trail that fades evenly and is gone after the measured time (ours was a third of a second)', () => {
    const { seconds, opacity } = BOOMERANG_LOOK.trail;
    expect(seconds).toBeCloseTo(0.85, 9);
    expect(trailOpacity(0)).toBeCloseTo(opacity, 9);
    expect(trailOpacity(seconds / 2)).toBeCloseTo(opacity / 2, 9);
    expect(trailOpacity(seconds)).toBe(0);
    expect(trailOpacity(seconds + 1)).toBe(0);
    expect(BOOMERANG_LOOK.trail.width).toBeCloseTo(0.8 * BOOMERANG_LOOK.disc.diameter, 9);
  });
});
