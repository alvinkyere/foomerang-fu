import { FIXED_TIMESTEP_SECONDS as DT } from '@foomerang/game-core';
import { describe, expect, it } from 'vitest';
import {
  BOOMERANG_TRANSITIONS,
  DEFAULT_FU_CONFIG,
  canTransition,
  createFuMatch,
  spawnPosition,
  stepFu,
  type FuEvent,
  type FuInputs,
  type FuState,
} from '../src/rules';

// ------------------------------------------------------------------------------------------
// Helpers. States are plain data, so tests may arrange a situation by copying and patching one.
// ------------------------------------------------------------------------------------------

const C = DEFAULT_FU_CONFIG;
const NONE: FuInputs = new Map();
const input = (
  entries: Record<string, { move?: { x: number; y: number }; throw?: boolean }>,
): FuInputs => new Map(Object.entries(entries));

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
const face = (state: FuState, id: string, x: number, y: number): FuState => ({
  ...state,
  players: state.players.map((p) => (p.id === id ? { ...p, facing: { x, y } } : p)),
});
const kill = (state: FuState, id: string): FuState => ({
  ...state,
  players: state.players.map((p) => (p.id === id ? { ...p, alive: false } : p)),
});
const patchBoomerang = (state: FuState, ownerId: string, patch: object): FuState => ({
  ...state,
  boomerangs: state.boomerangs.map((b) => (b.ownerId === ownerId ? { ...b, ...patch } : b)),
});
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`test setup: no ${what}`);
  return value;
}
const body = (s: FuState, id: string) =>
  must(
    s.world.bodies.find((b) => b.id === id),
    `body ${id}`,
  );
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

/** Alice at the left facing right, Bob at the right facing left, a whole arena between them. */
function duel(): FuState {
  let s = createFuMatch([
    { id: 'a', slot: 0 },
    { id: 'b', slot: 3 },
  ]);
  s = place(s, 'a', 200, 450);
  s = place(s, 'b', 1400, 450);
  s = face(s, 'a', 1, 0);
  return face(s, 'b', -1, 0);
}

function run(state: FuState, steps: number, inputs: FuInputs | ((i: number) => FuInputs) = NONE) {
  let current = state;
  const events: FuEvent[] = [];
  for (let i = 0; i < steps; i += 1) {
    const result = stepFu(current, typeof inputs === 'function' ? inputs(i) : inputs, DT);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}
const types = (events: readonly FuEvent[]) => events.map((e) => e.type);

// ------------------------------------------------------------------------------------------

describe('creating a match', () => {
  it('starts round 1 with every player alive at their slot’s spawn point, facing the middle', () => {
    const s = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 3 },
    ]);
    expect(s.round).toBe(1);
    expect(s.phase).toBe('PLAYING');
    expect(s.roundOver).toBeUndefined();
    expect(s.players.map((p) => [p.id, p.alive])).toEqual([
      ['a', true],
      ['b', true],
    ]);
    expect(s.world.bodies.map((b) => [b.id, b.position])).toEqual([
      ['a', spawnPosition(0, C.arena)],
      ['b', spawnPosition(3, C.arena)],
    ]);
    for (const p of s.players) {
      const at = body(s, p.id).position;
      const toCentre = { x: C.arena.width / 2 - at.x, y: C.arena.height / 2 - at.y };
      const length = Math.hypot(toCentre.x, toCentre.y);
      expect(p.facing.x).toBeCloseTo(toCentre.x / length, 12);
      expect(p.facing.y).toBeCloseTo(toCentre.y / length, 12);
    }
  });

  it('gives everyone exactly one boomerang, HELD, at its owner', () => {
    const s = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
    ]);
    expect(s.boomerangs.map((b) => [b.ownerId, b.state, b.position])).toEqual([
      ['a', 'HELD', body(s, 'a').position],
      ['b', 'HELD', body(s, 'b').position],
    ]);
  });

  it('spawn points for the six slots are distinct and inside the arena', () => {
    const points = [0, 1, 2, 3, 4, 5].map((slot) => spawnPosition(slot, C.arena));
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBe(6);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(C.playerRadius);
      expect(p.x).toBeLessThanOrEqual(C.arena.width - C.playerRadius);
      expect(p.y).toBeGreaterThanOrEqual(C.playerRadius);
      expect(p.y).toBeLessThanOrEqual(C.arena.height - C.playerRadius);
    }
  });

  it.each([
    ['no players', []],
    [
      'a duplicate id',
      [
        { id: 'a', slot: 0 },
        { id: 'a', slot: 1 },
      ],
    ],
    [
      'a duplicate slot',
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 0 },
      ],
    ],
    ['a slot beyond six', [{ id: 'a', slot: 6 }]],
    ['a negative slot', [{ id: 'a', slot: -1 }]],
    ['a fractional slot', [{ id: 'a', slot: 0.5 }]],
    ['an empty id', [{ id: '', slot: 0 }]],
  ])('rejects %s (a programming error, not a game state)', (_name, players) => {
    expect(() => createFuMatch(players)).toThrow(RangeError);
  });

  it.each([
    ['a non-positive speed', { throwSpeed: 0 }],
    ['a non-finite range', { throwRange: Number.POSITIVE_INFINITY }],
    ['a negative radius', { boomerangRadius: -1 }],
    ['a zero round-end interval', { roundEndSeconds: 0 }],
    ['an arena too small for a player', { arena: { width: 50, height: 50 } }],
    ['a boomerang fast enough to jump over a player in one step', { throwSpeed: 100_000 }],
  ])('rejects a configuration with %s', (_name, overrides) => {
    expect(() => createFuMatch([{ id: 'a', slot: 0 }], overrides)).toThrow(RangeError);
  });
});

