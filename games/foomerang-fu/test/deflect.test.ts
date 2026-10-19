import { FIXED_TIMESTEP_SECONDS as DT, MAX_STEP_SECONDS } from '@foomerang/game-core';
import { STRAIGHT } from './support/fixtures';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FU_CONFIG,
  PRIMITIVE_ARENA,
  canTransition,
  createFuMatch as createCurvedMatch,
  deflectionDirection,
  stepFu,
  type FuArena,
  type FuConfig,
  type FuEvent,
  type FuInputs,
  type FuState,
  type Rect,
} from '../src/rules';

// These tests arrange their scenes with boomerangs flying straight (the owner's curved flight, 2026-10-19, is tested in
// curve.test.ts): every match here is created with STRAIGHT unless a test says otherwise.
const createFuMatch: typeof createCurvedMatch = (players, overrides = {}) =>
  createCurvedMatch(players, { ...STRAIGHT, ...overrides });

// These files run thousands of simulation steps; on a cold, loaded checkout a few took longer than vitest's
// 5 s default. This only gives them room; no assertion depends on it.
vi.setConfig({ testTimeout: 60_000 });

// ------------------------------------------------------------------------------------------
// Slice 3 — Defensive Mastery. An ACTIVE slash that meets an enemy boomerang deflects it. The
// boomerang stays its thrower's; it flies off in a direction derived from the defender's slash
// direction and the incoming trajectory; and then it comes home. Timing is everything: the same
// slash that kills players only defends during its 0.12 s active window.
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
const pos = (s: FuState, id: string) =>
  must(
    s.world.bodies.find((b) => b.id === id),
    `body ${id}`,
  ).position;
const types = (events: readonly FuEvent[]) => events.map((e) => e.type);
const unit = (x: number, y: number) => {
  const l = Math.hypot(x, y);
  return { x: x / l, y: y / l };
};

/** Alice at the left throwing right; Bob 500 away facing her, the whole open lane between them. */
function lane(extra: Partial<FuConfig> = {}, ids = ['a', 'b']): FuState {
  let s = createFuMatch(
    ids.map((id, slot) => ({ id, slot })),
    extra,
  );
  s = place(s, 'a', 200, 450);
  s = place(s, 'b', 700, 450);
  s = face(s, 'a', 1, 0);
  return face(s, 'b', -1, 0);
}

interface Played {
  readonly states: FuState[];
  readonly events: FuEvent[];
}
/** Alice throws on step 0; Bob presses SLASH on step `press` (never, if undefined). */
function shoot(
  start: FuState,
  press: number | undefined,
  steps: number,
  dt = DT,
  extra: (i: number) => Record<string, Press> = () => ({}),
  pressBy = 'b',
): Played {
  let s = start;
  const states: FuState[] = [];
  const events: FuEvent[] = [];
  for (let i = 0; i < steps; i += 1) {
    const frame: Record<string, Press> = { ...extra(i) };
    if (i === 0) frame['a'] = { ...frame['a'], throw: true };
    if (i === press) frame[pressBy] = { ...frame[pressBy], slash: true };
    const r = stepFu(s, input(frame), dt);
    s = r.state;
    states.push(s);
    events.push(...r.events);
  }
  return { states, events };
}
const survived = (p: Played) => !p.events.some((e) => e.type === 'HIT' && e.victimId === 'b');

