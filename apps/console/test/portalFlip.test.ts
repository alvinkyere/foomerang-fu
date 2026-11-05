import { describe, expect, it } from 'vitest';
import { flipFrameAt, parsePortalFlip } from '../src/render/three/portalFlip';

// The autumn glade's portals (ff physics hq 2.mp4 10:26): their cyan strokes change shape through a 5.833 s cycle (measured: the
// shape repeats at that lag, similarity 0.964), drawn as traced frames shown one at a time.

describe('portal flipbook', () => {
  const flip = { period: 5.833, frames: 24, lags: [0, 1.5] };

  it('reads a manifest entry and refuses a bad one', () => {
    expect(parsePortalFlip(flip)).toEqual(flip);
    expect(parsePortalFlip(undefined)).toBeUndefined();
    expect(parsePortalFlip({ period: 0, frames: 24, lags: [] })).toBeUndefined();
    expect(parsePortalFlip({ period: 5, frames: 1.5, lags: [] })).toBeUndefined();
    expect(parsePortalFlip({ period: 5, frames: 24, lags: ['a'] })).toBeUndefined();
  });

  it('steps through the frames once per period, from frame 0 at time 0', () => {
    const f = parsePortalFlip(flip);
    if (f === undefined) throw new Error('parse');
    expect(flipFrameAt(f, 0, 0)).toBe(0);
    expect(flipFrameAt(f, 0, (5833 / 24) * 5 + 1)).toBe(5);
    expect(flipFrameAt(f, 0, 5833 - 1)).toBe(23);
    expect(flipFrameAt(f, 0, 5833 + 1)).toBe(0);
  });

  it('runs each portal its own lag behind (seconds), and a portal with no lag at none', () => {
    const f = parsePortalFlip(flip);
    if (f === undefined) throw new Error('parse');
    expect(flipFrameAt(f, 1, 1500)).toBe(0);
    expect(flipFrameAt(f, 1, 0)).toBe(flipFrameAt(f, 0, 5833 - 1500));
    expect(flipFrameAt(f, 7, 1000)).toBe(flipFrameAt(f, 0, 1000));
  });
});