describe('movement and facing (game-core does the moving)', () => {
  it('moves a player by speed × dt along the input', () => {
    const s = duel();
    const { state } = stepFu(s, input({ a: { move: { x: 1, y: 0 } } }), DT);
    expect(body(state, 'a').position.x).toBeCloseTo(200 + C.playerSpeed * DT, 9);
    expect(body(state, 'a').position.y).toBe(450);
    expect(body(state, 'b').position).toEqual(body(s, 'b').position);
  });

  it('a player with no input does not move', () => {
    const s = duel();
    expect(stepFu(s, NONE, DT).state.world.bodies).toEqual(s.world.bodies);
  });

  it('facing follows the last MEANINGFUL movement direction', () => {
    let s = duel();
    s = stepFu(s, input({ a: { move: { x: 0, y: 1 } } }), DT).state; // thumb down
    expect(player(s, 'a').facing).toEqual({ x: 0, y: 1 });
    s = stepFu(s, input({ a: { move: { x: -1, y: -1 } } }), DT).state; // up-left, normalised
    expect(player(s, 'a').facing.x).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(player(s, 'a').facing.y).toBeCloseTo(-Math.SQRT1_2, 12);
  });

  it('a thumb inside the dead zone, or released, keeps the previous facing', () => {
    let s = stepFu(duel(), input({ a: { move: { x: 0, y: 1 } } }), DT).state;
    s = stepFu(s, input({ a: { move: { x: 0.05, y: -0.05 } } }), DT).state; // inside the dead zone
    expect(player(s, 'a').facing).toEqual({ x: 0, y: 1 });
    s = stepFu(s, input({ a: { move: { x: 0, y: 0 } } }), DT).state;
    expect(player(s, 'a').facing).toEqual({ x: 0, y: 1 });
    s = stepFu(s, NONE, DT).state;
    expect(player(s, 'a').facing).toEqual({ x: 0, y: 1 });
  });

  it('a dead player neither moves nor turns', () => {
    const s = kill(duel(), 'a');
    const next = stepFu(s, input({ a: { move: { x: 0, y: 1 } } }), DT).state;
    expect(body(next, 'a').position).toEqual(body(s, 'a').position);
    expect(player(next, 'a').facing).toEqual({ x: 1, y: 0 });
  });

  it('stays inside the arena', () => {
    let s = duel();
    s = run(s, 600, input({ a: { move: { x: -1, y: -1 } } })).state;
    expect(body(s, 'a').position).toEqual({ x: C.playerRadius, y: C.playerRadius });
  });
});

