import { FIXED_TIMESTEP_SECONDS as DT } from '@foomerang/game-core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FU_CONFIG,
  createFuMatch,
  stepFu,
  type FuConfig,
  type FuEvent,
  type FuInputs,
  type FuState,
} from '../src/rules';

// ------------------------------------------------------------------------------------------
// SLASH: the short, fast melee swing that uses the boomerang while it is in hand. States are plain
// data, so tests arrange a situation by copying and patching one.
// ------------------------------------------------------------------------------------------

const C = DEFAULT_FU_CONFIG;
const NONE: FuInputs = new Map();
type Press = { move?: { x: number; y: number }; throw?: boolean; slash?: boolean };
const input = (entries: Record<string, Press>): FuInputs => new Map(Object.entries(entries));
const SLASH_A = input({ a: { slash: true } });

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`test setup: no ${what}`);
  return value;
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
const player = (s: FuState, id: string) =>
  must(
    s.players.find((p) => p.id === id),
    `player ${id}`,
  );
const boom = (s: FuState, id: string) =>
  must(
    s.boomerangs.find((b) => b.ownerId === id),
    `boomerang ${id}`,
  );
const body = (s: FuState, id: string) =>
  must(
    s.world.bodies.find((b) => b.id === id),
    `body ${id}`,
  );
const types = (events: readonly FuEvent[]) => events.map((e) => e.type);

/** Alice at the left facing right, Bob `gap` to her right (default: well inside the slash). */
function duel(gap = 100, overrides: Partial<FuConfig> = {}): FuState {
  let s = createFuMatch(
    [
      { id: 'a', slot: 0 },
      { id: 'b', slot: 3 },
    ],
    overrides,
  );
  s = place(s, 'a', 600, 450);
  s = place(s, 'b', 600 + gap, 450);
  s = face(s, 'a', 1, 0);
  return face(s, 'b', -1, 0);
}

/** Nobody within reach, and nobody in the line of a throw to the right. */
const far = (): FuState => place(duel(), 'b', 1500, 850);

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

/** Steps, with Alice slashing on the first step only, until `done` (or fails after `limit`). */
function until(state: FuState, done: (s: FuState) => boolean, limit = 200) {
  let current = state;
  for (let i = 1; i <= limit; i += 1) {
    current = stepFu(current, NONE, DT).state;
    if (done(current)) return i;
  }
  throw new Error('condition never reached');
}

// ------------------------------------------------------------------------------------------

describe('configuration: slash tuning lives in DEFAULT_FU_CONFIG, not in the renderer', () => {
  it('has a reach, an arc, an active window, a recovery and a movement modifier', () => {
    expect(C.slashReach).toBeGreaterThan(C.playerRadius);
    expect(C.slashArc).toBeGreaterThan(0);
    expect(C.slashArc).toBeLessThanOrEqual(Math.PI * 2);
    expect(C.slashActiveSeconds).toBeGreaterThan(0);
    expect(C.slashRecoverySeconds).toBeGreaterThan(0);
    expect(C.slashMoveFactor).toBeGreaterThan(0);
    expect(C.slashMoveFactor).toBeLessThanOrEqual(1);
  });

  it.each([
    ['slashReach', 0],
    ['slashReach', Number.NaN],
    ['slashArc', 0],
    ['slashArc', Math.PI * 2 + 0.1],
    ['slashActiveSeconds', 0],
    ['slashRecoverySeconds', -1],
    ['slashMoveFactor', 0],
    ['slashMoveFactor', 1.5],
  ] as const)('rejects an invalid %s (%s) as a programming error', (key, value) => {
    expect(() => createFuMatch([{ id: 'a', slot: 0 }], { [key]: value })).toThrow(RangeError);
  });

  it('starts every player READY, with nothing to draw', () => {
    for (const p of duel().players) expect(p.slash).toEqual({ phase: 'READY' });
  });
});

