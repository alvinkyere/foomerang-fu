import {
  FIXED_TIMESTEP_SECONDS as DT,
  MAX_STEP_SECONDS,
  type WorldState,
} from '@foomerang/game-core';
import { STRAIGHT } from './support/fixtures';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FU_CONFIG,
  createFuMatch as createCurvedMatch,
  spawnPosition,
  stepFu,
  type FuInputs,
  type FuPlayerSpec,
  type FuState,
} from '../src/rules';

// These tests arrange their scenes with boomerangs flying straight (the owner's curved flight, 2026-10-19, is tested in
// curve.test.ts): every match here is created with STRAIGHT unless a test says otherwise.
const createFuMatch: typeof createCurvedMatch = (players, overrides = {}) =>
  createCurvedMatch(players, { ...STRAIGHT, ...overrides });

// ------------------------------------------------------------------------------------------
// Living players are solid to each other. Resolved in the rules (circle vs circle), never by Phaser.
// ------------------------------------------------------------------------------------------

const C = DEFAULT_FU_CONFIG;
const R = C.playerRadius;
const TOUCH = 2 * R;
const EPS = 1e-6;
const NONE: FuInputs = new Map();
type Press = { move?: { x: number; y: number }; throw?: boolean; slash?: boolean };
const input = (entries: Record<string, Press>): FuInputs => new Map(Object.entries(entries));

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`test setup: no ${what}`);
  return value;
}
const pos = (s: FuState | WorldState, id: string) => {
  const world = 'world' in s ? s.world : s;
  return must(
    world.bodies.find((b) => b.id === id),
    `body ${id}`,
  ).position;
};
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
const kill = (state: FuState, id: string): FuState => ({
  ...state,
  players: state.players.map((p) => (p.id === id ? { ...p, alive: false } : p)),
});
const dist = (s: FuState, a: string, b: string) => {
  const p = pos(s, a);
  const q = pos(s, b);
  return Math.hypot(p.x - q.x, p.y - q.y);
};
/** The deepest overlap between any two LIVING players (0 if none). */
function worstOverlap(s: FuState): number {
  let worst = 0;
  const living = s.players.filter((p) => p.alive);
  for (let i = 0; i < living.length; i += 1) {
    for (let j = i + 1; j < living.length; j += 1) {
      const a = living[i];
      const b = living[j];
      if (a && b) worst = Math.max(worst, TOUCH - dist(s, a.id, b.id));
    }
  }
  return worst;
}
function match(ids: readonly string[], at: Record<string, [number, number]>): FuState {
  let s = createFuMatch(ids.map((id, slot) => ({ id, slot })));
  for (const id of ids) {
    const [x, y] = must(at[id], `position ${id}`);
    s = place(s, id, x, y);
  }
  return s;
}
const inside = (s: FuState) =>
  s.world.bodies.every(
    (b) =>
      b.position.x >= R - EPS &&
      b.position.x <= C.arena.width - R + EPS &&
      b.position.y >= R - EPS &&
      b.position.y <= C.arena.height - R + EPS,
  );

const RIGHT = { x: 1, y: 0 };
const LEFT = { x: -1, y: 0 };

