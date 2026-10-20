import { FIXED_TIMESTEP_SECONDS as DT, MAX_STEP_SECONDS } from '@foomerang/game-core';
import { STRAIGHT } from './support/fixtures';
import { spawnsForRound } from '../src/rules/spawnPlan';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FU_CONFIG,
  PRIMITIVE_ARENA,
  createFuMatch as createCurvedMatch,
  spawnPosition,
  stepFu,
  type FuArena,
  type FuConfig,
  type FuEvent,
  type FuInputs,
  type FuState,
  type Rect,
  type Solid,
} from '../src/rules';
import { distanceToSolid } from '../src/rules/arena';

// These tests arrange their scenes with boomerangs flying straight (the owner's curved flight, 2026-10-19, is tested in
// curve.test.ts): every match here is created with STRAIGHT unless a test says otherwise.
const createFuMatch: typeof createCurvedMatch = (players, overrides = {}) =>
  createCurvedMatch(players, { ...STRAIGHT, ...overrides });

// These files run thousands of simulation steps; on a cold, loaded checkout a few took longer than vitest's
// 5 s default. This only gives them room; no assertion depends on it.
vi.setConfig({ testTimeout: 60_000 });

// ------------------------------------------------------------------------------------------
// Arena geometry is DATA owned by the rules: walls block living players and thrown boomerangs
// (and a slash's line of sight). Phaser only draws it.
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
/** Spawns out on the left and right edges, clear of every test wall below. */
const EDGE_SPAWNS = [
  { x: 60, y: 60 },
  { x: 1540, y: 840 },
  { x: 1540, y: 60 },
  { x: 60, y: 840 },
  { x: 60, y: 450 },
  { x: 1540, y: 450 },
];
const arenaWith = (walls: Rect[], extra: Partial<FuArena> = {}): FuArena => ({
  width: 1600,
  height: 900,
  walls,
  spawns: EDGE_SPAWNS,
  ...extra,
});
function match(
  ids: readonly string[],
  arena: FuArena,
  at: Record<string, [number, number]>,
  extra: object = {},
) {
  let s = createFuMatch(
    ids.map((id, slot) => ({ id, slot })),
    { arena, ...extra },
  );
  for (const id of ids) s = place(s, id, ...must(at[id], `position ${id}`));
  return s;
}
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
const face = (s: FuState, id: string, x: number, y: number): FuState => ({
  ...s,
  players: s.players.map((p) => (p.id === id ? { ...p, facing: { x, y } } : p)),
});
const kill = (s: FuState, id: string): FuState => ({
  ...s,
  players: s.players.map((p) => (p.id === id ? { ...p, alive: false } : p)),
});
const pos = (s: FuState, id: string) =>
  must(
    s.world.bodies.find((b) => b.id === id),
    `body ${id}`,
  ).position;
const boom = (s: FuState, id: string) =>
  must(
    s.boomerangs.find((b) => b.ownerId === id),
    `boomerang ${id}`,
  );
const player = (s: FuState, id: string) =>
  must(
    s.players.find((p) => p.id === id),
    `player ${id}`,
  );
const types = (events: readonly FuEvent[]) => events.map((e) => e.type);
function run(
  s: FuState,
  steps: number,
  inputs: FuInputs | ((i: number) => FuInputs) = NONE,
  dt = DT,
) {
  let current = s;
  const events: FuEvent[] = [];
  for (let i = 0; i < steps; i += 1) {
    const r = stepFu(current, typeof inputs === 'function' ? inputs(i) : inputs, dt);
    current = r.state;
    events.push(...r.events);
  }
  return { state: current, events };
}