describe('the swing: SLASH while the boomerang is in hand', () => {
  it('kills an enemy inside the arc on the very step it is pressed, and says so in order', () => {
    const { state, events } = run(duel(100), 1, SLASH_A);
    expect(player(state, 'b').alive).toBe(false);
    expect(types(events)).toEqual(['SLASHED', 'HIT', 'SCORE', 'ROUND_OVER']); // (Slice 8: a kill also fills a hole)
    expect(events[0]).toMatchObject({ type: 'SLASHED', playerId: 'a', direction: { x: 1, y: 0 } });
    expect(events[1]).toMatchObject({ type: 'HIT', byId: 'a', victimId: 'b' });
    expect(events[2]).toMatchObject({ type: 'SCORE', playerId: 'a', delta: 1, reason: 'KILL' });
    expect(events[3]).toEqual({ type: 'ROUND_OVER', winnerId: 'a' });
  });

  it('uses the same boomerang: it stays HELD, in hand, throughout', () => {
    let s = far(); // nobody close
    for (let i = 0; i < 60; i += 1) {
      s = stepFu(s, SLASH_A, DT).state;
      expect(boom(s, 'a').state).toBe('HELD');
    }
  });

  it('a slash that hits nobody is still a slash: it starts ACTIVE with the full window', () => {
    const { state } = run(far(), 1, SLASH_A);
    expect(state.players.every((p) => p.alive)).toBe(true);
    expect(player(state, 'a').slash).toMatchObject({
      phase: 'ACTIVE',
      direction: { x: 1, y: 0 },
      remaining: C.slashActiveSeconds,
    });
  });

  it('an enemy outside the arc survives: behind, to the side, and too far', () => {
    for (const [x, y] of [
      [500, 450], // behind
      [600, 550], // 90° to the side (the default arc is narrower than 180°)
      [600, 350],
      [600 + C.slashReach + 40, 450], // in front, but out of reach
    ] as const) {
      const s = place(duel(), 'b', x, y);
      const { state, events } = run(s, 1, SLASH_A);
      expect(player(state, 'b').alive, `enemy at ${x},${y}`).toBe(true);
      expect(types(events)).toEqual(['SLASHED']);
    }
  });

  it('respects facing: the arc points where the player faces, whichever way that is', () => {
    const cases: [number, number, number, number][] = [
      [0, 1, 600, 450 + 100], // facing down, enemy below: dies
      [0, -1, 600, 450 - 100], // up
      [-1, 0, 600 - 100, 450], // left
    ];
    for (const [fx, fy, ex, ey] of cases) {
      const hit = run(place(face(duel(), 'a', fx, fy), 'b', ex, ey), 1, SLASH_A).state;
      expect(player(hit, 'b').alive, `facing ${fx},${fy}`).toBe(false);
      // …and the same enemy placed on the opposite side survives.
      const miss = run(
        place(face(duel(), 'a', fx, fy), 'b', 1200 - ex, 900 - ey),
        1,
        SLASH_A,
      ).state;
      expect(player(miss, 'b').alive, `facing ${fx},${fy} (behind)`).toBe(true);
    }
  });

  it('uses the established facing when the thumb is released (neutral input keeps the last direction)', () => {
    let s = place(duel(), 'b', 600, 550); // below
    s = face(s, 'a', 0, 1);
    s = run(s, 1, input({ a: { move: { x: 0, y: 0 }, slash: true } })).state;
    expect(player(s, 'b').alive).toBe(false);
  });

  it('locks its direction when it starts: turning mid-swing does not swing the arc around', () => {
    let s = run(far(), 1, SLASH_A).state; // swinging right
    s = run(s, 3, input({ a: { move: { x: 0, y: 1 } } })).state; // thumb now pushes down
    expect(player(s, 'a').facing.y).toBeGreaterThan(0.99); // the player turned…
    expect(player(s, 'a').slash).toMatchObject({ phase: 'ACTIVE', direction: { x: 1, y: 0 } }); // …the swing did not
    // an enemy walking into the NEW facing during the swing is safe; into the swing's own arc is not
    const below = place(s, 'b', body(s, 'a').position.x, body(s, 'a').position.y + 100);
    expect(player(run(below, 1).state, 'b').alive).toBe(true);
    const ahead = place(s, 'b', body(s, 'a').position.x + 100, body(s, 'a').position.y);
    expect(player(run(ahead, 1).state, 'b').alive).toBe(false);
  });

  it('hits an enemy that walks into the arc during the active window, but not one who arrives after it', () => {
    const start = run(far(), 1, SLASH_A).state;
    const inWindow = place(start, 'b', 700, 450);
    expect(player(run(inWindow, 1).state, 'b').alive).toBe(false);

    const steps = until(start, (s) => player(s, 'a').slash.phase !== 'ACTIVE');
    const afterWindow = run(start, steps).state;
    expect(player(afterWindow, 'a').slash.phase).toBe('RECOVERING');
    const late = place(afterWindow, 'b', 700, 450);
    expect(player(run(late, 1).state, 'b').alive).toBe(true);
  });

  it('never kills its owner, and never kills an already-dead player', () => {
    let s = place(duel(), 'b', 600, 450); // enemy exactly on top of Alice
    s = kill(s, 'b');
    const { state, events } = run(s, 1, SLASH_A);
    expect(player(state, 'a').alive).toBe(true);
    expect(types(events)).toEqual(['SLASHED', 'ROUND_OVER']); // nobody was hit; Alice simply is the last one standing
  });

  it('can hit several enemies at once', () => {
    let s = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
      { id: 'c', slot: 2 },
    ]);
    s = face(place(place(place(s, 'a', 600, 450), 'b', 700, 420), 'c', 700, 480), 'a', 1, 0);
    const { state, events } = run(s, 1, SLASH_A);
    expect(player(state, 'b').alive).toBe(false);
    expect(player(state, 'c').alive).toBe(false);
    expect(events.filter((e) => e.type === 'HIT')).toHaveLength(2);
  });
});