describe('throwing: HELD → THROWN', () => {
  it('a throw request from HELD launches the boomerang in the facing direction, just outside its owner', () => {
    const { state, events } = stepFu(duel(), input({ a: { throw: true } }), DT);
    const b = boom(state, 'a');
    expect(b.state).toBe('THROWN');
    expect(b.direction).toEqual({ x: 1, y: 0 });
    expect(b.travelled).toBe(0);
    expect(b.position).toEqual({ x: 200 + C.playerRadius + C.boomerangRadius + 1, y: 450 });
    expect(events).toEqual([
      { type: 'THROWN', playerId: 'a', position: b.position, direction: { x: 1, y: 0 } },
    ]);
  });

  it('turning and throwing in the same step throws the way the thumb now points', () => {
    const { state } = stepFu(duel(), input({ a: { move: { x: 0, y: 1 }, throw: true } }), DT);
    expect(boom(state, 'a').direction).toEqual({ x: 0, y: 1 });
  });

  it('a player who has never moved throws toward the middle of the arena (deterministic fallback)', () => {
    const s = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 3 },
    ]);
    const { state } = stepFu(s, input({ a: { throw: true } }), DT);
    expect(boom(state, 'a').direction).toEqual(player(s, 'a').facing);
    expect(boom(state, 'a').direction.y).toBeGreaterThan(0); // slot 0 spawns at the top, so "inward" is down
  });

  it('is deterministic: the same state and inputs always give the same throw', () => {
    const a = stepFu(duel(), input({ a: { throw: true } }), DT);
    const b = stepFu(duel(), input({ a: { throw: true } }), DT);
    expect(a).toEqual(b);
  });

  it('a second throw request while the boomerang is away does nothing: one boomerang per player', () => {
    const s = stepFu(duel(), input({ a: { throw: true } }), DT).state;
    const before = boom(s, 'a');
    const { state, events } = stepFu(s, input({ a: { throw: true } }), DT);
    expect(state.boomerangs).toHaveLength(2);
    expect(boom(state, 'a').travelled).toBeGreaterThan(before.travelled); // it simply carried on flying
    expect(types(events)).not.toContain('THROWN');
  });

  it('a held-down throw (the same request every step) never throws twice without a catch in between', () => {
    const { events } = run(duel(), 400, input({ a: { throw: true } }));
    let inFlight = false;
    let throws = 0;
    for (const e of events) {
      if (e.type === 'THROWN') {
        expect(inFlight).toBe(false);
        inFlight = true;
        throws += 1;
      }
      if (e.type === 'CAUGHT') inFlight = false;
    }
    expect(throws).toBeGreaterThan(1); // it does throw again once the boomerang is back in hand
  });

  it.each([
    ['the string "true"', 'true'],
    ['the number 1', 1],
    ['an object', {}],
    ['null', null],
    ['undefined', undefined],
    ['false', false],
  ])('only the boolean true throws (%s does not)', (_name, value) => {
    const { state } = stepFu(duel(), new Map([['a', { throw: value as boolean }]]), DT);
    expect(boom(state, 'a').state).toBe('HELD');
  });

  it('a dead player cannot throw', () => {
    const { state, events } = stepFu(kill(duel(), 'a'), input({ a: { throw: true } }), DT);
    expect(boom(state, 'a').state).toBe('HELD');
    expect(types(events)).not.toContain('THROWN');
  });

  it('never spawns the boomerang outside the arena, even throwing into a wall', () => {
    let s = place(duel(), 'a', 40, 450);
    s = face(s, 'a', -1, 0);
    const { state } = stepFu(s, input({ a: { throw: true } }), DT);
    expect(boom(state, 'a').position.x).toBeGreaterThanOrEqual(C.boomerangRadius);
  });
});

