import { describe, expect, it } from 'vitest';
import {
  PEN_CHIPS,
  PEN_OPEN_SECONDS,
  penChipAt,
  penStreaksAt,
  penTintFactor,
  penWallAt,
} from '../src/render/penOpening';

// The warm-up's pens opening (the HQ, foomerang-fu physics hq.mp4: the mug's pen 2.53-2.87 s, the aubergine's 3.70-4.00 s; owner,
// 2026-11-12: "it settles into the ground"): the lever struck, the whole pen takes the player's colour at once, which fades back
// partly; at ~0.17 s the pen's two end walls sink straight down into the ground (gone by ~0.21 s), the two long walls (the ones over
// the moat) a moment after (gone by ~0.29 s). They never fly or tip.

describe('a pen wall opening', () => {
  it('stands untinted before its lever is struck', () => {
    expect(penWallAt(undefined, false)).toEqual({ tint: 0, sink: 0, visible: true });
    expect(penWallAt(undefined, true)).toEqual({ tint: 0, sink: 0, visible: true });
  });
  it('takes the player’s colour at once, still standing', () => {
    const p = penWallAt(0.01, false);
    expect(p.tint).toBe(1);
    expect(p.sink).toBe(0);
  });
  it('fades back about half way while it stands (the aubergine’s pen: 0.78 at 0.08 s, 0.48 at 0.18 s)', () => {
    expect(penWallAt(0.08, false).tint).toBeCloseTo(0.8, 1);
    expect(penWallAt(0.18, false).tint).toBeCloseTo(0.5, 1);
    expect(penWallAt(0.15, true).sink).toBe(0);
    expect(penWallAt(0.15, false).sink).toBe(0);
  });
  it('sinks the end walls first, gone by 0.21 s, while the long walls still stand', () => {
    expect(penWallAt(0.19, true).sink).toBeGreaterThan(0.2);
    expect(penWallAt(0.215, true).visible).toBe(false);
    expect(penWallAt(0.215, false).visible).toBe(true);
    expect(penWallAt(0.215, false).sink).toBeLessThan(0.5);
  });
  it('sinks the long walls a moment after, gone by the end', () => {
    expect(penWallAt(0.25, false).sink).toBeGreaterThan(0.5);
    expect(penWallAt(PEN_OPEN_SECONDS, false).visible).toBe(false);
    expect(PEN_OPEN_SECONDS).toBeLessThanOrEqual(0.3);
  });
});

describe('the colour a pen takes', () => {
  it('is the wall’s own colour times a light version of the player’s, a little darker (the mug’s white pen: x0.88)', () => {
    const [r, g, b] = penTintFactor('#ffffff');
    expect(r).toBeCloseTo(0.89, 2);
    expect(g).toBeCloseTo(0.89, 2);
    expect(b).toBeCloseTo(0.89, 2);
  });
  it('keeps a strong player colour from turning the lavender wall muddy (a light version of it)', () => {
    const [r, g, b] = penTintFactor('#009E73');
    expect(Math.min(r, g, b)).toBeGreaterThan(0.3);
    expect(g).toBeGreaterThan(r);
  });
});

// The lever's burst (the aubergine's, 3.717-3.95 s at 30 fps, ~29 px a unit): a frame of short radial streaks round the knob, then
// chips flying out, fast then slow (~0.6 unit at 0.04 s, ~1.8 by 0.15 s), falling to the ground, gone by 0.25 s.
describe('the lever’s chips', () => {
  it('fly out from the knob, fast then slow, in every direction', () => {
    const at = (t: number, k: number) => penChipAt(t, k);
    const r = (t: number, k: number) => Math.hypot(at(t, k).x, at(t, k).y);
    expect(r(0.04, 0)).toBeGreaterThan(0.4);
    expect(r(0.04, 0)).toBeLessThan(1.2);
    expect(r(0.15, 0)).toBeGreaterThan(1.4);
    expect(r(0.15, 0)).toBeLessThan(2.4);
    expect(r(0.2, 0) - r(0.15, 0)).toBeLessThan(r(0.04, 0));
    const angles = Array.from({ length: PEN_CHIPS }, (_, k) =>
      Math.atan2(at(0.1, k).y, at(0.1, k).x),
    );
    expect(new Set(angles.map((a) => Math.floor(((a + Math.PI) / (2 * Math.PI)) * 4))).size).toBe(
      4,
    );
  });
  it('fall from the knob’s height to the ground and are gone by 0.25 s', () => {
    expect(penChipAt(0, 0).z).toBeCloseTo(1.4, 1);
    expect(penChipAt(0.22, 0).z).toBe(0);
    expect(penChipAt(0.24, 0).visible).toBe(true);
    expect(penChipAt(0.26, 0).visible).toBe(false);
  });
  it('the streaks show only in the strike’s first frames', () => {
    expect(penStreaksAt(0.01)).toBe(true);
    expect(penStreaksAt(0.05)).toBe(false);
    expect(penStreaksAt(undefined)).toBe(false);
  });
});