describe('availability: the weapon must be in hand', () => {
  it.each(['THROWN', 'RETURNING'] as const)(
    'cannot slash while the boomerang is %s: nothing happens, and nothing is stored for later',
    (boomerangState) => {
      let s = patchBoomerang(duel(100), 'a', {
        state: boomerangState,
        position: { x: 1200, y: 100 },
        direction: boomerangState === 'THROWN' ? { x: 1, y: 0 } : { x: 0, y: 0 },
      });
      const result = stepFu(s, SLASH_A, DT);
      expect(result.events.some((e) => e.type === 'SLASHED' || e.type === 'HIT')).toBe(false);
      expect(player(result.state, 'a').slash).toEqual({ phase: 'READY' });
      expect(player(result.state, 'b').alive).toBe(true);
      // the press is not buffered: once the boomerang is home, nothing swings by itself
      s = patchBoomerang(result.state, 'a', {
        state: 'HELD',
        position: body(result.state, 'a').position,
        direction: { x: 0, y: 0 },
        travelled: 0,
      });
      expect(types(run(s, 5).events)).not.toContain('SLASHED');
    },
  );

  it('slash is available from the step after the boomerang is caught, not on the catch step', () => {
    let s = far();
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    const caughtAfter = until(s, (x) => boom(x, 'a').state === 'HELD');
    expect(caughtAfter).toBeGreaterThan(1);
    // Replay up to just before the catch step, then press SLASH on the catch step itself.
    const justBefore = run(s, caughtAfter - 1).state;
    expect(boom(justBefore, 'a').state).not.toBe('HELD');
    const onCatch = stepFu(justBefore, SLASH_A, DT);
    expect(boom(onCatch.state, 'a').state).toBe('HELD');
    expect(types(onCatch.events)).not.toContain('SLASHED');
    expect(types(stepFu(onCatch.state, SLASH_A, DT).events)).toContain('SLASHED');
  });

  it('a dead player cannot slash', () => {
    const s = kill(duel(100), 'a');
    const { state, events } = run(s, 1, SLASH_A);
    expect(types(events)).not.toContain('SLASHED');
    expect(player(state, 'b').alive).toBe(true);
    expect(player(state, 'a').slash).toEqual({ phase: 'READY' });
  });

  it('a player who dies mid-swing stops swinging', () => {
    const s = run(far(), 1, SLASH_A).state;
    expect(player(s, 'a').slash.phase).toBe('ACTIVE');
    const dead = kill(s, 'a');
    expect(player(run(dead, 1).state, 'a').slash).toEqual({ phase: 'READY' });
  });
});