/** Distance from a point to the nearest point of a rectangle (0 if inside). */
function gap(p: { x: number; y: number }, w: Solid): number {
  return distanceToSolid(p, w);
}
/** The deepest a living player is inside any wall, or any other living player (0 if none). */
function worstOverlap(s: FuState): number {
  const walls = s.config.arena.walls ?? [];
  let worst = 0;
  const living = s.players.filter((p) => p.alive);
  for (const p of living) {
    for (const w of walls) worst = Math.max(worst, R - gap(pos(s, p.id), w));
  }
  for (let i = 0; i < living.length; i += 1) {
    for (let j = i + 1; j < living.length; j += 1) {
      const a = pos(s, must(living[i], 'p').id);
      const b = pos(s, must(living[j], 'p').id);
      worst = Math.max(worst, 2 * R - Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return worst;
}
const inside = (s: FuState) =>
  s.world.bodies.every(
    (b) =>
      b.position.x >= R - EPS &&
      b.position.x <= s.config.arena.width - R + EPS &&
      b.position.y >= R - EPS &&
      b.position.y <= s.config.arena.height - R + EPS,
  );

const RIGHT = { x: 1, y: 0 };
const DOWN = { x: 0, y: 1 };
/** One slab, 100 wide and 300 tall, in the middle of the arena. */
const SLAB: Rect = { x: 700, y: 300, width: 100, height: 300 };
const ONE_WALL = arenaWith([SLAB]);

describe('the open arena is still Slice 1: no walls, so nothing here can change it', () => {
  it('the default configuration has no geometry', () => {
    expect(C.arena.walls ?? []).toEqual([]);
    expect(createFuMatch([{ id: 'a', slot: 0 }]).config.arena).toBe(C.arena);
  });
});

describe('players are solid against walls', () => {
  it('walking straight into a wall stops flush against it, and stays stopped under sustained input', () => {
    let s = match(['a', 'b'], ONE_WALL, { a: [500, 450], b: [1500, 100] });
    for (let i = 0; i < 200; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT } }), DT).state;
      expect(worstOverlap(s), `step ${i}`).toBeLessThan(EPS);
    }
    expect(pos(s, 'a').x).toBeCloseTo(SLAB.x - R, 6);
    expect(pos(s, 'a').y).toBeCloseTo(450, 9);
    const settled = pos(s, 'a');
    s = run(s, 60, input({ a: { move: RIGHT } })).state;
    expect(pos(s, 'a').x).toBeCloseTo(settled.x, 9); // no jitter, no creep
  });

  it('a diagonal push slides along the wall at full tangential speed instead of sticking', () => {
    let s = match(['a', 'b'], ONE_WALL, { a: [600, 350], b: [1500, 100] });
    s = run(s, 30, input({ a: { move: RIGHT } })).state; // up against the face
    const before = pos(s, 'a');
    s = run(s, 20, input({ a: { move: { x: 1, y: 1 } } })).state;
    const after = pos(s, 'a');
    expect(after.x).toBeCloseTo(before.x, 6); // not into the wall…
    const tangential = C.playerSpeed * DT * Math.SQRT1_2 * 20; // …but 0.707 of full speed along it
    expect(after.y - before.y).toBeCloseTo(tangential, 4);
  });

  it('rounds a convex corner smoothly: never inside, never snagged, and gets past', () => {
    let s = match(['a', 'b'], ONE_WALL, { a: [640, 250], b: [1500, 100] });
    let passed = false;
    for (let i = 0; i < 200; i += 1) {
      s = stepFu(s, input({ a: { move: { x: 1, y: 0.4 } } }), DT).state;
      expect(worstOverlap(s)).toBeLessThan(EPS);
      if (pos(s, 'a').x > SLAB.x + SLAB.width + R) passed = true;
    }
    expect(passed).toBe(true);
  });

  it('a concave corner (wall meeting the arena edge) holds a player in without trapping the thumb', () => {
    const corner = arenaWith([{ x: 0, y: 500, width: 400, height: 100 }]);
    let s = match(['a', 'b'], corner, { a: [300, 800], b: [1500, 100] });
    for (let i = 0; i < 300; i += 1) {
      s = stepFu(s, input({ a: { move: { x: -1, y: -1 } } }), DT).state; // into the corner
      expect(worstOverlap(s)).toBeLessThan(EPS);
      expect(inside(s)).toBe(true);
    }
    s = run(s, 60, input({ a: { move: { x: 1, y: 0 } } })).state; // and straight back out
    expect(pos(s, 'a').x).toBeGreaterThan(R + 100);
  });

  it('the arena boundary still holds, with walls present', () => {
    let s = match(['a', 'b'], ONE_WALL, { a: [100, 100], b: [1500, 800] });
    s = run(s, 120, input({ a: { move: { x: -1, y: -1 } } })).state;
    expect(pos(s, 'a')).toEqual({ x: R, y: R });
  });

  it('a corridor wide enough for one body can be walked through, end to end, without touching a wall', () => {
    const corridor = arenaWith([
      { x: 700, y: 200, width: 60, height: 300 },
      { x: 860, y: 200, width: 60, height: 300 }, // 100 wide between them
    ]);
    let s = match(['a', 'b'], corridor, { a: [810, 100], b: [1500, 800] });
    for (let i = 0; i < 120; i += 1) {
      s = stepFu(s, input({ a: { move: DOWN } }), DT).state;
      expect(worstOverlap(s)).toBeLessThan(EPS);
    }
    expect(pos(s, 'a').y).toBeGreaterThan(500 + R); // out the far end
    expect(pos(s, 'a').x).toBeCloseTo(810, 6);
  });

  it('a gap narrower than a player cannot be entered at all', () => {
    const slot = arenaWith([
      { x: 700, y: 200, width: 60, height: 300 },
      { x: 820, y: 200, width: 60, height: 300 }, // 60 wide: a body is 72
    ]);
    let s = match(['a', 'b'], slot, { a: [790, 100], b: [1500, 800] });
    s = run(s, 120, input({ a: { move: DOWN } })).state;
    // The round body wedges its nose into the gap (its centre can get to about 20 short of the wall
    // line, where it touches both corners) but can go no further.
    expect(pos(s, 'a').y).toBeLessThan(200 - 15);
    expect(pos(s, 'a').y).toBeCloseTo(200 - Math.sqrt(R * R - 30 * 30), 4);
    expect(worstOverlap(s)).toBeLessThan(EPS);
  });

  it('player + player + wall: a shove cannot push a player into a wall, and the pusher is held behind them', () => {
    let s = match(['a', 'b', 'c'], ONE_WALL, { a: [400, 450], b: [600, 450], c: [1500, 100] });
    for (let i = 0; i < 250; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT } }), DT).state;
      expect(worstOverlap(s), `step ${i}`).toBeLessThan(1e-4);
    }
    expect(pos(s, 'b').x).toBeCloseTo(SLAB.x - R, 3);
    expect(pos(s, 'a').x).toBeCloseTo(SLAB.x - R - 2 * R, 3);
  });

  it('several players converging on a chokepoint queue up: nobody overlaps, nobody is pushed through the wall', () => {
    const gate = arenaWith([
      { x: 700, y: 0, width: 100, height: 400 },
      { x: 700, y: 520, width: 100, height: 380 }, // a 120 gap at y 400–520: one body wide, not two
    ]);
    let s = match(['a', 'b', 'c', 'd'], gate, {
      a: [500, 380],
      b: [500, 460],
      c: [440, 420],
      d: [380, 440],
    });
    for (let i = 0; i < 400; i += 1) {
      s = stepFu(
        s,
        input({
          a: { move: RIGHT },
          b: { move: RIGHT },
          c: { move: RIGHT },
          d: { move: RIGHT },
        }),
        DT,
      ).state;
      expect(worstOverlap(s), `step ${i}`).toBeLessThan(1e-4);
      expect(inside(s)).toBe(true);
    }
    const through = s.players.filter((p) => pos(s, p.id).x > 800 + R - EPS).length;
    expect(through).toBeGreaterThanOrEqual(1); // it is a chokepoint, not a wall
  });

  it.each([DT, 3 * DT, MAX_STEP_SECONDS])(
    'no tunnelling through the thinnest allowed wall at any accepted dt (dt = %s)',
    (dt) => {
      const thin = arenaWith([{ x: 700, y: 200, width: R, height: 500 }]); // exactly the minimum thickness
      let s = match(['a', 'b'], thin, { a: [500, 450], b: [1500, 100] });
      for (let i = 0; i < 80; i += 1) {
        s = stepFu(s, input({ a: { move: RIGHT } }), dt).state;
        expect(pos(s, 'a').x).toBeLessThanOrEqual(700 - R + EPS);
      }
    },
  );

  it.each([
    ['left', 710, 450, SLAB.x - R, 450],
    ['right', 790, 450, SLAB.x + SLAB.width + R, 450],
    ['top', 750, 310, 750, SLAB.y - R],
    ['bottom', 750, 590, 750, SLAB.y + SLAB.height + R],
  ])(
    'a player found inside a wall is put out by the nearest face (%s)',
    (_face, x, y, expectedX, expectedY) => {
      let s = match(['a', 'b'], ONE_WALL, { a: [x, y], b: [1500, 100] });
      s = stepFu(s, NONE, DT).state;
      expect(pos(s, 'a').x).toBeCloseTo(expectedX, 6);
      expect(pos(s, 'a').y).toBeCloseTo(expectedY, 6);
    },
  );

  it('a lone player (nobody to collide with) is still stopped by walls', () => {
    let s = match(['a'], ONE_WALL, { a: [500, 450] });
    s = run(s, 120, input({ a: { move: RIGHT } })).state;
    expect(pos(s, 'a').x).toBeCloseTo(SLAB.x - R, 6);
  });

  it('dead players are not solid against anything: a corpse inside a wall is left alone', () => {
    let s = match(['a', 'b', 'c'], ONE_WALL, { a: [500, 450], b: [750, 450], c: [1500, 100] });
    s = kill(s, 'b');
    s = run(s, 10).state;
    expect(pos(s, 'b')).toEqual({ x: 750, y: 450 });
  });

  it('living players keep colliding with each other exactly as in Slice 1, with walls in the arena', () => {
    let s = match(['a', 'b'], ONE_WALL, { a: [200, 100], b: [380, 100] });
    for (let i = 0; i < 120; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT }, b: { move: { x: -1, y: 0 } } }), DT).state;
    }
    const a = pos(s, 'a');
    const b = pos(s, 'b');
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(2 * R, 6);
    expect((a.x + b.x) / 2).toBeCloseTo(290, 6);
  });
});

