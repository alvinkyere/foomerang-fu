import { describe, expect, it } from 'vitest';
import { CAMERA_FRAMING, easeCamera, frameTarget } from '../src/render/cameraFraming';

// The camera, as the reference video's moves on the plaza (1:56–2:39.5; its frame registered to our map every frame, so its zoom
// and centre are exact): it keeps every living player in view with room round them, as close as that allows but never wider
// than the whole plaza nor closer than ≈ 1.3× (its narrowest view: 985 px of the map's 1280), easing there over ≈ a second. With
// the players spread it shows the whole plaza; with the last two close together it closes in on them (2:38.5–2:39.25).
// Positions are where the resting camera shows them on screen: -1 (left / bottom) … 1 (right / top).

describe('the camera’s framing', () => {
  it('with the players spread over the plaza, shows all of it', () => {
    const t = frameTarget([
      { u: -0.8, v: -0.6 },
      { u: 0.7, v: 0.5 },
    ]);
    expect(t).toEqual({ zoom: 1, u: 0, v: 0 });
  });

  it('with the last players close together, closes in on them, but no closer than ≈ 1.3×', () => {
    const near = frameTarget([
      { u: 0.4, v: 0.1 },
      { u: 0.5, v: 0.2 },
    ]);
    expect(near.zoom).toBeCloseTo(CAMERA_FRAMING.maxZoom, 9);
    expect(CAMERA_FRAMING.maxZoom).toBeCloseTo(1280 / 985, 1);
    // its centre moves towards them, as far as the plaza's edge allows (the view never leaves the plaza)
    expect(near.u).toBeGreaterThan(0);
    expect(near.u).toBeLessThanOrEqual(1 - 1 / near.zoom + 1e-9);
  });

  it('keeps everyone in view, with room round them: a closer view only when they all fit in it', () => {
    const pts = [
      { u: -0.3, v: 0 },
      { u: 0.3, v: 0.1 },
    ];
    const t = frameTarget(pts);
    for (const p of pts) {
      expect(Math.abs(p.u - t.u) * t.zoom).toBeLessThanOrEqual(
        1 - CAMERA_FRAMING.padding * t.zoom + 1e-9,
      );
    }
  });

  it('nobody to frame (between rounds): the whole plaza', () => {
    expect(frameTarget([])).toEqual({ zoom: 1, u: 0, v: 0 });
  });

  it('eases towards where it should be, most of the way in about a second', () => {
    const from = { zoom: 1, u: 0, v: 0 };
    const to = { zoom: 1.3, u: 0.2, v: 0 };
    const after = (s: number) => {
      let c = from;
      for (let t = 0; t < s; t += 1 / 60) c = easeCamera(c, to, 1 / 60);
      return c;
    };
    expect(after(0.1).zoom).toBeLessThan(1.1);
    expect(after(1).zoom).toBeGreaterThan(1.25);
    expect(after(3).u).toBeCloseTo(0.2, 3);
  });
});