describe('cooldown and recovery: spam is prevented by the rules, not by the UI', () => {
  it('goes ACTIVE → RECOVERING → READY on the configured timing', () => {
    let s = run(far(), 1, SLASH_A).state;
    const active = 1 + until(s, (x) => player(x, 'a').slash.phase === 'RECOVERING');
    expect(active * DT).toBeGreaterThanOrEqual(C.slashActiveSeconds - DT);
    expect(active * DT).toBeLessThanOrEqual(C.slashActiveSeconds + 2 * DT);

    s = run(
      s,
      until(s, (x) => player(x, 'a').slash.phase === 'RECOVERING'),
    ).state;
    expect(player(s, 'a').slash).toMatchObject({ phase: 'RECOVERING' });
    const recovery = until(s, (x) => player(x, 'a').slash.phase === 'READY');
    expect(recovery * DT).toBeGreaterThanOrEqual(C.slashRecoverySeconds - DT);
    expect(recovery * DT).toBeLessThanOrEqual(C.slashRecoverySeconds + 2 * DT);
  });

  it('pressing SLASH on every step swings once per cycle, no faster', () => {
    const cycle = C.slashActiveSeconds + C.slashRecoverySeconds;
    const seconds = 4;
    const { events } = run(far(), Math.round(seconds / DT), SLASH_A);
    const swings = events.filter((e) => e.type === 'SLASHED').length;
    expect(swings).toBeGreaterThanOrEqual(Math.floor(seconds / (cycle + 2 * DT)));
    expect(swings).toBeLessThanOrEqual(Math.ceil(seconds / (cycle - DT)));
    expect(swings).toBeGreaterThanOrEqual(2); // and it does swing again when READY
  });

  it('a press during ACTIVE or RECOVERING is dropped, not queued: the swing after is a fresh press', () => {
    let s = run(far(), 3, SLASH_A).state; // pressed on 3 consecutive steps
    s = run(s, 200).state; // everything settles to READY with no further input
    expect(player(s, 'a').slash).toEqual({ phase: 'READY' });
    expect(types(run(s, 30).events)).not.toEqual(expect.arrayContaining(['SLASHED']));
  });

  it('a repeated SLASH (a duplicated event reaching the rules twice) cannot produce two attacks', () => {
    const twice = run(far(), 2, SLASH_A);
    expect(twice.events.filter((e) => e.type === 'SLASHED')).toHaveLength(1);
  });

  it('movement is slowed by slashMoveFactor while swinging and recovering, and only then', () => {
    const walk = input({ a: { move: { x: 0, y: -1 } } });
    const travelled = (from: FuState, to: FuState) =>
      body(from, 'a').position.y - body(to, 'a').position.y;
    const freeDistance = travelled(far(), run(far(), 5, walk).state);

    const swinging = run(far(), 1, SLASH_A).state;
    expect(travelled(swinging, run(swinging, 5, walk).state)).toBeCloseTo(
      freeDistance * C.slashMoveFactor,
      6,
    );

    // a half-deflected thumb is slowed in proportion, not flattened
    const half = input({ a: { move: { x: 0, y: -0.575 } } }); // (0.575 - dead zone) / (1 - dead zone) = 0.5
    const freeHalf = travelled(far(), run(far(), 5, half).state);
    expect(travelled(swinging, run(swinging, 5, half).state)).toBeCloseTo(
      freeHalf * C.slashMoveFactor,
      6,
    );

    // after the whole cycle, full speed again
    const cycle = Math.ceil((C.slashActiveSeconds + C.slashRecoverySeconds) / DT) + 3;
    const settled = run(swinging, cycle).state;
    expect(player(settled, 'a').slash).toEqual({ phase: 'READY' });
    expect(travelled(settled, run(settled, 5, walk).state)).toBeCloseTo(freeDistance, 6);
  });
});

