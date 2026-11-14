import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CANAL_COURT_ARENA, CANAL_COURT_WALLS } from '@foomerang/foomerang-fu';
import { PLAYABLE_ARENAS } from '../src/runtime/arenas';
import { productArena } from '../src/runtime/powerupMode';
import { rendererKindFor } from '../src/render/rendererKind';
import { RECONSTRUCTED_MAPS } from '../src/render/reconstructed/maps';

// The canal court (art/canal_court, foomerang-fu physics hq.mp4 10:55): tested at ?arena=canal, on the plaza's renderer, outside the
// rotation until the owner puts it in.

const dir = join(__dirname, '..', 'public', 'maps', 'canal_court');

describe('the canal court', () => {
  it('is chosen by ?arena=canal, drawn by the plaza’s renderer, a named playable arena', () => {
    expect(productArena('?arena=canal')).toBe('canal_court');
    expect(productArena('?arena=canal_court')).toBe('canal_court');
    expect(rendererKindFor('canal_court')).toBe('three');
    expect(PLAYABLE_ARENAS.canal_court.arena).toBe(CANAL_COURT_ARENA);
    expect(PLAYABLE_ARENAS.canal_court.named).toBe(true);
    expect(RECONSTRUCTED_MAPS.canal_court.assetDir).toBe('maps/canal_court/');
    expect(RECONSTRUCTED_MAPS.canal_court.arena).toEqual({
      width: CANAL_COURT_ARENA.width,
      height: CANAL_COURT_ARENA.height,
    });
  });

  it('has the aqueduct, the basin, the rocks and the props solid, a border round the kerb, six spawns clear of every wall', () => {
    const { walls, safeZone, spawns } = CANAL_COURT_ARENA;
    const ids = CANAL_COURT_WALLS.map((w) => w.id);
    for (const part of [
      'TOWER',
      'CHANNEL',
      'STUB',
      'BASIN',
      'ROCK_SW',
      'ROCK_N',
      'ROCK_E',
      'ROCK_SE',
      'BARREL_NW',
      'BENCH',
      'RACK',
      'PLANK',
    ])
      expect(ids.some((id) => id.startsWith(part))).toBe(true);
    expect(safeZone).toBeDefined();
    expect(spawns).toHaveLength(6);
    for (const s of spawns ?? []) {
      if (safeZone !== undefined) {
        expect(s.x).toBeGreaterThan(safeZone.x);
        expect(s.x).toBeLessThan(safeZone.x + safeZone.width);
        expect(s.y).toBeGreaterThan(safeZone.y);
        expect(s.y).toBeLessThan(safeZone.y + safeZone.height);
      }
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

  it('ships its model and a manifest with the HQ’s READY view and the plaza’s characters', () => {
    expect(existsSync(join(dir, 'plaza.glb'))).toBe(true);
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
      map: string;
      assetsFrom: string;
      hqFrame: { zoom: number };
    };
    expect(m.map).toBe('canal_court');
    expect(m.assetsFrom).toBe('market_plaza');
    expect(m.hqFrame.zoom).toBeCloseTo(1.0724, 3); // 1.15x the rig's zoom: the characters' size in the READY frame
  });
});
