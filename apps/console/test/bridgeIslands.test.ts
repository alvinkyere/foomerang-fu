import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_POOL } from '../src/runtime/mapRotation';
import { productArena } from '../src/runtime/powerupMode';
import { rendererKindFor } from '../src/render/rendererKind';

// The lily island (art/bridge_islands, the HQ's foomerang-fu physics hq.mp4 10:37): in the rotation since 2026-11-11, and at ?arena=bridge
// (the owner, 2026-10-30), on the plaza's renderer, its camera fixed on the whole island.

const scale = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'art', 'bridge_islands', 'scale.json'), 'utf8'),
) as { hqZoom: number; scale: number; gameZoomFit: number };
const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'maps', 'bridge_islands', 'manifest.json'), 'utf8'),
) as {
  fixedFrame?: { zoom: number; u: number; v: number };
  followFrame?: { minZoom: number; maxZoom: number };
};

describe('the lily island', () => {
  it('is chosen by ?arena=bridge and is in the rotation (owner, 2026-11-11: "now put this in the rotation")', () => {
    expect(productArena('?arena=bridge')).toBe('bridge_islands');
    expect(PRODUCT_POOL).toContain('bridge_islands');
  });

  it('is drawn by the plaza’s renderer', () => {
    expect(rendererKindFor('bridge_islands')).toBe('three');
  });

  it('has a camera that stays on the whole island, at the HQ’s zoom over its scale', () => {
    expect(manifest.fixedFrame?.u).toBe(0);
    expect(manifest.fixedFrame?.v).toBe(0);
    expect(manifest.fixedFrame?.zoom).toBeCloseTo(
      (scale.hqZoom / scale.scale) * scale.gameZoomFit,
      4,
    );
  });

  it('follows the players from the whole island to 1.3 times closer, as the HQ’s camera does', () => {
    const rest = (scale.hqZoom / scale.scale) * scale.gameZoomFit;
    expect(manifest.followFrame?.minZoom).toBeCloseTo(rest, 4);
    expect(manifest.followFrame?.maxZoom).toBeCloseTo(rest * 1.3, 4);
  });
});
