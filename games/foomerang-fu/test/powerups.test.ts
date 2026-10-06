import { describe, expect, it } from 'vitest';
import {
  POWER_COMBINATIONS,
  POWER_KINDS,
  PRIMITIVE_ARENA,
  PRIMITIVE_POWERUPS,
  createFuMatch,
  isPowerKind,
  spawnKind,
  stepFu,
  type FuState,
  type PowerKind,
} from '../src/rules';
import {
  C,
  DT,
  LANE,
  NONE,
  at,
  face,
  give,
  holds,
  input,
  kill,
  make,
  must,
  patchPowers,
  place,
  player,
  run,
  types,
} from './support/fixtures';

// ------------------------------------------------------------------------------------------------
// The powerup SYSTEM: what exists, where it appears, who takes it, how long it lasts, how it
// stacks. (What each of the five does has its own file.) Everything here is rules state.
// ------------------------------------------------------------------------------------------------

const SPOTS = [
  { x: 400, y: 300 },
  { x: 800, y: 300 },
  { x: 1200, y: 300 },
];
const SCHEDULE = {
  spots: SPOTS,
  firstSeconds: 2,
  intervalSeconds: 3,
  maxOnField: 2,
  pickupRadius: 28,
};
const withSchedule = (overrides: object = {}) =>
  make(['a', 'b'], { powerups: { ...SCHEDULE, ...overrides } });
/** Both players far from every spot, so nothing collects by accident. */
const parked = (s = withSchedule()) => place(place(s, 'a', 100, 800), 'b', 1500, 800);

describe('the five powerups and their compatibility table', () => {
  it('there are exactly five, in a fixed order', () => {
    expect([...POWER_KINDS]).toEqual([
      'OVERDRIVE',
      'BLAST_BOOMERANG',
      'GUARD',
      'TWIN_THROW',
      'PHASE_DASH',
    ]);
    expect(POWER_KINDS.every(isPowerKind)).toBe(true);
    for (const junk of ['', 'overdrive', 'SHIELD', 7, null, undefined, {}]) {
      expect(isPowerKind(junk)).toBe(false);
    }
  });

  it('every unordered pair is spelled out — nothing combines (or fails to) by accident', () => {
    const keys = Object.keys(POWER_COMBINATIONS).sort();
    expect(keys).toHaveLength(10);
    const expected: string[] = [];
    for (const a of POWER_KINDS) for (const b of POWER_KINDS) if (a < b) expected.push(`${a}+${b}`);
    expect(keys).toEqual(expected.sort());
    for (const entry of Object.values(POWER_COMBINATIONS)) {
      expect(entry.allowed).toBe(true);
      expect(entry.rule.length).toBeGreaterThan(5);
    }
  });
});

