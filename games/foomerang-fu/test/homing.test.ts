import { FIXED_TIMESTEP_SECONDS as DT, MAX_STEP_SECONDS } from '@foomerang/game-core';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FU_CONFIG,
  PRIMITIVE_ARENA,
  createFuMatch,
  stepFu,
  type FuArena,
  type FuEvent,
  type FuInputs,
  type FuState,
  type Rect,
  type Solid,
} from '../src/rules';
import { distanceToSolid } from '../src/rules/arena';

// These files run thousands of simulation steps; on a cold, loaded checkout a few took longer than vitest's
// 5 s default. This only gives them room; no assertion depends on it.
vi.setConfig({ testTimeout: 60_000 });

// ------------------------------------------------------------------------------------------
// The way home, as the reference video shows it (owner, 2026-10-19; 0:39.1): a RETURNING boomerang homes on its
// thrower, and if anything is in its way (a wall, the arena's edge) it bounces off and DROPS on its own side, sliding
// to a stop. It never finds its own way round and never passes through geometry. Its thrower picks it up or calls it.
// ------------------------------------------------------------------------------------------

const C = DEFAULT_FU_CONFIG;
const RB = C.boomerangRadius;
const NONE: FuInputs = new Map();
type Press = { move?: { x: number; y: number }; throw?: boolean; slash?: boolean };
const input = (entries: Record<string, Press>): FuInputs => new Map(Object.entries(entries));
const EPS = 1e-6;

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`test setup: no ${what}`);
  return value;
}
const EDGE_SPAWNS = [
  { x: 60, y: 60 },
  { x: 1540, y: 840 },
  { x: 1540, y: 60 },
  { x: 60, y: 840 },
  { x: 60, y: 450 },
  { x: 1540, y: 450 },
];
const arenaWith = (walls: Rect[]): FuArena => ({
  width: 1600,
  height: 900,
  walls,
  spawns: EDGE_SPAWNS,
});
function place(state: FuState, id: string, x: number, y: number): FuState {
  return {
    ...state,
    world: {
      ...state.world,
      bodies: state.world.bodies.map((b) => (b.id === id ? { ...b, position: { x, y } } : b)),
    },
    boomerangs: state.boomerangs.map((b) =>
      b.ownerId === id && b.state === 'HELD' ? { ...b, position: { x, y } } : b,
    ),
  };
}
/** One player (a round never ends) with their boomerang already on its way home from `from`. */
function returning(arena: FuArena, owner: [number, number], from: [number, number], players = 1) {
  let s = createFuMatch(
    Array.from({ length: players }, (_, slot) => ({ id: String.fromCharCode(97 + slot), slot })),
    { arena },
  );
  s = place(s, 'a', ...owner);
  return {
    ...s,
    boomerangs: s.boomerangs.map((b) =>
      b.ownerId === 'a'
        ? {
            ...b,
            state: 'RETURNING' as const,
            position: { x: from[0], y: from[1] },
            direction: { x: 0, y: 0 },
            travelled: 0,
          }
        : b,
    ),
  } as FuState;
}
const boom = (s: FuState, id = 'a') =>
  must(
    s.boomerangs.find((b) => b.ownerId === id),
    `boomerang ${id}`,
  );
const player = (s: FuState, id: string) =>
  must(
    s.players.find((p) => p.id === id),
    `player ${id}`,
  );
function gap(p: { x: number; y: number }, w: Solid): number {
  return distanceToSolid(p, w);
}
const inWall = (p: { x: number; y: number }, walls: readonly Solid[]) =>
  walls.some((w) => gap(p, w) < RB - EPS);