describe('THROW and SLASH together', () => {
  it('on the same step the SLASH wins: the throw is dropped, not deferred, and the weapon stays in hand', () => {
    const both = input({ a: { throw: true, slash: true } });
    const { state, events } = run(far(), 1, both);
    expect(types(events)).toEqual(['SLASHED']);
    expect(boom(state, 'a').state).toBe('HELD');
    // the dropped throw does not fire later
    const later = run(state, 120);
    expect(types(later.events)).not.toContain('THROWN');
  });

  it('does not depend on the order inputs were written or delivered in', () => {
    const forward = input({ a: { throw: true, slash: true }, b: { slash: true } });
    const reversed: FuInputs = new Map([
      ['b', { slash: true }],
      ['a', { slash: true, throw: true }],
    ]);
    const x = run(duel(100), 1, forward);
    const y = run(duel(100), 1, reversed);
    expect(y.state).toEqual(x.state);
    expect(y.events).toEqual(x.events);
  });

  it('when the slash is not available (recovering) the throw goes through as usual', () => {
    let s = run(far(), 1, SLASH_A).state;
    s = run(
      s,
      until(s, (x) => player(x, 'a').slash.phase === 'RECOVERING'),
    ).state;
    const { state, events } = run(s, 1, input({ a: { throw: true, slash: true } }));
    expect(types(events)).toEqual(['THROWN']);
    expect(boom(state, 'a').state).toBe('THROWN');
  });

  it('a throw during the ACTIVE swing is ignored (the weapon is mid-swing), and one during recovery works', () => {
    const swinging = run(far(), 2, SLASH_A).state;
    expect(player(swinging, 'a').slash.phase).toBe('ACTIVE');
    const blocked = stepFu(swinging, input({ a: { throw: true } }), DT);
    expect(types(blocked.events)).not.toContain('THROWN');
    expect(boom(blocked.state, 'a').state).toBe('HELD');

    const recovering = run(
      swinging,
      until(swinging, (x) => player(x, 'a').slash.phase === 'RECOVERING'),
    ).state;
    const thrown = stepFu(recovering, input({ a: { throw: true } }), DT);
    expect(types(thrown.events)).toContain('THROWN');
  });

  it('after throwing, the recovery keeps counting but the slash cannot be used until the weapon is back', () => {
    let s = run(far(), 1, SLASH_A).state;
    s = run(
      s,
      until(s, (x) => player(x, 'a').slash.phase === 'RECOVERING'),
    ).state;
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    s = run(
      s,
      until(s, (x) => player(x, 'a').slash.phase === 'READY'),
    ).state;
    expect(boom(s, 'a').state).not.toBe('HELD'); // READY, but the weapon is still out
    expect(types(stepFu(s, SLASH_A, DT).events)).not.toContain('SLASHED');
  });
});

