import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEMPLE_COURT_ARENA, TEMPLE_COURT_WALLS } from '@foomerang/foomerang-fu';
import { PLAYABLE_ARENAS } from '../src/runtime/arenas';
import { PRODUCT_POOL } from '../src/runtime/mapRotation';
import { productArena } from '../src/runtime/powerupMode';
import { rendererKindFor } from '../src/render/rendererKind';
import { RECONSTRUCTED_MAPS } from '../src/render/reconstructed/maps';
import { parsePlantGroups } from '../src/render/hexPlants';

// The temple court (art/temple_court, ff physics hq 2.mp4 2:01): tested at ?arena=temple, on the plaza's renderer.

const dir = join(__dirname, '..', 'public', 'maps', 'temple_court');

describe('the temple court', () => {
  it('is chosen by ?arena=temple, drawn by the plaza’s renderer, a named playable arena outside the rotation', () => {
    expect(productArena('?arena=temple')).toBe('temple_court');
    expect(productArena('?arena=temple_court')).toBe('temple_court');
    expect(PRODUCT_POOL).not.toContain('temple_court');
    expect(rendererKindFor('temple_court')).toBe('three');
    expect(PLAYABLE_ARENAS.temple_court.arena).toBe(TEMPLE_COURT_ARENA);
    expect(PLAYABLE_ARENAS.temple_court.named).toBe(true);
    expect(RECONSTRUCTED_MAPS.temple_court.assetDir).toBe('maps/temple_court/');
    expect(RECONSTRUCTED_MAPS.temple_court.arena).toEqual({
      width: TEMPLE_COURT_ARENA.width,
      height: TEMPLE_COURT_ARENA.height,
    });
  });

  it('has a border, solid planters, wings and gates, and six spawns inside the border clear of every wall', () => {
    const { walls, safeZone, spawns } = TEMPLE_COURT_ARENA;
    const ids = TEMPLE_COURT_WALLS.map((w) => w.id);
    // seven planters (four small, three big under the trees), each two crossed boxes
    expect(ids.filter((id) => id.startsWith('PLANTER_'))).toHaveLength(14);
    expect(ids.filter((id) => id.startsWith('WING_'))).toHaveLength(8);
    expect(ids.filter((id) => id.startsWith('GATE_'))).toHaveLength(4);
    expect(ids).toContain('SLAB');
    expect(spawns).toHaveLength(6);
    if (safeZone === undefined) throw new Error('no border');
    for (const s of spawns ?? []) {
      expect(s.x).toBeGreaterThan(safeZone.x);
      expect(s.x).toBeLessThan(safeZone.x + safeZone.width);
      expect(s.y).toBeGreaterThan(safeZone.y);
      expect(s.y).toBeLessThan(safeZone.y + safeZone.height);
      for (const w of walls ?? []) {
        if ('radius' in w) expect(Math.hypot(s.x - w.x, s.y - w.y)).toBeGreaterThan(w.radius + 36);
        else if ('angle' in w) {
          const c = Math.cos(w.angle);
          const n = Math.sin(w.angle);
          const dx = s.x - w.x;
          const dy = s.y - w.y;
          const inside =
            Math.abs(dx * c + dy * n) < w.halfWidth + 20 &&
            Math.abs(-dx * n + dy * c) < w.halfHeight + 20;
          expect(inside).toBe(false);
        }
      }
    }
  });

  it('ships its model and a manifest whose two orange hex fields the renderer reads, their shadows falling west', () => {
    for (const f of ['plaza.glb', 'manifest.json']) expect(existsSync(join(dir, f))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
      map: string;
      plants: unknown;
    };
    expect(manifest.map).toBe('temple_court');
    const groups = parsePlantGroups(manifest.plants);
    expect(groups).toHaveLength(1);
    const field = groups[0];
    if (field === undefined) throw new Error('no plants');
    expect(field.pads.length).toBeGreaterThan(150);
    expect(field.shadow?.perHeight[0]).toBeLessThan(0); // (west: the court's sun is in the east)
  });
});