interface Flight {
  readonly caughtAfter: number | undefined;
  readonly state: FuState;
  readonly events: FuEvent[];
  readonly path: { x: number; y: number }[];
  readonly worstPenetration: number;
}
/** Steps until the boomerang is home (or `maxSteps`), recording its path and how deep it ever was in a wall. */
function fly(
  start: FuState,
  maxSteps: number,
  dt = DT,
  frame: FuInputs | ((i: number, s: FuState) => FuInputs) = NONE,
): Flight {
  const walls = start.config.arena.walls ?? [];
  let s = start;
  const events: FuEvent[] = [];
  const path = [boom(s).position];
  let worst = 0;
  for (let i = 1; i <= maxSteps; i += 1) {
    const r = stepFu(s, typeof frame === 'function' ? frame(i, s) : frame, dt);
    s = r.state;
    events.push(...r.events);
    path.push(boom(s).position);
    for (const w of walls) worst = Math.max(worst, RB - gap(boom(s).position, w));
    if (boom(s).state === 'HELD')
      return { caughtAfter: i, state: s, events, path, worstPenetration: worst };
  }
  return { caughtAfter: undefined, state: s, events, path, worstPenetration: worst };
}

const SLAB: Rect = { x: 700, y: 300, width: 100, height: 300 };
const ONE_WALL = arenaWith([SLAB]);

describe('something in the way home: it bounces off and drops on its own side', () => {
  it('owner beyond a wall: it flies at it, bounces off (a RICOCHET), drops, and never gets home on its own', () => {
    const f = fly(returning(ONE_WALL, [1100, 450], [400, 450]), 600);
    expect(f.caughtAfter).toBeUndefined();
    expect(boom(f.state).state).toBe('GROUNDED');
    expect(f.events.filter((e) => e.type === 'RICOCHET')).toHaveLength(1);
    expect(f.events.filter((e) => e.type === 'DROPPED')).toHaveLength(1);
    expect(boom(f.state).position.x).toBeLessThan(SLAB.x - RB + EPS); // on its own side
    expect(f.worstPenetration).toBeLessThanOrEqual(EPS);
  });

  it('it slides back the way it bounced and comes to rest there', () => {
    const f = fly(returning(ONE_WALL, [1100, 450], [400, 450]), 600);
    const rest = boom(f.state).position;
    expect(rest.x).toBeLessThan(SLAB.x - 300); // slid well back from the wall
    expect(boom(f.state).velocity).toEqual({ x: 0, y: 0 });
    expect(boom(fly(f.state, 120).state).position).toEqual(rest);
  });

  it('the same situation drops it on the same step, in the same place', () => {
    const one = fly(returning(ONE_WALL, [1100, 450], [400, 450]), 200);
    const two = fly(returning(ONE_WALL, [1100, 450], [400, 450]), 200);
    expect(two.path).toEqual(one.path);
  });

  it('an owner who runs behind cover after throwing cannot be reached through it', () => {
    const start = returning(ONE_WALL, [500, 450], [200, 450]);
    const f = fly(start, 300, DT, (i) => (i < 120 ? input({ a: { move: { x: 1, y: 0 } } }) : NONE));
    expect(f.worstPenetration).toBeLessThanOrEqual(EPS);
    for (const p of f.path) expect(inWall(p, ONE_WALL.walls ?? [])).toBe(false);
  });

  it('the arena edge stops it too: it never leaves the arena', () => {
    const s = returning(arenaWith([]), [800, 450], [200, 450]);
    // pointing it away from home at the edge: the turn back takes it into the edge first
    const away = {
      ...s,
      boomerangs: s.boomerangs.map((b) =>
        b.ownerId === 'a' ? { ...b, position: { x: 30, y: 450 }, direction: { x: -1, y: 0 } } : b,
      ),
    };
    const f = fly(away, 200);
    for (const p of f.path) {
      expect(p.x).toBeGreaterThanOrEqual(RB - EPS);
      expect(p.x).toBeLessThanOrEqual(1600 - RB + EPS);
    }
  });
});

describe('no penetration, no tunnelling, at any accepted dt', () => {
  const THIN: Rect = { x: 780, y: 0, width: 40, height: 900 }; // the thinnest an arena allows (a player radius, 36)
  for (const dt of [DT, 2 * DT, 0.05, MAX_STEP_SECONDS]) {
    it(`dt = ${dt}: a returning boomerang meets the thinnest wall and stays on its side`, () => {
      const f = fly(returning(arenaWith([THIN]), [1300, 450], [300, 450]), Math.ceil(4 / dt), dt);
      expect(f.caughtAfter).toBeUndefined();
      for (const p of f.path) expect(p.x).toBeLessThan(THIN.x - RB + EPS);
      expect(f.worstPenetration).toBeLessThanOrEqual(EPS);
    });
  }
});

