import { describe, expect, it } from 'vitest';
import {
  FREE_FOR_ALL,
  MARKET_PLAZA_ARENA,
  MARKET_PLAZA_BOOK_SPOTS,
  MARKET_PLAZA_HEIGHT,
  MARKET_PLAZA_SPAWNS,
  MARKET_PLAZA_WALLS,
  MARKET_PLAZA_WIDTH,
  createFuMatch,
  stepFu,
} from '../src/rules';
import { circleHitsWalls, wallsOf } from '../src/rules/arena';
import { DT, R, at, input, make } from './support/fixtures';

// market_plaza: the first map reconstructed from the master gameplay video (art/reconstruction). Its geometry is DATA owned by
// the rules (generated from the measured reconstruction by art/reconstruction/runtime/gen_plaza_arena.py). These tests check
// the data; the approved mechanics are unchanged — the plaza adds no new mechanic.

const walls = wallsOf(MARKET_PLAZA_ARENA);

describe('market_plaza: the arena data', () => {
  it('is an 1750 × 1300 arena with solid stalls, fountain and crates, six spawns and no Slice 6 systems', () => {
    expect([MARKET_PLAZA_WIDTH, MARKET_PLAZA_HEIGHT]).toEqual([1750, 1300]);
    expect([MARKET_PLAZA_ARENA.width, MARKET_PLAZA_ARENA.height]).toEqual([1750, 1300]);
    expect(MARKET_PLAZA_ARENA.spawns).toHaveLength(6);
    expect(MARKET_PLAZA_ARENA.gates ?? []).toEqual([]);
    expect(MARKET_PLAZA_ARENA.platforms ?? []).toEqual([]);
    expect(MARKET_PLAZA_ARENA.hazards ?? []).toEqual([]);
    expect(walls).toHaveLength(MARKET_PLAZA_WALLS.length);
    expect(createFuMatch([{ id: 'a', slot: 0 }], { arena: MARKET_PLAZA_ARENA }).config.arena).toBe(
      MARKET_PLAZA_ARENA,
    );
  });

  it('every obstacle lies inside the boundary, has a positive size and a unique id; the fountain centre is solid', () => {
    expect(new Set(MARKET_PLAZA_WALLS.map((w) => w.id)).size).toBe(MARKET_PLAZA_WALLS.length);
    for (const w of MARKET_PLAZA_WALLS) {
      expect(w.width, w.id).toBeGreaterThan(0);
      expect(w.height, w.id).toBeGreaterThan(0);
      expect(w.x, w.id).toBeGreaterThanOrEqual(0);
      expect(w.y, w.id).toBeGreaterThanOrEqual(0);
      expect(w.x + w.width, w.id).toBeLessThanOrEqual(MARKET_PLAZA_WIDTH);
      expect(w.y + w.height, w.id).toBeLessThanOrEqual(MARKET_PLAZA_HEIGHT);
    }
    const f = MARKET_PLAZA_WALLS.filter((w) => w.kind === 'FOUNTAIN');
    expect(f.length).toBeGreaterThan(0);
    const cx = f.reduce((s, w) => s + w.x + w.width / 2, 0) / f.length;
    const cy = f.reduce((s, w) => s + w.y + w.height / 2, 0) / f.length;
    expect(circleHitsWalls({ x: cx, y: cy }, 1, walls)).toBe(true);
  });

  it('every spawn and Book spot is on open floor with room around it; spawns are well spread', () => {
    for (const p of [...MARKET_PLAZA_SPAWNS, ...MARKET_PLAZA_BOOK_SPOTS]) {
      expect(circleHitsWalls(p, R + 20, walls), `${p.x},${p.y}`).toBe(false);
      expect(p.x - R).toBeGreaterThan(0);
      expect(p.y - R).toBeGreaterThan(0);
      expect(p.x + R).toBeLessThan(MARKET_PLAZA_WIDTH);
      expect(p.y + R).toBeLessThan(MARKET_PLAZA_HEIGHT);
    }
    for (let i = 0; i < 6; i += 1)
      for (let j = i + 1; j < 6; j += 1) {
        const a = MARKET_PLAZA_SPAWNS[i];
        const b = MARKET_PLAZA_SPAWNS[j];
        expect(Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0))).toBeGreaterThan(
          400,
        );
      }
  });

  it('six-player fuzz with the approved mechanics never puts a living body inside an obstacle or outside the boundary', () => {
    const IDS = ['a', 'b', 'c', 'd', 'e', 'f'];
    let s = make(IDS, { arena: MARKET_PLAZA_ARENA, ...FREE_FOR_ALL, seed: 9 });
    for (let i = 0; i < 2400; i += 1) {
      s = stepFu(
        s,
        input(
          Object.fromEntries(
            IDS.map((id, k) => [
              id,
              {
                move: { x: Math.cos(i / (11 + 2 * k) + k), y: Math.sin(i / (13 + k) + 2 * k) },
                dash: (i + 3 * k) % 17 === 0,
                throw: (i + 5 * k) % 37 === 0,
                slash: (i + 2 * k) % 41 === 0,
              },
            ]),
          ),
        ),
        DT,
      ).state;
      for (const p of s.players) {
        if (!p.alive) continue;
        const pos = at(s, p.id);
        expect(circleHitsWalls(pos, R - 0.01, walls), `tick ${i} ${p.id}`).toBe(false);
        expect(pos.x).toBeGreaterThanOrEqual(R - 1e-6);
        expect(pos.y).toBeGreaterThanOrEqual(R - 1e-6);
        expect(pos.x).toBeLessThanOrEqual(MARKET_PLAZA_WIDTH - R + 1e-6);
        expect(pos.y).toBeLessThanOrEqual(MARKET_PLAZA_HEIGHT - R + 1e-6);
      }
    }
  });
});