describe('the boomerang’s states and transitions', () => {
  it('has exactly the cycle HELD → THROWN → RETURNING → HELD', () => {
    expect(BOOMERANG_TRANSITIONS).toEqual({
      HELD: ['THROWN'],
      THROWN: ['RETURNING'],
      RETURNING: ['HELD'],
    });
  });

  it.each([
    ['HELD', 'THROWN', true],
    ['THROWN', 'RETURNING', true],
    ['RETURNING', 'HELD', true],
    ['HELD', 'RETURNING', false],
    ['HELD', 'HELD', false],
    ['THROWN', 'HELD', false],
    ['THROWN', 'THROWN', false],
    ['RETURNING', 'THROWN', false],
    ['RETURNING', 'RETURNING', false],
  ] as const)('%s → %s is %s', (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it('the simulation only ever takes allowed transitions, over a long messy game', () => {
    let s = duel();
    let previous = s.boomerangs.map((b) => b.state);
    for (let i = 0; i < 1500; i += 1) {
      const result = stepFu(
        s,
        input({
          a: { move: { x: Math.sin(i / 30), y: Math.cos(i / 17) }, throw: i % 40 === 0 },
          b: { move: { x: Math.cos(i / 23), y: Math.sin(i / 11) }, throw: i % 55 === 0 },
        }),
        DT,
      );
      s = result.state;
      s.boomerangs.forEach((b, index) => {
        const was = must(previous[index], 'previous state');
        expect(was === b.state || canTransition(was, b.state), `${was} → ${b.state}`).toBe(true);
      });
      previous = s.boomerangs.map((b) => b.state);
    }
  });
});

describe('travel over fixed timesteps', () => {
  it('flies out at throwSpeed × dt per step along a fixed direction', () => {
    let s = stepFu(duel(), input({ a: { throw: true } }), DT).state;
    const start = boom(s, 'a').position;
    s = stepFu(s, NONE, DT).state;
    expect(boom(s, 'a').position.x).toBeCloseTo(start.x + C.throwSpeed * DT, 9);
    expect(boom(s, 'a').position.y).toBe(450);
    expect(boom(s, 'a').travelled).toBeCloseTo(C.throwSpeed * DT, 9);
    expect(boom(s, 'a').state).toBe('THROWN');
  });

  it('keeps flying straight even if its owner moves away or turns', () => {
    let s = stepFu(duel(), input({ a: { throw: true } }), DT).state;
    s = run(s, 10, input({ a: { move: { x: 0, y: 1 } } })).state;
    expect(boom(s, 'a').direction).toEqual({ x: 1, y: 0 });
    expect(boom(s, 'a').position.y).toBe(450);
  });

  it('turns to RETURNING after exactly throwRange, and never goes further out', () => {
    let s = stepFu(duel(), input({ a: { throw: true } }), DT).state;
    const start = boom(s, 'a').position;
    const steps = Math.ceil(C.throwRange / (C.throwSpeed * DT));
    s = run(s, steps - 1).state;
    expect(boom(s, 'a').state).toBe('THROWN');
    const result = stepFu(s, NONE, DT);
    expect(boom(result.state, 'a').state).toBe('RETURNING');
    expect(boom(result.state, 'a').position.x - start.x).toBeCloseTo(C.throwRange, 9);
  });

  it('turns to RETURNING at a wall instead of leaving the arena', () => {
    let s = place(duel(), 'a', 120, 450);
    s = face(s, 'a', -1, 0);
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    s = run(s, 20).state;
    const b = boom(s, 'a');
    expect(b.position.x).toBeGreaterThanOrEqual(C.boomerangRadius);
    expect(['RETURNING', 'HELD']).toContain(b.state);
  });

  it('RETURNING homes in on where its owner is NOW, not where they were', () => {
    let s = stepFu(duel(), input({ a: { throw: true } }), DT).state;
    s = run(s, 40).state; // out and turning
    expect(boom(s, 'a').state).toBe('RETURNING');
    const first = boom(s, 'a').position;
    // The owner runs away vertically; the boomerang's pull must have a vertical component.
    s = run(s, 8, input({ a: { move: { x: 0, y: 1 } } })).state;
    expect(boom(s, 'a').position.y).toBeGreaterThan(first.y);
    expect(boom(s, 'a').position.x).toBeLessThan(first.x);
  });

  it('returns at returnSpeed × dt', () => {
    let s = stepFu(duel(), input({ a: { throw: true } }), DT).state;
    s = run(s, 40).state;
    const before = boom(s, 'a').position;
    const after = boom(stepFu(s, NONE, DT).state, 'a').position;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeCloseTo(C.returnSpeed * DT, 9);
  });

  it('is caught when it reaches its owner: RETURNING → HELD, at the owner, ready to throw again', () => {
    let s = stepFu(duel(), input({ a: { throw: true } }), DT).state;
    const result = run(s, 120);
    expect(types(result.events)).toContain('CAUGHT');
    s = result.state;
    expect(boom(s, 'a').state).toBe('HELD');
    expect(boom(s, 'a').position).toEqual(body(s, 'a').position);
    expect(boom(s, 'a').travelled).toBe(0);
    const again = stepFu(s, input({ a: { throw: true } }), DT);
    expect(boom(again.state, 'a').state).toBe('THROWN');
  });

  it('is caught the moment it touches its owner (within both radii), not only at their centre', () => {
    let s = place(duel(), 'a', 800, 450);
    const reach = C.playerRadius + C.boomerangRadius;
    s = patchBoomerang(s, 'a', {
      state: 'RETURNING',
      position: { x: 800 + reach + 5, y: 450 }, // 5 units outside touching distance
      direction: { x: 0, y: 0 },
      travelled: 0,
    });
    const { state, events } = stepFu(s, NONE, DT);
    expect(boom(state, 'a').state).toBe('HELD');
    expect(types(events)).toContain('CAUGHT');
  });

  it('a boomerang that is still outside touching distance after a step keeps returning', () => {
    let s = place(duel(), 'a', 800, 450);
    s = patchBoomerang(s, 'a', {
      state: 'RETURNING',
      position: { x: 800 + 300, y: 450 },
      direction: { x: 0, y: 0 },
      travelled: 0,
    });
    expect(boom(stepFu(s, NONE, DT).state, 'a').state).toBe('RETURNING');
  });

  it('a HELD boomerang stays with its owner as they move', () => {
    const s = run(duel(), 30, input({ a: { move: { x: 1, y: 1 } } })).state;
    expect(boom(s, 'a').position).toEqual(body(s, 'a').position);
  });
});

describe('hits and death', () => {
  /** Bob stands in Alice’s line of fire. */
  function inLineOfFire() {
    return place(duel(), 'b', 520, 450);
  }

  it('a THROWN boomerang that reaches an enemy kills them', () => {
    const result = run(stepFu(inLineOfFire(), input({ a: { throw: true } }), DT).state, 40);
    expect(player(result.state, 'b').alive).toBe(false);
    expect(result.events.filter((e) => e.type === 'HIT')).toEqual([
      expect.objectContaining({ type: 'HIT', byId: 'a', victimId: 'b' }),
    ]);
  });

  it('a RETURNING boomerang kills too', () => {
    let s = stepFu(duel(), input({ a: { throw: true } }), DT).state;
    s = run(s, 36).state;
    expect(boom(s, 'a').state).toBe('RETURNING');
    // Bob steps into its way on the return leg.
    s = place(s, 'b', boom(s, 'a').position.x - 30, boom(s, 'a').position.y);
    const result = stepFu(s, NONE, DT);
    expect(player(result.state, 'b').alive).toBe(false);
  });

  it('a HELD boomerang kills nobody: standing on an enemy is not an attack', () => {
    const s = place(duel(), 'b', 210, 450);
    const { state, events } = stepFu(s, NONE, DT);
    expect(player(state, 'b').alive).toBe(true);
    expect(events).toEqual([]);
  });

  it('touching exactly (distance = both radii) is a miss; a hair closer is a hit', () => {
    const reach = C.playerRadius + C.boomerangRadius;
    const s = place(duel(), 'b', 200 + C.playerRadius + C.boomerangRadius + 1 + reach, 450);
    let r = stepFu(s, input({ a: { throw: true } }), DT);
    expect(player(r.state, 'b').alive).toBe(true); // exactly touching on the throw step
    r = stepFu(r.state, NONE, DT); // it moves 15 closer
    expect(player(r.state, 'b').alive).toBe(false);
  });

  it('the kill is immediate, and the dead stay dead until the round resets', () => {
    const thrown = stepFu(inLineOfFire(), input({ a: { throw: true } }), DT).state;
    let s = thrown;
    let killedAt = -1;
    for (let i = 0; i < 40 && killedAt < 0; i += 1) {
      s = stepFu(s, NONE, DT).state;
      if (!player(s, 'b').alive) killedAt = i;
    }
    expect(killedAt).toBeGreaterThanOrEqual(0);
    s = run(s, 100).state; // well inside the 2.5 s round-over interval
    expect(player(s, 'b').alive).toBe(false);
    expect(s.round).toBe(1);
  });

  it('a boomerang can kill two players at once', () => {
    let s = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
      { id: 'c', slot: 2 },
    ]);
    s = place(s, 'a', 200, 450);
    s = face(s, 'a', 1, 0);
    s = place(s, 'b', 520, 430);
    s = place(s, 'c', 520, 470);
    const result = run(stepFu(s, input({ a: { throw: true } }), DT).state, 40);
    expect(player(result.state, 'b').alive).toBe(false);
    expect(player(result.state, 'c').alive).toBe(false);
  });

  it('two boomerangs reaching the same victim in one step kill them once, credited to the first in player order', () => {
    let s = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
      { id: 'c', slot: 2 },
    ]);
    s = place(s, 'c', 800, 450);
    s = {
      ...s,
      boomerangs: s.boomerangs.map((b) =>
        b.ownerId === 'c'
          ? b
          : {
              ...b,
              state: 'THROWN' as const,
              position: { x: 800, y: 450 },
              direction: { x: 1, y: 0 },
              travelled: 0,
            },
      ),
    };
    const { state, events } = stepFu(s, NONE, DT);
    expect(player(state, 'c').alive).toBe(false);
    expect(events.filter((e) => e.type === 'HIT')).toHaveLength(1);
    expect(events.find((e) => e.type === 'HIT')).toMatchObject({ byId: 'a', victimId: 'c' });
  });

  it('a boomerang flies on through the dead: no hit, no repeat events', () => {
    let s = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
      { id: 'c', slot: 2 },
    ]);
    s = place(s, 'a', 200, 450);
    s = face(s, 'a', 1, 0);
    s = kill(place(s, 'b', 520, 450), 'b'); // a corpse in the line of fire
    s = place(s, 'c', 1500, 850); // the other survivor is far away
    const result = run(stepFu(s, input({ a: { throw: true } }), DT).state, 60);
    expect(result.events.filter((e) => e.type === 'HIT')).toEqual([]);
    expect(result.state.phase).toBe('PLAYING');
  });
});

