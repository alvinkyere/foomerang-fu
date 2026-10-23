import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMapCamera, parseMapCamera } from '../src/render/reconstructed/mapCamera';
import { rendererKindFor } from '../src/render/rendererKind';
import { characterHeight, sceneSpace } from '../src/render/three/plazaSpace';

// The market plaza is drawn in real-time 3D (three.js): its own lit models (art/reconstruction/environ2/blender/plaza_lit.py,
// exported Y-up in Blender units), seen through environ2's camera. The rules stay in world units; this is the only bridge.

const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'maps', 'market_plaza', 'manifest.json'), 'utf8'),
) as { camera: unknown; characterScale: number };
const camera = parseMapCamera(manifest.camera);
const space = sceneSpace(camera);

describe('the plaza in 3D', () => {
  it('the market plaza and the gong islands are drawn in 3D; every other map and the test arenas stay on Phaser', () => {
    expect(rendererKindFor('market_plaza')).toBe('three');
    expect(rendererKindFor('gong_islands')).toBe('three');
    for (const arena of ['harbour_fort', 'sky_islands', 'primitive', 'systems'] as const)
      expect(rendererKindFor(arena), arena).toBe('phaser');
  });

  it('a world point maps into the scene (Y up, Blender units) where the 2D camera projects it', () => {
    // the scene point, seen by the same pinhole (written out here independently), lands on the 2D camera's pixel
    const flat = createMapCamera(camera);
    const rad = Math.PI / 180;
    const th = camera.pitchDeg * rad;
    const C = camera.centre.map((v) => v * 100) as [number, number, number];
    for (const [x, y, z] of [
      [864.5, 663.5, 0],
      [100, 200, 0],
      [1600, 1000, 60],
    ] as const) {
      const p = space.toScene(x, y, z); // three: (X, Z_up, -Y)
      const bx = p.x - C[0];
      const by = -p.z - C[1];
      const bz = p.y - C[2];
      // the solver's camera: R = pitch (yaw 0, roll 0)
      const cx = bx;
      const cy = -Math.sin(th) * by - Math.cos(th) * bz;
      const d = Math.cos(th) * by - Math.sin(th) * bz;
      const px = (camera.focalPx * cx) / d + camera.principal.x;
      const py = (camera.focalPx * cy) / d + camera.principal.y;
      const want = flat.project(x, y, z);
      expect(px).toBeCloseTo(want.x, 6);
      expect(py).toBeCloseTo(want.y, 6);
    }
  });

  it('a player radius is the same size on the ground in the scene as in the rules', () => {
    const a = space.toScene(500, 500);
    const b = space.toScene(536, 500);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(space.length(36), 9);
    expect(space.length(2748)).toBeCloseTo(100, 9); // one plan unit = 100 Blender units
  });

  it('a character is drawn as tall as in the 2D plaza (the cell times the map’s scale, on the 1920 canvas)', () => {
    // at distance d a height h projects to F * h / d px: so h = px * d / F
    const px = 192 * manifest.characterScale;
    expect(characterHeight(camera, 192, manifest.characterScale, 1234)).toBeCloseTo(
      (px * 1234) / camera.focalPx,
      9,
    );
  });
});
