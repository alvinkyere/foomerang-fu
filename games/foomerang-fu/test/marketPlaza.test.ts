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
import { boundsOf, circleHitsWalls, wallsOf } from '../src/rules/arena';
import { DT, R, at, input, make } from './support/fixtures';

// market_plaza: the plaza of environ2.avif (the owner's reference still, art/reconstruction/environ2). Its geometry is DATA owned
// by the rules, generated from the 3D models the game draws (plaza.glb) by art/reconstruction/environ2/blender/collision.py:
// each solid is ONE model in its real shape (owner, 2026-10-17). These tests check the data; the mechanics are the approved ones.

const walls = wallsOf(MARKET_PLAZA_ARENA);

describe('market_plaza: the arena data', () => {
  it('is environ2’s plaza plus the outside sand beyond each fence: 2209 × 1108, six spawns, no Slice 6 systems', () => {
    expect([MARKET_PLAZA_WIDTH, MARKET_PLAZA_HEIGHT]).toEqual([2209, 1108]);
    expect([MARKET_PLAZA_ARENA.width, MARKET_PLAZA_ARENA.height]).toEqual([2209, 1108]);
    expect(MARKET_PLAZA_ARENA.spawns).toHaveLength(6);
    expect(MARKET_PLAZA_ARENA.gates ?? []).toEqual([]);
    expect(MARKET_PLAZA_ARENA.platforms ?? []).toEqual([]);
    expect(MARKET_PLAZA_ARENA.hazards ?? []).toEqual([]);
    expect(walls).toHaveLength(MARKET_PLAZA_WALLS.length);
    expect(createFuMatch([{ id: 'a', slot: 0 }], { arena: MARKET_PLAZA_ARENA }).config.arena).toBe(
      MARKET_PLAZA_ARENA,
    );
  });

  it('every solid is one model we draw, in its real shape: round pots, posts and fountain; turned crates, stalls and fences', () => {
    const shapeOf = (w: (typeof MARKET_PLAZA_WALLS)[number]) => ('shape' in w ? w.shape : 'rect');
    const expected = {
      POT: 'disc',
      POLE: 'disc',
      SIGN: 'disc',
      FOUNTAIN: 'disc',
      CRATE: 'box',
      STALL: 'box',
      FENCE: 'box',
      TERRACE: 'rect',
    } as const;
    for (const w of MARKET_PLAZA_WALLS) expect(shapeOf(w), w.id).toBe(expected[w.kind]);
    // no blanket cells: one wall per model (the four far-left posts are four poles, not a strip)
    expect(MARKET_PLAZA_WALLS.filter((w) => w.kind === 'FOUNTAIN')).toHaveLength(1);
    expect(MARKET_PLAZA_WALLS.filter((w) => w.kind === 'CRATE')).toHaveLength(9);
    expect(MARKET_PLAZA_WALLS.filter((w) => w.kind === 'STALL')).toHaveLength(6);
  });

  it('the bottom-left crates and pots are solid only where they stand: the sand round them is open (the owner’s barrier)', () => {
    // the models' centres (plaza.glb): two crates and two pots
    for (const p of [
      { x: 577, y: 912 },
      { x: 488, y: 943 },
      { x: 538, y: 982 },
      { x: 494, y: 1006 },
    ])
      expect(circleHitsWalls(p, 1, walls), `${p.x},${p.y}`).toBe(true);
    // all of this was one 200 × 240 block; now a body stands on open sand left of, above, right of and below the group
    for (const p of [
      { x: 420, y: 940 },
      { x: 480, y: 870 },
      { x: 660, y: 950 },
      { x: 620, y: 1010 },
      { x: 500, y: 1068 },
    ])
      expect(circleHitsWalls(p, R, walls), `${p.x},${p.y}`).toBe(false);
  });

  it('a player walks right along the bottom of the plaza, under the pots, until the bunting post stops them', () => {
    let s = make(['a', 'b'], { arena: MARKET_PLAZA_ARENA, seed: 2 });
    s = {
      ...s,
      world: {
        ...s.world,
        bodies: s.world.bodies.map((b) =>
          b.id === 'a' ? { ...b, position: { x: 300, y: 1068 } } : b,
        ),
      },
    };
    for (let t = 0; t < 4; t += DT) s = stepFu(s, input({ a: { move: { x: 1, y: 0 } } }), DT).state;
    expect(at(s, 'a').x).toBeGreaterThan(800);
  });

  it('stalls, the fountain, crates, pots, poles and the sign are solid (the owner’s decision); so is the raised terrace', () => {
    const kinds = new Set(MARKET_PLAZA_WALLS.map((w) => w.kind));
    for (const kind of ['STALL', 'FOUNTAIN', 'CRATE', 'POT', 'POLE', 'SIGN', 'TERRACE'] as const)
      expect(kinds.has(kind), kind).toBe(true);
    // the fountain's base is a circle of radius 162 around (1104.5, 663.5): its centre blocks, a body clear of its rim does not
    expect(circleHitsWalls({ x: 1104.5, y: 663.5 }, 1, walls)).toBe(true);
    expect(circleHitsWalls({ x: 1104.5, y: 663.5 + 162 + 40 + R }, R, walls)).toBe(false);
  });

  it('its border is the two dashed lines on the sand: the safe zone runs from world x 271 to 1939', () => {
    expect(MARKET_PLAZA_ARENA.safeZone).toEqual({
      x: 271,
      y: 0,
      width: 1668,
      height: MARKET_PLAZA_HEIGHT,
    });
  });

  it('beyond the dashed lines a player can walk out onto open sand (no wall there), and every spawn is inside them', () => {
    for (const y of [300, 500, 700, 900]) {
      expect(circleHitsWalls({ x: 140, y }, R, walls), `west outside at y ${y}`).toBe(false);
      expect(
        circleHitsWalls({ x: MARKET_PLAZA_WIDTH - 140, y }, R, walls),
        `east outside at y ${y}`,
      ).toBe(false);
    }
    for (const p of MARKET_PLAZA_SPAWNS) {
      expect(p.x).toBeGreaterThan(271);
      expect(p.x).toBeLessThan(1939);
    }
  });

  it('every obstacle lies inside the boundary, has a positive size and a unique id; the fountain centre is solid', () => {
    expect(new Set(MARKET_PLAZA_WALLS.map((w) => w.id)).size).toBe(MARKET_PLAZA_WALLS.length);
    for (const w of MARKET_PLAZA_WALLS) {
      const b = boundsOf(w);
      expect(b.width, w.id).toBeGreaterThan(0);
      expect(b.height, w.id).toBeGreaterThan(0);
      // a model standing at the frame's edge may reach past it; its middle is always on the plaza
      expect(b.x + b.width / 2, w.id).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height / 2, w.id).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width / 2, w.id).toBeLessThanOrEqual(MARKET_PLAZA_WIDTH);
      expect(b.y + b.height / 2, w.id).toBeLessThanOrEqual(MARKET_PLAZA_HEIGHT);
    }
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
          700,
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