describe('owner policy: your own boomerang never kills you', () => {
  it('not when it is thrown (it starts overlapping nothing, and the owner is immune regardless)', () => {
    const { state } = stepFu(duel(), input({ a: { throw: true } }), DT);
    expect(player(state, 'a').alive).toBe(true);
  });

  it('not when the owner runs into its path', () => {
    let s = stepFu(duel(), input({ a: { throw: true } }), DT).state;
    s = place(s, 'a', boom(s, 'a').position.x, boom(s, 'a').position.y); // standing on it
    expect(player(stepFu(s, NONE, DT).state, 'a').alive).toBe(true);
  });

  it('not on the way back, even straight through the owner', () => {
    const s = stepFu(duel(), input({ a: { throw: true } }), DT).state;
    const result = run(s, 150);
    expect(player(result.state, 'a').alive).toBe(true);
    expect(result.events.filter((e) => e.type === 'HIT')).toEqual([]);
  });

  it('a dead owner’s boomerang is still lethal to everyone else (the throw already happened)', () => {
    let s = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
      { id: 'c', slot: 2 },
    ]);
    s = place(s, 'b', 700, 450);
    s = kill(s, 'a');
    s = patchBoomerang(s, 'a', {
      state: 'THROWN',
      position: { x: 700, y: 450 },
      direction: { x: 1, y: 0 },
      travelled: 100,
    });
    const { state } = stepFu(s, NONE, DT);
    expect(player(state, 'b').alive).toBe(false);
  });
});

