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
// A RETURNING boomerang is bound by solid geometry exactly like a THROWN one. It keeps homing on
// its owner with LOCAL steering: when its heading is blocked it slides along the wall (a committed
// hand, flipped once if it is wedged in a concave corner), and a time-boxed failsafe recalls it if
// wall-following never gets it home. No pathfinding, no teleporting through geometry.
// ------------------------------------------------------------------------------------------

const C = DEFAULT_FU_CONFIG;
const R = C.playerRadius;
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

describe('a returning boomerang cannot pass through a wall', () => {
  it('owner and boomerang on opposite sides of a wall: it goes round it, never into it, and is caught', () => {
    const f = fly(returning(ONE_WALL, [500, 450], [1000, 450]), 400);
    expect(f.worstPenetration).toBeLessThan(EPS);
    expect(f.caughtAfter).toBeDefined();
    expect(f.events.map((e) => e.type)).toContain('CAUGHT');
    // it really did go around: some point of the path is above or below the whole slab
    expect(
      f.path.some((p) => p.y < SLAB.y - RB + EPS || p.y > SLAB.y + SLAB.height + RB - EPS),
    ).toBe(true);
    // and it never crossed the slab's own x-range at a y inside it
    expect(
      f.path.every(
        (p) =>
          !(
            p.x > SLAB.x &&
            p.x < SLAB.x + SLAB.width &&
            p.y > SLAB.y &&
            p.y < SLAB.y + SLAB.height
          ),
      ),
    ).toBe(true);
  });

  it('head-on at the exact middle of a wall is deterministic (it picks a side by a fixed rule and keeps it)', () => {
    const one = fly(returning(ONE_WALL, [500, 450], [1000, 450]), 400);
    const two = fly(returning(ONE_WALL, [500, 450], [1000, 450]), 400);
    expect(two.path).toEqual(one.path);
    // it commits to one side: it does not oscillate across the middle line
    const ys = one.path.map((p) => p.y);
    const wentUp = ys.some((y) => y < 450 - 100);
    const wentDown = ys.some((y) => y > 450 + 100);
    expect(wentUp !== wentDown).toBe(true);
    expect(wentDown).toBe(true); // an exact tie takes the fixed hand: down, here
  });

  it('an owner who runs behind cover after throwing cannot be reached through it', () => {
    // Alice throws right along the open lane above the slab, then runs down behind it.
    const arena = arenaWith([{ x: 500, y: 300, width: 100, height: 300 }]);
    let s = createFuMatch([{ id: 'a', slot: 0 }], { arena });
    s = place(s, 'a', 300, 200);
    s = { ...s, players: s.players.map((p) => ({ ...p, facing: { x: 1, y: 0 } })) };
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    let worst = 0;
    let caught = false;
    for (let i = 0; i < 300 && !caught; i += 1) {
      const turning = boom(s).state === 'RETURNING';
      // once it is on its way back, the owner ducks behind the slab
      s = stepFu(s, input({ a: { move: turning ? { x: 0.3, y: 1 } : { x: 0, y: 0 } } }), DT).state;
      for (const w of arena.walls ?? []) worst = Math.max(worst, RB - gap(boom(s).position, w));
      caught = boom(s).state === 'HELD' && i > 5;
    }
    expect(worst).toBeLessThan(EPS);
    expect(caught).toBe(true);
    expect(player(s, 'a').alive).toBe(true); // never its owner's killer
  });

  it('it stays flush with a wall it is sliding along, not hovering away from it', () => {
    const f = fly(returning(ONE_WALL, [500, 450], [1000, 450]), 400);
    const sliding = f.path.filter((p) => Math.abs(gap(p, SLAB) - RB) < 1e-6);
    expect(sliding.length).toBeGreaterThan(5);
  });
});

