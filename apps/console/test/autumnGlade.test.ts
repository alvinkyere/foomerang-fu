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

  it('has a dashed border, three logs and two rocks (two blocks each) as walls, and six spawns inside the border', () => {
    const { walls, safeZone, spawns } = AUTUMN_GLADE_ARENA;
    expect(walls).toHaveLength(7);
    expect(spawns).toHaveLength(6);
    if (safeZone === undefined) throw new Error('no border');
    for (const s of spawns ?? []) {
      expect(s.x).toBeGreaterThan(safeZone.x);
      expect(s.x).toBeLessThan(safeZone.x + safeZone.width);
      expect(s.y).toBeGreaterThan(safeZone.y);
      expect(s.y).toBeLessThan(safeZone.y + safeZone.height);
    }
  });

  it('has one pair of portals, each pad on open sand inside the border and pointing at the other', () => {
    const { portals, walls, safeZone } = AUTUMN_GLADE_ARENA;
    expect(portals).toHaveLength(2);
    if (portals === undefined || safeZone === undefined) throw new Error('no portals or border');
    const [a, b] = portals;
    if (a === undefined || b === undefined) throw new Error('no pair');
    expect(a.to).toBe(b.id);
    expect(b.to).toBe(a.id);
    for (const p of portals) {
      expect(p.x).toBeGreaterThan(safeZone.x);
      expect(p.x).toBeLessThan(safeZone.x + safeZone.width);
      for (const w of walls ?? []) {
        if (!('angle' in w)) continue; // (the glade's walls are all turned boxes)
        const c = Math.cos(w.angle);
        const s = Math.sin(w.angle);
        const dx = p.x - w.x;
        const dy = p.y - w.y;
        const inside =
          Math.abs(dx * c + dy * s) < w.halfWidth + p.radius &&
          Math.abs(-dx * s + dy * c) < w.halfHeight + p.radius;
        expect(inside, `${p.id} overlaps ${JSON.stringify(w)}`).toBe(false);
      }
    }
  });

  it('ships its model and manifest', () => {
    for (const f of ['plaza.glb', 'manifest.json']) {
      expect(existsSync(join(__dirname, '..', 'public', 'maps', 'autumn_glade', f))).toBe(true);
    }
  });
});
