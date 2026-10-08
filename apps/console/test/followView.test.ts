import { describe, expect, it } from 'vitest';
import { followView } from '../src/render/reconstructed/followView';

// A reconstructed map whose baked canvas is larger than the screen is viewed like the master video's own camera: it pans with
// the action at the footage's scale (zoom 1) and zooms out only as far as needed to keep every living player in view.

const VIEW = { width: 1920, height: 1080 };
const WORLD = { width: 3280, height: 1620 };

describe('follow view for reconstructed maps', () => {
  it('a canvas the size of the screen never moves (market_plaza)', () => {
    expect(followView([{ x: 100, y: 100 }], VIEW, VIEW)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('centres on the players at footage scale when they fit', () => {
    const v = followView(
      [
        { x: 1500, y: 800 },
        { x: 1700, y: 900 },
      ],
      WORLD,
      VIEW,
    );
    expect(v.zoom).toBe(1);
    expect(v.x + VIEW.width / 2).toBeCloseTo(1600, 6);
    expect(v.y + VIEW.height / 2).toBeCloseTo(850, 6);
  });

  it('never shows outside the baked canvas', () => {
    const v = followView([{ x: 10, y: 10 }], WORLD, VIEW);
    expect([v.x, v.y]).toEqual([0, 0]);
    const w = followView([{ x: 3270, y: 1610 }], WORLD, VIEW);
    expect(w.x).toBeCloseTo(WORLD.width - VIEW.width, 6);
    expect(w.y).toBeCloseTo(WORLD.height - VIEW.height, 6);
  });

  it('zooms out only as far as needed to keep everyone (with a margin) in view, never past the whole canvas', () => {
    const v = followView(
      [
        { x: 300, y: 500 },
        { x: 2900, y: 600 },
      ],
      WORLD,
      VIEW,
      150,
    );
    expect(v.zoom).toBeLessThan(1);
    expect(v.zoom).toBeCloseTo(VIEW.width / (2900 - 300 + 300), 6);
    const all = followView(
      [
        { x: 0, y: 0 },
        { x: 3280, y: 1620 },
      ],
      WORLD,
      VIEW,
      150,
    );
    expect(all.zoom).toBeCloseTo(Math.min(VIEW.width / WORLD.width, VIEW.height / WORLD.height), 6);
  });

  it('with nobody alive it shows the whole canvas, centred', () => {
    const v = followView([], WORLD, VIEW);
    expect(v.zoom).toBeCloseTo(Math.min(VIEW.width / WORLD.width, VIEW.height / WORLD.height), 6);
    expect(v.x + VIEW.width / v.zoom / 2).toBeCloseTo(WORLD.width / 2, 6);
    expect(v.y + VIEW.height / v.zoom / 2).toBeCloseTo(WORLD.height / 2, 6);
  });
});
