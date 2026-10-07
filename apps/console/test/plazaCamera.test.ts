import { describe, expect, it } from 'vitest';
import { PLAZA_CANVAS, plazaGroundScale, plazaProject } from '../src/render/plaza/camera';

// The market_plaza camera is the solved take-A camera of the master video (frame 233), frozen as the game camera. These reference
// projections come from the Python solver (art/reconstruction/analysis/proj.py) through the same world mapping the rules use.
describe('market_plaza camera', () => {
  it('is a 1920 × 1080 canvas', () => {
    expect([PLAZA_CANVAS.width, PLAZA_CANVAS.height]).toEqual([1920, 1080]);
  });

  it.each([
    [0, 0, 0, 221.545, 54.403],
    [1800, 0, 0, 1724.595, 51.998],
    [0, 1300, 0, 13.526, 1069.306],
    [900, 650, 0, 983.776, 492.448],
    [900, 650, 60, 984.638, 458.573],
  ])('projects world (%d, %d, z %d) exactly as the solver does', (x, y, z, px, py) => {
    const p = plazaProject(x, y, z);
    expect(p.x).toBeCloseTo(px, 2);
    expect(p.y).toBeCloseTo(py, 2);
  });

  it('keeps the whole playable arena on screen, and nearer ground is larger', () => {
    for (const [x, y] of [
      [0, 0],
      [1750, 0],
      [0, 1300],
      [1750, 1300],
    ] as const) {
      const p = plazaProject(x, y);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1920);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1080);
    }
    expect(plazaGroundScale(900, 1200).sx).toBeGreaterThan(plazaGroundScale(900, 100).sx);
  });
});