describe('simultaneous slashes', () => {
  it('two players who slash each other on the same step both die: a draw', () => {
    const { state, events } = run(duel(100), 1, input({ a: { slash: true }, b: { slash: true } }));
    expect(player(state, 'a').alive).toBe(false);
    expect(player(state, 'b').alive).toBe(false);
    expect(events.filter((e) => e.type === 'HIT')).toHaveLength(2);
    expect(events.at(-1)).toEqual({ type: 'ROUND_OVER', winnerId: undefined });
    expect(state.roundOver?.winnerId).toBeUndefined();
    // the dead are not left mid-swing (nothing to draw, nothing frozen in ACTIVE for the whole pause)
    expect(state.players.map((p) => p.slash)).toEqual([{ phase: 'READY' }, { phase: 'READY' }]);
  });

  it('a player killed on the step they swing still lands that swing (everything resolves together)', () => {
    // Bob is facing away from Alice, so only Alice's swing connects with anybody; Carol kills Alice.
    let s = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
      { id: 'c', slot: 2 },
    ]);
    s = place(place(place(s, 'a', 600, 450), 'b', 700, 450), 'c', 600, 350);
    s = face(face(face(s, 'a', 1, 0), 'b', 1, 0), 'c', 0, 1);
    const { state } = run(s, 1, input({ a: { slash: true }, c: { slash: true } }));
    expect(player(state, 'a').alive).toBe(false); // Carol got Alice…
    expect(player(state, 'b').alive).toBe(false); // …and Alice still got Bob
    expect(player(state, 'c').alive).toBe(true);
  });

  it('a slash and a boomerang landing on the same step on the same victim: one kill, credited by player order', () => {
    let s = createFuMatch([
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
      { id: 'c', slot: 2 },
    ]);
    s = place(place(place(s, 'a', 600, 450), 'b', 700, 450), 'c', 800, 450);
    s = face(face(s, 'a', 1, 0), 'c', -1, 0);
    s = patchBoomerang(s, 'c', {
      state: 'THROWN',
      position: { x: 710, y: 450 },
      direction: { x: -1, y: 0 },
      travelled: 0,
    });
    const { events } = run(s, 1, input({ a: { slash: true } }));
    const hits = events.filter((e) => e.type === 'HIT');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ victimId: 'b', byId: 'a' });
  });
});

describe('the edge of the hit region (open: touching the edge is a miss, like every hit in Fu)', () => {
  it('exactly slashReach away is a miss; just inside is a hit', () => {
    const reach = 120;
    const exact = run(duel(reach, { slashReach: reach }), 1, SLASH_A).state;
    expect(player(exact, 'b').alive).toBe(true);
    const inside = run(duel(reach - 1e-6, { slashReach: reach }), 1, SLASH_A).state;
    expect(player(inside, 'b').alive).toBe(false);
    const outside = run(duel(reach + 1e-6, { slashReach: reach }), 1, SLASH_A).state;
    expect(player(outside, 'b').alive).toBe(true);
  });

  it('the arc edge: a hair inside the half-angle hits, a hair outside misses', () => {
    const arc = Math.PI; // half-angle 90°, so the edge is exactly sideways
    const at = (angle: number) =>
      place(
        duel(100, { slashArc: arc }),
        'b',
        600 + 100 * Math.cos(angle),
        450 + 100 * Math.sin(angle),
      );
    const half = arc / 2;
    expect(player(run(at(half - 0.001), 1, SLASH_A).state, 'b').alive).toBe(false);
    expect(player(run(at(half + 0.001), 1, SLASH_A).state, 'b').alive).toBe(true);
    expect(player(run(at(-(half - 0.001)), 1, SLASH_A).state, 'b').alive).toBe(false);
    expect(player(run(at(-(half + 0.001)), 1, SLASH_A).state, 'b').alive).toBe(true);
  });

  it('an enemy exactly on top of the attacker (no direction at all) is hit', () => {
    const s = run(duel(0), 1, SLASH_A).state;
    expect(player(s, 'b').alive).toBe(false);
  });

  it('a full-circle arc hits in every direction', () => {
    const s = place(duel(100, { slashArc: Math.PI * 2 }), 'b', 500, 450); // directly behind
    expect(player(run(s, 1, SLASH_A).state, 'b').alive).toBe(false);
  });
});