describe('simultaneous and edge-case hits', () => {
  it('two players killing each other in the same step both die: a draw, not a winner', () => {
    let s = place(duel(), 'b', 400, 450);
    s = stepFu(s, input({ a: { throw: true }, b: { throw: true } }), DT).state;
    const result = run(s, 20);
    expect(player(result.state, 'a').alive).toBe(false);
    expect(player(result.state, 'b').alive).toBe(false);
    expect(result.state.phase).toBe('ROUND_OVER');
    expect(result.state.roundOver?.winnerId).toBeUndefined();
    // both HIT events happen in the SAME step
    const hits = result.events.filter((e) => e.type === 'HIT');
    expect(hits).toHaveLength(2);
  });

  it('the order of inputs in the Map never changes the outcome', () => {
    const first = stepFu(
      duel(),
      new Map([
        ['a', { throw: true }],
        ['b', { throw: true }],
      ]),
      DT,
    );
    const second = stepFu(
      duel(),
      new Map([
        ['b', { throw: true }],
        ['a', { throw: true }],
      ]),
      DT,
    );
    expect(first).toEqual(second);
  });

  it('a boomerang that is caught by its owner on the same step it would hit someone still resolves the hit first', () => {
    // Enemy overlapping the point where the owner reacquires: the hit uses the end-of-step positions.
    let s = stepFu(duel(), input({ a: { throw: true } }), DT).state;
    s = run(s, 36).state; // RETURNING
    expect(boom(s, 'a').state).toBe('RETURNING');
    s = place(s, 'b', boom(s, 'a').position.x - 20, boom(s, 'a').position.y);
    const { state } = stepFu(s, NONE, DT);
    expect(player(state, 'b').alive).toBe(false);
  });
});