describe('the deflection direction is one stated formula', () => {
  // out = normalize( reflect(v, s) + s + rot90(s) ),  reflect(v, s) = v − 2 (v·s) s,  rot90(s) = (−s.y, s.x)
  const dot = (a: { x: number; y: number }, b: { x: number; y: number }) => a.x * b.x + a.y * b.y;

  it('head-on at the blade: the mirror image goes straight back, the push adds the swing direction and the sweep adds a sideways kick — not straight back at the thrower', () => {
    const out = deflectionDirection({ x: 1, y: 0 }, { x: -1, y: 0 });
    const expected = unit(-2, -1); // reflect = (−1,0); + s = (−2,0); + rot90(s) = (0,−1)
    expect(out.x).toBeCloseTo(expected.x, 12);
    expect(out.y).toBeCloseTo(expected.y, 12);
    expect(out.y).not.toBe(0); // a miss, not a mirror
  });

  it('is a function of the incoming trajectory AND the slash direction (positioning matters)', () => {
    const s = { x: -1, y: 0 };
    const a = deflectionDirection({ x: 1, y: 0 }, s);
    const b = deflectionDirection(unit(1, 0.5), s); // thrown from a different spot
    const c = deflectionDirection({ x: 1, y: 0 }, unit(-1, 0.5)); // defender faces differently
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.1);
    expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeGreaterThan(0.1);
  });

  it('is always a unit vector with a forward component along the slash: it is never knocked back through the defender', () => {
    let seed = 99;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < 2000; i += 1) {
      const v = unit(random() * 2 - 1 || 1e-3, random() * 2 - 1);
      const s = unit(random() * 2 - 1 || 1e-3, random() * 2 - 1);
      const out = deflectionDirection(v, s);
      expect(Math.hypot(out.x, out.y)).toBeCloseTo(1, 9);
      expect(dot(out, s)).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it('a boomerang already travelling along the slash direction is still deflected sideways-forward (the sum never vanishes)', () => {
    const s = { x: 0, y: 1 };
    const out = deflectionDirection(s, s);
    expect(out.x).toBeCloseTo(-1, 12); // rot90(s) = (−1, 0)
    expect(out.y).toBeCloseTo(0, 12);
  });

  it('is deterministic and pure', () => {
    const v = unit(0.3, -0.7);
    const s = unit(-0.8, 0.2);
    expect(deflectionDirection(v, s)).toEqual(deflectionDirection(v, s));
  });
});

describe('timing: only the ACTIVE window defends', () => {
  const outcomes = (steps = 60) =>
    Array.from({ length: 46 }, (_, press) => ({
      press,
      played: shoot(lane(), press, steps),
    }));

  it('the slashes that save the defender form ONE contiguous window of press times, with deaths either side of it', () => {
    const rows = outcomes().map((r) => ({ press: r.press, saved: survived(r.played) }));
    const saved = rows.filter((r) => r.saved).map((r) => r.press);
    expect(saved.length).toBeGreaterThanOrEqual(6); // a real window to hit…
    expect(saved.length).toBeLessThanOrEqual(20); // …not a permanent shield
    const first = must(saved[0], 'first');
    const last = must(saved.at(-1), 'last');
    expect(saved).toEqual(Array.from({ length: last - first + 1 }, (_, i) => first + i)); // contiguous
    expect(first).toBeGreaterThan(0);
    expect(rows.find((r) => r.press === first - 1)?.saved).toBe(false); // too early
    expect(rows.find((r) => r.press === last + 1)?.saved).toBe(false); // too late
  });

  it('an early slash fails: the swing is over, and recovering, by the time the boomerang arrives', () => {
    const p = shoot(lane(), 3, 60);
    expect(survived(p)).toBe(false);
    expect(types(p.events)).not.toContain('DEFLECTED');
    // at the step it killed, Bob's slash was recovering, not active
    const killedAt = p.states.findIndex((s) => !player(s, 'b').alive);
    expect(player(must(p.states[killedAt - 1], 'prev'), 'b').slash.phase).toBe('RECOVERING');
  });

  it('a late slash fails: the boomerang has already arrived', () => {
    const p = shoot(lane(), 40, 60);
    expect(survived(p)).toBe(false);
    expect(types(p.events)).not.toContain('DEFLECTED');
  });

  it('holding the swing in recovery is no shield: pressing again while recovering does nothing, the boomerang gets through', () => {
    const p = shoot(lane(), 3, 60, DT, (i) => (i > 3 ? { b: { slash: true } } : {})); // mashing
    expect(survived(p)).toBe(false);
  });

  it('a correctly timed slash deflects instead of killing, and the defender lives', () => {
    const rows = outcomes().filter((r) => survived(r.played));
    const middle = must(rows[Math.floor(rows.length / 2)], 'a good press');
    expect(types(middle.played.events)).toContain('DEFLECTED');
    expect(types(middle.played.events)).not.toContain('HIT');
    expect(player(must(middle.played.states.at(-1), 'end'), 'b').alive).toBe(true);
  });

  it('a slash pressed on the very step the boomerang would have killed still saves (deflection is judged before death)', () => {
    // find the first step of lethality without any defence…
    const bare = shoot(lane(), undefined, 60);
    const diedAt = bare.states.findIndex((s) => !player(s, 'b').alive);
    expect(diedAt).toBeGreaterThan(10);
    expect(survived(shoot(lane(), diedAt, 60))).toBe(true);
    expect(survived(shoot(lane(), diedAt + 1, 60))).toBe(false);
  });
});

describe('what the slash can reach', () => {
  const goodPress = () => {
    const rows = Array.from({ length: 46 }, (_, press) => press).filter((p) =>
      survived(shoot(lane(), p, 60)),
    );
    return must(rows[Math.floor(rows.length / 2)], 'a good press');
  };

  it('facing matters: a defender facing away is not defended by a slash behind them', () => {
    const p = goodPress();
    const away = face(lane(), 'b', 1, 0);
    expect(survived(shoot(away, p, 60))).toBe(false);
  });

  it('the arc is the slash region: inside it deflects, outside it does not', () => {
    const p = goodPress();
    const within = face(lane(), 'b', Math.cos(0.9), Math.sin(0.9) * -1); // about 52° off the incoming line
    const outside = face(lane(), 'b', -Math.cos(1.2), Math.sin(1.2)); // about 69° off: beyond the 60° half-arc
    void within;
    expect(survived(shoot(face(lane(), 'b', -Math.cos(0.7), Math.sin(0.7)), p, 60))).toBe(true); // 40° off
    expect(survived(shoot(outside, p, 60))).toBe(false);
  });

  it('a wall between the blade and the boomerang is cover: no deflecting through it', () => {
    const wall: Rect = { x: 620, y: 300, width: 40, height: 300 }; // between them, and inside the blade's reach
    const arena: FuArena = {
      width: 1600,
      height: 900,
      walls: [wall],
      spawns: [
        { x: 60, y: 60 },
        { x: 1540, y: 840 },
        { x: 1540, y: 60 },
        { x: 60, y: 840 },
        { x: 60, y: 450 },
        { x: 1540, y: 450 },
      ],
    };
    let s = createFuMatch(
      ['a', 'b'].map((id, slot) => ({ id, slot })),
      { arena },
    );
    s = face(place(place(s, 'a', 200, 450), 'b', 700, 450), 'b', -1, 0);
    const behind = (x: number) => ({
      ...s,
      boomerangs: s.boomerangs.map((b) =>
        b.ownerId === 'a'
          ? {
              ...b,
              state: 'THROWN' as const,
              position: { x, y: 450 },
              direction: { x: 1, y: 0 },
              travelled: 0,
            }
          : b,
      ),
    });
    // 95 from the defender, well inside the blade's reach — but the wall is in the way
    const blocked = stepFu(behind(590), input({ b: { slash: true } }), DT);
    expect(types(blocked.events)).not.toContain('DEFLECTED');
    // the same distance with a clear line (the wall is somewhere else) does deflect
    const clear = stepFu(
      { ...behind(590), config: { ...s.config, arena: { ...arena, walls: [] } } },
      input({ b: { slash: true } }),
      DT,
    );
    expect(types(clear.events)).toContain('DEFLECTED');
  });

  it('you cannot deflect your own boomerang', () => {
    let s = lane();
    s = {
      ...s,
      boomerangs: s.boomerangs.map((b) =>
        b.ownerId === 'b'
          ? {
              ...b,
              state: 'THROWN' as const,
              position: { x: 640, y: 450 },
              direction: { x: -1, y: 0 },
              travelled: 0,
            }
          : b,
      ),
    };
    const r = stepFu(s, input({ b: { slash: true } }), DT);
    expect(types(r.events)).not.toContain('DEFLECTED');
    expect(boom(r.state, 'b').state).toBe('THROWN');
  });

  it('a HELD boomerang is nothing to deflect', () => {
    const s = place(lane(), 'a', 600, 450); // alice right in bob's arc, boomerang in hand
    const r = stepFu(s, input({ b: { slash: true } }), DT);
    expect(types(r.events)).not.toContain('DEFLECTED');
    expect(player(r.state, 'a').alive).toBe(false); // the slash kills the PLAYER, as ever
  });
});

describe('ownership and lifecycle', () => {
  const deflected = () => {
    const presses = Array.from({ length: 46 }, (_, p) => p).filter((p) =>
      survived(shoot(lane(), p, 60)),
    );
    const press = must(presses[Math.floor(presses.length / 2)], 'a good press');
    const played = shoot(lane(), press, 200);
    const at = played.states.findIndex((s) => boom(s, 'a').state === 'DEFLECTED');
    return { played, at };
  };

  it('the boomerang remains its thrower’s: never stolen, never caught, never duplicated', () => {
    const { played, at } = deflected();
    expect(at).toBeGreaterThan(0);
    for (const s of played.states.slice(at)) {
      expect(s.boomerangs).toHaveLength(2);
      expect(boom(s, 'a').ownerId).toBe('a');
      expect(boom(s, 'b').state).toBe('HELD'); // Bob has only his own, in hand
    }
    const first = must(played.states[at], 'deflected state');
    expect(boom(first, 'a')).toMatchObject({
      state: 'DEFLECTED',
      deflectedBy: 'b',
      deflections: 1,
    });
  });

  it('flies the stated direction for the stated distance, then turns RETURNING and is caught by its owner', () => {
    const { played, at } = deflected();
    const first = must(played.states[at], 'deflected state');
    const d = boom(first, 'a').direction;
    const v = { x: 1, y: 0 };
    const expected = deflectionDirection(v, { x: -1, y: 0 });
    expect(d.x).toBeCloseTo(expected.x, 9);
    expect(d.y).toBeCloseTo(expected.y, 9);
    const start = boom(first, 'a').position;
    const turned = played.states.findIndex((s, i) => i > at && boom(s, 'a').state === 'RETURNING');
    expect(turned).toBeGreaterThan(at);
    const end = boom(must(played.states[turned - 1], 'last deflected'), 'a').position;
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThanOrEqual(C.deflectRange + EPS);
    // it flew along d, in a straight line
    const along =
      ((end.x - start.x) * d.x + (end.y - start.y) * d.y) /
      Math.hypot(end.x - start.x, end.y - start.y);
    expect(along).toBeCloseTo(1, 6);
    expect(played.states.some((s, i) => i > turned && boom(s, 'a').state === 'HELD')).toBe(true); // home again
    expect(types(played.events)).toContain('CAUGHT');
  });

  it('is not a shield for the boomerang’s owner’s enemies forever: it ends (no infinite lifetime)', () => {
    const { played } = deflected();
    expect(boom(must(played.states.at(-1), 'end'), 'a').state).toBe('HELD');
  });

  it('can be thrown again once it is home (the counters reset)', () => {
    const { played } = deflected();
    const home = must(played.states.at(-1), 'end');
    expect(boom(home, 'a')).toMatchObject({ deflections: 0, deflectedBy: undefined });
  });

  it('the deflector is immune to the boomerang they just knocked away, for that leg of its flight', () => {
    const { played, at } = deflected();
    const during = played.states.slice(at).filter((s) => boom(s, 'a').state === 'DEFLECTED');
    expect(during.length).toBeGreaterThan(3);
    expect(during.every((s) => player(s, 'b').alive)).toBe(true);
  });

  it('a deflected boomerang is still a weapon: it kills a third player in its path, but never its owner', () => {
    // Bob faces left; deflection heads up-left of the lane. Put Cleo in that path.
    const presses = Array.from({ length: 46 }, (_, p) => p).filter((p) =>
      survived(shoot(lane({}, ['a', 'b', 'c']), p, 60)),
    );
    const press = must(presses[Math.floor(presses.length / 2)], 'a good press');
    const probe = shoot(lane({}, ['a', 'b', 'c']), press, 60);
    const at = probe.states.findIndex((s) => boom(s, 'a').state === 'DEFLECTED');
    const dir = boom(must(probe.states[at], 's'), 'a').direction;
    const from = boom(must(probe.states[at], 's'), 'a').position;
    let s0 = lane({}, ['a', 'b', 'c']);
    s0 = place(s0, 'c', from.x + dir.x * 150, from.y + dir.y * 150);
    const p = shoot(s0, press, 60);
    expect(p.events.some((e) => e.type === 'HIT' && e.victimId === 'c' && e.byId === 'a')).toBe(
      true,
    );
    expect(p.events.some((e) => e.type === 'HIT' && e.victimId === 'a')).toBe(false);
    expect(p.events.some((e) => e.type === 'HIT' && e.victimId === 'b')).toBe(false);
  });

  it('the immunity is real: a boomerang knocked off line right beside its deflector would otherwise have clipped them', () => {
    // Bob faces left. The boomerang is moving up past his front-left; the blade sends it up and to the left,
    // and its path comes within 45 of his centre. Without the immunity that kills him; with it he lives.
    let s = lane();
    s = {
      ...s,
      boomerangs: s.boomerangs.map((b) =>
        b.ownerId === 'a'
          ? {
              ...b,
              state: 'THROWN' as const,
              position: { x: 670, y: 505 },
              direction: { x: 0, y: -1 },
              travelled: 0,
            }
          : b,
      ),
    };
    const events: FuEvent[] = [];
    for (let i = 0; i < 12; i += 1) {
      const r = stepFu(s, input(i === 0 ? { b: { slash: true } } : {}), DT);
      s = r.state;
      events.push(...r.events);
    }
    expect(types(events)).toContain('DEFLECTED');
    expect(events.some((e) => e.type === 'HIT' && e.victimId === 'b')).toBe(false);
    expect(player(s, 'b').alive).toBe(true);
    // and the same path really does come close enough to hurt (this is what the immunity prevented)
    const path = deflectionDirection({ x: 0, y: -1 }, { x: -1, y: 0 });
    const from = { x: 670, y: 490 };
    const t = (700 - from.x) * path.x + (450 - from.y) * path.y;
    const closest = Math.hypot(from.x + path.x * t - 700, from.y + path.y * t - 450);
    expect(closest).toBeLessThan(C.playerRadius + C.boomerangRadius);
  });

  it('a boomerang that turns RETURNING after a deflection is lethal to the deflector again (normal rules resume)', () => {
    const { played } = deflected();
    const returning = played.states.find((s) => boom(s, 'a').state === 'RETURNING');
    expect(boom(must(returning, 'returning'), 'a').deflectedBy).toBeUndefined();
  });
});

describe('walls after a deflection (Slice 2 rules still hold)', () => {
  const spawns = [
    { x: 60, y: 60 },
    { x: 1540, y: 840 },
    { x: 1540, y: 60 },
    { x: 60, y: 840 },
    { x: 60, y: 450 },
    { x: 1540, y: 450 },
  ];
  const gap = (p: { x: number; y: number }, w: Rect) =>
    Math.hypot(
      p.x - Math.min(Math.max(p.x, w.x), w.x + w.width),
      p.y - Math.min(Math.max(p.y, w.y), w.y + w.height),
    );

  it('deflected straight into an adjacent wall: it stops flush, turns RETURNING, and never enters the wall', () => {
    // Bob stands with a wall right behind his swing's exit line (above-left of the lane).
    const wall: Rect = { x: 500, y: 300, width: 120, height: 100 };
    const arena: FuArena = { width: 1600, height: 900, walls: [wall], spawns };
    let s = createFuMatch(
      ['a', 'b'].map((id, slot) => ({ id, slot })),
      { arena },
    );
    s = face(place(place(s, 'a', 200, 450), 'b', 700, 450), 'b', -1, 0);
    s = {
      ...s,
      boomerangs: s.boomerangs.map((b) =>
        b.ownerId === 'a'
          ? {
              ...b,
              state: 'THROWN' as const,
              position: { x: 560, y: 450 },
              direction: { x: 1, y: 0 },
              travelled: 0,
            }
          : b,
      ),
    };
    // deflection leaves up-left: into the wall's underside, 50 above
    let seen = false;
    for (let i = 0; i < 80; i += 1) {
      const r = stepFu(s, input(i === 0 ? { b: { slash: true } } : {}), DT);
      s = r.state;
      if (boom(s, 'a').state === 'DEFLECTED') seen = true;
      if (boom(s, 'a').state !== 'HELD')
        expect(gap(boom(s, 'a').position, wall), `step ${i}`).toBeGreaterThanOrEqual(RB - EPS);
      if (boom(s, 'a').state === 'HELD') break;
    }
    expect(seen).toBe(true);
    expect(boom(s, 'a').state).toBe('HELD');
  });

  it.each([DT, 3 * DT, MAX_STEP_SECONDS])(
    'no tunnelling through the thinnest wall after a deflection (dt = %s)',
    (dt) => {
      const wall: Rect = { x: 380, y: 200, width: C.playerRadius, height: 500 };
      const arena: FuArena = { width: 1600, height: 900, walls: [wall], spawns };
      for (const startX of [520, 540, 560, 580, 600]) {
        let s = createFuMatch(
          ['a', 'b'].map((id, slot) => ({ id, slot })),
          { arena },
        );
        s = face(place(place(s, 'a', 100, 450), 'b', 700, 450), 'b', -1, 0);
        s = {
          ...s,
          boomerangs: s.boomerangs.map((b) =>
            b.ownerId === 'a'
              ? {
                  ...b,
                  state: 'THROWN' as const,
                  position: { x: startX, y: 450 },
                  direction: { x: 1, y: 0 },
                  travelled: 0,
                }
              : b,
          ),
        };
        for (let i = 0; i < 60; i += 1) {
          s = stepFu(s, input(i === 0 ? { b: { slash: true } } : {}), dt).state;
          if (boom(s, 'a').state !== 'HELD') {
            expect(
              gap(boom(s, 'a').position, wall),
              `start ${startX} step ${i}`,
            ).toBeGreaterThanOrEqual(RB - EPS);
          }
        }
      }
    },
  );
});

describe('deterministic resolution order', () => {
  /** A boomerang of Alice's sits in both Bob's and Cleo's active arcs. */
  function crossfire() {
    let s = createFuMatch(
      ['a', 'b', 'c'].map((id, slot) => ({ id, slot })),
      {},
    );
    s = place(place(place(s, 'a', 100, 450), 'b', 700, 400), 'c', 700, 500);
    s = face(face(face(s, 'a', 1, 0), 'b', -1, 0), 'c', -1, 0);
    s = {
      ...s,
      boomerangs: s.boomerangs.map((b) =>
        b.ownerId === 'a'
          ? {
              ...b,
              state: 'THROWN' as const,
              position: { x: 590, y: 450 },
              direction: { x: 1, y: 0 },
              travelled: 0,
            }
          : b,
      ),
    };
    return s;
  }

  it('two players deflecting the same boomerang on the same step: exactly one deflects, the nearer; a tie goes to the earlier player', () => {
    const both = stepFu(crossfire(), input({ b: { slash: true }, c: { slash: true } }), DT);
    const deflections = both.events.filter((e) => e.type === 'DEFLECTED');
    expect(deflections).toHaveLength(1);
    expect(boom(both.state, 'a').deflections).toBe(1);
    // symmetric about the lane: equally near, so the earlier player in the match (b) wins
    expect(boom(both.state, 'a').deflectedBy).toBe('b');
    // nudge Cleo nearer: now she wins
    let near = place(crossfire(), 'c', 680, 460);
    near = face(near, 'c', -1, 0);
    const r = stepFu(near, input({ b: { slash: true }, c: { slash: true } }), DT);
    expect(boom(r.state, 'a').deflectedBy).toBe('c');
  });

  it('does not depend on the order the inputs were written or delivered in', () => {
    const forward = stepFu(crossfire(), input({ b: { slash: true }, c: { slash: true } }), DT);
    const reversed = stepFu(
      crossfire(),
      new Map([
        ['c', { slash: true }],
        ['b', { slash: true }],
      ]),
      DT,
    );
    expect(reversed).toEqual(forward);
  });

  it('one swing that reaches a player AND a boomerang does both on the same step', () => {
    let s = crossfire();
    s = place(s, 'c', 640, 420); // Cleo within Bob's arc and reach, off the lane
    const r = stepFu(s, input({ b: { slash: true } }), DT);
    expect(types(r.events)).toContain('DEFLECTED');
    expect(r.events.some((e) => e.type === 'HIT' && e.byId === 'b' && e.victimId === 'c')).toBe(
      true,
    );
  });

  it('a boomerang deflected this step kills nobody this step (the clank absorbs it), even a bystander right beside it', () => {
    let s = crossfire();
    s = place(s, 'c', 560, 470); // Cleo is within 50 of the boomerang at (590 + 15, 450), and out of Bob's reach
    const r = stepFu(s, input({ b: { slash: true } }), DT);
    expect(types(r.events)).toContain('DEFLECTED');
    expect(r.events.some((e) => e.type === 'HIT' && e.byId === 'a')).toBe(false);
    expect(player(r.state, 'c').alive).toBe(true);
  });

  it('a boomerang in nobody’s active arc is untouched and kills as before (same step, boomerang vs player)', () => {
    const r = stepFu(crossfire(), NONE, DT);
    expect(types(r.events)).not.toContain('DEFLECTED');
    let s = place(crossfire(), 'b', 615, 450);
    s = stepFu(s, NONE, DT).state;
    expect(player(s, 'b').alive).toBe(false);
  });

  it('simultaneous interactions: two defenders each deflect a different boomerang on the same step, independently', () => {
    // (a player must hold their own boomerang to slash, so "mutual" deflection is two separate ones)
    let s = createFuMatch(
      ['a', 'b', 'c', 'd'].map((id, slot) => ({ id, slot })),
      {},
    );
    s = place(place(place(place(s, 'a', 700, 200), 'b', 700, 700), 'c', 100, 200), 'd', 100, 700);
    s = face(face(s, 'a', -1, 0), 'b', -1, 0);
    s = {
      ...s,
      boomerangs: s.boomerangs.map((b) =>
        b.ownerId === 'c'
          ? {
              ...b,
              state: 'THROWN' as const,
              position: { x: 590, y: 200 },
              direction: { x: 1, y: 0 },
              travelled: 0,
            }
          : b.ownerId === 'd'
            ? {
                ...b,
                state: 'THROWN' as const,
                position: { x: 590, y: 700 },
                direction: { x: 1, y: 0 },
                travelled: 0,
              }
            : b,
      ),
    };
    const r = stepFu(s, input({ a: { slash: true }, b: { slash: true } }), DT);
    expect(r.events.filter((e) => e.type === 'DEFLECTED')).toHaveLength(2);
    expect(boom(r.state, 'c')).toMatchObject({
      state: 'DEFLECTED',
      deflectedBy: 'a',
      ownerId: 'c',
    });
    expect(boom(r.state, 'd')).toMatchObject({
      state: 'DEFLECTED',
      deflectedBy: 'b',
      ownerId: 'd',
    });
    expect(r.state.players.every((p) => p.alive)).toBe(true);
  });

  it('the same defender cannot deflect the boomerang they just deflected again on the next steps of the same swing', () => {
    let s = crossfire();
    s = stepFu(s, input({ b: { slash: true } }), DT).state;
    for (let i = 0; i < 6; i += 1) {
      const r = stepFu(s, NONE, DT);
      expect(types(r.events)).not.toContain('DEFLECTED');
      s = r.state;
    }
    expect(boom(s, 'a').deflections).toBe(1);
  });
});

describe('sequential deflections', () => {
  /** b faces a's boomerang; c stands where the first deflection sends it. */
  function relay(config: Partial<FuConfig> = {}) {
    let s = createFuMatch(
      ['a', 'b', 'c'].map((id, slot) => ({ id, slot })),
      config,
    );
    s = place(place(place(s, 'a', 100, 450), 'b', 700, 450), 'c', 520, 250);
    s = face(face(face(s, 'a', 1, 0), 'b', -1, 0), 'c', 0, 1);
    s = {
      ...s,
      boomerangs: s.boomerangs.map((b) =>
        b.ownerId === 'a'
          ? {
              ...b,
              state: 'THROWN' as const,
              position: { x: 590, y: 450 },
              direction: { x: 1, y: 0 },
              travelled: 0,
            }
          : b,
      ),
    };
    return s;
  }

  it('a second defender can deflect the already-deflected boomerang: owner unchanged, count 2, new deflector', () => {
    let s = stepFu(relay(), input({ b: { slash: true } }), DT).state;
    expect(boom(s, 'a')).toMatchObject({ state: 'DEFLECTED', deflections: 1, deflectedBy: 'b' });
    // wherever it goes next, Cleo meets it with her own slash: put her in its path and swing
    const d = boom(s, 'a').direction;
    const here = boom(s, 'a').position;
    s = place(s, 'c', here.x + d.x * 90, here.y + d.y * 90);
    s = face(s, 'c', -d.x, -d.y);
    let second: FuState | undefined;
    for (let i = 0; i < 12 && second === undefined; i += 1) {
      const r = stepFu(s, input(i === 0 ? { c: { slash: true } } : {}), DT);
      s = r.state;
      if (types(r.events).includes('DEFLECTED')) second = r.state;
    }
    const after = boom(must(second, 'a second deflection'), 'a');
    expect(after).toMatchObject({
      ownerId: 'a',
      state: 'DEFLECTED',
      deflections: 2,
      deflectedBy: 'c',
    });
  });

  it('the number of deflections per throw is capped, so a boomerang cannot be batted about forever', () => {
    let s = relay({ maxDeflections: 1 });
    s = stepFu(s, input({ b: { slash: true } }), DT).state;
    expect(boom(s, 'a').deflections).toBe(1);
    const d = boom(s, 'a').direction;
    const here = boom(s, 'a').position;
    s = place(s, 'c', here.x + d.x * 90, here.y + d.y * 90);
    s = face(s, 'c', -d.x, -d.y);
    let killed = false;
    for (let i = 0; i < 12; i += 1) {
      const r = stepFu(s, input(i === 0 ? { c: { slash: true } } : {}), DT);
      s = r.state;
      expect(types(r.events)).not.toContain('DEFLECTED');
      if (r.events.some((e) => e.type === 'HIT' && e.victimId === 'c')) killed = true;
    }
    expect(killed || !player(s, 'c').alive).toBe(true); // the cap is reached: it is lethal as normal
  });

  it('with the cap at zero nothing can be deflected at all', () => {
    const r = stepFu(relay({ maxDeflections: 0 }), input({ b: { slash: true } }), DT);
    expect(types(r.events)).not.toContain('DEFLECTED');
  });

  it('two defenders batting it back and forth still end: the boomerang gets home in bounded time', () => {
    let s = createFuMatch(
      ['a', 'b', 'c'].map((id, slot) => ({ id, slot })),
      {},
    );
    s = place(place(place(s, 'a', 100, 450), 'b', 700, 400), 'c', 700, 500);
    s = face(face(face(s, 'a', 1, 0), 'b', -1, 0), 'c', -1, 0);
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    let homeAt: number | undefined;
    for (let i = 0; i < 600; i += 1) {
      // both defenders slash on every step they can
      s = stepFu(s, input({ b: { slash: true }, c: { slash: true } }), DT).state;
      if (s.phase === 'ROUND_OVER') break;
      if (boom(s, 'a').state === 'HELD') {
        homeAt = i;
        break;
      }
    }
    expect(boom(s, 'a').deflections).toBeLessThanOrEqual(C.maxDeflections);
    expect(homeAt !== undefined || s.phase === 'ROUND_OVER').toBe(true);
  });
});

describe('configuration', () => {
  it.each([
    ['deflectRange', 0],
    ['deflectRange', Number.NaN],
    ['maxDeflections', -1],
    ['maxDeflections', 1.5],
  ] as const)('rejects %s = %s', (key, value) => {
    expect(() => createFuMatch([{ id: 'a', slot: 0 }], { ...STRAIGHT, [key]: value })).toThrow(
      RangeError,
    );
  });
  it('the state machine: DEFLECTED is reachable from THROWN, RETURNING and itself, and leads only to RETURNING or another deflection', () => {
    expect(canTransition('THROWN', 'DEFLECTED')).toBe(true);
    expect(canTransition('RETURNING', 'DEFLECTED')).toBe(true);
    expect(canTransition('DEFLECTED', 'DEFLECTED')).toBe(true);
    expect(canTransition('DEFLECTED', 'RETURNING')).toBe(true);
    expect(canTransition('DEFLECTED', 'HELD')).toBe(false);
    expect(canTransition('DEFLECTED', 'THROWN')).toBe(false);
    expect(canTransition('HELD', 'DEFLECTED')).toBe(false);
  });
});

describe('determinism and long-run invariants', () => {
  /**
   * Deterministic stand-in players: each walks at the nearest living enemy (so they face each other),
   * throws now and then, and SLASHES when an enemy boomerang is close — which is what makes deflections
   * actually happen over thousands of steps. `noise` makes them less perfect.
   */
  function policy(s: FuState, i: number, noise: () => number): FuInputs {
    return new Map(
      s.players.map((p) => {
        const me = pos(s, p.id);
        const enemies = s.players.filter((q) => q.id !== p.id && q.alive);
        const nearest = enemies
          .map((q) => ({ q, d: Math.hypot(pos(s, q.id).x - me.x, pos(s, q.id).y - me.y) }))
          .sort((x, y) => x.d - y.d)[0];
        const target = nearest === undefined ? me : pos(s, nearest.q.id);
        const heading = unit(target.x - me.x || 1e-3, target.y - me.y);
        const threatened = s.boomerangs.some(
          (b) =>
            b.ownerId !== p.id &&
            b.state !== 'HELD' &&
            Math.hypot(b.position.x - me.x, b.position.y - me.y) < 150,
        );
        return [
          p.id,
          {
            move: { x: heading.x + (noise() - 0.5) * 0.4, y: heading.y + (noise() - 0.5) * 0.4 },
            throw: (i + p.slot * 7) % 45 === 0,
            slash: threatened || noise() < 0.01,
          },
        ];
      }),
    );
  }
  const lcg = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const crowd = (arena?: FuArena) => {
    let s = createFuMatch(
      ['a', 'b', 'c'].map((id, slot) => ({ id, slot })),
      arena === undefined ? {} : { arena },
    );
    if (arena === undefined)
      s = place(place(place(s, 'a', 500, 450), 'b', 900, 450), 'c', 700, 700);
    return s;
  };

  it('byte-identical replay with deflections happening', () => {
    const run = () => {
      let s = crowd();
      const noise = lcg(5);
      const events: FuEvent[] = [];
      for (let i = 0; i < 6000; i += 1) {
        const r = stepFu(s, policy(s, i, noise), DT);
        s = r.state;
        events.push(...r.events);
      }
      return { s, events };
    };
    const one = run();
    const two = run();
    expect(JSON.stringify(two.s)).toBe(JSON.stringify(one.s));
    expect(two.events).toEqual(one.events);
    expect(one.events.filter((e) => e.type === 'DEFLECTED').length).toBeGreaterThan(3);
    expect(one.events.some((e) => e.type === 'ROUND_START')).toBe(true); // and it crossed round resets
  });

  it('fuzz on the real arena, six reactive players: never a duplicate boomerang, never inside a wall, deflections capped, nothing flies forever', () => {
    let s = createFuMatch(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id, slot) => ({ id, slot })),
      { arena: PRIMITIVE_ARENA },
    );
    const noise = lcg(31337);
    const walls = PRIMITIVE_ARENA.walls ?? [];
    const away = new Map<string, number>();
    let deflections = 0;
    for (let i = 0; i < 24000; i += 1) {
      const r = stepFu(s, policy(s, i, noise), i % 6 === 0 ? 3 * DT : DT);
      s = r.state;
      deflections += r.events.filter((e) => e.type === 'DEFLECTED').length;
      expect(s.boomerangs).toHaveLength(6);
      expect(new Set(s.boomerangs.map((b) => b.ownerId)).size).toBe(6);
      for (const b of s.boomerangs) {
        expect(b.deflections).toBeLessThanOrEqual(C.maxDeflections);
        if (b.state !== 'HELD') {
          for (const w of walls) {
            const g = Math.hypot(
              b.position.x - Math.min(Math.max(b.position.x, w.x), w.x + w.width),
              b.position.y - Math.min(Math.max(b.position.y, w.y), w.y + w.height),
            );
            expect(g, `step ${i}`).toBeGreaterThanOrEqual(RB - EPS);
          }
          // (lying on the ground it may wait as long as it likes for its thrower: only a FLYING boomerang's time is bounded)
          away.set(b.ownerId, b.state === 'GROUNDED' ? 0 : (away.get(b.ownerId) ?? 0) + 1);
        } else {
          away.set(b.ownerId, 0);
        }
        // bounded flight: up to 4 legs of 0.4–0.6 s plus a return (3 s of wall-following at worst, then it drops)
        expect(away.get(b.ownerId) ?? 0).toBeLessThan(20 / DT);
      }
      if (s.phase === 'ROUND_OVER')
        s = { ...s, roundOver: { winnerId: undefined, resetInSeconds: DT } };
    }
    expect(deflections).toBeGreaterThanOrEqual(3); // rare in a crowd, but they do happen (the open-arena replay above has many)
  }, 90_000);
});