describe('rounds', () => {
  it('a slash that leaves one survivor ends the round with that player as the winner', () => {
    const { state } = run(duel(100), 1, SLASH_A);
    expect(state.phase).toBe('ROUND_OVER');
    expect(state.roundOver).toMatchObject({ winnerId: 'a' });
  });

  it('SLASH input is ignored while the round is over, and the freeze keeps the swing as it was', () => {
    const over = run(duel(100), 1, SLASH_A).state;
    const next = stepFu(over, input({ a: { slash: true }, b: { slash: true } }), DT);
    expect(next.state.players).toEqual(over.players);
    expect(next.state.world.bodies).toEqual(over.world.bodies);
    expect(next.events).toEqual([]);
  });

  it('the next round starts everyone READY with nothing swinging', () => {
    let s = run(duel(100), 1, SLASH_A).state;
    s = run(s, Math.round(C.roundEndSeconds / DT) + 2).state;
    expect(s.round).toBe(2);
    expect(s.players.every((p) => p.alive && p.slash.phase === 'READY')).toBe(true);
    expect(types(run(s, 1).events)).not.toContain('SLASHED');
  });
});

describe('determinism and hostile input', () => {
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
    });

  it('replaying the same inputs from the same start gives identical states and events, slashes included', () => {
    const one = run(duel(150), 3000, script);
    const two = run(duel(150), 3000, script);
    expect(one.events.some((e) => e.type === 'SLASHED')).toBe(true);
    expect(two.state).toEqual(one.state);
    expect(two.events).toEqual(one.events);
    expect(JSON.stringify(two.state)).toBe(JSON.stringify(one.state));
  });

  it('never mutates the state it is given', () => {
    const s = duel(100);
    const snapshot = JSON.stringify(s);
    stepFu(s, input({ a: { slash: true, throw: true } }), DT);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it.each([['true'], [1], [{}], [[]], [null], [Number.NaN], ['']])(
    'only the boolean true counts as a slash (%j does not)',
    (value) => {
      const hostile = new Map([['a', { slash: value as unknown as boolean }]]);
      const { state, events } = run(duel(100), 1, hostile);
      expect(types(events)).toEqual([]);
      expect(player(state, 'b').alive).toBe(true);
    },
  );

  it('fuzz: slash invariants hold over thousands of random steps', () => {
    let seed = 987654;
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
    let swings = 0;
    for (let i = 0; i < 6000; i += 1) {
      const frame: FuInputs = new Map(
        s.players.map((p) => [
          p.id,
          {
            move: { x: random() * 2 - 1, y: random() * 2 - 1 },
            throw: random() < 0.05,
            slash: random() < 0.08,
          },
        ]),
      );
      const result = stepFu(s, frame, DT);
      s = result.state;
      swings += result.events.filter((e) => e.type === 'SLASHED').length;
      for (const p of s.players) {
        if (p.slash.phase === 'READY') continue;
        expect(p.alive || s.phase === 'ROUND_OVER').toBe(true);
        expect(Math.hypot(p.slash.direction.x, p.slash.direction.y)).toBeCloseTo(1, 9);
        expect(p.slash.remaining).toBeGreaterThan(0);
        const limit = p.slash.phase === 'ACTIVE' ? C.slashActiveSeconds : C.slashRecoverySeconds;
        expect(p.slash.remaining).toBeLessThanOrEqual(limit + 1e-9);
        // the weapon is in hand for the whole swing
        if (p.slash.phase === 'ACTIVE') expect(boom(s, p.id).state).toBe('HELD');
      }
    }
    expect(swings).toBeGreaterThan(20);
  }, 30_000); // a long loop of per-step assertions; generous so a loaded CI machine cannot flake it
});
