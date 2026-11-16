import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GONG_COURT_ARENA, GONG_COURT_WALLS } from '@foomerang/foomerang-fu';
import { PLAYABLE_ARENAS } from '../src/runtime/arenas';
import { productArena } from '../src/runtime/powerupMode';
import { rendererKindFor } from '../src/render/rendererKind';
import { RECONSTRUCTED_MAPS } from '../src/render/reconstructed/maps';
import { PRODUCT_POOL } from '../src/runtime/mapRotation';

// The gong court (art/gong_court, foomerang-fu physics hq.mp4 0:35): ?arena=court, on the plaza's renderer, in the product rotation
// (owner, 2026-11-15: "we can even add it to the rotation of maps").

const dir = join(__dirname, '..', 'public', 'maps', 'gong_court');

describe('the gong court', () => {
  it('is chosen by ?arena=court, drawn by the plaza’s renderer, a named playable arena', () => {
    expect(productArena('?arena=court')).toBe('gong_court');
    expect(productArena('?arena=gong_court')).toBe('gong_court');
    expect(rendererKindFor('gong_court')).toBe('three');
    expect(PRODUCT_POOL).toContain('gong_court');
    expect(PLAYABLE_ARENAS.gong_court.arena).toBe(GONG_COURT_ARENA);
    expect(PLAYABLE_ARENAS.gong_court.named).toBe(true);
    expect(RECONSTRUCTED_MAPS.gong_court.assetDir).toBe('maps/gong_court/');
    expect(RECONSTRUCTED_MAPS.gong_court.arena).toEqual({
      width: GONG_COURT_ARENA.width,
      height: GONG_COURT_ARENA.height,
    });
  });

  it('is closed by its walls (no dashed border, as the HQ), its stone solid, six spawns clear of every wall', () => {
    const { walls, safeZone, spawns } = GONG_COURT_ARENA;
    expect(safeZone).toBeUndefined();
    const ids = GONG_COURT_WALLS.map((w) => w.id);
    for (const part of [
      'WALL_N',
      'WALL_S',
      'WALL_E',
      'WALL_W',
      'PLAT_NW',
      'PLAT_NE',
      'PLAT_SW',
      'PLAT_SE',
      'PLANTER_C',
    ])
      expect(ids.some((id) => id.startsWith(part))).toBe(true);
    expect(spawns).toHaveLength(6);
    for (const s of spawns ?? []) {
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

  it('ships its model and a manifest with the HQ’s READY view, the plaza’s characters and a still court', () => {
    expect(existsSync(join(dir, 'plaza.glb'))).toBe(true);
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
      map: string;
      assetsFrom: string;
      hqFrame: { zoom: number };
      scenery: { fade: boolean; sway: boolean };
    };
    expect(m.map).toBe('gong_court');
    expect(m.assetsFrom).toBe('market_plaza');
    expect(m.hqFrame.zoom).toBeCloseTo(0.9839, 3); // 1.055x the rig's zoom: the characters' size in the READY frame against our game's (art/gong_court/measure.py)
    expect(m.scenery).toEqual({ fade: false, sway: false });
  });
});
