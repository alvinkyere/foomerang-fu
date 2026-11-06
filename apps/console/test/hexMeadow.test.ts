import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEX_MEADOW_ARENA } from '@foomerang/foomerang-fu';
import { PLAYABLE_ARENAS } from '../src/runtime/arenas';
import { productArena } from '../src/runtime/powerupMode';
import { rendererKindFor } from '../src/render/rendererKind';
import { RECONSTRUCTED_MAPS } from '../src/render/reconstructed/maps';
import { parsePlants } from '../src/render/hexPlants';

// The hex meadow (art/hex_meadow, ff physics hq 2.mp4 20:02): tested at ?arena=meadow, on the plaza's renderer.

const dir = join(__dirname, '..', 'public', 'maps', 'hex_meadow');

describe('the hex meadow', () => {
  it('is chosen by ?arena=meadow, drawn by the plaza’s renderer, a named playable arena', () => {
    expect(productArena('?arena=meadow')).toBe('hex_meadow');
    expect(rendererKindFor('hex_meadow')).toBe('three');
    expect(PLAYABLE_ARENAS.hex_meadow.arena).toBe(HEX_MEADOW_ARENA);
    expect(PLAYABLE_ARENAS.hex_meadow.named).toBe(true);
    expect(RECONSTRUCTED_MAPS.hex_meadow.assetDir).toBe('maps/hex_meadow/');
  });

  it('has a dashed border, four rocks as turned boxes, and six spawns inside the border clear of every wall', () => {
    const { walls, safeZone, spawns } = HEX_MEADOW_ARENA;
    const boxes = (walls ?? []).filter((w) => 'angle' in w);
    expect(boxes).toHaveLength(4);
    expect(spawns).toHaveLength(6);
    if (safeZone === undefined) throw new Error('no border');
    for (const s of spawns ?? []) {
      expect(s.x).toBeGreaterThan(safeZone.x);
      expect(s.x).toBeLessThan(safeZone.x + safeZone.width);
      expect(s.y).toBeGreaterThan(safeZone.y);
      expect(s.y).toBeLessThan(safeZone.y + safeZone.height);
      for (const w of walls ?? [])
        if ('radius' in w) expect(Math.hypot(s.x - w.x, s.y - w.y)).toBeGreaterThan(w.radius + 36);
    }
  });

  it('has solid trunks and bamboo: a disc at each of the 6 trees and 4 stalks', () => {
    const discs = (HEX_MEADOW_ARENA.walls ?? []).filter((w) => 'radius' in w);
    expect(discs).toHaveLength(10);
    for (const d of discs) if ('radius' in d) expect(d.radius).toBeGreaterThanOrEqual(18);
  });

  it('ships its model and a manifest whose plants the renderer reads: ~1,000 pads, a quarter with a flower', () => {
    for (const f of ['plaza.glb', 'manifest.json']) expect(existsSync(join(dir, f))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
      map: string;
      plants: unknown;
    };
    expect(manifest.map).toBe('hex_meadow');
    const plants = parsePlants(manifest.plants);
    if (plants === undefined) throw new Error('no plants');
    expect(plants.pads.length).toBeGreaterThan(900);
    const flowers = plants.pads.filter((p) => p[3]).length;
    expect(flowers / plants.pads.length).toBeGreaterThan(0.2);
    expect(plants.height).toBeCloseTo(2.9, 1);
  });
});
