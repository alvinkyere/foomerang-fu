import { describe, expect, it } from 'vitest';
import { PEN_OPEN_SECONDS, penWallAt } from '../src/render/penOpening';

// The warm-up's pens opening (the HQ, foomerang-fu physics hq.mp4 2.53-2.87 s, the mug's pen, 60 fps): the lever struck, the whole pen
// turns the player's colour at once; from ~0.1 s its walls tip over outwards, flat by ~0.25 s, and fade, gone by ~0.3 s.

describe('a pen wall opening', () => {
  it('stands untinted before its lever is struck', () => {
    expect(penWallAt(undefined)).toEqual({ tint: 0, tip: 0, opacity: 1, visible: true });
  });
  it('takes the player’s colour at once, still standing', () => {
    const p = penWallAt(0.02);
    expect(p.tint).toBe(1);
    expect(p.tip).toBe(0);
  });
  it('tips over outwards, flat by a quarter second, then fades away', () => {
    expect(penWallAt(0.18).tip).toBeGreaterThan(0.2); // (falling: slow at first, faster as it goes)
    expect(penWallAt(0.18).tip).toBeLessThan(1);
    expect(penWallAt(0.25).tip).toBe(1);
    expect(penWallAt(0.28).opacity).toBeLessThan(1);
    expect(penWallAt(PEN_OPEN_SECONDS).visible).toBe(false);
  });
});
