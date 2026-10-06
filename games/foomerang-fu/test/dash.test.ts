import { FIXED_TIMESTEP_SECONDS as DT } from '@foomerang/game-core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FU_CONFIG,
  PRIMITIVE_ARENA,
  createFuMatch,
  stepFu,
  type FuConfig,
  isFatigued,
  type FuEvent,
  type FuInputs,
  type FuState,
} from '../src/rules';
import { distanceToRect } from '../src/rules/arena';

// ------------------------------------------------------------------------------------------
// DASH (Slice 4, an experiment): a short, committed, directional burst of movement. It is movement
// and nothing else — no invulnerability, no attack — and it obeys the same walls, boundaries and
// bodies as walking. States are plain data, so tests arrange a situation by copying and patching.
// ------------------------------------------------------------------------------------------

const C = DEFAULT_FU_CONFIG;
const R = C.playerRadius;
const NONE: FuInputs = new Map();
type Press = {
  move?: { x: number; y: number };
  throw?: boolean;
  slash?: boolean;
  dash?: boolean;
};
const input = (entries: Record<string, Press>): FuInputs => new Map(Object.entries(entries));
const DASH_A = input({ a: { dash: true } });
const DISTANCE = C.dashSpeed * C.dashSeconds;

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
const at = (s: FuState, id: string) =>
  must(
    s.world.bodies.find((b) => b.id === id),
    `body ${id}`,
  ).position;
const types = (events: readonly FuEvent[]) => events.map((e) => e.type);
const phase = (s: FuState, id: string) => player(s, id).dash.phase;
const gap = (s: FuState, a: string, b: string) =>
  Math.hypot(at(s, a).x - at(s, b).x, at(s, a).y - at(s, b).y);