describe('a thrown boomerang that may not bounce stops at a wall and turns back', () => {
  // (a throw bounces off walls up to maxRicochets times, ricochet.test.ts; the impact after its last allowed bounce stops it
  // and sends it home: these tests allow none, so the first impact is that one)
  /** Alice at x=400 facing right, the slab ahead at x = 700. */
  const aimed = () =>
    face(
      match(['a', 'b'], ONE_WALL, { a: [400, 450], b: [1500, 100] }, { maxRicochets: 0 }),
      'a',
      1,
      0,
    );

  it('THROWN → RETURNING on impact, stopped flush against the wall, not inside it', () => {
    let s = stepFu(aimed(), input({ a: { throw: true } }), DT).state;
    let hit: FuState | undefined;
    for (let i = 0; i < 60 && hit === undefined; i += 1) {
      s = stepFu(s, NONE, DT).state;
      expect(gap(boom(s, 'a').position, SLAB), `step ${i}`).toBeGreaterThanOrEqual(RB - EPS);
      if (boom(s, 'a').state === 'RETURNING') hit = s;
    }
    const b = boom(must(hit, 'impact'), 'a');
    // heading home it keeps a heading (the curve's return, 2026-10-19): off a wall, straight back towards its thrower
    expect(b.direction.x).toBeCloseTo(-1, 9);
    expect(b.direction.y).toBeCloseTo(0, 9);
    expect(b.travelled).toBe(0);
    expect(b.position.x).toBeGreaterThan(SLAB.x - RB - 1e-3); // as close as it can get…
    expect(b.position.x).toBeLessThanOrEqual(SLAB.x - RB + EPS); // …without touching
    expect(b.position.y).toBeCloseTo(450, 9);
  });

  it('turns on the very step it meets the wall (it does not sit pushing against it until its range runs out)', () => {
    let s = stepFu(aimed(), input({ a: { throw: true } }), DT).state;
    let previousX = boom(s, 'a').position.x;
    for (let i = 0; i < 60; i += 1) {
      s = stepFu(s, NONE, DT).state;
      const b = boom(s, 'a');
      if (b.state === 'THROWN') {
        previousX = b.position.x;
        continue;
      }
      // the first step that is no longer THROWN is the impact; it never stopped short and waited
      expect(b.state).toBe('RETURNING');
      expect(previousX).toBeLessThan(SLAB.x - RB - 1e-3); // it had been flying freely, not already stopped at the wall
      expect(b.position.x).toBeGreaterThan(SLAB.x - RB - 1e-3);
      return;
    }
    throw new Error('never reached the wall');
  });

  it('does not bounce or ricochet: it heads straight home along the way it came, and is caught', () => {
    let s = stepFu(aimed(), input({ a: { throw: true } }), DT).state;
    while (boom(s, 'a').state === 'THROWN') s = stepFu(s, NONE, DT).state;
    let last = Math.hypot(
      boom(s, 'a').position.x - pos(s, 'a').x,
      boom(s, 'a').position.y - pos(s, 'a').y,
    );
    for (let i = 0; i < 60 && boom(s, 'a').state === 'RETURNING'; i += 1) {
      s = stepFu(s, NONE, DT).state;
      const b = boom(s, 'a');
      const d = Math.hypot(b.position.x - pos(s, 'a').x, b.position.y - pos(s, 'a').y);
      expect(d).toBeLessThanOrEqual(last + EPS); // only ever closer
      expect(b.position.y).toBeCloseTo(450, 6); // no sideways deflection
      last = d;
    }
    expect(boom(s, 'a').state).toBe('HELD');
  });

  it('never kills its owner, at the wall or on the way back', () => {
    const { state } = run(stepFu(aimed(), input({ a: { throw: true } }), DT).state, 90);
    expect(player(state, 'a').alive).toBe(true);
  });

  it('a throw made with the player pressed against the wall never puts the boomerang inside it', () => {
    let s = match(
      ['a', 'b'],
      ONE_WALL,
      { a: [SLAB.x - R, 450], b: [1500, 100] },
      { maxRicochets: 0 },
    );
    s = face(s, 'a', 1, 0);
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    expect(boom(s, 'a').state).toBe('THROWN');
    for (let i = 0; i < 60; i += 1) {
      expect(gap(boom(s, 'a').position, SLAB), `step ${i}`).toBeGreaterThanOrEqual(RB - EPS);
      s = stepFu(s, NONE, DT).state;
    }
    expect(boom(s, 'a').state).toBe('HELD');
    expect(player(s, 'a').alive).toBe(true);
  });

  it('cannot tunnel at ANY start offset, at the longest accepted step (the end point alone would let it through)', () => {
    const thin = arenaWith([{ x: 700, y: 200, width: R, height: 500 }]);
    for (let x = 400; x <= 460; x += 3) {
      let s = face(
        match(['a', 'b'], thin, { a: [x, 450], b: [1500, 100] }, { maxRicochets: 0 }),
        'a',
        1,
        0,
      );
      s = stepFu(s, input({ a: { throw: true } }), MAX_STEP_SECONDS).state;
      for (let i = 0; i < 12; i += 1) {
        s = stepFu(s, NONE, MAX_STEP_SECONDS).state;
        expect(boom(s, 'a').position.x, `start ${x}, step ${i}`).toBeLessThanOrEqual(
          700 - RB + EPS,
        );
        if (boom(s, 'a').state === 'RETURNING') break;
      }
    }
  });

  it.each([DT, 3 * DT, MAX_STEP_SECONDS])(
    'cannot tunnel through the thinnest wall, however long the step (dt = %s)',
    (dt) => {
      const thin = arenaWith([{ x: 700, y: 200, width: R, height: 500 }]);
      let s = face(match(['a', 'b'], thin, { a: [400, 450], b: [1500, 100] }), 'a', 1, 0);
      s = stepFu(s, input({ a: { throw: true } }), dt).state;
      for (let i = 0; i < 40; i += 1) {
        s = stepFu(s, NONE, dt).state;
        expect(boom(s, 'a').position.x).toBeLessThanOrEqual(700 - RB + EPS);
        if (boom(s, 'a').state === 'HELD') break;
      }
    },
  );

  it('is blocked by the wall’s corner at exactly its own radius: 13 away is a hit, 15 away passes', () => {
    // flying DOWN a line 10 to the left of the slab's face: it clips the top-left corner
    const clip = (offset: number) => {
      let s = match(
        ['a', 'b'],
        ONE_WALL,
        { a: [SLAB.x - offset, 100], b: [1500, 800] },
        { maxRicochets: 0 },
      );
      s = face(s, 'a', 0, 1);
      s = stepFu(s, input({ a: { throw: true } }), DT).state;
      for (let i = 0; i < 40 && boom(s, 'a').state === 'THROWN'; i += 1)
        s = stepFu(s, NONE, DT).state;
      return boom(s, 'a');
    };
    const grazing = clip(10); // closer than the radius: blocked just before the corner
    expect(grazing.state).toBe('RETURNING');
    expect(grazing.position.y).toBeCloseTo(SLAB.y - Math.sqrt(RB * RB - 100), 1);
    const clear = clip(RB + 1); // farther than the radius: slides past the wall
    expect(clear.position.y).toBeGreaterThan(SLAB.y + SLAB.height);
  });

  it('cannot kill through a wall: a player right behind it is safe from a boomerang that stopped at it', () => {
    let s = aimed();
    s = place(s, 'b', SLAB.x + SLAB.width + R + 1, 450);
    const { state, events } = run(stepFu(s, input({ a: { throw: true } }), DT).state, 60);
    expect(types(events)).not.toContain('HIT');
    expect(player(state, 'b').alive).toBe(true);
  });

  it('a boomerang coming back is bound by walls too (Slice 2 decision, reversed after human play): it never enters one, and goes round', () => {
    // The first version of this rule let a returning boomerang fly straight home through cover. Playtesting
    // found that unfair, so it is now constrained exactly like a thrown one; see homing.test.ts for the steering.
    let s = match(['a', 'b'], ONE_WALL, { a: [400, 450], b: [1500, 100] });
    s = patch(s, 'a', {
      state: 'RETURNING',
      position: { x: 1000, y: 450 }, // the far side of the slab from its owner
      direction: { x: 0, y: 0 },
      travelled: 0,
    });
    for (let i = 0; i < 200 && boom(s, 'a').state === 'RETURNING'; i += 1) {
      s = stepFu(s, NONE, DT).state;
      expect(gap(boom(s, 'a').position, SLAB), `step ${i}`).toBeGreaterThanOrEqual(RB - EPS);
    }
    expect(boom(s, 'a').state).toBe('HELD'); // and it still got home
  });
});

