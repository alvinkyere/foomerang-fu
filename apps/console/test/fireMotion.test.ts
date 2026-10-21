import { describe, expect, it } from 'vitest';
import { FIRE_MOTION, burntTilt, flameBall, lastFlames, smokeBall } from '../src/render/fireMotion';

// A burning body and a death by fire, timed every frame from the reference video (9:55.9–9:57.6 burning; 9:57.62–9:58.3 the
// eggplant falls on its side, the flames go out and smoke rises off it).

describe('burning', () => {
  it('fire balls climb the body in turn, shrinking and turning from yellow to orange', () => {
    const born = flameBall(0, 0);
    expect(born).toMatchObject({ height: 0, size: FIRE_MOTION.sizeFrom, colour: FIRE_MOTION.low });
    const up = flameBall(0, FIRE_MOTION.riseSeconds * 0.9);
    expect(up.height).toBeCloseTo(0.9 * FIRE_MOTION.riseTo, 6);
    expect(up.size).toBeLessThan(born.size);
    // the balls are spread through the climb: never all at the same height
    const heights = Array.from({ length: FIRE_MOTION.balls }, (_, i) => flameBall(i, 0.1).height);
    expect(new Set(heights.map((h) => h.toFixed(3))).size).toBe(FIRE_MOTION.balls);
  });
});

describe('dying of it', () => {
  it('falls onto its side in 0.15 s and lies there', () => {
    expect(burntTilt(0)).toBe(0);
    expect(burntTilt(0.15)).toBeCloseTo(Math.PI / 2, 9);
    expect(burntTilt(3)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('the last flames go out in 0.15 s; smoke rises and is gone by 0.55 s', () => {
    expect(lastFlames(0)?.size).toBe(1);
    expect(lastFlames(0.15)).toBeUndefined();
    expect(smokeBall(0, 0.1)?.height).toBeGreaterThan(0.3);
    expect(smokeBall(0, 0.4)?.height).toBeGreaterThan(smokeBall(0, 0.1)?.height ?? 9);
    for (let i = 0; i < FIRE_MOTION.death.smokeBalls; i += 1)
      expect(smokeBall(i, 0.55)).toBeUndefined();
  });
});
