import { describe, expect, it } from 'vitest';
import { GARDEN_HEIGHT, GARDEN_WIDTH } from '@foomerang/foomerang-fu';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  groundScale,
  project,
  unproject,
  upScale,
} from '../src/render/garden/camera';

// The camera is fitted to the reference: these are the four corners of its dashed boundary, as measured in the image
// (canvas pixels in the 1999 × 1138 frame), and the foreshortening measured from its walls.
describe('the Garden camera', () => {
  it('projects the arena’s four corners onto the reference’s dashed boundary', () => {
    const corners: [number, number, number, number][] = [
      [0, 0, 257, 79],
      [GARDEN_WIDTH, 0, 1632, 79],
      [0, GARDEN_HEIGHT, 122.5, 1043.5],
      [GARDEN_WIDTH, GARDEN_HEIGHT, 1745, 1043.5],
    ];
    for (const [x, y, sx, sy] of corners) {
      const p = project(x, y);
      expect(Math.abs(p.x - sx), `x of ${x},${y}`).toBeLessThan(7);
      expect(Math.abs(p.y - sy), `y of ${x},${y}`).toBeLessThan(2);
    }
  });

  it('has the reference’s perspective: the near edge is about 18% wider than the far edge, and the ground is foreshortened to about 0.64', () => {
    const far = project(GARDEN_WIDTH, 0).x - project(0, 0).x;
    const near = project(GARDEN_WIDTH, GARDEN_HEIGHT).x - project(0, GARDEN_HEIGHT).x;
    expect(near / far).toBeGreaterThan(1.16);
    expect(near / far).toBeLessThan(1.2);
    const { sx, sy } = groundScale(720, 728);
    expect(sy / sx).toBeGreaterThan(0.6);
    expect(sy / sx).toBeLessThan(0.68);
  });

  it('is invertible at any height (a wall top unprojects to the footprint it stands on)', () => {
    for (const [x, y, z] of [
      [10, 10, 0],
      [700, 700, 36],
      [1400, 1400, 60],
      [300, 900, 70],
    ] as const) {
      const p = project(x, y, z);
      const q = unproject(p.x, p.y, z);
      expect(q.x).toBeCloseTo(x, 6);
      expect(q.y).toBeCloseTo(y, 6);
    }
  });

  it('is a 1999 × 1138 canvas with the reference’s 1.757 aspect, and the arena fills the same share of it', () => {
    expect(CANVAS_WIDTH / CANVAS_HEIGHT).toBeCloseTo(2752 / 1566, 2);
    const tl = project(0, 0);
    const br = project(GARDEN_WIDTH, GARDEN_HEIGHT);
    expect((br.x - tl.x) / CANVAS_WIDTH).toBeGreaterThan(0.72);
    expect((br.x - tl.x) / CANVAS_WIDTH).toBeLessThan(0.77);
    expect((br.y - tl.y) / CANVAS_HEIGHT).toBeGreaterThan(0.82);
    expect((br.y - tl.y) / CANVAS_HEIGHT).toBeLessThan(0.87);
  });

  it('things get taller on screen toward the viewer, and a wall (36 units) is about 28 pixels high', () => {
    expect(upScale(720, 1400)).toBeGreaterThan(upScale(720, 100));
    const h = project(720, 700, 0).y - project(720, 700, 36).y;
    expect(h).toBeGreaterThan(24);
    expect(h).toBeLessThan(34);
  });
});