/** Runs `count` steps of `dt`, applying `inputs` on the first step only unless `repeat` is set. */
function run(
  state: FuState,
  count: number,
  inputs: FuInputs = NONE,
  { dt = DT, repeat = false }: { dt?: number; repeat?: boolean } = {},
): { state: FuState; events: FuEvent[] } {
  let s = state;
  const events: FuEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const result = stepFu(s, i === 0 || repeat ? inputs : NONE, dt);
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

/** Alice (a) at (600, 450) facing right, Bob (b) far away, in the OPEN arena unless overridden. */
function lone(overrides: Partial<FuConfig> = {}): FuState {
  let s = createFuMatch(
    [
      { id: 'a', slot: 0 },
      { id: 'b', slot: 3 },
    ],
    overrides,
  );
  s = place(s, 'a', 600, 450);
  s = place(s, 'b', 1500, 850);
  return face(s, 'a', 1, 0);
}

/** The same, in the walled test arena. */
const walled = (): FuState => lone({ arena: PRIMITIVE_ARENA });

/** Dashes until the dash is over (leaves DASHING); returns the state and how many steps it took. */
function finishDash(
  start: FuState,
  id: string,
  dt = DT,
): { state: FuState; steps: number; events: FuEvent[] } {
  let s = start;
  const events: FuEvent[] = [];
  let steps = 0;
  while (phase(s, id) === 'DASHING' && steps < 500) {
    const result = stepFu(s, NONE, dt);
    s = result.state;
    events.push(...result.events);
    steps += 1;
  }
  return { state: s, steps, events };
}

describe('the DASH state machine: READY → DASHING → READY (fatigue limits spamming, not a cooldown)', () => {
  it('everybody starts READY, and so does everybody after a round reset', () => {
    const s = lone();
    expect(s.players.map((p) => p.dash)).toEqual([{ phase: 'READY' }, { phase: 'READY' }]);
  });

  it('a press from READY starts the dash: DASHING, locked to the thumb direction, announced once', () => {
    const { state, events } = run(lone(), 1, input({ a: { dash: true, move: { x: 0, y: 1 } } }));
    expect(player(state, 'a').dash).toMatchObject({ phase: 'DASHING', direction: { x: 0, y: 1 } });
    const dashed = events.filter((e) => e.type === 'DASHED');
    expect(dashed).toEqual([
      { type: 'DASHED', playerId: 'a', position: { x: 600, y: 450 }, direction: { x: 0, y: 1 } },
    ]);
  });

  it('with the thumb in the dead zone or untouched it dashes the way the player faces', () => {
    for (const press of [
      { dash: true },
      { dash: true, move: { x: 0, y: 0 } },
      { dash: true, move: { x: 0.05, y: -0.05 } },
    ] as Press[]) {
      const s = face(lone(), 'a', 0, -1);
      const { state } = run(s, 1, input({ a: press }));
      expect(player(state, 'a').dash).toMatchObject({
        phase: 'DASHING',
        direction: { x: 0, y: -1 },
      });
      expect(player(state, 'a').facing).toEqual({ x: 0, y: -1 });
    }
  });

  it('with no thumb and no facing at all it still dashes, deterministically, to the right', () => {
    const s = face(lone(), 'a', 0, 0);
    const { state } = run(s, 1, DASH_A);
    expect(player(state, 'a').dash).toMatchObject({ phase: 'DASHING', direction: { x: 1, y: 0 } });
    expect(at(state, 'a').x).toBeGreaterThan(600);
  });

  it('a thumb direction becomes the facing too, as it does for walking', () => {
    const { state } = run(lone(), 1, input({ a: { dash: true, move: { x: -1, y: 0 } } }));
    expect(player(state, 'a').facing).toEqual({ x: -1, y: 0 });
  });

  it('covers exactly dashSpeed × dashSeconds in open ground, in a whole number of steps', () => {
    const started = run(lone(), 1, DASH_A);
    const done = finishDash(started.state, 'a');
    const total = done.steps + 1;
    expect(total).toBe(Math.ceil(C.dashSeconds / DT - 1e-9));
    expect(at(done.state, 'a').x - 600).toBeCloseTo(DISTANCE, 6);
    expect(at(done.state, 'a').y).toBeCloseTo(450, 9);
    expect(phase(done.state, 'a')).toBe('READY'); // no cooldown: ready again at once
  });

  it('is a discrete burst, not a speed boost: letting go of the button changes nothing, holding changes nothing', () => {
    const tapped = finishDash(run(lone(), 1, DASH_A).state, 'a').state;
    const held = finishDash(run(lone(), 1, DASH_A, { repeat: true }).state, 'a').state;
    expect(at(held, 'a')).toEqual(at(tapped, 'a'));
  });

  it('is committed: the thumb cannot steer it, and does not turn the player, while it lasts', () => {
    const s = run(lone(), 1, DASH_A).state;
    const { state } = run(s, 4, input({ a: { move: { x: -1, y: -1 } } }), { repeat: true });
    expect(phase(state, 'a')).toBe('DASHING');
    expect(at(state, 'a').y).toBeCloseTo(450, 9); // still dead straight
    expect(at(state, 'a').x).toBeGreaterThan(600 + 4 * C.dashSpeed * DT);
    expect(player(state, 'a').facing).toEqual({ x: 1, y: 0 });
  });

  it('has NO cooldown: after the burst a press dashes again on the very next step, and walking is normal until then', () => {
    const over = finishDash(run(lone(), 1, DASH_A).state, 'a').state;
    expect(phase(over, 'a')).toBe('READY');
    const walked = run(over, 6, input({ a: { move: { x: 0, y: 1 } } }), { repeat: true });
    expect(at(walked.state, 'a').y - at(over, 'a').y).toBeCloseTo(6 * C.playerSpeed * DT, 6);
    const again = run(over, 1, DASH_A);
    expect(types(again.events)).toContain('DASHED');
    expect(phase(again.state, 'a')).toBe('DASHING');
  });

  it('pressing every step dashes back to back: one dash begins the step after the last one ended', () => {
    let s = lone({ arena: { width: 12000, height: 900 } });
    s = place(s, 'a', 100, 450);
    let step = 0;
    const startedAt: number[] = [];
    for (let guard = 0; startedAt.length < 3 && guard < 2000; guard += 1) {
      const result = stepFu(s, DASH_A, DT);
      s = result.state;
      step += 1;
      if (result.events.some((e) => e.type === 'DASHED')) startedAt.push(step);
    }
    const dashSteps = Math.ceil(C.dashSeconds / DT - 1e-9);
    expect(startedAt).toEqual([1, 1 + dashSteps, 1 + 2 * dashSteps]);
  });

  it('repeated presses while DASHING neither restart nor extend it', () => {
    const plain = finishDash(run(lone(), 1, DASH_A).state, 'a');
    const spammed = run(lone(), 1, DASH_A);
    const mashed = run(spammed.state, plain.steps, DASH_A, { repeat: true });
    expect(types(mashed.events)).not.toContain('DASHED');
    expect(at(mashed.state, 'a')).toEqual(at(plain.state, 'a'));
    expect(phase(mashed.state, 'a')).toBe('READY');
  });

  it('only the boolean true counts; garbage, and a dead player, do nothing', () => {
    for (const dash of ['yes', 1, {}, null, undefined, false]) {
      const { state } = run(lone(), 1, input({ a: { dash } as unknown as Press }));
      expect(phase(state, 'a')).toBe('READY');
    }
    const dead = run(kill(lone(), 'a'), 3, DASH_A, { repeat: true }).state;
    expect(phase(dead, 'a')).toBe('READY');
    expect(at(dead, 'a')).toEqual({ x: 600, y: 450 });
  });

  it('a press for a player who is not in the match is ignored', () => {
    const { state, events } = run(lone(), 1, input({ nobody: { dash: true } }));
    expect(types(events)).toEqual([]);
    expect(state.players.every((p) => p.dash.phase === 'READY')).toBe(true);
  });

  it('is deterministic: the same state and inputs give the same result', () => {
    const a = run(lone(), 20, DASH_A);
    const b = run(lone(), 20, DASH_A);
    expect(a).toEqual(b);
  });

  it('a dt of 0 is a no-op even with a press', () => {
    const s = lone();
    expect(stepFu(s, DASH_A, 0).state).toBe(s);
  });
});

describe('DASH never lets dt change the distance (high accepted dt, no teleporting)', () => {
  it('one big step moves exactly as far as the same time in fixed steps', () => {
    const fixed = run(lone(), 6, DASH_A, { dt: DT });
    const big = run(lone(), 1, DASH_A, { dt: 6 * DT });
    expect(at(big.state, 'a').x).toBeCloseTo(at(fixed.state, 'a').x, 6);
    expect(player(big.state, 'a').dash).toMatchObject({ phase: 'DASHING' });
  });

  it('the whole dash is dt-invariant to within the step', () => {
    const big = run(lone(), 1, DASH_A, { dt: 0.1 });
    const done = finishDash(big.state, 'a', 0.1);
    expect(at(done.state, 'a').x - 600).toBeCloseTo(DISTANCE, 6);
    expect(phase(done.state, 'a')).toBe('READY');
  });

  it('fatigue timing is dt-invariant too: the same time in big steps leaves the same recovery time', () => {
    const fixed = run(lone(), 12, DASH_A, { dt: DT }).state;
    const big = run(run(lone(), 1, DASH_A, { dt: 6 * DT }).state, 1, NONE, { dt: 6 * DT }).state;
    expect(player(big, 'a').fatigue.recoverIn).toBeCloseTo(player(fixed, 'a').fatigue.recoverIn, 9);
  });
});

describe('DASH + walls and the arena boundary: it obeys the same geometry as walking', () => {
  it('stops against a wall, in contact, never inside it', () => {
    // The central block's left face is x = 700; a body of radius 36 stops with its centre at 664.
    const s = place(walled(), 'a', 600, 450);
    const done = finishDash(run(s, 1, DASH_A).state, 'a');
    expect(at(done.state, 'a').x).toBeCloseTo(700 - R, 6);
    expect(at(done.state, 'a').y).toBeCloseTo(450, 9);
  });

  it('slides along a wall when it meets it at an angle, rather than stopping dead', () => {
    // Heading down-right into the central block's left face, the downward part carries on.
    const s = place(walled(), 'a', 640, 380);
    const { state } = run(s, 1, input({ a: { dash: true, move: { x: 1, y: 1 } } }));
    const done = finishDash(state, 'a');
    expect(at(done.state, 'a').x).toBeLessThanOrEqual(700 - R + 1e-6);
    expect(at(done.state, 'a').y).toBeGreaterThan(380 + 40);
  });

  it('stops at the arena boundary and slides along it', () => {
    const left = finishDash(
      run(place(lone(), 'a', 100, 450), 1, input({ a: { dash: true, move: { x: -1, y: 0 } } }))
        .state,
      'a',
    );
    expect(at(left.state, 'a').x).toBeCloseTo(R, 9);
    const corner = finishDash(
      run(place(lone(), 'a', 100, 120), 1, input({ a: { dash: true, move: { x: -1, y: -0.3 } } }))
        .state,
      'a',
    );
    expect(at(corner.state, 'a').x).toBeGreaterThanOrEqual(R - 1e-9);
    expect(at(corner.state, 'a').y).toBeGreaterThanOrEqual(R - 1e-9);
    const bottomRight = finishDash(
      run(place(lone(), 'a', 1550, 850), 1, input({ a: { dash: true, move: { x: 1, y: 1 } } }))
        .state,
      'a',
    );
    expect(at(bottomRight.state, 'a').x).toBeLessThanOrEqual(1600 - R + 1e-9);
    expect(at(bottomRight.state, 'a').y).toBeLessThanOrEqual(900 - R + 1e-9);
  });

  it.each([DT, 0.1])(
    'never tunnels through any wall of the test arena, in any of four directions, at dt = %s',
    (dt) => {
      const arena = PRIMITIVE_ARENA;
      const walls = arena.walls ?? [];
      const directions = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];
      let checked = 0;
      for (const wall of walls) {
        const centre = { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 };
        for (const d of directions) {
          for (const closeBy of [R + 1, R + 20, R + 60, R + 120]) {
            // Start `closeBy` outside the face the dash will run into, aligned with the wall's middle.
            const start = {
              x: centre.x - d.x * (wall.width / 2 + closeBy),
              y: centre.y - d.y * (wall.height / 2 + closeBy),
            };
            if (
              start.x < R ||
              start.x > 1600 - R ||
              start.y < R ||
              start.y > 900 - R ||
              walls.some((w) => distanceToRect(start, w) < R)
            )
              continue;
            let s = place(walled(), 'a', start.x, start.y);
            s = run(s, 1, input({ a: { dash: true, move: d } }), { dt }).state;
            for (let i = 0; i < 40 && phase(s, 'a') === 'DASHING'; i += 1) {
              s = stepFu(s, NONE, dt).state;
              const p = at(s, 'a');
              for (const w of walls) {
                expect(
                  distanceToRect(p, w),
                  `wall ${JSON.stringify(w)} from ${JSON.stringify(start)}`,
                ).toBeGreaterThanOrEqual(R - 1e-6);
              }
              // never across the wall this dash was aimed at
              expect((p.x - centre.x) * d.x + (p.y - centre.y) * d.y).toBeLessThan(0);
            }
            checked += 1;
          }
        }
      }
      expect(checked).toBeGreaterThan(30); // the sweep really did cover the geometry
    },
  );

  it('a dash cannot squeeze through a corridor wall, and one body wide still means one body wide', () => {
    // The left corridor is x 250–350. Dashing sideways at it from the open side must stop at its wall.
    const s = place(walled(), 'a', 100, 450);
    const done = finishDash(
      run(s, 1, input({ a: { dash: true, move: { x: 1, y: 0 } } })).state,
      'a',
    );
    expect(at(done.state, 'a').x).toBeCloseTo(200 - R, 6);
  });
});