describe('living players are solid to each other', () => {
  it('head-on: two players walking at each other stop in contact, never overlapping, and do not drift', () => {
    let s = match(['a', 'b'], { a: [600, 450], b: [780, 450] });
    let steps = 0;
    for (let i = 0; i < 120; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT }, b: { move: LEFT } }), DT).state;
      expect(worstOverlap(s), `step ${i}`).toBeLessThan(EPS);
      expect(pos(s, 'a').x).toBeLessThan(pos(s, 'b').x);
      steps += 1;
    }
    expect(steps).toBe(120);
    expect(dist(s, 'a', 'b')).toBeCloseTo(TOUCH, 6);
    // equal and opposite effort ⇒ they meet in the middle and stay there
    expect((pos(s, 'a').x + pos(s, 'b').x) / 2).toBeCloseTo(690, 6);
    expect(pos(s, 'a').y).toBeCloseTo(450, 9);
    expect(pos(s, 'b').y).toBeCloseTo(450, 9);
  });

  it('sustained opposing input does not jitter: after contact the positions are the same every step', () => {
    let s = match(['a', 'b'], { a: [600, 450], b: [672, 450] }); // already touching
    const history: [number, number, number, number][] = [];
    for (let i = 0; i < 600; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT }, b: { move: LEFT } }), DT).state;
      history.push([pos(s, 'a').x, pos(s, 'a').y, pos(s, 'b').x, pos(s, 'b').y]);
    }
    const first = must(history[0], 'first');
    for (const h of history) h.forEach((v, k) => expect(v).toBeCloseTo(first[k] ?? 0, 6));
  });

  it('stationary vs moving: the walker cannot pass; the stationary player is shoved along (equal bodies)', () => {
    let s = match(['a', 'b'], { a: [600, 450], b: [800, 450] });
    for (let i = 0; i < 150; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT } }), DT).state;
      expect(worstOverlap(s)).toBeLessThan(EPS);
      expect(pos(s, 'a').x).toBeLessThan(pos(s, 'b').x);
    }
    expect(pos(s, 'b').x).toBeGreaterThan(800); // shoved, not walked through
    expect(dist(s, 'a', 'b')).toBeCloseTo(TOUCH, 6);
  });

  it('unequal effort: the stronger push wins ground but never overlaps', () => {
    let s = match(['a', 'b'], { a: [600, 450], b: [800, 450] });
    for (let i = 0; i < 200; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT }, b: { move: { x: -0.5, y: 0 } } }), DT).state;
      expect(worstOverlap(s)).toBeLessThan(EPS);
      expect(pos(s, 'a').x).toBeLessThan(pos(s, 'b').x);
    }
  });

  it('a diagonal / glancing contact slides around instead of sticking or passing through', () => {
    // Alice walks right along y = 450; Bob stands 50 below her line, so they clip each other.
    let s = match(['a', 'b'], { a: [500, 450], b: [700, 500] });
    let passed = false;
    for (let i = 0; i < 200; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT } }), DT).state;
      expect(worstOverlap(s)).toBeLessThan(EPS);
      if (pos(s, 'a').x > pos(s, 'b').x) passed = true;
    }
    expect(passed).toBe(true); // she slid past
    expect(pos(s, 'a').y).toBeLessThan(450 + EPS); // pushed up and away, not into him
    expect(pos(s, 'b').y).toBeGreaterThan(500 - EPS);
  });

  it('three players converging on one point: nobody overlaps, nobody is flung', () => {
    let s = match(['a', 'b', 'c'], { a: [700, 350], b: [900, 350], c: [800, 550] });
    let before = s;
    for (let i = 0; i < 400; i += 1) {
      s = stepFu(
        s,
        input({
          a: { move: { x: 1, y: 1 } },
          b: { move: { x: -1, y: 1 } },
          c: { move: { x: 0, y: -1 } },
        }),
        DT,
      ).state;
      expect(worstOverlap(s), `step ${i}`).toBeLessThan(EPS);
      expect(inside(s)).toBe(true);
      for (const id of ['a', 'b', 'c']) {
        const p = pos(s, id);
        const q = pos(before, id);
        // never more than the player's own stride plus the correction it can cause
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThanOrEqual(2 * C.playerSpeed * DT);
      }
      before = s;
    }
  });

  it('three in a row pushed from one end transmit the push; nobody overlaps', () => {
    let s = match(['a', 'b', 'c'], { a: [400, 450], b: [472, 450], c: [544, 450] });
    for (let i = 0; i < 120; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT } }), DT).state;
      expect(worstOverlap(s)).toBeLessThan(EPS);
    }
    expect(pos(s, 'c').x).toBeGreaterThan(544);
  });

  it('at the arena edge: a player cannot be shoved out, and the pusher is blocked behind them', () => {
    const wall = C.arena.width - R;
    let s = match(['a', 'b'], { a: [wall - 200, 450], b: [wall - 5, 450] });
    for (let i = 0; i < 200; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT } }), DT).state;
      expect(worstOverlap(s)).toBeLessThan(EPS);
      expect(inside(s)).toBe(true);
    }
    expect(pos(s, 'b').x).toBeCloseTo(wall, 6);
    expect(pos(s, 'a').x).toBeCloseTo(wall - TOUCH, 6);
  });

  it('two players dropped on exactly the same point are pulled apart, the same way every time', () => {
    const s = match(['a', 'b'], { a: [800, 450], b: [800, 450] });
    const once = stepFu(s, NONE, DT).state;
    expect(dist(once, 'a', 'b')).toBeCloseTo(TOUCH, 6);
    expect(stepFu(s, NONE, DT).state).toEqual(once);
  });

  it('in a corner: a player pinned by two others stays inside and nothing overlaps', () => {
    const s0 = match(['a', 'b', 'c'], {
      a: [R + 10, R + 10],
      b: [R + 100, R + 10],
      c: [R + 10, R + 100],
    });
    let s = s0;
    for (let i = 0; i < 300; i += 1) {
      s = stepFu(
        s,
        input({ b: { move: { x: -1, y: -0.2 } }, c: { move: { x: -0.2, y: -1 } } }),
        DT,
      ).state;
      expect(worstOverlap(s)).toBeLessThan(1e-4);
      expect(inside(s)).toBe(true);
    }
  });

  it.each([DT, 2 * DT, MAX_STEP_SECONDS])(
    'no tunnelling: head-on at full speed from touching never swaps sides (dt = %s)',
    (dt) => {
      let s = match(['a', 'b'], { a: [600, 450], b: [672, 450] });
      for (let i = 0; i < 60; i += 1) {
        s = stepFu(s, input({ a: { move: RIGHT }, b: { move: LEFT } }), dt).state;
        expect(pos(s, 'a').x).toBeLessThan(pos(s, 'b').x);
        expect(worstOverlap(s)).toBeLessThan(EPS);
      }
    },
  );

  it('a mover cannot be carried through by a large dt either (one player walking into a stationary one)', () => {
    let s = match(['a', 'b'], { a: [600, 450], b: [700, 450] });
    for (let i = 0; i < 30; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT } }), MAX_STEP_SECONDS).state;
      expect(pos(s, 'a').x).toBeLessThan(pos(s, 'b').x);
    }
  });
});

