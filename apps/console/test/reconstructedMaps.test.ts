import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HARBOUR_FORT_ARENA, MARKET_PLAZA_ARENA, SKY_ISLANDS_ARENA } from '@foomerang/foomerang-fu';
import { describe, expect, it } from 'vitest';
import { createMapCamera, parseMapCamera } from '../src/render/reconstructed/mapCamera';
import {
  RECONSTRUCTED_MAPS,
  characterFor,
  headingFrame,
  reconstructedMapFor,
} from '../src/render/reconstructed/maps';
import { parseArenaParam } from '../src/runtime/powerupMode';

// Maps reconstructed from the master gameplay video are registered as DATA (asset folder, seat roster); everything else about a
// map — camera, layers, character atlases — ships in its manifest, so adding a map needs no renderer branch.

const manifestOf = (dir: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(__dirname, '..', 'public', dir, 'manifest.json'), 'utf8')) as Record<
    string,
    unknown
  >;

describe('reconstructed maps', () => {
  it('market_plaza is a distinct, selectable reconstructed map; Garden is not one', () => {
    expect(parseArenaParam('?arena=market_plaza')).toBe('market_plaza');
    expect(reconstructedMapFor('market_plaza')?.assetDir).toBe('maps/market_plaza/');
    expect(reconstructedMapFor('garden')).toBeUndefined();
    expect(parseArenaParam('')).toBe('garden');
  });

  it('seats 1–6 on the plaza are six different pack characters (the plaza video cast)', () => {
    const roster = RECONSTRUCTED_MAPS.market_plaza.roster;
    expect(roster).toEqual(['bread', 'coffee', 'watermelon', 'icecream', 'banana', 'carrot']);
    expect(new Set([1, 2, 3, 4, 5, 6].map((n) => characterFor(roster, n))).size).toBe(6);
  });

  it('picks the baked heading that faces the game facing (frame 0 faces the viewer, +x is a quarter turn)', () => {
    expect(headingFrame(0, 1)).toBe(0);
    expect(headingFrame(1, 0)).toBe(4);
    expect(headingFrame(0, -1)).toBe(8);
    expect(headingFrame(-1, 0)).toBe(12);
    expect(headingFrame(Math.SQRT1_2, Math.SQRT1_2)).toBe(2);
  });

  it.each(Object.values(RECONSTRUCTED_MAPS))(
    '$id ships a manifest with its own solved camera and every seat’s character atlas',
    (map) => {
      const manifest = manifestOf(map.assetDir);
      expect(manifest['map']).toBe(map.id);
      const camera = createMapCamera(parseMapCamera(manifest['camera']));
      // the arena's corners are on the canvas: the map's own camera frames its own arena
      for (const [x, y] of [
        [0, 0],
        [map.arena.width, 0],
        [0, map.arena.height],
        [map.arena.width, map.arena.height],
      ] as const) {
        const p = camera.project(x, y);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(camera.canvas.width);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(camera.canvas.height);
      }
      const characters = manifest['characters'] as Record<string, unknown>;
      for (const kind of map.roster) expect(characters[kind]).toBeDefined();
    },
  );

  it('registered arena sizes are the rules’ arena sizes', () => {
    expect(RECONSTRUCTED_MAPS.market_plaza.arena).toEqual({
      width: MARKET_PLAZA_ARENA.width,
      height: MARKET_PLAZA_ARENA.height,
    });
    expect(RECONSTRUCTED_MAPS.harbour_fort.arena).toEqual({
      width: HARBOUR_FORT_ARENA.width,
      height: HARBOUR_FORT_ARENA.height,
    });
    expect(RECONSTRUCTED_MAPS.sky_islands.arena).toEqual({
      width: SKY_ISLANDS_ARENA.width,
      height: SKY_ISLANDS_ARENA.height,
    });
    expect(parseArenaParam('?arena=sky_islands')).toBe('sky_islands');
  });

  it('harbour_fort is selectable, seats its video cast first (avocado, watermelon) and has its own longer lens', () => {
    expect(parseArenaParam('?arena=harbour_fort')).toBe('harbour_fort');
    const map = reconstructedMapFor('harbour_fort');
    expect(map?.roster.slice(0, 2)).toEqual(['avocado', 'watermelon']);
    const plaza = parseMapCamera(manifestOf('maps/market_plaza/')['camera']);
    const harbour = parseMapCamera(manifestOf('maps/harbour_fort/')['camera']);
    expect(harbour.focalPx).toBeGreaterThan(1.5 * plaza.focalPx);
  });

  it('the plaza manifest camera is the solved take-A camera', () => {
    const camera = createMapCamera(parseMapCamera(manifestOf('maps/market_plaza/')['camera']));
    const p = camera.project(900, 650, 60);
    expect(p.x).toBeCloseTo(984.638, 2);
    expect(p.y).toBeCloseTo(458.573, 2);
  });
});
