import { describe, expect, it } from 'vitest';
import type { MovementInput } from '../src/input';
import { createSeededRandom } from '../src/random';
import { step } from '../src/step';
import { FIXED_TIMESTEP_SECONDS, MAX_STEP_SECONDS } from '../src/time';
import type { WorldState } from '../src/world';
import {
  DOWN,
  LEFT,
  MAX_SPEED,
  RIGHT,
  STILL,
  UP,
  at,
  body,
  deepFreeze,
  frame,
  makeWorld,
} from './support/worlds';

const DT = FIXED_TIMESTEP_SECONDS;

/** Advances `seconds` of simulated time using `stepsPerSecond` equal steps. */
function run(
  start: WorldState,
  inputs: ReturnType<typeof frame>,
  seconds: number,
  stepsPerSecond: number,
): WorldState {
  let state = start;
  for (let i = 0; i < Math.round(seconds * stepsPerSecond); i += 1) {
    state = step(state, inputs, 1 / stepsPerSecond);
  }
  return state;
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

describe('UNITS: world units and seconds, never pixels or frames', () => {
  it('moves maxSpeed × dt world units in one step', () => {
    const next = step(makeWorld(), frame({ A: RIGHT }), DT);
    expect(at(next, 'A').x).toBeCloseTo(50 + MAX_SPEED * DT, 12);
    expect(at(next, 'A').y).toBe(30);
  });

  it('moves maxSpeed world units in one simulated second', () => {
    const after = run(makeWorld(), frame({ A: RIGHT }), 1, 60);
    expect(at(after, 'A').x).toBeCloseTo(60, 9);
  });

  it('covers the same distance in a second whatever the step size (60, 30, 120 Hz and 0.1 s steps)', () => {
    for (const stepsPerSecond of [10, 30, 60, 120]) {
      const after = run(makeWorld(), frame({ A: RIGHT }), 1, stepsPerSecond);
      expect(at(after, 'A').x, `${stepsPerSecond} steps/s`).toBeCloseTo(60, 9);
    }
  });

  it('scales with the configured maxSpeed', () => {
    const slow = run(makeWorld(undefined, { maxSpeed: 2 }), frame({ A: RIGHT }), 1, 60);
    expect(at(slow, 'A').x).toBeCloseTo(52, 9);
  });

  it('follows the analog response: after the dead zone, 0.575 deflection is half speed', () => {
    const after = run(makeWorld(), frame({ A: { x: 0.575, y: 0 } }), 1, 60);
    expect(at(after, 'A').x).toBeCloseTo(55, 9);
  });

  it('input +y increases y; −y decreases it (no handedness baked in: rendering decides what “down” is)', () => {
    expect(at(step(makeWorld(), frame({ A: DOWN }), DT), 'A').y).toBeGreaterThan(30);
    expect(at(step(makeWorld(), frame({ A: UP }), DT), 'A').y).toBeLessThan(30);
    expect(at(step(makeWorld(), frame({ A: LEFT }), DT), 'A').x).toBeLessThan(50);
  });
});

describe('SIMULATION TIME advances from state + dt only', () => {
  it('adds dt every step, moving or not', () => {
    const one = step(makeWorld(), frame({}), DT);
    expect(one.time).toBe(DT);
    let state = makeWorld();
    for (let i = 0; i < 60; i += 1) state = step(state, frame({}), DT);
    expect(state.time).toBeCloseTo(1, 12);
  });
});

describe('DIAGONAL: (1, 1) must never be faster than (1, 0)', () => {
  const travelled = (input: { x: number; y: number }) => {
    const after = run(makeWorld([{ id: 'A', x: 50, y: 30 }]), frame({ A: input }), 1, 60);
    return distance(at(after, 'A'), { x: 50, y: 30 });
  };

  it('moves exactly maxSpeed per second on the diagonal, same as straight', () => {
    expect(travelled({ x: 1, y: 1 })).toBeCloseTo(MAX_SPEED, 9);
    expect(travelled({ x: 1, y: 0 })).toBeCloseTo(MAX_SPEED, 9);
  });

  it.each([
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])('direction (%i, %i) covers the same distance', (x, y) => {
    expect(travelled({ x, y })).toBeCloseTo(MAX_SPEED, 9);
  });

  it('splits the diagonal evenly between the axes', () => {
    const after = run(makeWorld([{ id: 'A', x: 50, y: 30 }]), frame({ A: { x: 1, y: 1 } }), 1, 60);
    expect(at(after, 'A').x - 50).toBeCloseTo(MAX_SPEED * Math.SQRT1_2, 9);
    expect(at(after, 'A').y - 30).toBeCloseTo(MAX_SPEED * Math.SQRT1_2, 9);
  });

  it('hostile out-of-range input cannot exceed maxSpeed either', () => {
    expect(travelled({ x: 5, y: 5 })).toBeCloseTo(MAX_SPEED, 9);
    expect(travelled({ x: 1000, y: -1000 })).toBeCloseTo(MAX_SPEED, 9);
  });
});

describe('DEAD ZONE through the simulation', () => {
  it('input inside it does not move the body at all, and leaves the very same body object', () => {
    const world = makeWorld();
    for (const m of [0.05, 0.1, 0.149, 0.15]) {
      const next = step(world, frame({ A: { x: m, y: 0 } }), DT);
      expect(body(next, 'A')).toBe(body(world, 'A'));
    }
  });

  it('input just outside it moves proportionally slowly (no jump)', () => {
    const world = makeWorld(undefined, { maxSpeed: 10 });
    const next = step(world, frame({ A: { x: 0.2, y: 0 } }), 0.1);
    expect(at(next, 'A').x - 50).toBeCloseTo(10 * ((0.2 - 0.15) / 0.85) * 0.1, 12);
  });

  it('with the dead zone disabled, a still stick leaves the body exactly where it is (no NaN)', () => {
    const world = makeWorld(undefined, { maxSpeed: 10, deadZone: 0 });
    const next = step(world, frame({ A: STILL, B: { x: -0, y: 0 } }), DT);
    expect(body(next, 'A')).toBe(body(world, 'A'));
    expect(body(next, 'B')).toBe(body(world, 'B'));
  });

  it('honors a configured dead zone', () => {
    const world = makeWorld(undefined, { maxSpeed: 10, deadZone: 0.5 });
    expect(body(step(world, frame({ A: { x: 0.4, y: 0 } }), DT), 'A')).toBe(body(world, 'A'));
    expect(at(step(world, frame({ A: { x: 0.8, y: 0 } }), DT), 'A').x).toBeGreaterThan(50);
  });
});

describe('INPUT FRAMES are keyed by id, and missing input means zero movement', () => {
  it('a player missing from the frame does not move, even if they moved last step', () => {
    let state = makeWorld();
    state = step(state, frame({ A: RIGHT, B: RIGHT, C: RIGHT }), DT);
    const bAfterFirst = at(state, 'B');
    state = step(state, frame({ A: RIGHT, C: RIGHT }), DT); // B absent
    expect(at(state, 'B')).toEqual(bAfterFirst); // no “keep doing what you were doing”
    expect(at(state, 'A').x).toBeGreaterThan(at(step(makeWorld(), frame({ A: RIGHT }), DT), 'A').x);
  });

  it('an empty frame moves nobody but time still passes', () => {
    const world = makeWorld();
    const next = step(world, frame({}), DT);
    expect(next.bodies).toEqual(world.bodies);
    expect(next.time).toBe(DT);
  });

  it('is keyed by id, not by array position', () => {
    const reordered = makeWorld([
      { id: 'C', x: 60, y: 40 },
      { id: 'A', x: 50, y: 30 },
      { id: 'B', x: 40, y: 20 },
    ]);
    const next = step(reordered, frame({ A: RIGHT }), DT);
    expect(at(next, 'A').x).toBeGreaterThan(50); // A moved although it is bodies[1]
    expect(at(next, 'C')).toEqual({ x: 60, y: 40 }); // bodies[0] did not
    expect(next.bodies.map((b) => b.id)).toEqual(['C', 'A', 'B']); // order preserved
  });

  it('does not depend on the insertion order of the frame', () => {
    const inputs = [
      ['A', RIGHT],
      ['B', LEFT],
      ['C', DOWN],
    ] as const;
    const forward = step(makeWorld(), new Map<string, MovementInput>(inputs), DT);
    const backward = step(makeWorld(), new Map<string, MovementInput>([...inputs].reverse()), DT);
    expect(JSON.stringify(forward)).toBe(JSON.stringify(backward));
  });

  it('ignores input for ids that are not in the world', () => {
    const world = makeWorld();
    const next = step(world, frame({ GHOST: RIGHT, A: RIGHT }), DT);
    expect(next.bodies.map((b) => b.id)).toEqual(['A', 'B', 'C']);
    expect(at(next, 'A').x).toBeGreaterThan(50);
  });

  it('survives an id like "__proto__" or "constructor" in a frame', () => {
    const world = makeWorld([
      { id: '__proto__', x: 10, y: 10 },
      { id: 'constructor', x: 20, y: 20 },
    ]);
    const next = step(
      world,
      new Map<string, MovementInput>([
        ['__proto__', RIGHT],
        ['constructor', DOWN],
      ]),
      DT,
    );
    expect(at(next, '__proto__').x).toBeGreaterThan(10);
    expect(at(next, 'constructor').y).toBeGreaterThan(20);
  });

  it('non-finite input is treated as zero movement and never poisons the state', () => {
    const next = step(
      makeWorld(),
      frame({ A: { x: Number.NaN, y: 1 }, B: { x: Number.POSITIVE_INFINITY, y: 0 }, C: RIGHT }),
      DT,
    );
    expect(at(next, 'A')).toEqual({ x: 50, y: 30 });
    expect(at(next, 'B')).toEqual({ x: 40, y: 20 });
    for (const b of next.bodies) {
      expect(Number.isFinite(b.position.x) && Number.isFinite(b.position.y)).toBe(true);
    }
  });
});

describe('MULTIPLAYER ISOLATION', () => {
  it('P1 right, P2 still → only P1 moves', () => {
    const next = step(makeWorld(), frame({ A: RIGHT, B: STILL }), DT);
    expect(at(next, 'A').x).toBeGreaterThan(50);
    expect(at(next, 'B')).toEqual({ x: 40, y: 20 });
    expect(at(next, 'C')).toEqual({ x: 60, y: 40 });
  });

  it('P1 right, P2 left → both move, independently and in opposite directions', () => {
    const after = run(makeWorld(), frame({ A: RIGHT, B: LEFT }), 1, 60);
    expect(at(after, 'A').x).toBeCloseTo(60, 9);
    expect(at(after, 'B').x).toBeCloseTo(30, 9);
    expect(at(after, 'A').y).toBe(30);
    expect(at(after, 'B').y).toBe(20);
    expect(at(after, 'C')).toEqual({ x: 60, y: 40 });
  });

  it('three players with three different inputs each follow only their own', () => {
    const after = run(makeWorld(), frame({ A: UP, B: DOWN, C: { x: 1, y: 1 } }), 1, 60);
    expect(at(after, 'A')).toEqual({ x: 50, y: expect.closeTo(20, 9) });
    expect(at(after, 'B')).toEqual({ x: 40, y: expect.closeTo(30, 9) });
    expect(at(after, 'C').x).toBeCloseTo(60 + MAX_SPEED * Math.SQRT1_2, 9);
    expect(at(after, 'C').y).toBeCloseTo(40 + MAX_SPEED * Math.SQRT1_2, 9);
  });

  it('a player pinned against a wall does not affect one moving freely', () => {
    const world = makeWorld([
      { id: 'A', x: 99, y: 30 },
      { id: 'B', x: 50, y: 30 },
    ]);
    const after = run(world, frame({ A: RIGHT, B: RIGHT }), 1, 60);
    expect(at(after, 'A').x).toBe(99);
    expect(at(after, 'B').x).toBeCloseTo(60, 9);
  });
});

describe('ARENA BOUNDS account for the body radius', () => {
  const edges: [
    string,
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ][] = [
    ['right wall', { x: 98, y: 30 }, RIGHT, { x: 99, y: 30 }],
    ['left wall', { x: 2, y: 30 }, LEFT, { x: 1, y: 30 }],
    ['top wall', { x: 50, y: 2 }, UP, { x: 50, y: 1 }],
    ['bottom wall', { x: 50, y: 58 }, DOWN, { x: 50, y: 59 }],
  ];

  it.each(edges)(
    'stops at the %s with the circle’s edge — not its center — on the boundary',
    (_n, start, input, expected) => {
      const after = run(makeWorld([{ id: 'A', ...start }]), frame({ A: input }), 3, 60);
      expect(at(after, 'A')).toEqual(expected);
    },
  );

  const corners: [
    string,
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ][] = [
    ['top-left', { x: 5, y: 5 }, { x: -1, y: -1 }, { x: 1, y: 1 }],
    ['top-right', { x: 95, y: 5 }, { x: 1, y: -1 }, { x: 99, y: 1 }],
    ['bottom-left', { x: 5, y: 55 }, { x: -1, y: 1 }, { x: 1, y: 59 }],
    ['bottom-right', { x: 95, y: 55 }, { x: 1, y: 1 }, { x: 99, y: 59 }],
  ];

  it.each(corners)('settles exactly in the %s corner', (_n, start, input, expected) => {
    const after = run(makeWorld([{ id: 'A', ...start }]), frame({ A: input }), 5, 60);
    expect(at(after, 'A')).toEqual(expected);
  });

  it('uses each body’s own radius', () => {
    const world = makeWorld([
      { id: 'small', x: 50, y: 30, radius: 1 },
      { id: 'big', x: 50, y: 40, radius: 3 },
    ]);
    const after = run(world, frame({ small: RIGHT, big: RIGHT }), 10, 60);
    expect(at(after, 'small').x).toBe(99);
    expect(at(after, 'big').x).toBe(97);
  });

  it('slides along a wall instead of sticking to it', () => {
    const world = makeWorld([{ id: 'A', x: 99, y: 30 }]);
    const after = run(world, frame({ A: { x: 1, y: 1 } }), 1, 60);
    expect(at(after, 'A').x).toBe(99); // held by the wall
    expect(at(after, 'A').y - 30).toBeCloseTo(MAX_SPEED * Math.SQRT1_2, 9); // still slides along it
  });

  it('never overshoots, even with a large step at a high speed', () => {
    const world = makeWorld([{ id: 'A', x: 98, y: 30 }], { maxSpeed: 1000 });
    const next = step(world, frame({ A: RIGHT }), MAX_STEP_SECONDS); // would travel 100 units
    expect(at(next, 'A').x).toBe(99);
  });

  it('a body at rest against a wall stays exactly there', () => {
    const world = makeWorld([{ id: 'A', x: 99, y: 59 }]);
    expect(body(step(world, frame({ A: { x: 1, y: 1 } }), DT), 'A')).toBe(body(world, 'A'));
  });

  it('never leaves the arena, and never becomes non-finite, over thousands of hostile steps', () => {
    const random = createSeededRandom(2024);
    const wild = () => {
      const roll = random.next();
      if (roll < 0.03) return Number.NaN;
      if (roll < 0.06) return Number.POSITIVE_INFINITY;
      return (random.next() - 0.5) * (roll < 0.2 ? 20 : 2.4); // sometimes far out of range
    };
    let state = makeWorld(
      [
        { id: 'A', x: 50, y: 30 },
        { id: 'B', x: 10, y: 10, radius: 4 },
      ],
      { maxSpeed: 40 },
    );
    for (let i = 0; i < 5000; i += 1) {
      state = step(state, frame({ A: { x: wild(), y: wild() }, B: { x: wild(), y: wild() } }), DT);
      for (const b of state.bodies) {
        expect(b.position.x).toBeGreaterThanOrEqual(b.radius);
        expect(b.position.x).toBeLessThanOrEqual(100 - b.radius);
        expect(b.position.y).toBeGreaterThanOrEqual(b.radius);
        expect(b.position.y).toBeLessThanOrEqual(60 - b.radius);
      }
    }
  });
});

describe('NO COLLISIONS in this slice: bodies pass straight through each other', () => {
  it('two bodies on a collision course swap sides untouched', () => {
    const world = makeWorld([
      { id: 'A', x: 40, y: 30 },
      { id: 'B', x: 60, y: 30 },
    ]);
    const after = run(world, frame({ A: RIGHT, B: LEFT }), 2, 60);
    expect(at(after, 'A').x).toBeCloseTo(60, 9);
    expect(at(after, 'B').x).toBeCloseTo(40, 9);
  });
});

describe('THE dt CONTRACT', () => {
  it('zero is a valid no-op: the very same state comes back', () => {
    const world = makeWorld();
    expect(step(world, frame({ A: RIGHT }), 0)).toBe(world);
  });

  it.each([FIXED_TIMESTEP_SECONDS, 1e-9, 0.05, MAX_STEP_SECONDS])('accepts %s', (dt) => {
    expect(() => step(makeWorld(), frame({ A: RIGHT }), dt)).not.toThrow();
  });

  it.each([
    -1e-9,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    MAX_STEP_SECONDS + 1e-9,
    1,
    500,
    Number.MAX_VALUE,
  ])('rejects %s as a contract violation, changing nothing', (dt) => {
    const world = makeWorld();
    const snapshot = JSON.stringify(world);
    expect(() => step(world, frame({ A: RIGHT }), dt)).toThrow(RangeError);
    expect(JSON.stringify(world)).toBe(snapshot);
  });
});

describe('IMMUTABILITY', () => {
  it('never mutates the previous state, even a deeply frozen one', () => {
    const world = deepFreeze(makeWorld());
    const snapshot = JSON.stringify(world);
    const next = step(world, frame({ A: RIGHT, B: { x: 1, y: 1 } }), DT);
    expect(JSON.stringify(world)).toBe(snapshot);
    expect(next).not.toBe(world);
  });

  it('never mutates the input frame or its entries', () => {
    const entry = deepFreeze({ x: 0.9, y: -0.4 });
    const inputs = frame({ A: entry, B: RIGHT });
    step(makeWorld(), inputs, DT);
    expect([...inputs.keys()]).toEqual(['A', 'B']);
    expect(inputs.get('A')).toBe(entry);
    expect(entry).toEqual({ x: 0.9, y: -0.4 });
  });

  it('returns frozen state', () => {
    const next = step(makeWorld(), frame({ A: RIGHT }), DT);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.bodies)).toBe(true);
    expect(Object.isFrozen(body(next, 'A'))).toBe(true);
    expect(Object.isFrozen(at(next, 'A'))).toBe(true);
  });

  it('shares unchanged bodies between states (cheap change detection)', () => {
    const world = makeWorld();
    const next = step(world, frame({ A: RIGHT }), DT);
    expect(body(next, 'B')).toBe(body(world, 'B'));
    expect(body(next, 'C')).toBe(body(world, 'C'));
    expect(body(next, 'A')).not.toBe(body(world, 'A'));
  });
});