describe('corners', () => {
  it('rounds a convex corner: slides along one face, wraps the corner and carries on', () => {
    // owner below-left of the slab's bottom-left... boomerang right of it, level with the top
    const f = fly(returning(ONE_WALL, [600, 700], [900, 350]), 400);
    expect(f.worstPenetration).toBeLessThan(EPS);
    expect(f.caughtAfter).toBeDefined();
  });

  it('a concave corner it is driven into: it backs out the other way (hand flipped once) and gets home', () => {
    // An L: a tall wall (x 700–760, y 200–600) with a floor (x 700–1000, y 540–600) at its foot.
    const arena = arenaWith([
      { x: 700, y: 200, width: 60, height: 400 },
      { x: 700, y: 540, width: 300, height: 60 },
    ]);
    // The boomerang is in the inside corner; the owner is beyond the tall wall and below the floor level,
    // so the first slide runs straight into the corner.
    const f = fly(returning(arena, [500, 700], [780, 520]), 600);
    expect(f.worstPenetration).toBeLessThan(EPS);
    expect(f.caughtAfter).toBeDefined();
    expect(f.events.map((e) => e.type)).not.toContain('RECALLED');
  });

  it('wedged against the arena edge on its first hand, it flips once and gets home (instead of waiting for the failsafe)', () => {
    // A wall that starts at the left edge; the boomerang sits on top of it close to that edge, and the owner is
    // below and slightly further left: the first hand says "slide left", which runs out of arena.
    const edge = arenaWith([{ x: 0, y: 500, width: 400, height: 100 }]);
    const f = fly(returning(edge, [36, 700], [60, 486]), 400);
    expect(f.worstPenetration).toBeLessThan(EPS);
    expect(f.caughtAfter).toBeDefined();
    expect(f.events.map((e) => e.type)).not.toContain('RECALLED');
    expect((f.caughtAfter ?? 0) * DT).toBeLessThan(C.returnWallSeconds / 2);
  });

  it('the other concave case: owner up and left, the slide goes the free way at once', () => {
    const arena = arenaWith([
      { x: 700, y: 200, width: 60, height: 400 },
      { x: 700, y: 540, width: 300, height: 60 },
    ]);
    const f = fly(returning(arena, [500, 300], [780, 520]), 600);
    expect(f.worstPenetration).toBeLessThan(EPS);
    expect(f.caughtAfter).toBeDefined();
  });
});

describe('corridors and chokepoints', () => {
  const corridor = arenaWith([
    { x: 700, y: 200, width: 60, height: 400 },
    { x: 860, y: 200, width: 60, height: 400 }, // 100 wide between them, 400 long
  ]);

  it('inside a corridor with the owner at the far end: straight along it', () => {
    const f = fly(returning(corridor, [810, 700], [810, 300]), 200);
    expect(f.worstPenetration).toBeLessThan(EPS);
    expect(f.caughtAfter).toBeDefined();
    expect(f.path.every((p) => Math.abs(p.x - 810) < 1e-6)).toBe(true); // dead straight, no wobble
  });

  it('inside a corridor with the owner beside it, beyond a wall: it follows the corridor out and round', () => {
    const f = fly(returning(corridor, [1100, 400], [810, 400]), 400);
    expect(f.worstPenetration).toBeLessThan(EPS);
    expect(f.caughtAfter).toBeDefined();
    expect(f.path.some((p) => p.y < 200 || p.y > 600)).toBe(true); // it left by an end
  });

  it('through a chokepoint the width of one body: a boomerang is far narrower, so it passes', () => {
    const gate = arenaWith([
      { x: 700, y: 0, width: 100, height: 400 },
      { x: 700, y: 520, width: 100, height: 380 }, // 120 gap at y 400–520
    ]);
    const f = fly(returning(gate, [400, 460], [1100, 460]), 200);
    expect(f.worstPenetration).toBeLessThan(EPS);
    expect(f.caughtAfter).toBeDefined();
    expect(f.path.every((p) => Math.abs(p.y - 460) < 1e-6)).toBe(true); // straight through the gap
  });

  it('when the gap is not on its straight line it slides to it, through it, and home', () => {
    const gate = arenaWith([
      { x: 700, y: 0, width: 100, height: 400 },
      { x: 700, y: 520, width: 100, height: 380 },
    ]);
    const f = fly(returning(gate, [400, 100], [1100, 100]), 400);
    expect(f.worstPenetration).toBeLessThan(EPS);
    expect(f.caughtAfter).toBeDefined();
  });
});