function patch(s: FuState, ownerId: string, p: object): FuState {
  return {
    ...s,
    boomerangs: s.boomerangs.map((b) => (b.ownerId === ownerId ? { ...b, ...p } : b)),
  };
}

describe('a slash needs a clear line to its victim', () => {
  it('cannot cut through a wall that stands between the two bodies', () => {
    const post: Rect = { x: 640, y: 380, width: 40, height: 140 }; // 40 thick: bodies 112 apart fit across it
    let s = match(['a', 'b'], arenaWith([post]), { a: [600, 450], b: [720, 450] });
    s = face(s, 'a', 1, 0);
    const { state, events } = run(s, 1, input({ a: { slash: true } }));
    expect(types(events)).toContain('SLASHED');
    expect(types(events)).not.toContain('HIT');
    expect(player(state, 'b').alive).toBe(true);
  });

  it('a diagonal line that passes just outside a wall’s corner is clear', () => {
    const post: Rect = { x: 650, y: 560, width: 40, height: 40 };
    let s = match(['a', 'b'], arenaWith([post]), { a: [600, 600], b: [670, 670] });
    s = face(s, 'a', Math.SQRT1_2, Math.SQRT1_2);
    // the line from (600,600) to (670,670) passes (650,650): 10 below the wall's bottom edge
    expect(player(run(s, 1, input({ a: { slash: true } })).state, 'b').alive).toBe(false);
    // …and one that really crosses the wall is blocked
    let t = match(['a', 'b'], arenaWith([{ x: 640, y: 640, width: 40, height: 40 }]), {
      a: [600, 600],
      b: [670, 670],
    });
    t = face(t, 'a', Math.SQRT1_2, Math.SQRT1_2);
    expect(player(run(t, 1, input({ a: { slash: true } })).state, 'b').alive).toBe(true);
  });

  it('hits the same victim when the line is clear (just around the wall)', () => {
    const post: Rect = { x: 640, y: 380, width: 40, height: 140 };
    let s = match(['a', 'b'], arenaWith([post]), { a: [600, 560], b: [700, 560] });
    s = face(s, 'a', 1, 0);
    expect(player(run(s, 1, input({ a: { slash: true } })).state, 'b').alive).toBe(false);
  });

  it('a line that only grazes the wall’s edge is blocked (closed geometry), and one that misses it is not', () => {
    const post: Rect = { x: 640, y: 400, width: 40, height: 100 };
    const attempt = (y: number) => {
      let s = match(['a', 'b'], arenaWith([post]), { a: [600, y], b: [720, y] });
      s = face(s, 'a', 1, 0);
      return player(run(s, 1, input({ a: { slash: true } })).state, 'b').alive;
    };
    expect(attempt(400)).toBe(true); // along the top edge: blocked… (alive = survived)
    expect(attempt(399)).toBe(false); // …one unit above: clear, so the slash lands
  });
});

