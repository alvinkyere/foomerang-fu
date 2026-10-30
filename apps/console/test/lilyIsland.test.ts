import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRODUCT_POOL } from '../src/runtime/mapRotation';
import { productArena } from '../src/runtime/powerupMode';
import { rendererKindFor } from '../src/render/rendererKind';

// The lily island (art/lily_island, the HQ's foomerang-fu physics hq.mp4 10:37): tested at ?arena=island, outside the rotation
// (the owner, 2026-10-30), on the plaza's renderer, its camera fixed on the whole island.

const scale = JSON.parse(
  readFileSync(join(__dirname, '..', '..', '..', 'art', 'lily_island', 'scale.json'), 'utf8'),
) as { hqZoom: number; scale: number };
const manifest = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'maps', 'lily_island', 'manifest.json'), 'utf8'),
) as {
  fixedFrame?: { zoom: number; u: number; v: number };
  followFrame?: { minZoom: number; maxZoom: number };
};

describe('the lily island', () => {
  it('is chosen by ?arena=island and is not in the rotation', () => {
    expect(productArena('?arena=island')).toBe('lily_island');
    expect(productArena('?arena=lily')).toBe('lily_island');
    expect(PRODUCT_POOL).not.toContain('lily_island');
  });

  it('is drawn by the plaza’s renderer', () => {
    expect(rendererKindFor('lily_island')).toBe('three');
  });

  it('has a camera that stays on the whole island, at the HQ’s zoom over its scale', () => {
    expect(manifest.fixedFrame?.u).toBe(0);
    expect(manifest.fixedFrame?.v).toBe(0);
    expect(manifest.fixedFrame?.zoom).toBeCloseTo(scale.hqZoom / scale.scale, 4);
  });

  it('follows the players from the whole island to 1.3 times closer, as the HQ’s camera does', () => {
    const rest = scale.hqZoom / scale.scale;
    expect(manifest.followFrame?.minZoom).toBeCloseTo(rest, 4);
    expect(manifest.followFrame?.maxZoom).toBeCloseTo(rest * 1.3, 4);
  });
});
