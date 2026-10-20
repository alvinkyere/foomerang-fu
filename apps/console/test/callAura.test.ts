import { describe, expect, it } from 'vitest';
import { CALL_AURA, auraPulse } from '../src/render/callAura';

// The aura while a boomerang is being called home (the reference video, the tutorial at 0:17.9–0:18.7): a pale ring round the
// boomerang (and on the caller's hands, owner) that flashes: lit ~0.3 s, dark ~0.15 s, over and over until it arrives.

describe('the calling aura', () => {
  it('is lit for 0.3 s, then dark for 0.15 s, and again', () => {
    expect(CALL_AURA.onSeconds).toBe(0.3);
    expect(CALL_AURA.offSeconds).toBe(0.15);
    expect(auraPulse(0.1)).toBeGreaterThan(0.5);
    expect(auraPulse(0.36)).toBe(0);
    expect(auraPulse(0.45 + 0.1)).toBeGreaterThan(0.5);
  });

  it('is about one and a half boomerang lengths across', () => {
    expect(CALL_AURA.ringOfBoomerang).toBeCloseTo(1.5, 6);
  });
});
