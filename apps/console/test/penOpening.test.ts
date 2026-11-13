import { describe, expect, it } from 'vitest';
import { PEN_OPEN_SECONDS, penWallAt } from '../src/render/penOpening';

// The warm-up's pens opening (the HQ, foomerang-fu physics hq.mp4 2.53-2.87 s, the mug's pen, 60 fps; owner, 2026-11-12: "it settles
// into the ground"): the lever struck, the whole pen turns the player's colour at once; from ~0.1 s its walls sink straight down into
// the ground, gone by ~0.3 s. They never fly or tip.

describe('a pen wall opening', () => {
  it('stands untinted before its lever is struck', () => {
    expect(penWallAt(undefined)).toEqual({ tint: 0, sink: 0, visible: true });
  });
  it('takes the player’s colour at once, still standing', () => {
    const p = penWallAt(0.02);
    expect(p.tint).toBe(1);
    expect(p.sink).toBe(0);
  });
  it('sinks into the ground, a little at first and faster as it goes, gone by the end', () => {
    expect(penWallAt(0.18).sink).toBeGreaterThan(0.1);
    expect(penWallAt(0.18).sink).toBeLessThan(0.8);
    expect(penWallAt(0.29).sink).toBeGreaterThan(0.9);
    expect(penWallAt(PEN_OPEN_SECONDS).visible).toBe(false);
  });
});