describe('arena data is validated', () => {
  const bad: [string, Partial<FuArena>][] = [
    ['a wall with no width', { walls: [{ x: 100, y: 100, width: 0, height: 100 }] }],
    ['a negative size', { walls: [{ x: 100, y: 100, width: -50, height: 100 }] }],
    [
      'a wall thinner than a player radius',
      { walls: [{ x: 100, y: 100, width: R - 1, height: 300 }] },
    ],
    ['a wall outside the arena', { walls: [{ x: 1550, y: 100, width: 100, height: 100 }] }],
    ['a non-finite wall', { walls: [{ x: Number.NaN, y: 100, width: 100, height: 100 }] }],
    ['a wall that is not an object', { walls: [null as unknown as Rect] }],
    [
      'a spawn inside a wall',
      {
        walls: [{ x: 90, y: 90, width: 100, height: 100 }],
        spawns: spawnsAt([
          [110, 110],
          [1490, 790],
          [1490, 110],
          [110, 790],
          [800, 75],
          [800, 825],
        ]),
      },
    ],
    [
      'the wrong number of spawns',
      {
        spawns: spawnsAt([
          [110, 110],
          [1490, 790],
        ]),
      },
    ],
    [
      'spawns that overlap each other',
      {
        spawns: spawnsAt([
          [110, 110],
          [120, 110],
          [1490, 110],
          [110, 790],
          [800, 75],
          [800, 825],
        ]),
      },
    ],
    [
      'a spawn outside the arena',
      {
        spawns: spawnsAt([
          [10, 10],
          [1490, 790],
          [1490, 110],
          [110, 790],
          [800, 75],
          [800, 825],
        ]),
      },
    ],
  ];
  function spawnsAt(points: [number, number][]) {
    return points.map(([x, y]) => ({ x, y }));
  }
  it.each(bad)('rejects %s as a programming error', (_name, extra) => {
    const config: Partial<FuConfig> = { arena: { width: 1600, height: 900, ...extra } };
    expect(() => createFuMatch([{ id: 'a', slot: 0 }], config)).toThrow(RangeError);
  });

  it('rejects walls given as something other than a list', () => {
    expect(() =>
      createFuMatch([{ id: 'a', slot: 0 }], {
        ...STRAIGHT,
        arena: { width: 1600, height: 900, walls: 'big' as unknown as Rect[] },
      }),
    ).toThrow(RangeError);
  });
});