describe('the pickup schedule is deterministic', () => {
  it('there are no pickups, ever, unless the config asks for them (Slices 1–4 are untouched)', () => {
    const s = run(make(), 3000).state;
    expect(s.pickups).toEqual([]);
    expect(s.pickupClock.spawned).toBe(0);
  });

  it('the first pickup appears exactly firstSeconds in, the next intervalSeconds after, in a fixed rotation of all five', () => {
    let s = parked();
    const appeared: { at: number; kind: PowerKind; x: number; y: number }[] = [];
    for (let step = 1; step <= 60 * 40 && appeared.length < 5; step += 1) {
      const r = stepFu(s, NONE, DT);
      s = r.state;
      // keep the field clear so the cap does not hold the schedule back
      for (const e of r.events) {
        if (e.type === 'POWERUP_SPAWNED')
          appeared.push({ at: step, kind: e.kind, x: e.position.x, y: e.position.y });
      }
      s = { ...s, pickups: [] };
    }
    expect(appeared.map((p) => p.at)).toEqual([120, 300, 480, 660, 840]); // 2 s, then every 3 s (+ the step that spawns)
    expect(appeared.map((p) => p.kind)).toEqual([
      'OVERDRIVE',
      'GUARD',
      'PHASE_DASH',
      'BLAST_BOOMERANG',
      'TWIN_THROW',
    ]);
    expect(new Set(appeared.map((p) => p.kind)).size).toBe(5);
    expect(appeared.map((p) => [p.x, p.y])).toEqual([
      [400, 300],
      [800, 300],
      [1200, 300],
      [400, 300],
      [800, 300],
    ]);
  });

  it('is a pure function of the spawn counter and the round (round 2 starts the rotation elsewhere)', () => {
    expect(spawnKind(0, 1)).toBe('OVERDRIVE');
    expect(spawnKind(0, 2)).toBe('BLAST_BOOMERANG');
    expect(spawnKind(0, 3)).toBe('GUARD');
    for (let n = 0; n < 5; n += 1) {
      expect(new Set(POWER_KINDS.map((_, i) => spawnKind(n + i, 1))).size).toBe(5);
    }
  });

  it('stops spawning at maxOnField, holds its clock while the field is full, and resumes when one is taken', () => {
    let s = parked();
    s = run(s, 60 * 12).state; // far longer than needed for three pickups
    expect(s.pickups).toHaveLength(2);
    expect(s.pickupClock.spawned).toBe(2);
    const held = s.pickupClock.spawnIn;
    s = run(s, 120).state;
    expect(s.pickupClock.spawnIn).toBe(held); // frozen, not banking time
    // take one: the next appears after the REMAINING time, not instantly and not a full interval later
    const first = must(s.pickups[0], 'pickup');
    s = place(s, 'a', first.position.x, first.position.y);
    s = stepFu(s, NONE, DT).state;
    expect(s.pickups).toHaveLength(1);
    s = place(s, 'a', 100, 800);
    let steps = 0;
    while (s.pickups.length < 2 && steps < 1000) {
      s = stepFu(s, NONE, DT).state;
      steps += 1;
    }
    expect(Math.abs(steps - held / DT)).toBeLessThanOrEqual(1);
  });

  it('never stacks two pickups on one spot, and waits when every spot is taken', () => {
    let s = parked(withSchedule({ spots: [SPOTS[0], SPOTS[1]], maxOnField: 5 }));
    s = run(s, 60 * 30).state;
    expect(s.pickups).toHaveLength(2);
    const where = s.pickups.map((p) => `${p.position.x},${p.position.y}`);
    expect(new Set(where).size).toBe(2);
    expect(s.pickupClock.spawnIn).toBeLessThanOrEqual(0); // ready, but nowhere to put it
    // a spot frees up: it fills at once
    const target = must(s.pickups[0], 'pickup');
    s = place(s, 'a', target.position.x, target.position.y);
    s = stepFu(s, NONE, DT).state;
    s = place(s, 'a', 100, 800);
    s = stepFu(s, NONE, DT).state;
    expect(s.pickups).toHaveLength(2);
  });

  it('a round reset clears the field and restarts the schedule; powers do not carry over', () => {
    let s = parked();
    s = run(s, 60 * 5).state;
    expect(s.pickups.length).toBeGreaterThan(0);
    s = give(s, 'a', 'GUARD');
    s = stepFu(kill(s, 'b'), NONE, DT).state;
    expect(s.phase).toBe('ROUND_OVER');
    let next = s;
    for (let i = 0; i < 400 && next.round === 1; i += 1) next = stepFu(next, NONE, DT).state;
    expect(next.round).toBe(2);
    expect(next.pickups).toEqual([]);
    expect(next.pickupClock).toEqual({ spawnIn: SCHEDULE.firstSeconds, spawned: 0 });
    expect(next.players.every((p) => holds(next, p.id, 'GUARD') === false)).toBe(true);
    expect(next.extraBoomerangs).toEqual([]);
  });

  it('nothing spawns while the round is over', () => {
    let s = parked();
    s = stepFu(kill(s, 'b'), NONE, DT).state;
    const before = s.pickupClock;
    s = run(s, 30).state;
    expect(s.pickupClock).toEqual(before);
    expect(s.pickups).toEqual([]);
  });

  it('is deterministic: the same match replays to the identical state and events (1,500 steps)', () => {
    const play = () => {
      let s = make(['a', 'b', 'c'], { arena: PRIMITIVE_ARENA, powerups: PRIMITIVE_POWERUPS });
      const log: unknown[] = [];
      for (let i = 0; i < 1500; i += 1) {
        const r = stepFu(
          s,
          input({
            a: {
              move: { x: Math.cos(i / 40), y: Math.sin(i / 50) },
              dash: i % 23 === 0,
              throw: i % 61 === 0,
            },
            b: {
              move: { x: Math.sin(i / 33), y: Math.cos(i / 29) },
              slash: i % 47 === 0,
              dash: i % 31 === 0,
            },
            c: { move: { x: -Math.cos(i / 37), y: Math.sin(i / 41) }, throw: i % 53 === 0 },
          }),
          DT,
        );
        s = r.state;
        log.push(r.events);
      }
      return JSON.stringify({ s, log });
    };
    expect(play()).toBe(play());
  });
});

