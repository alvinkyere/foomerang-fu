import { describe, expect, it } from 'vitest';
import { BOOMERANG_LOOK, trailOpacity } from '../src/render/boomerangLook';

// How the boomerang is drawn (art/physics_reference/README.md, "The boomerang's look"): its shape is render/boomerangShape.ts,
// half a character's height long; behind every throw a band ≈ 0.8 of its spinning blur (≈ 35 u) wide, fading over ≈ 0.85 s.

describe('the boomerang’s look, measured', () => {
  it('is drawn half a character’s height long (characters are ≈ 70–76 u tall), not the 22 u of a misread scale', () => {
    expect(BOOMERANG_LOOK.span).toBe(36);
  });

  it('leaves a trail that fades evenly and is gone after the measured time (ours was a third of a second)', () => {
    const { seconds, opacity } = BOOMERANG_LOOK.trail;
    expect(seconds).toBeCloseTo(0.85, 9);
    expect(trailOpacity(0)).toBeCloseTo(opacity, 9);
    expect(trailOpacity(seconds / 2)).toBeCloseTo(opacity / 2, 9);
    expect(trailOpacity(seconds)).toBe(0);
    expect(trailOpacity(seconds + 1)).toBe(0);
    expect(BOOMERANG_LOOK.trail.width).toBeCloseTo(0.8 * 35, 9);
  });
});
