import { describe, expect, it } from 'vitest';
import { READY_GO, popScale, sparks } from '../src/render/readyGo';

// READY and GO as the HQ video draws them (9:05.66–9:07.32, at 60 frames a second; art/physics_reference/README.md, "READY
// and GO"): each word pops in at the screen's middle (≈ 0.5 of its size on its first frame, 105% on its sixth, settled by its
// tenth), stands, and is cut off. 0.134 s after GO appears, eight short white dashes burst from round it: on an ellipse
// 141 × 91 px (at 1080 px of screen) at the eight compass points, each flying 28 px further out as it shrinks from 21 px to
// nothing in 0.4 s. Lengths are in the video's px at 1080 px of screen height.

describe('READY and GO', () => {
  it('pop in as the video’s do: half size, past full at the sixth frame, settled by the tenth', () => {
    const f = (k: number) => popScale(k / 60);
    expect(f(0)).toBeCloseTo(0.5, 2);
    expect(f(1)).toBeCloseTo(0.72, 2);
    expect(f(5)).toBeCloseTo(1.05, 2);
    expect(f(9)).toBe(1);
    expect(popScale(0.5)).toBe(1);
    expect(popScale(2.5 / 60)).toBeCloseTo((0.88 + 0.98) / 2, 2); // between frames: in between
  });

  it('are the video’s size, its letters traced from it', () => {
    expect(READY_GO.ready.width).toBeCloseTo(424.8, 0);
    expect(READY_GO.go.width).toBeCloseTo(189.7, 0);
    expect(READY_GO.screenHeight).toBe(1080);
  });

  it('GO bursts eight dashes 0.134 s after it appears, for 0.4 s', () => {
    expect(sparks(0.1)).toEqual([]);
    expect(sparks(0.134 + 0.4 + 0.01)).toEqual([]);
    const first = sparks(0.134);
    expect(first).toHaveLength(8);
    const right = first[0];
    expect(right?.outer.x).toBeCloseTo(141, 0);
    expect(right?.outer.y).toBeCloseTo(0, 6);
    expect(right?.length).toBeCloseTo(21, 0);
    const down = first[2];
    expect(Math.hypot(down?.outer.x ?? 0, down?.outer.y ?? 0)).toBeCloseTo(91, 0);
  });

  it('they fly out as they shrink, as the video’s: 28 px further by the end, quickest at first', () => {
    const r = (s: number) => sparks(0.134 + s)[0]?.outer.x ?? 0;
    const len = (s: number) => sparks(0.134 + s)[0]?.length ?? 0;
    expect(r(0.2) - r(0)).toBeCloseTo(21, 0); // measured 22 at 0.2 s
    expect(r(0.399) - r(0)).toBeCloseTo(28, 0);
    expect(r(0.1) - r(0)).toBeGreaterThan(r(0.3) - r(0.2));
    expect(len(0.2)).toBeCloseTo(10.5, 0);
    expect(len(0.399)).toBeLessThan(0.2);
  });
});