describe('only the living are solid', () => {
  it('a dead player does not block a living one, and is not pushed', () => {
    // a third player stays alive far away, so the round is not over
    let s = kill(match(['a', 'b', 'z'], { a: [600, 450], b: [700, 450], z: [1500, 100] }), 'b');
    for (let i = 0; i < 40; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT } }), DT).state;
    }
    expect(pos(s, 'a').x).toBeGreaterThan(700 + R); // walked straight through
    expect(pos(s, 'b')).toEqual({ x: 700, y: 450 });
  });

  it('two living players are not blocked by a dead third standing between them', () => {
    let s = kill(match(['a', 'b', 'c'], { a: [600, 450], b: [800, 450], c: [700, 450] }), 'c');
    for (let i = 0; i < 100; i += 1) {
      s = stepFu(s, input({ a: { move: RIGHT }, b: { move: LEFT } }), DT).state;
    }
    expect(dist(s, 'a', 'b')).toBeCloseTo(TOUCH, 6); // they met each other, not the corpse
  });

  it('a boomerang-killed player stops being solid from the moment they die', () => {
    let s = match(['a', 'b', 'c'], { a: [600, 450], b: [900, 450], c: [900, 450 + TOUCH + 1] });
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, facing: RIGHT } : p)) };
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    for (let i = 0; i < 60; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.players.find((p) => p.id === 'b')?.alive).toBe(false);
    expect(worstOverlap(s)).toBeLessThan(EPS);
  });
});

describe('what the rest of the rules see', () => {
  it('hits and slashes use the post-collision, rule-state positions', () => {
    // Bob is dropped inside Alice; the step separates them, then Alice's slash is judged on THAT.
    let s = match(['a', 'b'], { a: [600, 450], b: [610, 450] });
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, facing: RIGHT } : p)) };
    const { state, events } = stepFu(s, input({ a: { slash: true } }), DT);
    expect(dist(state, 'a', 'b')).toBeCloseTo(TOUCH, 6);
    const hit = events.find((e) => e.type === 'HIT');
    expect(hit).toMatchObject({ victimId: 'b', position: pos(state, 'b') });
  });

  it('a held boomerang rides with its owner after they are separated', () => {
    const s = match(['a', 'b'], { a: [600, 450], b: [610, 450] });
    const { state } = stepFu(s, NONE, DT);
    for (const id of ['a', 'b']) {
      expect(state.boomerangs.find((b) => b.ownerId === id)?.position).toEqual(pos(state, id));
    }
  });
});

