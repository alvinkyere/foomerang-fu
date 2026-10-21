import { describe, expect, it } from 'vitest';
import { SLASH_LOOK, swingAngle, swoosh } from '../src/render/slashMotion';

// A slash, as the reference video shows it (the mug at 0:39.93–40.30, frame by frame; art/physics_reference/README.md, "The
// slash"): the boomerang hand sweeps from its side across the front to the other side during the swing (≈ 0.12 s), a white
// crescent sweeping round the front at its feet with it, gone as the swing ends; the hand holds there a moment, then comes back.

describe('the slash', () => {
  it('sweeps the boomerang hand from its side across the front to the other side during the swing', () => {
    expect(swingAngle('ACTIVE', 0)).toBeCloseTo(-SLASH_LOOK.sweep / 2, 9);
    expect(swingAngle('ACTIVE', 1)).toBeCloseTo(SLASH_LOOK.sweep / 2, 9);
    expect(Math.abs(swingAngle('ACTIVE', 0.5))).toBeLessThan(SLASH_LOOK.sweep / 2);
    // fast first (an easing out): past the front before half the swing
    expect(swingAngle('ACTIVE', 0.4)).toBeGreaterThan(0);
  });

  it('holds the hand out at the far side, then brings it back by the end of the recovery', () => {
    expect(swingAngle('RECOVERING', 0.2)).toBeCloseTo(SLASH_LOOK.sweep / 2, 9);
    expect(swingAngle('RECOVERING', 1)).toBeCloseTo(-SLASH_LOOK.sweep / 2, 9);
  });

  it('draws the white crescent along the swing, revealed as the hand goes, gone soon after', () => {
    const start = swoosh('ACTIVE', 0.1);
    const mid = swoosh('ACTIVE', 0.6);
    expect(mid.length).toBeGreaterThan(start.length);
    expect(swoosh('ACTIVE', 1).length).toBeCloseTo(SLASH_LOOK.sweep, 9);
    expect(swoosh('ACTIVE', 1).opacity).toBeGreaterThan(0);
    expect(swoosh('RECOVERING', 0.5).opacity).toBe(0);
  });
});