describe('collection: who takes a pickup, and when', () => {
  const lay = (s: FuState = make(), kind: PowerKind = 'GUARD', x = 600, y = 450): FuState => ({
    ...s,
    pickups: [...s.pickups, { id: 1 + s.pickups.length, kind, position: { x, y } }],
  });
  const base = () => place(place(make(), 'a', 100, 800), 'b', 1500, 800);

  it('a body overlapping the pickup takes it: removed from the field, announced, and now theirs', () => {
    const s = place(lay(base()), 'a', 600 + 60, 450);
    const r = stepFu(s, NONE, DT);
    expect(r.state.pickups).toEqual([]);
    expect(player(r.state, 'a').powers.guard).toBe(true);
    const picked = r.events.filter((e) => e.type === 'PICKED_UP');
    expect(picked).toEqual([
      {
        type: 'PICKED_UP',
        playerId: 'a',
        kind: 'GUARD',
        pickupId: 1,
        position: { x: 600, y: 450 },
      },
    ]);
  });

  it('just out of reach it is not taken (reach = player radius + pickup radius)', () => {
    const reach = C.playerRadius + 28;
    const near = stepFu(place(lay(base()), 'a', 600 + reach - 0.5, 450), NONE, DT).state;
    expect(near.pickups).toEqual([]);
    const far = stepFu(place(lay(base()), 'a', 600 + reach + 0.5, 450), NONE, DT).state;
    expect(far.pickups).toHaveLength(1);
    expect(player(far, 'a').powers.guard).toBe(false);
  });

  it('cover matters: a pickup on the far side of a wall cannot be taken through it', () => {
    const arena = { width: 1600, height: 900, walls: [{ x: 700, y: 300, width: 50, height: 300 }] };
    let s = make(['a', 'b'], { arena });
    s = place(place(s, 'a', 690, 450), 'b', 1500, 800);
    s = lay(s, 'GUARD', 752, 450); // 62 away: inside the radius, but the wall is between
    const after = stepFu(s, NONE, DT).state;
    expect(after.pickups).toHaveLength(1);
    expect(player(after, 'a').powers.guard).toBe(false);
  });

  it('cover matters even for a long reach: with a wider pickup radius a wall is still between player and pickup', () => {
    const arena = { width: 1600, height: 900, walls: [{ x: 700, y: 300, width: 50, height: 300 }] };
    const wide = {
      spots: [{ x: 300, y: 100 }],
      firstSeconds: 99,
      intervalSeconds: 99,
      maxOnField: 1,
      pickupRadius: 60,
    };
    let s = make(['a', 'b'], { arena, powerups: wide });
    s = place(place(s, 'a', 664, 450), 'b', 1500, 800); // flush against the wall
    s = lay(s, 'GUARD', 752, 450); // 88 away: inside the (36 + 60) reach, behind the wall
    const after = stepFu(s, NONE, DT).state;
    expect(after.pickups).toHaveLength(1);
    expect(player(after, 'a').powers.guard).toBe(false);
    // the same distance with nothing in the way is taken
    let open = make(['a', 'b'], { powerups: { ...wide, spots: [{ x: 300, y: 100 }] } });
    open = place(place(open, 'a', 664, 450), 'b', 1500, 800);
    open = lay(open, 'GUARD', 752, 450);
    expect(player(stepFu(open, NONE, DT).state, 'a').powers.guard).toBe(true);
  });

  it('an impossible pickup (unknown kind) is dropped and never obeyed; nothing is granted', () => {
    let s = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
    s = {
      ...s,
      pickups: [{ id: 1, kind: 'SHIELD' as unknown as PowerKind, position: at(s, 'a') }],
    };
    const r = stepFu(s, NONE, DT);
    expect(r.state.pickups).toEqual([]);
    expect(r.events).toEqual([]);
    expect(player(r.state, 'a').powers).toEqual({
      overdrive: 0,
      blast: false,
      guard: false,
      twin: false,
      phase: 0,
    });
  });

  it('contention: the NEARER player takes it; an exact tie goes to the earlier player in the match', () => {
    let s = lay(make(['a', 'b']));
    s = place(place(s, 'a', 600 - 50, 450), 'b', 600 + 40, 450);
    let r = stepFu(s, NONE, DT);
    expect(player(r.state, 'b').powers.guard).toBe(true);
    expect(player(r.state, 'a').powers.guard).toBe(false);
    // …but they are 72 apart so cannot overlap; use a vertical pair for the exact tie
    s = lay(make(['a', 'b']));
    s = place(place(s, 'a', 600 - 40, 450), 'b', 600 + 40, 450);
    r = stepFu(s, NONE, DT);
    expect(player(r.state, 'a').powers.guard).toBe(true); // a is earlier in the match
    expect(player(r.state, 'b').powers.guard).toBe(false);
    // the match order, not the ids, decides it
    let flipped = lay(make(['b', 'a']));
    flipped = place(place(flipped, 'a', 600 - 40, 450), 'b', 600 + 40, 450);
    const f = stepFu(flipped, NONE, DT);
    expect(player(f.state, 'b').powers.guard).toBe(true);
    expect(player(f.state, 'a').powers.guard).toBe(false);
  });

  it('contention never depends on which player pressed what: inputs do not change the winner', () => {
    let s = lay(make(['a', 'b']));
    s = place(place(s, 'a', 600 - 40, 450), 'b', 600 + 40, 450);
    for (const inputs of [
      NONE,
      input({ a: { slash: true } }),
      input({ b: { throw: true }, a: { throw: true } }),
    ]) {
      const r = stepFu(s, inputs, DT);
      expect(player(r.state, 'a').powers.guard).toBe(true);
    }
  });

  it('a player takes at most ONE pickup per step; the next step they take the next', () => {
    let s = base();
    s = lay(lay(s, 'GUARD', 600, 450), 'OVERDRIVE', 610, 450);
    s = place(s, 'a', 600, 450);
    const one = stepFu(s, NONE, DT);
    expect(one.state.pickups).toHaveLength(1);
    expect(player(one.state, 'a').powers.guard).toBe(true); // the lower pickup id first
    expect(player(one.state, 'a').powers.overdrive).toBe(0);
    const two = stepFu(one.state, NONE, DT);
    expect(two.state.pickups).toEqual([]);
    expect(player(two.state, 'a').powers.overdrive).toBeGreaterThan(0);
  });

  it('two pickups, two players, one step: each takes the one nearest them', () => {
    let s = base();
    s = lay(lay(s, 'GUARD', 400, 450), 'PHASE_DASH', 800, 450);
    s = place(place(s, 'a', 800, 450), 'b', 400, 450); // each stands on the OTHER one's pickup
    const r = stepFu(s, NONE, DT);
    expect(player(r.state, 'a').powers.phase).toBeGreaterThan(0);
    expect(player(r.state, 'b').powers.guard).toBe(true);
  });

  it('a duplicate is refused: the pickup stays for someone else, and nothing is wasted or stacked', () => {
    let s = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
    s = give(s, 'a', 'GUARD');
    s = lay(s, 'GUARD', 600, 450);
    const again = stepFu(s, NONE, DT).state;
    expect(again.pickups).toHaveLength(1);
    // another player who does not hold one can take it
    const taken = stepFu(place(again, 'b', 600 + 40, 450), NONE, DT).state;
    expect(taken.pickups).toEqual([]);
    expect(player(taken, 'b').powers.guard).toBe(true);
    // a timed one is "held" while it runs, and takeable again once it has ended
    let t = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
    t = give(t, 'a', 'OVERDRIVE');
    t = lay(t, 'OVERDRIVE', 600, 450);
    expect(stepFu(t, NONE, DT).state.pickups).toHaveLength(1);
    t = patchPowers(t, 'a', { overdrive: 0 });
    expect(stepFu(t, NONE, DT).state.pickups).toHaveLength(0);
  });

  it('different powers coexist: a player can take all five, one at a time', () => {
    let s = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
    for (const kind of POWER_KINDS) s = give(s, 'a', kind);
    for (const kind of POWER_KINDS) expect(holds(s, 'a', kind), kind).toBe(true);
  });

  it('an excluded pair cannot be held together (the pickup stays), and the table can say so', () => {
    const only = (pairs: [PowerKind, PowerKind][]) =>
      place(place(make(['a', 'b'], { exclusivePairs: pairs }), 'a', 600, 450), 'b', 1500, 800);
    let s = give(only([['GUARD', 'PHASE_DASH']]), 'a', 'GUARD');
    s = lay(s, 'PHASE_DASH', 600, 450);
    expect(stepFu(s, NONE, DT).state.pickups).toHaveLength(1);
    expect(player(stepFu(s, NONE, DT).state, 'a').powers.phase).toBe(0);
    // order does not matter, and other kinds are unaffected
    let t = give(only([['GUARD', 'PHASE_DASH']]), 'a', 'PHASE_DASH');
    t = lay(t, 'GUARD', 600, 450);
    expect(stepFu(t, NONE, DT).state.pickups).toHaveLength(1);
    t = lay({ ...t, pickups: [] }, 'OVERDRIVE', 600, 450);
    expect(stepFu(t, NONE, DT).state.pickups).toHaveLength(0);
  });

  it('the dead take nothing', () => {
    const s = kill(place(lay(base()), 'a', 600, 450), 'a');
    const r = stepFu(s, NONE, DT);
    expect(r.state.pickups).toHaveLength(1);
    expect(player(r.state, 'a').powers.guard).toBe(false);
  });

  it('a dasher takes what is under them at the end of the step, at any accepted dt', () => {
    for (const dt of [DT, 0.1]) {
      let s = lay(base(), 'GUARD', 700, 450);
      s = face(place(s, 'a', 560, 450), 'a', 1, 0);
      let r = stepFu(s, input({ a: { dash: true } }), dt);
      for (let i = 0; i < 12; i += 1) r = stepFu(r.state, NONE, dt);
      expect(r.state.pickups, `dt ${dt}`).toEqual([]);
      expect(player(r.state, 'a').powers.guard, `dt ${dt}`).toBe(true);
    }
  });

  it('collection happens BEFORE kills in a step: a player who dies the step they take one still took it (and loses it)', () => {
    let s = make(['a', 'b']);
    s = place(place(s, 'a', 600, 450), 'b', 600 + 100, 450);
    s = face(s, 'b', -1, 0);
    s = lay(s, 'GUARD', 600, 450);
    s = { ...s, pickups: [{ id: 1, kind: 'OVERDRIVE', position: { x: 600, y: 450 } }] };
    const r = stepFu(s, input({ b: { slash: true } }), DT);
    expect(types(r.events)).toContain('PICKED_UP');
    expect(player(r.state, 'a').alive).toBe(false);
    expect(player(r.state, 'a').powers).toEqual({
      overdrive: 0,
      blast: false,
      guard: false,
      twin: false,
      phase: 0,
    });
  });

  it('collection happens BEFORE throws in a step: what you take this step already counts when you throw', () => {
    let s = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
    s = face(s, 'a', 1, 0);
    s = lay(s, 'BLAST_BOOMERANG', 600, 450);
    const r = stepFu(s, input({ a: { throw: true } }), DT);
    expect(r.state.boomerangs[0]?.blast).toBe(true);
  });
});