describe('rounds', () => {
  function killedBob() {
    const s = stepFu(place(duel(), 'b', 520, 450), input({ a: { throw: true } }), DT).state;
    return run(s, 40);
  }

  it('when only one player is left alive the round is over, and the survivor is the winner', () => {
    const { state, events } = killedBob();
    expect(state.phase).toBe('ROUND_OVER');
    expect(state.roundOver).toMatchObject({ winnerId: 'a', resetInSeconds: expect.any(Number) });
    expect(events.filter((e) => e.type === 'ROUND_OVER')).toEqual([
      { type: 'ROUND_OVER', winnerId: 'a' },
    ]);
  });

  it('with three players the round continues until one is left', () => {
    let s = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
      { id: 'c', slot: 2 },
    ]);
    s = patchBoomerang(place(s, 'b', 800, 450), 'a', {
      state: 'THROWN',
      position: { x: 800, y: 450 },
      direction: { x: 1, y: 0 },
      travelled: 0,
    });
    const { state } = stepFu(s, NONE, DT);
    expect(player(state, 'b').alive).toBe(false);
    expect(state.phase).toBe('PLAYING');
  });

  it('a single player can never end a round (nobody to fight)', () => {
    const s = run(createFuMatch([{ id: 'a', slot: 0 }]), 600).state;
    expect(s.phase).toBe('PLAYING');
  });

  it('freezes play while the round is over: no movement, throws or flying boomerangs', () => {
    const over = killedBob().state;
    const next = stepFu(
      over,
      input({ a: { move: { x: 1, y: 0 }, throw: true }, b: { throw: true } }),
      DT,
    ).state;
    expect(next.world.bodies).toEqual(over.world.bodies);
    expect(next.boomerangs).toEqual(over.boomerangs);
    expect(next.players).toEqual(over.players);
  });

  it('counts the round-end interval down and then resets, exactly when the interval has elapsed', () => {
    const over = killedBob().state;
    const steps = Math.round((over.roundOver?.resetInSeconds ?? 0) / DT);
    expect(steps).toBeGreaterThan(100);
    const almost = run(over, steps - 1).state;
    expect(almost.phase).toBe('ROUND_OVER');
    const result = stepFu(almost, NONE, DT);
    expect(result.state.phase).toBe('PLAYING');
    expect(result.state.round).toBe(2);
    expect(result.events).toEqual([{ type: 'ROUND_START', round: 2 }]);
  });

  it('the new round is the same fresh start every time: everyone alive, at spawn, facing in, boomerangs HELD', () => {
    const initial = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 3 },
    ]);
    let s = place(duel(), 'b', 520, 450);
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    s = run(s, 40 + Math.round(C.roundEndSeconds / DT) + 2).state;
    expect(s.round).toBe(2);
    expect(s.players).toEqual(initial.players);
    expect(s.boomerangs).toEqual(initial.boomerangs);
    expect(s.world.bodies).toEqual(initial.world.bodies);
    expect(s.phase).toBe('PLAYING');
    expect(s.roundOver).toBeUndefined();
  });

  it('can be played round after round', () => {
    let s = place(duel(), 'b', 520, 450);
    for (let round = 1; round <= 3; round += 1) {
      expect(s.round).toBe(round);
      s = place(s, 'b', 520, 450);
      s = face(s, 'a', 1, 0);
      s = place(s, 'a', 200, 450);
      s = stepFu(s, input({ a: { throw: true } }), DT).state;
      s = run(s, 40).state;
      expect(s.phase).toBe('ROUND_OVER');
      s = run(s, Math.round(C.roundEndSeconds / DT) + 1).state;
    }
    expect(s.round).toBe(4);
  });
});