describe('DASH + players: bodies stay solid', () => {
  const pair = (distance: number): FuState => {
    let s = lone();
    s = place(s, 'b', 600 + distance, 450);
    return s;
  };

  it('stops at contact with a living player, shoves nobody, and the dash is over', () => {
    const s = run(pair(200), 1, DASH_A).state;
    const done = finishDash(s, 'a');
    expect(gap(done.state, 'a', 'b')).toBeGreaterThanOrEqual(2 * R - 1e-6);
    expect(gap(done.state, 'a', 'b')).toBeLessThan(2 * R + 1);
    expect(at(done.state, 'b')).toEqual({ x: 800, y: 450 }); // not pushed
    expect(phase(done.state, 'a')).toBe('READY'); // blocked: the burst ends
    expect(player(done.state, 'b').alive).toBe(true); // a dash is not an attack
    expect(done.events.some((e) => e.type === 'HIT')).toBe(false);
  });

  it('a dash that starts already in contact, pointing at the player, goes nowhere', () => {
    const s = run(pair(2 * R), 1, DASH_A).state;
    expect(at(s, 'a')).toEqual({ x: 600, y: 450 });
    expect(at(s, 'b')).toEqual({ x: 600 + 2 * R, y: 450 });
  });

  it('a dash that starts in contact but points away is free', () => {
    const s = run(pair(2 * R), 1, input({ a: { dash: true, move: { x: -1, y: 0 } } })).state;
    const done = finishDash(s, 'a');
    expect(at(done.state, 'a').x).toBeCloseTo(600 - DISTANCE, 6);
  });

  it('passes a player it does not touch', () => {
    let s = lone();
    s = place(s, 'b', 700, 450 + 2 * R + 5);
    const done = finishDash(run(s, 1, DASH_A).state, 'a');
    expect(at(done.state, 'a').x - 600).toBeCloseTo(DISTANCE, 6);
  });

  it('goes straight through the body of a dead player: the dead are not solid', () => {
    let s = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 3 },
        { id: 'c', slot: 1 },
      ],
      {},
    );
    s = place(place(place(s, 'a', 600, 450), 'b', 700, 450), 'c', 1500, 850);
    s = face(kill(s, 'b'), 'a', 1, 0);
    const done = finishDash(run(s, 1, DASH_A).state, 'a');
    expect(at(done.state, 'a').x - 600).toBeCloseTo(DISTANCE, 6);
  });

  it('two players dashing at each other stop in contact without overlap, and neither is favoured', () => {
    const build = (order: 'ab' | 'ba'): FuState => {
      const specs =
        order === 'ab'
          ? [
              { id: 'a', slot: 0 },
              { id: 'b', slot: 3 },
            ]
          : [
              { id: 'b', slot: 3 },
              { id: 'a', slot: 0 },
            ];
      let s = createFuMatch(specs, {});
      s = place(place(s, 'a', 600, 450), 'b', 600 + 300, 450);
      return face(face(s, 'a', 1, 0), 'b', -1, 0);
    };
    const press = input({ a: { dash: true }, b: { dash: true } });
    const outcome = (order: 'ab' | 'ba') => {
      let s = run(build(order), 1, press).state;
      for (
        let i = 0;
        i < 200 && (phase(s, 'a') === 'DASHING' || phase(s, 'b') === 'DASHING');
        i += 1
      )
        s = stepFu(s, NONE, DT).state;
      return s;
    };
    const ab = outcome('ab');
    const ba = outcome('ba');
    expect(gap(ab, 'a', 'b')).toBeGreaterThanOrEqual(2 * R - 1e-6);
    expect(gap(ab, 'a', 'b')).toBeLessThan(2 * R + 2);
    expect(at(ab, 'a').x).toBeLessThan(at(ab, 'b').x); // nobody passed anybody
    // symmetric about the midpoint, and identical whichever player was first in the match
    expect(at(ab, 'a').x + at(ab, 'b').x).toBeCloseTo(600 + 900, 6);
    expect(at(ba, 'a')).toEqual(at(ab, 'a'));
    expect(at(ba, 'b')).toEqual(at(ab, 'b'));
    expect(phase(ab, 'a')).toBe('READY');
    expect(phase(ab, 'b')).toBe('READY');
  });

  it('a walker who walks into a dasher cannot overlap them or pass through', () => {
    let s = lone();
    s = place(s, 'b', 800, 450);
    s = face(s, 'b', -1, 0);
    let current = run(s, 1, input({ a: { dash: true }, b: { move: { x: -1, y: 0 } } })).state;
    for (let i = 0; i < 20; i += 1) {
      current = stepFu(current, input({ b: { move: { x: -1, y: 0 } } }), DT).state;
      expect(gap(current, 'a', 'b')).toBeGreaterThanOrEqual(2 * R - 1e-6);
      expect(at(current, 'a').x).toBeLessThan(at(current, 'b').x);
    }
  });

  it.each([DT, 0.1])('never tunnels through a player at dt = %s, from any starting gap', (dt) => {
    for (let distance = 2 * R; distance <= 2 * R + 260; distance += 13) {
      let s = run(pair(distance), 1, DASH_A, { dt }).state;
      for (let i = 0; i < 12; i += 1) s = stepFu(s, NONE, dt).state;
      expect(at(s, 'a').x, `gap ${distance}`).toBeLessThan(at(s, 'b').x);
      expect(gap(s, 'a', 'b'), `gap ${distance}`).toBeGreaterThanOrEqual(2 * R - 1e-6);
    }
  });
});

