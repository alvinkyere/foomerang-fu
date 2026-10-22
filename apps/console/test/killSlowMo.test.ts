import { describe, expect, it } from 'vitest';
import { KILL_SLOW_MO, gameSecondsBetween, killTimeScale } from '../src/runtime/killSlowMo';

// A kill freezes the game for 0.1 s, then plays it at ≈ 0.2× until 1.1 s, back to full speed by 1.35 s (the HQ video: the
// donut 1:03.85, the coffee mug 2:21.18).

describe('a kill’s slow motion', () => {
  it('freezes, then slows to a fifth, then eases back', () => {
    expect(killTimeScale(0.05)).toBe(0);
    expect(killTimeScale(0.5)).toBeCloseTo(0.2, 9);
    expect(killTimeScale(1.2)).toBeGreaterThan(0.2);
    expect(killTimeScale(1.2)).toBeLessThan(1);
    expect(killTimeScale(1.4)).toBe(1);
    expect(KILL_SLOW_MO).toMatchObject({ freeze: 0.1, slowUntil: 1.1, backAt: 1.35 });
  });

  it('the game loses ≈ 1 s to it: 1.35 s of real time hold ≈ 0.35 s of play', () => {
    expect(gameSecondsBetween(0, 1.35)).toBeCloseTo(0.2 + 0.15, 2);
    expect(gameSecondsBetween(0, 0.1)).toBe(0);
    expect(gameSecondsBetween(2, 3)).toBeCloseTo(1, 9);
  });
});
