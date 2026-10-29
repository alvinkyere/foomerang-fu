import { describe, expect, it } from 'vitest';
import {
  POND_CROSS_ARENA,
  POND_CROSS_RAFT,
  POND_CROSS_SPAWNS,
  stepFu,
  type FuArena,
  type FuEvent,
} from '../src/rules';
import { circleHitsWalls, onGround, turntableGround, turntableWalls } from '../src/rules/arena';
import { navGridFor } from '../src/cpu/nav';
import { playMatch } from './support/cpuMatch';
import { DT, NONE, R, at, make, place, player } from './support/fixtures';

// A turntable (owner, 2026-10-27: the cross pond's raft, foomerang-fu physics hq.mp4 4:26-4:28, turning ~24 degrees a second
// clockwise): its ground and its crates turn about its centre by the round's clock, and whoever stands on it turns with it.

// a bank on the left (x 0-300) and a cross-shaped raft round (900, 450): two arms 600 x 160, turning 90 degrees a second
const ARM = (w: number, h: number) => [
  { x: -w / 2, y: -h / 2 },
  { x: w / 2, y: -h / 2 },
  { x: w / 2, y: h / 2 },
  { x: -w / 2, y: h / 2 },
];
const POND: FuArena = Object.freeze({
  width: 1600,
  height: 900,
  ground: [
    [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 900 },
      { x: 0, y: 900 },
    ],
  ],
  turntables: [
    {
      x: 900,
      y: 450,
      degreesPerSecond: 90,
      startDegrees: 0,
      ground: [ARM(600, 160), ARM(160, 600)],
      walls: [{ shape: 'box' as const, x: -200, y: 0, halfWidth: 30, halfHeight: 30, angle: 0 }],
    },
  ],
  spawns: [100, 250, 400, 550, 700, 850].map((y) => ({ x: 150, y: Math.min(y, 820) })),
});
const falls = (events: readonly FuEvent[]) =>
  events.filter((e) => e.type === 'HIT' && e.source === 'FALL');

describe('a turntable', () => {
  it('carries whoever stands on it round its centre, and they do not fall', () => {
    let s = make(['a', 'b'], { arena: POND, roundIntroSeconds: 0 });
    s = place(s, 'a', 1150, 450); // on the east arm, 250 from the centre
    let fell = false;
    for (let t = 0; t < 1; t += DT) {
      const r = stepFu(s, NONE, DT);
      s = r.state;
      fell ||= falls(r.events).length > 0;
    }
    // a quarter turn clockwise (screen: +Y down): east -> south
    expect(fell).toBe(false);
    expect(player(s, 'a').alive).toBe(true);
    expect(at(s, 'a').x).toBeCloseTo(900, -1);
    expect(at(s, 'a').y).toBeCloseTo(700, -1);
  });

  it('the water between its arms is no ground: stepping off falls', () => {
    let s = make(['a', 'b'], { arena: POND, roundIntroSeconds: 0 });
    s = place(s, 'a', 1150, 650); // between the east and the south arm
    const r = stepFu(s, NONE, DT);
    expect(falls(r.events)).toHaveLength(1);
  });

  it('a CPU does not plan over it (it turns away under the plan); the bank stays free', () => {
    const grid = navGridFor(POND, R);
    expect(grid.isFree(...grid.cellOf({ x: 1150, y: 450 }))).toBe(false);
    expect(grid.isFree(...grid.cellOf({ x: 150, y: 450 }))).toBe(true);
  });

  it('its crates turn with it', () => {
    expect(circleHitsWalls({ x: 700, y: 450 }, 10, turntableWalls(POND, 0))).toBe(true);
    expect(circleHitsWalls({ x: 900, y: 250 }, 10, turntableWalls(POND, 1))).toBe(true);
    expect(circleHitsWalls({ x: 700, y: 450 }, 10, turntableWalls(POND, 1))).toBe(false);
  });
});