describe('DASH gives no invulnerability: a dashing player dies like anybody else', () => {
  /** Bob's boomerang is flying left along the lane towards Alice, `from` units to her right. */
  function incoming(from: number): FuState {
    let s = lone();
    s = place(s, 'b', 1500, 800);
    s = patchBoomerang(s, 'b', {
      state: 'THROWN',
      position: { x: 600 + from, y: 450 },
      direction: { x: -1, y: 0 },
      travelled: 0,
    });
    return s;
  }

  it('dashing into the path of a boomerang is a death', () => {
    // Alice stands clear above the lane, then dashes down into it as the boomerang arrives.
    let s = place(incoming(120), 'a', 600, 330);
    s = patchBoomerang(s, 'b', { position: { x: 740, y: 450 } });
    const outcome = run(s, 12, input({ a: { dash: true, move: { x: 0, y: 1 } } }));
    expect(
      outcome.events.some((e) => e.type === 'HIT' && e.victimId === 'a' && e.byId === 'b'),
    ).toBe(true);
    expect(player(outcome.state, 'a').alive).toBe(false);
  });

  it('dashing straight at an oncoming boomerang is a death — the two close faster, never skip past each other', () => {
    const outcome = run(incoming(260), 20, DASH_A);
    expect(outcome.events.some((e) => e.type === 'HIT' && e.victimId === 'a')).toBe(true);
  });

  it.each([260, 275, 290, 303, 317])(
    'dashing at an oncoming boomerang from %s units never lets it pass through unhurt',
    (from) => {
      const outcome = run(incoming(from), 25, DASH_A);
      expect(outcome.events.some((e) => e.type === 'HIT' && e.victimId === 'a')).toBe(true);
    },
  );

  it('a dash that really does clear the path in time survives — by position, not by immunity', () => {
    const s = incoming(300); // arrives in about twenty steps
    const dodged = run(s, 40, input({ a: { dash: true, move: { x: 0, y: -1 } } }));
    expect(player(dodged.state, 'a').alive).toBe(true);
    expect(at(dodged.state, 'a').y).toBeLessThan(450 - 100);
    const stood = run(s, 40);
    expect(player(stood.state, 'a').alive).toBe(false); // the same boomerang kills someone who stays
  });

  it('a boomerang that arrives while the dash is still under way kills', () => {
    // Dashing sideways along the boomerang's own lane: it hits mid-dash.
    const outcome = run(incoming(200), 6, input({ a: { dash: true, move: { x: 1, y: 0 } } }));
    expect(player(outcome.state, 'a').alive).toBe(false);
  });

  it('dashing into an active slash is a death', () => {
    let s = lone();
    s = place(s, 'b', 790, 450);
    s = face(s, 'b', -1, 0);
    // Bob swings; Alice, 190 away (outside the 130 reach), dashes into the arc while it is still active.
    s = place(s, 'a', 600, 450);
    const swung = run(s, 1, input({ b: { slash: true }, a: { dash: true } }));
    expect(swung.events.some((e) => e.type === 'SLASHED')).toBe(true);
    const outcome = run(swung.state, 6);
    const hits = [...swung.events, ...outcome.events].filter((e) => e.type === 'HIT');
    expect(hits).toEqual([expect.objectContaining({ victimId: 'a', byId: 'b' })]);
    expect(player(outcome.state, 'a').alive).toBe(false);
  });

  it('a dash that is over before the slash comes round lives', () => {
    let s = lone();
    s = place(s, 'b', 900, 450);
    s = face(s, 'b', -1, 0);
    const outcome = run(
      s,
      8,
      input({ a: { dash: true, move: { x: 0, y: -1 } }, b: { slash: true } }),
    );
    expect(player(outcome.state, 'a').alive).toBe(true);
  });

  it('is not an attack: dashing at and past a swinging or standing enemy hurts nobody by itself', () => {
    let s = lone();
    s = place(s, 'b', 800, 450);
    const outcome = run(s, 30, DASH_A);
    expect(outcome.events.some((e) => e.type === 'HIT')).toBe(false);
    expect(player(outcome.state, 'b').alive).toBe(true);
  });

  it('dying during a dash ends it and ends the movement: the dead stay where they fell', () => {
    // Three players, so that the round goes on after Alice dies and the death itself is what ends her dash.
    let s = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 3 },
        { id: 'c', slot: 1 },
      ],
      {},
    );
    s = place(place(place(s, 'a', 600, 450), 'b', 780, 450), 'c', 1500, 850);
    s = face(face(s, 'a', 1, 0), 'b', -1, 0);
    let current = run(s, 1, input({ b: { slash: true }, a: { dash: true } })).state;
    for (let i = 0; i < 100 && player(current, 'a').alive; i += 1)
      current = stepFu(current, NONE, DT).state;
    expect(current.phase).toBe('PLAYING');
    expect(player(current, 'a').dash).toEqual({ phase: 'READY' }); // ended on the very step they died
    const rest = at(current, 'a');
    current = run(current, 10, DASH_A, { repeat: true }).state;
    expect(at(current, 'a')).toEqual(rest);
  });
});

