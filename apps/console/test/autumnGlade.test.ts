import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTUMN_GLADE_ARENA } from '@foomerang/foomerang-fu';
import { PLAYABLE_ARENAS } from '../src/runtime/arenas';
import { PRODUCT_POOL } from '../src/runtime/mapRotation';
import { productArena } from '../src/runtime/powerupMode';
import { rendererKindFor } from '../src/render/rendererKind';
import { RECONSTRUCTED_MAPS } from '../src/render/reconstructed/maps';

// The autumn glade (art/autumn_glade, ff physics hq 2.mp4 10:26): tested at ?arena=glade, outside the rotation, on the plaza's renderer.

describe('the autumn glade', () => {
  it('is chosen by ?arena=glade and is not in the rotation yet', () => {
    expect(productArena('?arena=glade')).toBe('autumn_glade');
    expect(PRODUCT_POOL).not.toContain('autumn_glade');
  });

  it('is drawn by the plaza’s renderer and is a named, playable arena', () => {
    expect(rendererKindFor('autumn_glade')).toBe('three');
    expect(PLAYABLE_ARENAS.autumn_glade.arena).toBe(AUTUMN_GLADE_ARENA);
    expect(PLAYABLE_ARENAS.autumn_glade.named).toBe(true);
    expect(RECONSTRUCTED_MAPS.autumn_glade.assetDir).toBe('maps/autumn_glade/');
  });

  it('has a dashed border, three logs and two rocks as walls, and six spawns inside the border', () => {
    const { walls, safeZone, spawns } = AUTUMN_GLADE_ARENA;
    expect(walls).toHaveLength(5);
    expect(spawns).toHaveLength(6);
    if (safeZone === undefined) throw new Error('no border');
    for (const s of spawns ?? []) {
      expect(s.x).toBeGreaterThan(safeZone.x);
      expect(s.x).toBeLessThan(safeZone.x + safeZone.width);
      expect(s.y).toBeGreaterThan(safeZone.y);
      expect(s.y).toBeLessThan(safeZone.y + safeZone.height);
    }
  });

  it('ships its model and manifest', () => {
    for (const f of ['plaza.glb', 'manifest.json']) {
      expect(existsSync(join(__dirname, '..', 'public', 'maps', 'autumn_glade', f))).toBe(true);
    }
  });
});
