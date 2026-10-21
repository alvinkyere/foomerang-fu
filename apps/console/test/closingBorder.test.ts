import { describe, expect, it } from 'vitest';
import { BATTLE_ROYALE_HOLD } from '@foomerang/foomerang-fu';
import { CLOSING_LOOK, closingLookAt } from '../src/render/three/closingBorder';

// Battle Royale's border, timed every frame from the reference video (4:37.03 the take; the glow fades in 4:37.08–4:37.2; the
// dashed line appears and moves from 4:37.94).

describe('the closing border', () => {
  it('the glow fades in over 0.05–0.2 s; the dashed line shows from the end of the hold', () => {
    expect(closingLookAt(0)).toEqual({ glow: 0, line: false });
    expect(closingLookAt(0.125).glow).toBeCloseTo(CLOSING_LOOK.glowOpacity / 2, 6);
    expect(closingLookAt(0.2).glow).toBeCloseTo(CLOSING_LOOK.glowOpacity, 6);
    expect(closingLookAt(BATTLE_ROYALE_HOLD - 0.01).line).toBe(false);
    expect(closingLookAt(BATTLE_ROYALE_HOLD).line).toBe(true);
  });
});
