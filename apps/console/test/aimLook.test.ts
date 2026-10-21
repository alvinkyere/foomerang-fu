import { describe, expect, it } from 'vitest';
import { AIM_LOOK, chevronDistance, windUp } from '../src/render/aimLook';

// Charging a throw, as the reference video shows it (the donut, 2:00.60–2:01.47, read frame by frame;
// art/physics_reference/README.md, "Charging a throw"): an arrowhead in the thrower's colour lies on the ground ahead of it,
// pointing where it aims, starting at its body and sliding out as the charge builds, slowing, still from ≈ 0.64 s (a full
// charge); and the boomerang is drawn back behind the body in its hand, ready to throw.

describe('charging a throw', () => {
  it('the arrowhead starts at the body and ends ≈ 1.4 body widths out at a full charge', () => {
    expect(chevronDistance(0)).toBeCloseTo(AIM_LOOK.from, 9);
    expect(chevronDistance(1)).toBeCloseTo(AIM_LOOK.to, 9);
    expect(AIM_LOOK.from).toBeGreaterThanOrEqual(36);
    expect(AIM_LOOK.to).toBeCloseTo(1.4 * 72, 0);
  });

  it('slides out fast at first, then slower (it eases out as the charge fills)', () => {
    const half = chevronDistance(0.5);
    expect(half - AIM_LOOK.from).toBeGreaterThan((AIM_LOOK.to - AIM_LOOK.from) / 2);
    for (let k = 0; k < 10; k += 1)
      expect(chevronDistance((k + 1) / 10)).toBeGreaterThan(chevronDistance(k / 10));
  });

  it('draws the boomerang back as the charge builds, all the way at a full one', () => {
    expect(windUp(0)).toBe(0);
    expect(windUp(1)).toBe(1);
    expect(windUp(0.5)).toBeGreaterThan(0.5);
  });
});