describe('lifetimes', () => {
  it('OVERDRIVE is timed: on for exactly overdriveSeconds after the step it was taken, then announced as ended', () => {
    let s = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
    s = give(s, 'a', 'OVERDRIVE');
    expect(player(s, 'a').powers.overdrive).toBe(C.overdriveSeconds);
    const steps = Math.round(C.overdriveSeconds / DT);
    const nearly = run(s, steps - 1);
    expect(holds(nearly.state, 'a', 'OVERDRIVE')).toBe(true);
    const done = stepFu(nearly.state, NONE, DT);
    expect(holds(done.state, 'a', 'OVERDRIVE')).toBe(false);
    expect(done.events).toEqual([{ type: 'POWER_EXPIRED', playerId: 'a', kind: 'OVERDRIVE' }]);
  });

  it('death takes every power; so does a round reset; the dead hold nothing', () => {
    let s = place(place(make(['a', 'b', 'c']), 'a', 600, 450), 'b', 1500, 800);
    s = place(s, 'c', 1500, 100);
    for (const kind of POWER_KINDS) s = give(s, 'a', kind);
    expect(s.extraBoomerangs).toHaveLength(1);
    s = patchPowers(s, 'a', { guard: false }); // (a guard would absorb this very swing: see guard.test.ts)
    s = place(s, 'b', 700, 450);
    s = face(s, 'b', -1, 0);
    const r = stepFu(s, input({ b: { slash: true } }), DT);
    expect(player(r.state, 'a').alive).toBe(false);
    for (const kind of POWER_KINDS) expect(holds(r.state, 'a', kind), kind).toBe(false);
  });

  it('powers survive ordinary play: moving, dashing, slashing and throwing spend none of them', () => {
    let s = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
    s = give(give(s, 'a', 'GUARD'), 'a', 'TWIN_THROW');
    s = run(s, 30, input({ a: { move: { x: 1, y: 0 }, slash: true } })).state;
    expect(player(s, 'a').powers.guard).toBe(true);
    expect(player(s, 'a').powers.twin).toBe(true);
  });
});