describe('a returning boomerang is still a weapon, and comes home when nothing is in the way', () => {
  it('kills a player standing in its way home', () => {
    let s = returning(arenaWith([]), [1300, 450], [300, 450], 2);
    s = place(s, 'b', 700, 450);
    const f = fly(s, 120);
    expect(player(f.state, 'b').alive).toBe(false);
  });

  it('never kills its owner', () => {
    const f = fly(returning(arenaWith([]), [1300, 450], [300, 450]), 200);
    expect(player(f.state, 'a').alive).toBe(true);
    expect(f.caughtAfter).toBeDefined();
  });

  it('with a clear way, from anywhere in the open arena, it gets home on its own', () => {
    for (const from of [
      [100, 100],
      [1500, 800],
      [800, 60],
      [60, 840],
    ] as [number, number][]) {
      const f = fly(returning(arenaWith([]), [800, 450], from), 600);
      expect(f.caughtAfter, `from ${from.join(',')}`).toBeDefined();
    }
  });
});

describe('determinism', () => {
  const script = (i: number): FuInputs =>
    input({
      a: {
        move: { x: Math.sin(i / 13), y: Math.cos(i / 29) },
        throw: i % 29 === 0,
        slash: i % 31 === 0,
      },
      b: { move: { x: Math.cos(i / 19), y: Math.sin(i / 7) }, throw: i % 37 === 0 },
      c: { move: { x: -Math.sin(i / 11), y: Math.cos(i / 5) }, throw: i % 41 === 0 },
    });
  const fresh = () =>
    createFuMatch(
      ['a', 'b', 'c'].map((id, slot) => ({ id, slot })),
      { arena: PRIMITIVE_ARENA },
    );

  it('byte-identical replay with boomerangs coming home and dropping against walls', () => {
    const run = () => {
      let s = fresh();
      const events: FuEvent[] = [];
      for (let i = 0; i < 4000; i += 1) {
        const r = stepFu(s, script(i), DT);
        s = r.state;
        events.push(...r.events);
      }
      return { s, events };
    };
    const one = run();
    const two = run();
    expect(JSON.stringify(two.s)).toBe(JSON.stringify(one.s));
    expect(two.events).toEqual(one.events);
    expect(
      one.events.filter((e) => e.type === 'CAUGHT' || e.type === 'DROPPED').length,
    ).toBeGreaterThanOrEqual(3);
  });

  it('fuzz: in a real six-player game no boomerang, in ANY state, is ever inside a wall', () => {
    let seed = 777;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let s = createFuMatch(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id, slot) => ({ id, slot })),
      { arena: PRIMITIVE_ARENA },
    );
    const walls = PRIMITIVE_ARENA.walls ?? [];
    let returningSeen = 0;
    for (let i = 0; i < 8000; i += 1) {
      const frame: FuInputs = new Map(
        s.players.map((p) => [
          p.id,
          {
            move: { x: random() * 2 - 1, y: random() * 2 - 1 },
            throw: random() < 0.05,
            slash: random() < 0.02,
          },
        ]),
      );
      s = stepFu(s, frame, i % 5 === 0 ? 3 * DT : DT).state;
      for (const b of s.boomerangs) {
        if (b.state === 'RETURNING' || b.state === 'GROUNDED') returningSeen += 1;
        if (b.state !== 'HELD') {
          for (const w of walls)
            expect(gap(b.position, w), `step ${i}`).toBeGreaterThanOrEqual(RB - EPS);
        }
      }
      if (s.phase === 'ROUND_OVER')
        s = { ...s, roundOver: { winnerId: undefined, resetInSeconds: DT } };
    }
    expect(returningSeen).toBeGreaterThan(200);
  }, 60_000);
});