describe('determinism and hostile input', () => {
  const script = (i: number): FuInputs =>
    input({
      a: { move: { x: Math.sin(i / 13), y: Math.cos(i / 29) }, throw: i % 37 === 0 },
      b: { move: { x: Math.cos(i / 19), y: Math.sin(i / 7) }, throw: i % 53 === 0 },
    });

  it('replaying the same inputs from the same start gives identical states and events', () => {
    const one = run(duel(), 3000, script);
    const two = run(duel(), 3000, script);
    expect(two.state).toEqual(one.state);
    expect(two.events).toEqual(one.events);
    expect(JSON.stringify(two.state)).toBe(JSON.stringify(one.state));
  });

  it('never mutates the state it is given', () => {
    const s = duel();
    const snapshot = JSON.stringify(s);
    stepFu(s, input({ a: { move: { x: 1, y: 0 }, throw: true } }), DT);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('zero dt is a no-op', () => {
    const s = duel();
    expect(stepFu(s, input({ a: { throw: true } }), 0)).toEqual({ state: s, events: [] });
  });

  it.each([-DT, Number.NaN, Number.POSITIVE_INFINITY, 0.5])(
    'rejects an invalid dt (%s) as a loop bug',
    (dt) => {
      expect(() => stepFu(duel(), NONE, dt)).toThrow(RangeError);
    },
  );

  it('garbage movement can not poison the simulation', () => {
    const garbage = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1e308,
      -1e308,
      5,
      -5,
      0.15,
      1e-320,
    ];
    let s = duel();
    for (let i = 0; i < 400; i += 1) {
      const x = must(garbage[i % garbage.length], 'garbage value');
      const y = must(garbage[(i * 7 + 3) % garbage.length], 'garbage value');
      s = stepFu(
        s,
        input({
          a: { move: { x, y }, throw: i % 9 === 0 },
          b: { move: { x: y, y: x }, throw: i % 11 === 0 },
        }),
        DT,
      ).state;
      for (const b of s.world.bodies) {
        expect(Number.isFinite(b.position.x) && Number.isFinite(b.position.y)).toBe(true);
        expect(b.position.x).toBeGreaterThanOrEqual(C.playerRadius);
        expect(b.position.x).toBeLessThanOrEqual(C.arena.width - C.playerRadius);
      }
      for (const p of s.players) expect(Math.hypot(p.facing.x, p.facing.y)).toBeCloseTo(1, 9);
      for (const m of s.boomerangs) {
        expect(Number.isFinite(m.position.x) && Number.isFinite(m.position.y)).toBe(true);
        expect(m.travelled).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('inputs for players who are not in the match are ignored', () => {
    const s = duel();
    const { state, events } = stepFu(
      s,
      input({ ghost: { move: { x: 1, y: 0 }, throw: true } }),
      DT,
    );
    expect(state.boomerangs).toHaveLength(2);
    expect(state.world.bodies).toEqual(s.world.bodies);
    expect(events).toEqual([]);
  });

  it('fuzz: invariants hold over thousands of random steps (positions finite and inside, one boomerang each, states valid)', () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let s = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
      { id: 'c', slot: 2 },
      { id: 'd', slot: 3 },
    ]);
    for (let i = 0; i < 6000; i += 1) {
      const frame: FuInputs = new Map(
        s.players.map((p) => [
          p.id,
          { move: { x: random() * 2 - 1, y: random() * 2 - 1 }, throw: random() < 0.05 },
        ]),
      );
      s = stepFu(s, frame, DT).state;
      expect(s.boomerangs).toHaveLength(4);
      for (const m of s.boomerangs) {
        expect(['HELD', 'THROWN', 'RETURNING']).toContain(m.state);
        expect(m.position.x).toBeGreaterThanOrEqual(0);
        expect(m.position.x).toBeLessThanOrEqual(C.arena.width);
        expect(Number.isFinite(m.position.y)).toBe(true);
      }
    }
  }, 30_000); // a long loop of per-step assertions; generous so a loaded CI machine cannot flake it
});