describe('the primitive arena', () => {
  const A = PRIMITIVE_ARENA;
  const walls = A.walls ?? [];
  const spawns = A.spawns ?? [];

  it('is the same size as the Slice 1 arena, and a valid configuration', () => {
    expect([A.width, A.height]).toEqual([C.arena.width, C.arena.height]);
    expect(() => createFuMatch([{ id: 'a', slot: 0 }], { ...STRAIGHT, arena: A })).not.toThrow();
  });

  it('has six spawn points: inside, clear of every wall, and at least a body apart', () => {
    expect(spawns).toHaveLength(6);
    spawns.forEach((p, i) => {
      expect(p.x).toBeGreaterThanOrEqual(R);
      expect(p.x).toBeLessThanOrEqual(A.width - R);
      expect(p.y).toBeGreaterThanOrEqual(R);
      expect(p.y).toBeLessThanOrEqual(A.height - R);
      for (const w of walls) expect(gap(p, w), `spawn ${i}`).toBeGreaterThanOrEqual(R);
      spawns.slice(i + 1).forEach((q) => {
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(2 * R + 200);
      });
      expect(spawnPosition(i, A)).toEqual(p);
    });
  });

  it('is symmetric left–right and top–bottom, so no seat is better than another', () => {
    const key = (w: Rect) => `${w.x},${w.y},${w.width},${w.height}`;
    const set = new Set(walls.map(key));
    for (const w of walls) {
      expect(set.has(key({ ...w, x: A.width - w.x - w.width }))).toBe(true);
      expect(set.has(key({ ...w, y: A.height - w.y - w.height }))).toBe(true);
    }
  });

  it('has solid cover, a narrow corridor, a chokepoint and routes around the middle', () => {
    expect(walls.length).toBeGreaterThanOrEqual(8);
    // a corridor: two walls with a gap that fits one body (72) but not two (144)
    const corridors = walls.flatMap((a) =>
      walls.flatMap((b) => {
        const g = b.x - (a.x + a.width);
        const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        return g >= 2 * R && g < 4 * R && overlapY >= 250 ? [g] : [];
      }),
    );
    expect(corridors.length).toBeGreaterThanOrEqual(1);
    // a chokepoint: two walls in a row with a gap of one body between them
    const chokepoints = walls.flatMap((a) =>
      walls.flatMap((b) => {
        const g = b.x - (a.x + a.width);
        const sameBand = a.y === b.y && a.height === b.height && a.width >= 200;
        return sameBand && g >= 2 * R && g < 4 * R ? [g] : [];
      }),
    );
    expect(chokepoints.length).toBeGreaterThanOrEqual(1);
  });

  it('is connected: every spawn can walk to every other (grid search at body size)', () => {
    const cell = 20;
    const cols = Math.floor(A.width / cell);
    const rows = Math.floor(A.height / cell);
    const free = (cx: number, cy: number) => {
      const p = { x: cx * cell + cell / 2, y: cy * cell + cell / 2 };
      return (
        p.x >= R &&
        p.x <= A.width - R &&
        p.y >= R &&
        p.y <= A.height - R &&
        walls.every((w) => gap(p, w) >= R)
      );
    };
    const start = must(spawns[0], 'spawn');
    const seen = new Set<string>();
    const queue: [number, number][] = [[Math.floor(start.x / cell), Math.floor(start.y / cell)]];
    while (queue.length > 0) {
      const [cx, cy] = must(queue.pop(), 'cell');
      const k = `${cx},${cy}`;
      if (seen.has(k) || cx < 0 || cy < 0 || cx >= cols || cy >= rows || !free(cx, cy)) continue;
      seen.add(k);
      queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    for (const p of spawns)
      expect(seen.has(`${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`)).toBe(true);
  });

  it('can really be walked through its narrow corridor and its chokepoint by a player', () => {
    // left corridor: x 250–350, y 300–600; entered from the top
    let s = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 1 },
      ],
      { arena: A },
    );
    s = place(s, 'a', 300, 200);
    for (let i = 0; i < 90; i += 1) {
      s = stepFu(s, input({ a: { move: DOWN } }), DT).state;
      expect(worstOverlap(s)).toBeLessThan(EPS);
    }
    expect(pos(s, 'a').y).toBeGreaterThan(600 + R);
    // top gate: the gap at x 740–860, y 150–200, entered from the top lane
    s = place(s, 'a', 800, 100);
    for (let i = 0; i < 60; i += 1) s = stepFu(s, input({ a: { move: DOWN } }), DT).state;
    expect(pos(s, 'a').y).toBeGreaterThan(200 + R);
  });

  it('round 1 starts at the arena’s own spawn points; round 2 at the planned fresh places (owner, 2026-10-19), with nobody overlapping', () => {
    let s = createFuMatch(
      ['a', 'b', 'c'].map((id, slot) => ({ id, slot })),
      { arena: A },
    );
    for (const p of s.players) expect(pos(s, p.id)).toEqual(spawnPosition(p.slot, A));
    s = place(place(s, 'a', 800, 450), 'b', 805, 455);
    s = { ...s, phase: 'ROUND_OVER', roundOver: { winnerId: 'a', resetInSeconds: DT } };
    s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    const planned = spawnsForRound(s.players, s.config, 2);
    for (const p of s.players) expect(pos(s, p.id)).toEqual(planned.get(p.id));
    expect(worstOverlap(s)).toBeLessThan(EPS);
  });
});