describe('powerup configuration is checked (a bad schedule is a RangeError, never a game state)', () => {
  const bad = (powerups: object) => () =>
    createFuMatch([{ id: 'a', slot: 0 }], {
      arena: PRIMITIVE_ARENA,
      powerups: { ...PRIMITIVE_POWERUPS, ...powerups },
    });

  it('accepts the primitive arena schedule', () => {
    expect(bad({})).not.toThrow();
  });

  it.each([
    ['no spots', { spots: [] }],
    ['a spot outside the arena', { spots: [{ x: 5000, y: 100 }] }],
    ['a spot inside a wall', { spots: [{ x: 800, y: 450 }] }],
    ['a spot against a wall', { spots: [{ x: 690, y: 450 }] }],
    ['a non-finite spot', { spots: [{ x: Number.NaN, y: 100 }] }],
    [
      'two identical spots',
      {
        spots: [
          { x: 460, y: 450 },
          { x: 460, y: 450 },
        ],
      },
    ],
    ['a zero first delay', { firstSeconds: 0 }],
    ['a negative interval', { intervalSeconds: -3 }],
    ['an infinite interval', { intervalSeconds: Number.POSITIVE_INFINITY }],
    ['a fractional cap', { maxOnField: 1.5 }],
    ['a zero cap', { maxOnField: 0 }],
    ['a zero pickup radius', { pickupRadius: 0 }],
  ])('rejects %s', (_name, powerups) => {
    expect(bad(powerups)).toThrow(RangeError);
  });

  it('rejects nonsense power settings', () => {
    const mk = (o: object) => () => createFuMatch([{ id: 'a', slot: 0 }], o);
    expect(mk({ phaseDashCharges: 0 })).toThrow(RangeError);
    expect(mk({ phaseDashCharges: 1.5 })).toThrow(RangeError);
    expect(mk({ overdriveMoveFactor: 0.9 })).toThrow(RangeError);
    expect(mk({ overdriveDashFactor: 0.5 })).toThrow(RangeError);
    expect(mk({ overdriveSeconds: 0 })).toThrow(RangeError);
    expect(mk({ blastRadius: -1 })).toThrow(RangeError);
    expect(mk({ exclusivePairs: [['GUARD', 'NOPE']] })).toThrow(RangeError);
    expect(mk({ exclusivePairs: [['GUARD']] })).toThrow(RangeError);
    // an overdriven body or dash must still be sweepable
    expect(mk({ overdriveMoveFactor: 6 })).toThrow(RangeError);
    expect(mk({ overdriveDashFactor: 2 })).toThrow(RangeError);
  });
});

describe('the overall step order is fixed and written down', () => {
  it('spawning happens after collection: a pickup that appears this step cannot be taken this step', () => {
    let s = make(['a', 'b'], { powerups: { ...SCHEDULE, firstSeconds: DT } });
    s = place(place(s, 'a', 400, 300), 'b', 1500, 800); // standing on the first spot
    const r = stepFu(s, NONE, DT);
    expect(r.state.pickups).toHaveLength(1);
    expect(player(r.state, 'a').powers.overdrive).toBe(0);
    const next = stepFu(r.state, NONE, DT);
    expect(player(next.state, 'a').powers.overdrive).toBeGreaterThan(0);
  });

  it('LANE keeps the shared fixture honest', () => {
    expect(LANE.arena.width).toBeGreaterThan(PRIMITIVE_ARENA.width);
    expect(at(make(), 'a')).toBeDefined();
  });
});