describe('the cross pond', () => {
  it('spawns everyone on a bank, clear of the wall; its raft is ground and its crates solid as it turns', () => {
    for (const s of POND_CROSS_ARENA.spawns ?? []) {
      expect(onGround(s, POND_CROSS_ARENA)).toBe(true);
      expect(circleHitsWalls(s, R, POND_CROSS_ARENA.walls ?? [])).toBe(false);
    }
    const tt = POND_CROSS_RAFT;
    for (const t of [0, 1.3, 2.9]) {
      expect(onGround({ x: tt.x, y: tt.y }, POND_CROSS_ARENA, t)).toBe(true);
      for (const w of turntableWalls(POND_CROSS_ARENA, t))
        expect(onGround(w, POND_CROSS_ARENA, t)).toBe(true);
    }
  });

  it('a CPU carried on the raft does not walk off it into the water toward a foe across the pond', () => {
    const tt = POND_CROSS_RAFT;
    const a = (tt.startDegrees * Math.PI) / 180;
    for (const seed of [1, 2, 3]) {
      let fell = false;
      playMatch({
        participants: [
          { id: 'a', cpu: 'HARD' },
          { id: 'b', human: () => ({}) },
        ],
        arena: POND_CROSS_ARENA,
        steps: 60 * 4,
        seed,
        // on an arm, 200 out from the middle; the foe on the far bank
        start: (s) =>
          place(
            place(s, 'a', tt.x + Math.cos(a) * 200, tt.y + Math.sin(a) * 200),
            'b',
            ...([POND_CROSS_SPAWNS[1]?.x ?? 0, POND_CROSS_SPAWNS[1]?.y ?? 0] as const),
          ),
        onStep: (_s, events) => {
          fell ||= falls(events).some((e) => e.type === 'HIT' && e.victimId === 'a');
        },
      });
      expect(fell, `seed ${seed}`).toBe(false);
    }
  });

  it('the raft, turning all the way round, never reaches more than half a unit into the banks (owner, 2026-10-29: it passed through the grass)', () => {
    // how deep a point is inside a polygon: its distance to the nearest edge (0: outside)
    type P = { x: number; y: number };
    const depth = (p: P, poly: readonly P[]): number => {
      let inside = false;
      let near = Infinity;
      for (let i = 0; i < poly.length; i += 1) {
        const a = poly[i] as P;
        const z = poly[(i + 1) % poly.length] as P;
        if (a.y > p.y !== z.y > p.y && p.x < ((z.x - a.x) * (p.y - a.y)) / (z.y - a.y) + a.x)
          inside = !inside;
        const ex = z.x - a.x;
        const ey = z.y - a.y;
        const u = Math.max(
          0,
          Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (ex * ex + ey * ey || 1)),
        );
        near = Math.min(near, Math.hypot(p.x - a.x - u * ex, p.y - a.y - u * ey));
      }
      return inside ? near : 0;
    };
    const reachOverWater = 1 * 27.48; // (the ground reaches a unit out over the water: arena.py)
    const allowed = reachOverWater + 0.5 * 27.48 + 6;
    let deepest = 0;
    for (let t = 0; t < 360 / POND_CROSS_RAFT.degreesPerSecond; t += 0.25)
      for (const raft of turntableGround(POND_CROSS_ARENA, t))
        for (let i = 0; i < raft.length; i += 1) {
          const a = raft[i] as P;
          const z = raft[(i + 1) % raft.length] as P;
          for (let k = 0; k < 8; k += 1) {
            const p = { x: a.x + ((z.x - a.x) * k) / 8, y: a.y + ((z.y - a.y) * k) / 8 };
            for (const bank of POND_CROSS_ARENA.ground ?? [])
              deepest = Math.max(deepest, depth(p, bank));
          }
        }
    expect(deepest).toBeLessThanOrEqual(allowed);
  });

  it('a player who stands on the raft rides it a full turn and stays alive', () => {
    const tt = POND_CROSS_RAFT;
    let s = make(['a', 'b'], { arena: POND_CROSS_ARENA, roundIntroSeconds: 0 });
    s = place(s, 'a', tt.x, tt.y);
    for (let t = 0; t < 360 / tt.degreesPerSecond; t += DT) s = stepFu(s, NONE, DT).state;
    expect(player(s, 'a').alive).toBe(true);
  });
});