describe('determinism with geometry', () => {
  const script = (i: number): FuInputs =>
    input({
      a: {
        move: { x: Math.sin(i / 13), y: Math.cos(i / 29) },
        throw: i % 37 === 0,
        slash: i % 11 === 0,
      },
      b: {
        move: { x: Math.cos(i / 19), y: Math.sin(i / 7) },
        throw: i % 53 === 0,
        slash: i % 17 === 0,
      },
      c: { move: { x: -Math.sin(i / 11), y: Math.cos(i / 5) }, slash: i % 23 === 0 },
    });
  const fresh = () =>
    createFuMatch(
      ['a', 'b', 'c'].map((id, slot) => ({ id, slot })),
      { arena: PRIMITIVE_ARENA },
    );

  it('the same inputs give byte-identical states and events', () => {
    const one = run(fresh(), 3000, script);
    const two = run(fresh(), 3000, script);
    expect(JSON.stringify(two.state)).toBe(JSON.stringify(one.state));
    expect(two.events).toEqual(one.events);
    expect(one.events.some((e) => e.type === 'THROWN')).toBe(true);
  });

  it('never mutates the state or the arena it is given', () => {
    const s = fresh();
    const before = JSON.stringify(s);
    run(s, 200, script);
    expect(JSON.stringify(s)).toBe(before);
    expect(Object.isFrozen(PRIMITIVE_ARENA)).toBe(true);
    expect(Object.isFrozen(PRIMITIVE_ARENA.walls)).toBe(true);
  });

  it('fuzz: six players on the real arena for thousands of steps — nobody enters a wall or another player, nothing leaves the arena, every boomerang stays out of the walls', () => {
    let seed = 20260506;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let s = createFuMatch(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id, slot) => ({ id, slot })),
      { arena: PRIMITIVE_ARENA },
    );
    const walls = PRIMITIVE_ARENA.walls ?? [];
    for (let i = 0; i < 8000; i += 1) {
      const frame: FuInputs = new Map(
        s.players.map((p) => [
          p.id,
          {
            move: { x: random() * 2 - 1, y: random() * 2 - 1 },
            throw: random() < 0.04,
            slash: random() < 0.03,
          },
        ]),
      );
      s = stepFu(s, frame, i % 7 === 0 ? 3 * DT : DT).state;
      expect(worstOverlap(s), `step ${i}`).toBeLessThan(1e-4);
      expect(inside(s)).toBe(true);
      for (const b of s.boomerangs) {
        if (b.state === 'THROWN')
          for (const w of walls) expect(gap(b.position, w)).toBeGreaterThanOrEqual(RB - 1e-6);
      }
      if (s.phase === 'ROUND_OVER')
        s = { ...s, roundOver: { winnerId: undefined, resetInSeconds: DT } };
    }
  }, 60_000);
});