describe('sequential contacts, long steps, thin walls', () => {
  it('several walls in a row (the primitive arena, across the middle) are rounded one after another', () => {
    const f = fly(returning(createArenaFor(), [110, 450], [1490, 450]), 600);
    expect(f.worstPenetration).toBeLessThan(EPS);
    expect(f.caughtAfter).toBeDefined();
    expect(f.events.map((e) => e.type)).not.toContain('RECALLED');
  });

  it.each([DT, 2 * DT, 3 * DT, MAX_STEP_SECONDS])(
    'no penetration and no tunnelling at any accepted dt (dt = %s), even through the thinnest wall',
    (dt) => {
      const thin = arenaWith([{ x: 700, y: 200, width: R, height: 500 }]);
      for (const startX of [752, 760, 790, 820, 900, 1100]) {
        const f = fly(returning(thin, [500, 450], [startX, 450]), 300, dt);
        expect(f.worstPenetration, `start ${startX}`).toBeLessThan(EPS);
        expect(f.caughtAfter, `start ${startX}`).toBeDefined();
        expect(f.path.every((p) => !(p.x > 700 && p.x < 700 + R && p.y > 200 && p.y < 700))).toBe(
          true,
        );
      }
    },
  );

  it('a boomerang in contact with the wall that the owner has just stepped behind is not caught through it', () => {
    const thin = arenaWith([{ x: 700, y: 200, width: R, height: 500 }]);
    // owner pressed against the wall's far face; boomerang pressed against the near face
    const s = returning(thin, [700 + R + R, 450], [700 - RB, 450]);
    const r = stepFu(s, NONE, DT);
    expect(boom(r.state).state).toBe('RETURNING');
    expect(r.events.map((e) => e.type)).not.toContain('CAUGHT');
  });
});

function createArenaFor(): FuArena {
  return PRIMITIVE_ARENA;
}

describe('a returning boomerang is still a weapon, and still comes home', () => {
  it('kills a player standing in its way around the wall (lethality is unchanged)', () => {
    // head-on, it takes the fixed side (down); a victim stands on the lane it must use
    const s0 = returning(ONE_WALL, [500, 450], [1000, 450], 2);
    const s1 = place(s0, 'b', 750, 650); // it hugs the slab's right face, then runs along its underside
    const f = fly(s1, 100); // (the round ends on the kill, and resets after 2.5 s: look at what happened, not at the end)
    expect(f.events.some((e) => e.type === 'HIT' && e.victimId === 'b' && e.byId === 'a')).toBe(
      true,
    );
  });

  it('never kills its owner while going round', () => {
    const f = fly(returning(ONE_WALL, [500, 450], [1000, 450]), 400);
    expect(player(f.state, 'a').alive).toBe(true);
  });

  it('every boomerang, from anywhere in the primitive arena, to every spawn point, gets home on its own (no failsafe)', () => {
    const walls = PRIMITIVE_ARENA.walls ?? [];
    let flights = 0;
    let slowest = 0;
    for (let x = 60; x < 1600; x += 110) {
      for (let y = 60; y < 900; y += 110) {
        const from = { x, y };
        if (walls.some((w) => gap(from, w) < RB + 1)) continue;
        for (const owner of PRIMITIVE_ARENA.spawns ?? []) {
          const f = fly(returning(PRIMITIVE_ARENA, [owner.x, owner.y], [x, y]), 400);
          flights += 1;
          expect(f.worstPenetration, `from ${x},${y} to ${owner.x},${owner.y}`).toBeLessThan(EPS);
          expect(f.caughtAfter, `from ${x},${y} to ${owner.x},${owner.y}`).toBeDefined();
          expect(f.events.map((e) => e.type)).not.toContain('RECALLED');
          slowest = Math.max(slowest, f.caughtAfter ?? 0);
        }
      }
    }
    expect(flights).toBeGreaterThan(500);
    expect(slowest * DT).toBeLessThan(C.returnWallSeconds); // nowhere near the failsafe
  });

  it('the same, at the longest accepted step', () => {
    const walls = PRIMITIVE_ARENA.walls ?? [];
    for (let x = 60; x < 1600; x += 220) {
      for (let y = 60; y < 900; y += 220) {
        if (walls.some((w) => gap({ x, y }, w) < RB + 1)) continue;
        for (const owner of PRIMITIVE_ARENA.spawns ?? []) {
          const f = fly(
            returning(PRIMITIVE_ARENA, [owner.x, owner.y], [x, y]),
            100,
            MAX_STEP_SECONDS,
          );
          expect(f.worstPenetration).toBeLessThan(EPS);
          expect(f.caughtAfter, `from ${x},${y} to ${owner.x},${owner.y}`).toBeDefined();
        }
      }
    }
  });
});