describe('determinism', () => {
  const script = (i: number): FuInputs =>
    input({
      a: {
        move: { x: Math.sin(i / 13), y: Math.cos(i / 29) },
        throw: i % 37 === 0,
        slash: i % 11 === 0,
      },
      b: { move: { x: Math.cos(i / 19), y: Math.sin(i / 7) }, slash: i % 17 === 0 },
      c: { move: { x: -Math.sin(i / 11), y: Math.cos(i / 5) } },
      d: { move: { x: Math.cos(i / 3), y: -Math.sin(i / 23) } },
    });
  const crowd = (specs: readonly FuPlayerSpec[]) => {
    let s = createFuMatch(specs);
    const at: Record<string, [number, number]> = {
      a: [700, 400],
      b: [780, 440],
      c: [740, 500],
      d: [820, 520],
    };
    for (const { id } of specs) s = place(s, id, ...must(at[id], 'p'));
    return s;
  };
  const specs: FuPlayerSpec[] = [
    { id: 'a', slot: 0 },
    { id: 'b', slot: 1 },
    { id: 'c', slot: 2 },
    { id: 'd', slot: 3 },
  ];

  it('replaying the same inputs gives identical states, byte for byte, with collisions happening', () => {
    const run = () => {
      let s = crowd(specs);
      for (let i = 0; i < 3000; i += 1) s = stepFu(s, script(i), DT).state;
      return s;
    };
    const one = run();
    expect(JSON.stringify(run())).toBe(JSON.stringify(one));
  });

  it('does not depend on the order players were listed in (up to rounding noise)', () => {
    const forward = crowd(specs);
    const reversed = crowd([...specs].reverse());
    let f = forward;
    let r = reversed;
    for (let i = 0; i < 400; i += 1) {
      // no throws/slashes: this is about movement and contact only
      const frame = input({
        a: { move: { x: 1, y: 0.4 } },
        b: { move: { x: -1, y: 0.2 } },
        c: { move: { x: 0.3, y: -1 } },
        d: { move: { x: -0.5, y: -1 } },
      });
      f = stepFu(f, frame, DT).state;
      r = stepFu(r, frame, DT).state;
    }
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(pos(r, id).x).toBeCloseTo(pos(f, id).x, 6);
      expect(pos(r, id).y).toBeCloseTo(pos(f, id).y, 6);
    }
  });

  it('the input Map order never matters', () => {
    const frame = (order: string[]): FuInputs =>
      new Map(order.map((id) => [id, { move: { x: id === 'a' ? 1 : -1, y: 0 } }]));
    const s = match(['a', 'b'], { a: [600, 450], b: [700, 450] });
    expect(stepFu(s, frame(['a', 'b']), DT)).toEqual(stepFu(s, frame(['b', 'a']), DT));
  });

  it('fuzz: over thousands of random steps no two living players overlap and everyone stays inside', () => {
    let seed = 424242;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let s = createFuMatch(['a', 'b', 'c', 'd', 'e', 'f'].map((id, slot) => ({ id, slot })));
    for (let i = 0; i < 6000; i += 1) {
      // everybody huddles towards the middle, with noise, so contact is constant
      const frame: FuInputs = new Map(
        s.players.map((p) => {
          const at = pos(s, p.id);
          const toward = { x: C.arena.width / 2 - at.x, y: C.arena.height / 2 - at.y };
          const len = Math.hypot(toward.x, toward.y) || 1;
          return [
            p.id,
            {
              move: {
                x: toward.x / len + (random() - 0.5),
                y: toward.y / len + (random() - 0.5),
              },
              slash: random() < 0.02,
            },
          ];
        }),
      );
      s = stepFu(s, frame, DT).state;
      expect(worstOverlap(s), `step ${i}`).toBeLessThan(1e-4);
      expect(inside(s)).toBe(true);
    }
  }, 30_000);
});

describe('spawning', () => {
  it('no two slots ever spawn overlapping, with room to spare', () => {
    for (let a = 0; a < 6; a += 1) {
      for (let b = a + 1; b < 6; b += 1) {
        const p = spawnPosition(a, C.arena);
        const q = spawnPosition(b, C.arena);
        expect(Math.hypot(p.x - q.x, p.y - q.y), `slots ${a},${b}`).toBeGreaterThan(TOUCH + 100);
      }
    }
  });

  it('every round reset starts with nobody overlapping, however the last round ended', () => {
    let s = createFuMatch(['a', 'b', 'c', 'd', 'e', 'f'].map((id, slot) => ({ id, slot })));
    s = stepFu(s, NONE, DT).state;
    expect(worstOverlap(s)).toBeLessThan(EPS);
    // end the round with a pile-up in the middle, then let it reset
    for (const p of s.players) s = place(s, p.id, 800 + p.slot, 450);
    s = { ...s, phase: 'ROUND_OVER', roundOver: { winnerId: undefined, resetInSeconds: DT } };
    s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    expect(worstOverlap(s)).toBeLessThan(EPS);
    for (const p of s.players) expect(pos(s, p.id)).toEqual(spawnPosition(p.slot, C.arena));
  });

  it('a configuration whose spawn points would overlap is refused as a programming error', () => {
    expect(() => createFuMatch([{ id: 'a', slot: 0 }], { ...STRAIGHT, playerRadius: 140 })).toThrow(
      RangeError,
    );
  });

  it('a configuration where a player could cross another in one step is refused', () => {
    expect(() =>
      createFuMatch([{ id: 'a', slot: 0 }], { ...STRAIGHT, playerSpeed: 100_000 }),
    ).toThrow(RangeError);
  });
});