describe('DASH and the weapon: it neither replaces nor is replaced by SLASH or THROW', () => {
  it('works while the boomerang is away, and the boomerang goes on flying', () => {
    const s = patchBoomerang(lone(), 'a', {
      state: 'THROWN',
      position: { x: 700, y: 300 },
      direction: { x: 0, y: -1 },
      travelled: 0,
    });
    const { state } = run(s, 1, DASH_A);
    expect(phase(state, 'a')).toBe('DASHING');
    expect(boom(state, 'a').state).toBe('THROWN');
    expect(boom(state, 'a').position.y).toBeLessThan(300);
  });

  it('a boomerang returning to a dashing owner still comes home (and never kills them)', () => {
    let s = patchBoomerang(lone(), 'a', {
      state: 'RETURNING',
      position: { x: 900, y: 450 },
      direction: { x: 0, y: 0 },
      travelled: 0,
    });
    s = run(s, 1, DASH_A).state;
    const done = run(s, 80);
    expect(boom(done.state, 'a').state).toBe('HELD');
    expect(player(done.state, 'a').alive).toBe(true);
  });

  it('is refused while a slash is ACTIVE, and while it is RECOVERING; fine again when READY', () => {
    let s = lone();
    s = run(s, 1, input({ a: { slash: true } })).state;
    expect(player(s, 'a').slash.phase).toBe('ACTIVE');
    let current = run(s, 1, DASH_A).state;
    expect(phase(current, 'a')).toBe('READY');
    while (player(current, 'a').slash.phase === 'ACTIVE') current = stepFu(current, NONE, DT).state;
    expect(player(current, 'a').slash.phase).toBe('RECOVERING');
    const during = run(current, 1, DASH_A);
    expect(phase(during.state, 'a')).toBe('READY');
    expect(types(during.events)).not.toContain('DASHED');
    while (player(current, 'a').slash.phase === 'RECOVERING') {
      current = stepFu(current, DASH_A, DT).state; // pressing the whole time
      if (player(current, 'a').slash.phase === 'READY') break;
    }
    // On the very step the recovery ends, a press is accepted, exactly like SLASH after SLASH.
    expect(phase(current, 'a')).toBe('DASHING');
  });

  it('a slash that ended its recovery is followed by a dash on the next press', () => {
    let s = run(lone(), 1, input({ a: { slash: true } })).state;
    s = run(s, Math.ceil((C.slashActiveSeconds + C.slashRecoverySeconds) / DT) + 2).state;
    expect(player(s, 'a').slash.phase).toBe('READY');
    expect(phase(run(s, 1, DASH_A).state, 'a')).toBe('DASHING');
  });

  it('a slash pressed during a dash is refused (and not remembered); allowed once it is over', () => {
    const dashing = run(lone(), 1, DASH_A).state;
    const refused = run(dashing, 1, input({ a: { slash: true } }));
    expect(types(refused.events)).not.toContain('SLASHED');
    expect(player(refused.state, 'a').slash.phase).toBe('READY');
    const cooldown = finishDash(dashing, 'a').state;
    const allowed = run(cooldown, 1, input({ a: { slash: true } }));
    expect(types(allowed.events)).toContain('SLASHED');
  });

  it('a throw pressed during a dash is refused; allowed once it is over, and just before a dash', () => {
    const dashing = run(lone(), 1, DASH_A).state;
    const refused = run(dashing, 1, input({ a: { throw: true } }));
    expect(types(refused.events)).not.toContain('THROWN');
    expect(boom(refused.state, 'a').state).toBe('HELD');
    const cooldown = finishDash(dashing, 'a').state;
    expect(boom(run(cooldown, 1, input({ a: { throw: true } })).state, 'a').state).toBe('THROWN');
    // A throw on one step, a dash on the next: both happen.
    const thrown = run(lone(), 1, input({ a: { throw: true } })).state;
    const after = run(thrown, 1, DASH_A);
    expect(phase(after.state, 'a')).toBe('DASHING');
    expect(boom(after.state, 'a').state).not.toBe('HELD');
  });

  it('a dash immediately after a slash, or a slash immediately after a dash, is a refusal either way round', () => {
    // dash → slash on the next step: refused (still DASHING)
    const d = run(run(lone(), 1, DASH_A).state, 1, input({ a: { slash: true } }));
    expect(player(d.state, 'a').slash.phase).toBe('READY');
    // slash → dash on the next step: refused (ACTIVE)
    const sl = run(run(lone(), 1, input({ a: { slash: true } })).state, 1, DASH_A);
    expect(phase(sl.state, 'a')).toBe('READY');
  });

  it('SLASH and DASH on the same step: the slash wins and the dash is dropped, not delayed', () => {
    const { state, events } = run(lone(), 1, input({ a: { slash: true, dash: true } }));
    expect(types(events)).toEqual(['SLASHED']);
    expect(phase(state, 'a')).toBe('READY');
    expect(at(state, 'a')).toEqual({ x: 600, y: 450 });
    expect(phase(run(state, 5).state, 'a')).toBe('READY'); // not remembered
  });

  it('THROW and DASH on the same step: the throw wins and the dash is dropped', () => {
    const { state, events } = run(lone(), 1, input({ a: { throw: true, dash: true } }));
    expect(types(events)).toEqual(['THROWN']);
    expect(phase(state, 'a')).toBe('READY');
  });

  it('SLASH, THROW and DASH all on one step: only the slash happens', () => {
    const { state, events } = run(
      lone(),
      1,
      input({ a: { slash: true, throw: true, dash: true } }),
    );
    expect(types(events)).toEqual(['SLASHED']);
    expect(phase(state, 'a')).toBe('READY');
    expect(boom(state, 'a').state).toBe('HELD');
  });

  it('a SLASH that could not happen (boomerang away) does not cost the dash', () => {
    const away = patchBoomerang(lone(), 'a', {
      state: 'THROWN',
      position: { x: 700, y: 300 },
      direction: { x: 0, y: -1 },
      travelled: 0,
    });
    const { state, events } = run(away, 1, input({ a: { slash: true, dash: true } }));
    expect(types(events)).toContain('DASHED');
    expect(types(events)).not.toContain('SLASHED');
    expect(phase(state, 'a')).toBe('DASHING');
  });

  it('a THROW that could not happen (boomerang away) does not cost the dash', () => {
    const away = patchBoomerang(lone(), 'a', {
      state: 'THROWN',
      position: { x: 700, y: 300 },
      direction: { x: 0, y: -1 },
      travelled: 0,
    });
    const { state } = run(away, 1, input({ a: { throw: true, dash: true } }));
    expect(phase(state, 'a')).toBe('DASHING');
  });

  it('two players pressing DASH on the same step each dash, independently', () => {
    const s = place(lone(), 'b', 600, 700);
    const { state } = run(face(s, 'b', 1, 0), 3, input({ a: { dash: true }, b: { dash: true } }));
    expect(phase(state, 'a')).toBe('DASHING');
    expect(phase(state, 'b')).toBe('DASHING');
    expect(at(state, 'a').x).toBeCloseTo(at(state, 'b').x, 9);
  });

  it('dashing does not touch the slash or boomerang rules: a slash after the dash is the same slash', () => {
    const cooldown = finishDash(run(lone(), 1, DASH_A).state, 'a').state;
    const slashed = run(cooldown, 1, input({ a: { slash: true } }));
    const plain = run(lone(), 1, input({ a: { slash: true } }));
    expect(player(slashed.state, 'a').slash).toEqual(player(plain.state, 'a').slash);
  });
});