describe('when local steering cannot make progress', () => {
  /** A sealed room (a box with 120×120 inside) with the owner in it: no route exists at all. */
  const sealed = arenaWith([
    { x: 700, y: 300, width: 200, height: 40 },
    { x: 700, y: 460, width: 200, height: 40 },
    { x: 700, y: 340, width: 40, height: 120 },
    { x: 860, y: 340, width: 40, height: 120 },
  ]);

  it('it wall-follows for the configured time, never entering any wall, and is then recalled — a stated failsafe, not a teleport through geometry', () => {
    const f = fly(returning(sealed, [800, 400], [400, 400]), 400);
    expect(f.worstPenetration).toBeLessThan(EPS);
    expect(f.caughtAfter).toBeDefined();
    const types = f.events.map((e) => e.type);
    expect(types).toContain('RECALLED');
    expect(types).not.toContain('CAUGHT');
    // it took (about) the configured time of wall-following, no sooner
    expect((f.caughtAfter ?? 0) * DT).toBeGreaterThanOrEqual(C.returnWallSeconds - DT);
    expect((f.caughtAfter ?? 0) * DT).toBeLessThanOrEqual(C.returnWallSeconds + 2 * DT + 0.5);
    // and nothing in its path ever went through the box
    expect(f.path.every((p) => !inWall(p, sealed.walls ?? []))).toBe(true);
    expect(boom(f.state).state).toBe('HELD'); // the owner has their weapon back
  });

  it('the failsafe is deterministic: the same situation gives the same recall on the same step', () => {
    const one = fly(returning(sealed, [800, 400], [400, 400]), 400);
    const two = fly(returning(sealed, [800, 400], [400, 400]), 400);
    expect(two.caughtAfter).toBe(one.caughtAfter);
    expect(two.path).toEqual(one.path);
  });

  it('the failsafe clock only runs while the boomerang is actually wall-following', () => {
    // an open arena: a long chase after a fleeing owner never counts as "stuck"
    let s = returning(arenaWith([]), [100, 450], [1500, 450]);
    for (let i = 0; i < 200 && boom(s).state === 'RETURNING'; i += 1) {
      s = stepFu(s, input({ a: { move: { x: -1, y: 0 } } }), DT).state;
    }
    expect(boom(s).state).toBe('HELD');
  });

  it('a configuration without a positive wall-following limit is refused', () => {
    expect(() => createFuMatch([{ id: 'a', slot: 0 }], { returnWallSeconds: 0 })).toThrow(
      RangeError,
    );
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

  it('byte-identical replay with returning boomerangs bending round walls', () => {
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
    expect(one.events.filter((e) => e.type === 'CAUGHT').length).toBeGreaterThan(5);
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
        if (b.state === 'RETURNING') returningSeen += 1;
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
