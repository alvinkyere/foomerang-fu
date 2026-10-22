import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HARBOUR_FORT_ARENA,
  MARKET_PLAZA_ARENA,
  SKY_ISLANDS_ARENA,
  distanceToSolid,
  type Solid,
} from '@foomerang/foomerang-fu';
import { describe, expect, it } from 'vitest';
import { CAMERA_FRAMING } from '../src/render/cameraFraming';
import { createMapCamera, parseMapCamera } from '../src/render/reconstructed/mapCamera';
import {
  RECONSTRUCTED_MAPS,
  characterFor,
  headingFrame,
  reconstructedMapFor,
} from '../src/render/reconstructed/maps';
import { PLAYABLE_ARENAS } from '../src/runtime/arenas';
import { parseArenaParam, productArena } from '../src/runtime/powerupMode';

// Maps reconstructed from the master gameplay video are registered as DATA (asset folder, seat roster); everything else about a
// map — camera, layers, character atlases — ships in its manifest, so adding a map needs no renderer branch.

/** A body of radius r at p overlaps a wall (the rules' own test: strictly inside its radius). */
const insideAWall = (p: { x: number; y: number }, r: number, walls: readonly Solid[]): boolean =>
  walls.some((w) => distanceToSolid(p, w) < r);

const manifestOf = (dir: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(__dirname, '..', 'public', dir, 'manifest.json'), 'utf8')) as Record<
    string,
    unknown
  >;

describe('reconstructed maps', () => {
  it('market_plaza is a distinct, selectable reconstructed map; the Garden no longer exists', () => {
    expect(parseArenaParam('?arena=market_plaza')).toBe('market_plaza');
    expect(reconstructedMapFor('market_plaza')?.assetDir).toBe('maps/market_plaza/');
    expect(parseArenaParam('?arena=garden')).toBeUndefined(); // not a choice any more: rotate
    expect(parseArenaParam('')).toBeUndefined(); // no pin: the console rotates
  });

  it('the product plays only the market plaza (the owner, 2026-10-16: perfect it first); a dev pin still picks a map', () => {
    expect(productArena('')).toBe('market_plaza');
    expect(productArena('?kills=3&powerups=off')).toBe('market_plaza');
    expect(productArena('?arena=garden')).toBe('market_plaza'); // unknown: the plaza, never a rotation
    expect(productArena('?arena=harbour_fort')).toBe('harbour_fort'); // development and tests only
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
      // the map's own camera frames its own arena: every place a player can stand (not inside a wall) is on the canvas. (A
      // perspective view's arena corners may lie off it — environ2's bottom corners do — but only inside solid ground.)
      const rules = PLAYABLE_ARENAS[map.id].arena;
      const walls = rules.walls ?? [];
      // a map with a border (the plaza) has open sand beyond it that the camera reaches by framing the players: only the
      // ground inside the border must be within the camera's reach (the video's views: CAMERA_FRAMING.art, in the resting
      // view's -1…1); a map without one, inside its own canvas
      const zone = rules.safeZone ?? {
        x: 36,
        y: 36,
        width: map.arena.width - 72,
        height: map.arena.height - 72,
      };
      const { u0, u1, v0, v1 } = CAMERA_FRAMING.art;
      for (let x = zone.x; x <= zone.x + zone.width; x += 24)
        for (
          let y = Math.max(36, zone.y);
          y <= Math.min(map.arena.height - 36, zone.y + zone.height);
          y += 24
        ) {
          if (insideAWall({ x, y }, 36, walls)) continue;
          const p = camera.project(x, y);
          const where = `${map.id} (${x}, ${y})`;
          if (rules.safeZone === undefined) {
            expect(p.x, where).toBeGreaterThanOrEqual(0);
            expect(p.x, where).toBeLessThanOrEqual(camera.canvas.width);
            expect(p.y, where).toBeGreaterThanOrEqual(0);
            expect(p.y, where).toBeLessThanOrEqual(camera.canvas.height);
          } else {
            const u = (p.x / camera.canvas.width) * 2 - 1;
            const v = 1 - (p.y / camera.canvas.height) * 2;
            expect(u, where).toBeGreaterThanOrEqual(u0);
            expect(u, where).toBeLessThanOrEqual(u1);
            expect(v, where).toBeGreaterThanOrEqual(v0);
            expect(v, where).toBeLessThanOrEqual(v1);
          }
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

  it('harbour_fort is selectable, seats its video cast first (avocado, watermelon) and has its own lens', () => {
    expect(parseArenaParam('?arena=harbour_fort')).toBe('harbour_fort');
    const map = reconstructedMapFor('harbour_fort');
    expect(map?.roster.slice(0, 2)).toEqual(['avocado', 'watermelon']);
    const plaza = parseMapCamera(manifestOf('maps/market_plaza/')['camera']);
    const harbour = parseMapCamera(manifestOf('maps/harbour_fort/')['camera']);
    expect(harbour.focalPx).toBeCloseTo(4620, 0);
    expect(harbour.focalPx).not.toBeCloseTo(plaza.focalPx, 0);
  });

  it('the plaza manifest camera is environ2’s solved camera (f 2577.4 px at 1280 wide, pitch 56.17°, on the 1920 canvas)', () => {
    const config = parseMapCamera(manifestOf('maps/market_plaza/')['camera']);
    expect(config.focalPx).toBeCloseTo(2577.37 * 1.5, 1);
    expect(config.pitchDeg).toBeCloseTo(56.173, 2);
    expect([config.canvas.width, config.canvas.height]).toEqual([1920, 1080]);
    const camera = createMapCamera(config);
    // the fountain's centre (its base circle, fitted on the ground) lies on the plaza's mirror axis, x = 651.25 × 1.5
    const fountain = camera.project(1104.5, 663.5);
    expect(Math.abs(fountain.x - 651.25 * 1.5)).toBeLessThan(1);
    // the fence line is 240 units inside the arena's west edge (beyond it: the outside sand): fence 30's foot (42, 343) and
    // fence 31's (4, 576), at 1280 wide
    for (const [fx, fy] of [
      [42, 343],
      [4, 576],
    ] as const) {
      const y = fy * 1.5;
      // walk down the west fence line (the safe zone's edge) to the fence foot's row and compare its canvas x
      let best = Number.POSITIVE_INFINITY;
      for (let wy = 0; wy <= MARKET_PLAZA_ARENA.height; wy += 0.5) {
        const p = camera.project(240, wy);
        if (Math.abs(p.y - y) < 0.5) best = Math.min(best, Math.abs(p.x - fx * 1.5));
      }
      expect(best, `fence foot (${fx}, ${fy})`).toBeLessThan(3);
    }
  });
});