describe('DASH and the round', () => {
  /** Alice dashes into Bob's slash: Bob wins the round while Alice's dash is under way. */
  function dashingIntoDeath(): FuState {
    let s = lone();
    s = place(s, 'b', 780, 450);
    s = face(s, 'b', -1, 0);
    let current = run(s, 1, input({ b: { slash: true }, a: { dash: true } })).state;
    for (let i = 0; i < 12 && current.phase === 'PLAYING'; i += 1)
      current = stepFu(current, NONE, DT).state;
    return current;
  }

  it('the round ends with the dasher dead and the survivor winning', () => {
    const s = dashingIntoDeath();
    expect(s.phase).toBe('ROUND_OVER');
    expect(s.roundOver?.winnerId).toBe('b');
  });

  it('a survivor who is mid-dash when the round ends is frozen READY, with no half-finished burst on show', () => {
    // Bob and Dave kill each other on the same step; Carol, dashing across the far side, is the last one standing.
    let s = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 3 },
        { id: 'c', slot: 1 },
        { id: 'd', slot: 2 },
      ],
      {},
    );
    s = place(place(place(place(s, 'a', 300, 450), 'b', 1000, 300), 'c', 300, 750), 'd', 1100, 300);
    s = face(face(face(face(s, 'a', 1, 0), 'b', 1, 0), 'c', 1, 0), 'd', -1, 0);
    s = kill(s, 'a');
    const result = stepFu(
      s,
      input({ c: { dash: true }, b: { slash: true }, d: { slash: true } }),
      DT,
    );
    expect(result.state.phase).toBe('ROUND_OVER');
    expect(result.state.roundOver?.winnerId).toBe('c');
    expect(at(result.state, 'c').x).toBeGreaterThan(300); // she really was dashing...
    expect(result.state.players.every((p) => p.dash.phase === 'READY')).toBe(true); // ...and is shown READY now
  });

  it('presses during ROUND_OVER do nothing; the next round starts everybody READY at their spawn', () => {
    let current = dashingIntoDeath();
    const frozen = at(current, 'b');
    current = run(current, 5, DASH_A, { repeat: true }).state;
    expect(at(current, 'b')).toEqual(frozen);
    expect(current.players.every((p) => p.dash.phase === 'READY')).toBe(true);
    let next = current;
    for (let i = 0; i < 400 && next.round === 1; i += 1) next = stepFu(next, NONE, DT).state;
    expect(next.round).toBe(2);
    expect(next.players.every((p) => p.alive && p.dash.phase === 'READY')).toBe(true);
    expect(next.players.map((p) => at(next, p.id))).toEqual(
      createFuMatch(
        [
          { id: 'a', slot: 0 },
          { id: 'b', slot: 3 },
        ],
        {},
      ).world.bodies.map((b) => b.position),
    );
  });

  it('fatigue does not carry over a round reset: the next round starts rested', () => {
    let s = lone({ arena: { width: 12000, height: 900 } });
    s = place(place(s, 'a', 100, 450), 'b', 11000, 450);
    for (let i = 0; i < 400 && player(s, 'a').fatigue.dashes < C.dashFreeCount + 2; i += 1) {
      s = stepFu(s, DASH_A, DT).state;
    }
    expect(player(s, 'a').fatigue.dashes).toBeGreaterThan(C.dashFreeCount);
    s = stepFu(kill(s, 'b'), NONE, DT).state;
    expect(s.phase).toBe('ROUND_OVER');
    let next = s;
    for (let i = 0; i < 400 && next.round === 1; i += 1) next = stepFu(next, NONE, DT).state;
    expect(player(next, 'a').fatigue).toEqual({ dashes: 0, recoverIn: 0 });
    expect(phase(next, 'a')).toBe('READY');
  });
});

describe('DASH and the arena', () => {
  it('the burst is short next to the arena: less than a fifth of its width, and well under one throw', () => {
    expect(DISTANCE).toBeLessThan(PRIMITIVE_ARENA.width / 5);
    expect(DISTANCE).toBeLessThan(C.throwRange);
  });
});

// ------------------------------------------------------------------------------------------------
// Fatigue: spamming is allowed; a burst of `dashFreeCount` successful dashes is free, the next one
// (and every one after) is FATIGUED until `fatigueRecoverySeconds` pass without a successful dash.
// The accounting is gameplay state, counted by the rules and nowhere else.
// ------------------------------------------------------------------------------------------------

