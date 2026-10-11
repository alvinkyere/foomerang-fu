import { describe, expect, it } from 'vitest';
import {
  createMapCamera,
  parseMapCamera,
  type MapCameraConfig,
} from '../src/render/reconstructed/mapCamera';

// A reconstructed map's game camera is DATA solved from the master video (art/reconstruction), shipped in the map's manifest.
// The projection is shared by every map; nothing in it is specific to one map.

/** market_plaza's solved take-A camera (frame 233), as package_map.py writes it into the manifest. */
const PLAZA: MapCameraConfig = {
  canvas: { width: 1920, height: 1080 },
  focalPx: 2700,
  principal: { x: 960, y: 540 },
  pitchDeg: 55.008641732929505,
  yawDeg: -1.20675586939306,
  rollDeg: 0.77223577225888,
  centre: [-0.07996035960614506, -0.1654559561589757, 1.1571011352706932],
  world: { unitsPerPlanUnit: 2000, planOriginX: -0.5, planOriginY: 1 },
};

describe('reconstructed map camera', () => {
  // reference projections from the Python solver (art/reconstruction/analysis/proj.py) — the same values the plaza camera
  // was pinned to before it became data
  it.each([
    [0, 0, 0, 221.545, 54.403],
    [1800, 0, 0, 1724.595, 51.998],
    [0, 1300, 0, 13.526, 1069.306],
    [900, 650, 0, 983.776, 492.448],
    [900, 650, 60, 984.638, 458.573],
  ])('projects world (%d, %d, z %d) exactly as the solver does', (x, y, z, px, py) => {
    const p = createMapCamera(PLAZA).project(x, y, z);
    expect(p.x).toBeCloseTo(px, 2);
    expect(p.y).toBeCloseTo(py, 2);
  });

  it('measures ground scale, larger nearer the camera', () => {
    const cam = createMapCamera(PLAZA);
    expect(cam.groundScale(900, 1200).sx).toBeGreaterThan(cam.groundScale(900, 100).sx);
    expect(cam.canvas).toEqual({ width: 1920, height: 1080 });
  });

  it('a longer lens at the same pose magnifies about the principal point', () => {
    const wide = createMapCamera(PLAZA).project(300, 300);
    const tele = createMapCamera({ ...PLAZA, focalPx: 2 * PLAZA.focalPx }).project(300, 300);
    expect(tele.x - 960).toBeCloseTo(2 * (wide.x - 960), 6);
    expect(tele.y - 540).toBeCloseTo(2 * (wide.y - 540), 6);
  });

  it('accepts a manifest camera and rejects a malformed one', () => {
    expect(parseMapCamera(JSON.parse(JSON.stringify(PLAZA)))).toEqual(PLAZA);
    expect(() => parseMapCamera({ ...PLAZA, focalPx: 'wide' })).toThrow(/focalPx/);
    expect(() => parseMapCamera({ ...PLAZA, centre: [0, 0] })).toThrow(/centre/);
    expect(() => parseMapCamera({ ...PLAZA, canvas: { width: -1, height: 1080 } })).toThrow(
      /canvas/,
    );
    expect(() => parseMapCamera(null)).toThrow();
  });
});
