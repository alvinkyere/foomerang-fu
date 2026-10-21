import { describe, expect, it } from 'vitest';
import { SHIELD_LOOK, fragmentAngle } from '../src/render/shieldLook';

// The Shield as the reference video draws it (6:54.38 the bubble; 8:54.19–8:54.25 the pop).

describe('the shield bubble', () => {
  it('is ≈ 1.85 widths across, centred half a body up; its pop is ten pink fragments gone in 0.1 s', () => {
    expect(SHIELD_LOOK.diameter).toBeCloseTo(1.85, 9);
    expect(SHIELD_LOOK.centre).toBeCloseTo(0.5, 9);
    expect(SHIELD_LOOK.fragments).toBe(10);
    expect(SHIELD_LOOK.popMs).toBe(100);
    expect(fragmentAngle(1) - fragmentAngle(0)).toBeCloseTo(
      (Math.PI * 2) / SHIELD_LOOK.fragments,
      9,
    );
  });
});