describe('DASH fatigue (burst, then tired — never a cooldown, never a stamina bar)', () => {
  const FREE = C.dashFreeCount;
  const lane = () => place(lone({ arena: { width: 30000, height: 900 } }), 'a', 100, 450);
  const fatigued = (s: FuState, id = 'a') => isFatigued(player(s, id).fatigue, C);
  const dashes = (s: FuState, id = 'a') => player(s, id).fatigue.dashes;

  /** Performs one successful dash and lets it finish; returns the state and the distance covered. */
  function oneDash(start: FuState, id = 'a'): { state: FuState; moved: number; events: FuEvent[] } {
    const before = at(start, id).x;
    const first = stepFu(start, input({ [id]: { dash: true } }), DT);
    const done = finishDash(first.state, id);
    return {
      state: done.state,
      moved: at(done.state, id).x - before,
      events: [...first.events, ...done.events],
    };
  }

  it('has the playtest hypotheses as its values', () => {
    expect(C.dashFreeCount).toBe(8);
    expect(C.fatigueRecoverySeconds).toBe(5);
    expect(C.fatiguedMoveFactor).toBe(0.7);
    expect(C.fatiguedDashFactor).toBe(0.7);
  });

  it('dashes 1 to 8 are normal: full distance, not fatigued, nothing announced', () => {
    let s = lane();
    for (let n = 1; n <= FREE; n += 1) {
      const result = oneDash(s);
      s = result.state;
      expect(dashes(s), `after dash ${n}`).toBe(n);
      expect(fatigued(s), `after dash ${n}`).toBe(false);
      expect(result.moved, `dash ${n}`).toBeCloseTo(DISTANCE, 6);
      expect(types(result.events)).not.toContain('FATIGUED');
    }
  });

  it('dash 9 enters FATIGUED (announced once) and is itself already at 70% power', () => {
    let s = lane();
    for (let n = 1; n <= FREE; n += 1) s = oneDash(s).state;
    const ninth = oneDash(s);
    expect(dashes(ninth.state)).toBe(FREE + 1);
    expect(fatigued(ninth.state)).toBe(true);
    expect(types(ninth.events).filter((t) => t === 'FATIGUED')).toHaveLength(1);
    expect(ninth.moved).toBeCloseTo(DISTANCE * C.fatiguedDashFactor, 6);
  });

  it('dash 10 and beyond are allowed, still at 70%, and FATIGUED is not announced again', () => {
    let s = lane();
    for (let n = 1; n <= FREE + 1; n += 1) s = oneDash(s).state;
    for (let n = FREE + 2; n <= FREE + 6; n += 1) {
      const result = oneDash(s);
      s = result.state;
      expect(dashes(s)).toBe(n);
      expect(fatigued(s)).toBe(true);
      expect(result.moved).toBeCloseTo(DISTANCE * C.fatiguedDashFactor, 6);
      expect(types(result.events)).not.toContain('FATIGUED');
    }
  });

  it('a fatigued dash is slower and shorter but lasts as long; its collisions are unchanged', () => {
    let s = lane();
    for (let n = 1; n <= FREE; n += 1) s = oneDash(s).state;
    const started = stepFu(s, DASH_A, DT).state;
    expect(player(started, 'a').dash).toMatchObject({ phase: 'DASHING' });
    const steps = finishDash(started, 'a').steps + 1;
    expect(steps).toBe(Math.ceil(C.dashSeconds / DT - 1e-9));
    // still stopped by a living player
    let t = place(s, 'b', at(s, 'a').x + 150, 450);
    t = run(t, 1, DASH_A).state;
    const done = finishDash(t, 'a').state;
    expect(gap(done, 'a', 'b')).toBeGreaterThanOrEqual(2 * R - 1e-6);
    expect(at(done, 'b').x).toBe(at(s, 'a').x + 150);
  });

  it('while fatigued, walking is 70% speed; rested walking is full speed', () => {
    let s = lane();
    const rested = run(s, 10, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true }).state;
    expect(at(rested, 'a').x - 100).toBeCloseTo(10 * C.playerSpeed * DT, 6);
    for (let n = 1; n <= FREE + 1; n += 1) s = oneDash(s).state;
    const before = at(s, 'a').x;
    const tired = run(s, 10, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true }).state;
    expect(at(tired, 'a').x - before).toBeCloseTo(
      10 * C.playerSpeed * C.fatiguedMoveFactor * DT,
      6,
    );
  });

  it('fatigue stacks with the slash slowdown while swinging', () => {
    let s = lane();
    for (let n = 1; n <= FREE + 1; n += 1) s = oneDash(s).state;
    s = run(s, 1, input({ a: { slash: true } })).state;
    const before = at(s, 'a').x;
    const next = run(s, 3, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true }).state;
    expect(at(next, 'a').x - before).toBeCloseTo(
      3 * C.playerSpeed * C.slashMoveFactor * C.fatiguedMoveFactor * DT,
      6,
    );
  });

  it('recovers after exactly fatigueRecoverySeconds without a successful dash: walking is full speed and the count resets', () => {
    let s = lane();
    for (let n = 1; n <= FREE + 2; n += 1) s = oneDash(s).state;
    expect(fatigued(s)).toBe(true);
    const steps = Math.round(C.fatigueRecoverySeconds / DT);
    // The recovery clock runs from the start of the last dash; ignore the steps that dash took.
    const lastDashSteps = Math.ceil(C.dashSeconds / DT - 1e-9);
    const sinceDash = lastDashSteps; // finishDash ran exactly this long
    let current = s;
    let events: FuEvent[] = [];
    const wait = steps - sinceDash;
    for (let i = 0; i < wait - 1; i += 1) {
      const r = stepFu(current, input({ a: { move: { x: 0, y: 1 } } }), DT); // walking does not interrupt it
      current = r.state;
      events = events.concat(r.events);
      expect(fatigued(current), `step ${i}`).toBe(true);
    }
    const last = stepFu(current, NONE, DT);
    expect(fatigued(last.state)).toBe(false);
    expect(player(last.state, 'a').fatigue).toEqual({ dashes: 0, recoverIn: 0 });
    expect(types([...events, ...last.events]).filter((t) => t === 'RECOVERED')).toHaveLength(1);
  });

  it('a successful dash during recovery resets the 5 s clock (and keeps counting)', () => {
    let s = lane();
    for (let n = 1; n <= FREE + 1; n += 1) s = oneDash(s).state;
    s = run(s, 200).state; // well into the recovery
    expect(player(s, 'a').fatigue.recoverIn).toBeLessThan(C.fatigueRecoverySeconds - 3);
    const again = stepFu(s, DASH_A, DT).state;
    expect(player(again, 'a').fatigue.recoverIn).toBeCloseTo(C.fatigueRecoverySeconds - DT, 9); // counted from the start of that step
    expect(dashes(again)).toBe(FREE + 2);
    // and it is the full 5 s from here: still tired just before, rested at the end
    const stepsToGo = Math.round(C.fatigueRecoverySeconds / DT) - 1; // the dash step itself is the first of the 300
    const nearly = run(again, stepsToGo - 1).state;
    expect(fatigued(nearly)).toBe(true);
    expect(fatigued(run(nearly, 1).state)).toBe(false);
  });

  it('after a full recovery the count starts again: another 8 free dashes, the 9th is fatigued', () => {
    let s = lane();
    for (let n = 1; n <= FREE + 1; n += 1) s = oneDash(s).state;
    s = run(s, Math.round(C.fatigueRecoverySeconds / DT) + 2).state;
    expect(dashes(s)).toBe(0);
    for (let n = 1; n <= FREE; n += 1) {
      s = oneDash(s).state;
      expect(fatigued(s)).toBe(false);
    }
    expect(fatigued(oneDash(s).state)).toBe(true);
  });

  it('a press on the very step recovery completes counts as dash number 1, at full power', () => {
    let s = lane();
    for (let n = 1; n <= FREE + 1; n += 1) s = oneDash(s).state;
    let current = s;
    for (let i = 0; i < 1000 && player(current, 'a').fatigue.recoverIn > DT + 1e-6; i += 1)
      current = stepFu(current, NONE, DT).state;
    const result = stepFu(current, DASH_A, DT);
    expect(dashes(result.state)).toBe(1);
    expect(fatigued(result.state)).toBe(false);
    expect(player(result.state, 'a').dash).toMatchObject({ phase: 'DASHING', speed: C.dashSpeed });
  });

  it('only SUCCESSFUL dashes count: refused, garbage, dead and unknown-player presses never add fatigue', () => {
    const base = lane();
    const same = (s: FuState) =>
      expect(player(s, 'a').fatigue).toEqual({ dashes: 0, recoverIn: 0 });
    // refused while swinging
    same(run(run(base, 1, input({ a: { slash: true } })).state, 3, DASH_A, { repeat: true }).state);
    // THROW wins the same step
    same(run(base, 1, input({ a: { throw: true, dash: true } })).state);
    // SLASH wins the same step
    same(run(base, 1, input({ a: { slash: true, dash: true } })).state);
    // garbage
    for (const dash of ['yes', 1, {}, null, false]) {
      same(run(base, 3, input({ a: { dash } as unknown as Press })).state);
    }
    // a press for nobody
    same(run(base, 3, input({ nobody: { dash: true } })).state);
    // a dead player
    expect(
      player(run(kill(base, 'a'), 3, DASH_A, { repeat: true }).state, 'a').fatigue.dashes,
    ).toBe(0);
    // mashing while already DASHING counts once
    const mashed = run(base, 20, DASH_A, { repeat: true }).state;
    expect(dashes(mashed)).toBe(Math.ceil(20 / Math.ceil(C.dashSeconds / DT - 1e-9)));
  });

  it('a dash blocked at once (into a wall or a body) is still a successful dash and counts', () => {
    let s = place(lane(), 'b', 100 + 2 * R, 450);
    s = run(s, 1, DASH_A).state; // already touching and pointing at Bob: goes nowhere
    expect(dashes(s)).toBe(1);
  });

  it('death resets fatigue; so does a new round', () => {
    let s = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 3 },
        { id: 'c', slot: 1 },
      ],
      { arena: { width: 30000, height: 900 } },
    );
    s = place(place(place(s, 'a', 100, 450), 'b', 29000, 450), 'c', 29000, 800);
    s = face(s, 'a', 1, 0);
    for (let n = 1; n <= FREE + 1; n += 1) s = oneDash(s).state;
    expect(fatigued(s)).toBe(true);
    s = place(s, 'b', at(s, 'a').x + 100, 450);
    s = face(s, 'b', -1, 0);
    s = run(s, 1, input({ b: { slash: true } })).state;
    expect(player(s, 'a').alive).toBe(false);
    expect(player(s, 'a').fatigue).toEqual({ dashes: 0, recoverIn: 0 });
  });

  it('is deterministic: replaying the same 1,500 inputs gives the identical state and events', () => {
    const script = (i: number): FuInputs =>
      input({
        a: {
          dash: i % 7 < 3,
          move: { x: Math.cos(i / 9), y: Math.sin(i / 9) },
          slash: i % 53 === 0,
        },
        b: { dash: i % 11 === 0, throw: i % 37 === 0 },
      });
    const play = () => {
      let s = lone();
      const log: FuEvent[] = [];
      for (let i = 0; i < 1500; i += 1) {
        const r = stepFu(s, script(i), DT);
        s = r.state;
        log.push(...r.events);
      }
      return { s, log };
    };
    const one = play();
    const two = play();
    expect(JSON.stringify(two)).toBe(JSON.stringify(one));
    expect(one.log.some((e) => e.type === 'FATIGUED')).toBe(true);
  });

  it('fatigue never runs ahead of the count or the clock: invariants hold under a fuzz of presses', () => {
    let s = lone();
    for (let i = 0; i < 3000; i += 1) {
      s = stepFu(
        s,
        input({ a: { dash: (i * 7919) % 13 < 5, move: { x: Math.sin(i), y: Math.cos(i * 0.7) } } }),
        DT,
      ).state;
      const f = player(s, 'a').fatigue;
      expect(f.dashes).toBeGreaterThanOrEqual(0);
      expect(f.recoverIn).toBeGreaterThanOrEqual(0);
      expect(f.recoverIn).toBeLessThanOrEqual(C.fatigueRecoverySeconds);
      expect(f.dashes === 0).toBe(f.recoverIn === 0);
    }
  });
});

