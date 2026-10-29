import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The cross pond's map folder (art/pond_cross/package.py): its camera does not follow, the whole pond is in one frame (the HQ,
// foomerang-fu physics hq.mp4 4:27: zoom 1.12 on the plaza's rig, over the pond's scale: art/pond_cross/scale.json), and its water
// has its own colours and ribbons.

const scale = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'art', 'pond_cross', 'scale.json'), 'utf8'),
) as { hqZoom: number; scale: number };
const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'maps', 'pond_cross', 'manifest.json'), 'utf8'),
) as {
  fixedFrame?: { zoom: number; u: number; v: number };
  water?: Record<string, string | number>;
};

describe('the cross pond’s map folder', () => {
  it('has a camera that stays on the whole pond, at the HQ’s zoom over the scale the pond was enlarged by', () => {
    expect(scale.scale).toBeGreaterThan(1); // (the owner, 2026-10-29: the arena was too small)
    expect(manifest.fixedFrame?.u).toBe(0);
    expect(manifest.fixedFrame?.v).toBe(0);
    expect(manifest.fixedFrame?.zoom).toBeCloseTo(scale.hqZoom / scale.scale, 4);
  });

  it('has its own water: the HQ’s teal as it looks in a browser, with ribbons wider than the fountain’s lines', () => {
    expect(manifest.water?.['base']).toBe('#7da9be'); // (the HQ's #74a2b3 as the video looks in a browser: art/pond_cross/colour.py)
    expect(manifest.water?.['foamWidth']).toBeGreaterThan(0.1); // (the fountain’s is 0.04)
  });
});