describe('DASH configuration', () => {
  const make = (overrides: Partial<FuConfig>) => () =>
    createFuMatch([{ id: 'a', slot: 0 }], overrides);

  it('has initial values that are valid', () => {
    expect(make({})).not.toThrow();
  });

  it.each(['dashSpeed', 'dashSeconds', 'fatigueRecoverySeconds'] as const)(
    'rejects a non-positive or non-finite %s',
    (key) => {
      for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(make({ [key]: value }), `${key}=${value}`).toThrow(RangeError);
      }
    },
  );

  it('rejects nonsense fatigue settings', () => {
    expect(make({ dashFreeCount: 0 })).toThrow(RangeError);
    expect(make({ dashFreeCount: 2.5 })).toThrow(RangeError);
    for (const key of ['fatiguedMoveFactor', 'fatiguedDashFactor'] as const) {
      expect(make({ [key]: 0 })).toThrow(RangeError);
      expect(make({ [key]: 1.01 })).toThrow(RangeError);
      expect(make({ [key]: 1 })).not.toThrow(); // no penalty is a valid setting
    }
  });

  it('rejects a dash that could move farther than a player radius in one step (it would tunnel)', () => {
    expect(make({ dashSpeed: (C.playerRadius / DT) * 1.01 })).toThrow(RangeError);
  });

  it('rejects a dash fast enough to carry a player through a boomerang between two steps', () => {
    const reach = C.playerRadius + C.boomerangRadius;
    expect(make({ dashSpeed: reach / DT - Math.max(C.throwSpeed, C.returnSpeed) + 1 })).toThrow(
      RangeError,
    );
  });
});
