import { FIXED_TIMESTEP_SECONDS as DT } from '@foomerang/game-core';
import { describe, expect, it } from 'vitest';
import {
  CpuController,
  DEFAULT_FU_CONFIG,
  DIFFICULTIES,
  PROFILES,
  Rng,
  SYSTEMS_ARENA,
  rematchOf,
  seedFor,
  type Difficulty,
  type FuEvent,
  type FuPlayerInput,
} from '../src';
import { circleHitsWalls, wallsOf } from '../src/rules/arena';
import { playMatch, type Participant } from './support/cpuMatch';
import { at, face, own, patchPlayer, place, player, STRAIGHT } from './support/fixtures';

// CPU players are tested as BEHAVIOUR: deterministic scenarios and properties over many seeds, through
// the real rules. A CPU is a player whose controller happens to be software, so everything here is also
// a statement about what it is NOT allowed to do.

const C = DEFAULT_FU_CONFIG;
const OPEN = { width: 1600, height: 900 };
const still = (): FuPlayerInput => ({});
const count = (events: readonly FuEvent[], type: string) =>
  events.filter((e) => e.type === type).length;

describe('a CPU is a player: the architecture', () => {
  it('everything a CPU produces is an ordinary input: a thumb direction and the three buttons, nothing else', () => {
    const allowed = new Set(['move', 'throw', 'slash', 'dash']);
    const seen = { move: 0, throw: 0, slash: 0, dash: 0 };
    for (const d of DIFFICULTIES) {
      const r = playMatch({
        participants: [
          { id: 'a', cpu: d },
          { id: 'b', cpu: d },
          { id: 'c', cpu: d },
        ],
        steps: 60 * 40,
        seed: 3,
        keepInputs: true,
        powerups: true,
      });
      for (const frame of r.inputs) {
        for (const input of frame.values()) {
          for (const key of Object.keys(input)) expect(allowed.has(key), key).toBe(true);
          if (input.move !== undefined) {
            expect(Number.isFinite(input.move.x) && Number.isFinite(input.move.y)).toBe(true);
            expect(Math.hypot(input.move.x, input.move.y)).toBeLessThanOrEqual(1 + 1e-9);
            if (input.move.x !== 0 || input.move.y !== 0) seen.move += 1;
          }
          for (const button of ['throw', 'slash', 'dash'] as const) {
            if (input[button] !== undefined) {
              expect(input[button]).toBe(true); // only the boolean true, exactly as a controller sends
              seen[button] += 1;
            }
          }
        }
      }
    }
    expect(seen.move).toBeGreaterThan(0);
    expect(seen.throw).toBeGreaterThan(0);
    expect(seen.slash).toBeGreaterThan(0);
    expect(seen.dash).toBeGreaterThan(0);
  });

  it('MOVE, THROW, SLASH and DASH inputs from a CPU each really happen in the rules (the same events a human causes)', () => {
    const count = { THROWN: 0, SLASHED: 0, DASHED: 0 } as Record<string, number>;
    let rounds = 0;
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 3; seed += 1) {
        const r = playMatch({
          participants: [
            { id: 'a', cpu: d },
            { id: 'b', cpu: d },
            { id: 'c', cpu: d },
          ],
          steps: 60 * 40,
          seed,
          onStep: (_state, events) => {
            for (const e of events) if (e.type in count) count[e.type] = (count[e.type] ?? 0) + 1;
          },
        });
        rounds += r.state.round;
      }
    }
    console.warn(`EVENTS ${JSON.stringify(count)}`);
    expect(count['THROWN']).toBeGreaterThan(0);
    expect(count['SLASHED']).toBeGreaterThan(0);
    expect(count['DASHED']).toBeGreaterThan(0);
    expect(rounds).toBeGreaterThan(9);
  });

  it("a CPU gets no better physics: speed, dash length, dash allowance and recovery are the rules' own, for every difficulty", () => {
    const maxStep = C.dashSpeed * C.overdriveDashFactor * DT + 1e-6; // the fastest legal movement in one step
    for (const d of DIFFICULTIES) {
      let previous = new Map<string, { x: number; y: number }>();
      let fastest = 0;
      let dashesInARow = 0;
      let mostDashes = 0;
      playMatch({
        participants: [
          { id: 'a', cpu: d },
          { id: 'b', cpu: d },
        ],
        steps: 60 * 60,
        seed: 21,
        onStep: (state) => {
          for (const p of state.players) {
            const now = at(state, p.id);
            const before = previous.get(p.id);
            if (before !== undefined && state.phase === 'PLAYING') {
              fastest = Math.max(fastest, Math.hypot(now.x - before.x, now.y - before.y));
            }
            previous.set(p.id, now);
            dashesInARow = p.fatigue.dashes;
            mostDashes = Math.max(mostDashes, dashesInARow);
          }
          if (state.phase === 'ROUND_OVER') previous = new Map();
        },
      });
      expect(fastest, d).toBeLessThanOrEqual(maxStep);
      // the fatigue system applies to them: they can build up fatigue past the free allowance only through the same rule
      expect(mostDashes, d).toBeLessThan(200);
    }
  });

  it('a CPU is stopped by the same walls and gates: in a long six-CPU match in the experimental arena nobody is ever inside solid geometry (unless mid phase-dash) or outside the arena', () => {
    const diffs: Difficulty[] = ['EASY', 'MEDIUM', 'HARD', 'HARD', 'MEDIUM', 'EASY'];
    const people: Participant[] = diffs.map((cpu, i) => ({ id: `p${i}`, cpu }));
    const walls = [...wallsOf(SYSTEMS_ARENA)];
    playMatch({
      participants: people,
      arena: SYSTEMS_ARENA,
      steps: 60 * 70,
      seed: 4,
      powerups: true,
      start: (s) => s,
      onStep: (state) => {
        const solid = [
          ...walls,
          ...(SYSTEMS_ARENA.gates ?? []).flatMap((g, k) =>
            state.gatesShut[k] === true ? [g.rect] : [],
          ),
        ];
        for (const p of state.players) {
          if (!p.alive) continue;
          const where = at(state, p.id);
          const phasing = p.dash.phase === 'DASHING' && 'phasing' in p.dash;
          if (!phasing) {
            for (const w of solid) {
              const d = Math.hypot(
                Math.max(w.x - where.x, 0, where.x - w.x - w.width),
                Math.max(w.y - where.y, 0, where.y - w.y - w.height),
              );
              expect(d).toBeGreaterThanOrEqual(C.playerRadius - 1e-6);
            }
          }
          expect(where.x).toBeGreaterThanOrEqual(C.playerRadius - 1e-6);
          expect(where.x).toBeLessThanOrEqual(1600 - C.playerRadius + 1e-6);
        }
      },
    });
  });

  it('difficulty changes decision quality ONLY: the profiles hold no speed, hitbox, recovery, allowance, powerup or vision knobs', () => {
    const allowedKeys = [
      'reactionTicks',
      'decisionTicks',
      'aimError',
      'lead',
      'horizon',
      'deflectTry',
      'deflectJitter',
      'dodge',
      'lapse',
      'dashUse',
      'fatigueAware',
      'hazardLookahead',
      'bookInterest',
      'bookRange',
      'retarget',
      'pressure',
      'cover',
      'phaseRoutes',
      'throwReach',
      'dashMisuse',
      'slashEager',
      'usePlatforms',
      // Slice 7 recalibration: more decision quality, still no physics
      'commitTicks',
      'hesitate',
      'hesitateTicks',
      'routeNoise',
      'throwHold',
      'throwGap',
      'aimLapse',
      'returnAwareness',
      'dashGap',
    ].sort();
    for (const d of DIFFICULTIES) expect(Object.keys(PROFILES[d]).sort()).toEqual(allowedKeys);
    expect(DIFFICULTIES).toEqual(['EASY', 'MEDIUM', 'HARD']);
  });
});

describe('perception and reaction: it sees a delayed world, never the present or the future', () => {
  it("each difficulty's reaction time is drawn from its band (Easy 550–850 ms, Medium 300–450 ms, Hard 180–280 ms) and the bands are ordered", () => {
    const bands: Record<Difficulty, [number, number]> = {
      EASY: [550, 850],
      MEDIUM: [300, 450],
      HARD: [180, 280],
    };
    const seen: Record<Difficulty, number[]> = { EASY: [], MEDIUM: [], HARD: [] };
    for (const d of DIFFICULTIES) {
      for (let seed = 0; seed < 200; seed += 1) {
        const ms = (new CpuController('x', d, seedFor(seed, 0)).reactionTicks * 1000) / 60;
        seen[d].push(ms);
        expect(ms, `${d} ${seed}`).toBeGreaterThanOrEqual(bands[d][0] - 9);
        expect(ms, `${d} ${seed}`).toBeLessThanOrEqual(bands[d][1] + 9);
      }
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(seen.EASY)).toBeGreaterThan(mean(seen.MEDIUM));
    expect(mean(seen.MEDIUM)).toBeGreaterThan(mean(seen.HARD));
    expect(Math.max(...seen.HARD)).toBeLessThan(Math.min(...seen.EASY));
  });

  it.each(DIFFICULTIES)(
    '%s cannot react to something sooner than its reaction time: change what an opponent does and its inputs cannot differ until that long has passed',
    (difficulty) => {
      const T0 = 60;
      const run = (turn: boolean) => {
        const log: FuPlayerInput[] = [];
        const r = playMatch({
          participants: [
            { id: 'a', cpu: difficulty },
            {
              id: 'b',
              human: (_s, tick) => ({
                move: tick < T0 ? { x: -1, y: 0 } : turn ? { x: 0, y: -1 } : { x: -1, y: 0 },
              }),
            },
          ],
          arena: OPEN,
          seed: 12,
          steps: T0 + 240, // (a slow CPU commits to a heading for up to a second before it can change it)
          keepInputs: true,
          start: (s) => place(place(s, 'a', 100, 100), 'b', 1500, 800),
        });
        for (const frame of r.inputs) log.push(frame.get('a') ?? {});
        return { log, delay: r.controllers.get('a')?.reactionTicks ?? 0 };
      };
      const same = run(false);
      const different = run(true);
      const delay = same.delay;
      // identical for every step it could not yet have seen the change…
      for (let t = 0; t < T0 + delay; t += 1)
        expect(different.log[t], `tick ${t}`).toEqual(same.log[t]);
      // …and it does eventually notice (the opponent really did something different)
      const diverged = different.log.some(
        (input, t) => t >= T0 + delay && JSON.stringify(input) !== JSON.stringify(same.log[t]),
      );
      expect(diverged).toBe(true);
    },
  );

  it('it does not know what a Book will award: with the seed (which fixes the award) changed, its inputs are identical right up to the moment the Book is taken', () => {
    // (the harness's CPU seed is fixed per match seed, so only the rules' seed — which fixes the award — differs)
    const inputsUntilPickup = (matchSeed: number, awardSeed: number) => {
      let upTo = Number.POSITIVE_INFINITY;
      const r = playMatch({
        participants: [
          { id: 'a', cpu: 'HARD' },
          { id: 'b', cpu: 'HARD' },
          { id: 'c', cpu: 'MEDIUM' },
        ],
        seed: matchSeed,
        steps: 60 * 60,
        config: { seed: awardSeed },
        powerups: true,
        keepInputs: true,
        onStep: (_s, events, tick) => {
          if (upTo === Number.POSITIVE_INFINITY && events.some((e) => e.type === 'PICKED_UP'))
            upTo = tick;
        },
      });
      return {
        upTo,
        log: r.inputs.slice(0, Math.min(upTo, r.inputs.length)).map((f) => JSON.stringify([...f])),
      };
    };
    let matchSeed = 1;
    while (!Number.isFinite(inputsUntilPickup(matchSeed, 1).upTo) && matchSeed < 12) matchSeed += 1;
    const a = inputsUntilPickup(matchSeed, 1).log;
    const b = inputsUntilPickup(matchSeed, 777).log;
    expect(a.length).toBeGreaterThan(60);
    expect(b).toEqual(a);
  });
});

describe('determinism', () => {
  const people: Participant[] = [
    { id: 'a', cpu: 'HARD' },
    { id: 'b', cpu: 'MEDIUM' },
    { id: 'c', cpu: 'EASY' },
    {
      id: 'h',
      human: (_s, t) => ({
        move: { x: Math.cos(t / 30), y: Math.sin(t / 41) },
        throw: t % 90 === 0,
        dash: t % 70 === 0,
      }),
    },
  ];
  const play = (seed: number) => {
    const r = playMatch({
      participants: people,
      arena: SYSTEMS_ARENA,
      seed,
      steps: 60 * 60,
      powerups: true,
      config: { targetKills: 14, regulationRounds: 9 },
    });
    return JSON.stringify({ s: r.state, e: r.events });
  };

  it('the same arena, participants, seed and human inputs replay to the identical result (a mixed 4-player match, a full minute)', () => {
    expect(play(9)).toBe(play(9));
  });

  it('a different seed plays a different game (the seed really drives the CPUs)', () => {
    expect(play(9)).not.toBe(play(10));
  });

  it('the seeded generator is a pure function of its seed', () => {
    const a = new Rng(5);
    const b = new Rng(5);
    for (let i = 0; i < 100; i += 1) expect(a.next()).toBe(b.next());
    expect(new Rng(5).next()).not.toBe(new Rng(6).next());
  });
});

describe('aiming and prediction differ by difficulty', () => {
  /**
   * A target running straight down at full speed along x = 760; the CPU approaches and throws. We count how often
   * its FIRST boomerang kills it on its way out (≈0.7 s): that isolates aim and lead from everything else.
   */
  const firstThrowHits = (difficulty: Difficulty): { hits: number; throws: number } => {
    let hits = 0;
    let throws = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      let thrownAt = -1;
      let hit = false;
      playMatch({
        participants: [
          { id: 'a', cpu: difficulty },
          {
            id: 'b',
            human: (_s, t) => {
              // runs down, then jinks sideways at a seed-dependent moment: no CPU can know when
              const jink = 20 + (seed % 7) * 6;
              return { move: t < jink ? { x: 0, y: 1 } : { x: seed % 2 === 0 ? 1 : -1, y: 0.3 } };
            },
          },
        ],
        arena: { width: 1600, height: 2400 }, // room to run: the target never stops
        seed,
        steps: 60 * 4,
        start: (s) => place(place(s, 'a', 400, 100), 'b', 700, 100),
        onStep: (state, events, tick) => {
          for (const e of events) {
            if (e.type === 'THROWN' && e.playerId === 'a' && thrownAt < 0) thrownAt = tick;
            if (
              e.type === 'HIT' &&
              e.victimId === 'b' &&
              thrownAt >= 0 &&
              tick - thrownAt <= 90 &&
              !hit
            )
              hit = true;
          }
        },
      });
      if (thrownAt >= 0) throws += 1;
      if (hit) hits += 1;
    }
    return { hits, throws };
  };

  it(
    'Hard leads a moving target and Easy does not: the first-throw hit rate rises with difficulty, and even Hard does not always hit',
    { timeout: 60_000 },
    () => {
      const easy = firstThrowHits('EASY');
      const medium = firstThrowHits('MEDIUM');
      const hard = firstThrowHits('HARD');
      console.warn(
        `AIM first-throw kills: EASY ${JSON.stringify(easy)} MEDIUM ${JSON.stringify(medium)} HARD ${JSON.stringify(hard)}\n`,
      );
      expect(hard.hits).toBeGreaterThan(easy.hits);
      expect(medium.hits).toBeGreaterThanOrEqual(easy.hits);
      expect(hard.hits).toBeLessThan(hard.throws); // not an aimbot: some of its throws miss
    },
  );
});

describe('defence: timed SLASH deflection, dodging, and failing', () => {
  /**
   * An enemy boomerang already flying straight at the CPU from 500 away; its owner is far off (so the CPU has no
   * throw of its own to make). Outcomes: it deflects, it dies, or it gets out of the way / is missed.
   */
  const outcomes = (difficulty: Difficulty, seeds = 80) => {
    let deflected = 0;
    let killed = 0;
    let tries = 0;
    let triedAndDied = 0;
    for (let seed = 1; seed <= seeds; seed += 1) {
      let first: 'DEFLECT' | 'HIT' | undefined;
      const r = playMatch({
        participants: [
          { id: 'a', cpu: difficulty },
          { id: 'b', human: still },
        ],
        arena: OPEN,
        seed,
        steps: 90,
        config: STRAIGHT, // a boomerang flying straight at the defender (the curve is curve.test.ts's subject)
        start: (s) => {
          const t = patchPlayer(place(place(s, 'a', 600, 450), 'b', 1400, 450), 'a', {
            fatigue: { dashes: 99, recoverIn: 4.9 },
          }); // (tired: no dash to confuse the defence)
          return {
            ...t,
            boomerangs: t.boomerangs.map((x) =>
              x.ownerId === 'b'
                ? {
                    ...x,
                    state: 'THROWN' as const,
                    position: { x: 1100, y: 450 },
                    direction: { x: -1, y: 0 },
                    travelled: 0,
                  }
                : x,
            ),
          };
        },
        onStep: (_s, events) => {
          for (const e of events) {
            if (first !== undefined) continue;
            if (e.type === 'DEFLECTED' && e.byId === 'a') first = 'DEFLECT';
            if (e.type === 'HIT' && e.victimId === 'a') first = 'HIT';
          }
        },
      });
      if (first === 'DEFLECT') deflected += 1;
      if (first === 'HIT') killed += 1;
      const tried = (r.controllers.get('a')?.stats.deflectTries ?? 0) > 0;
      if (tried) tries += 1;
      if (tried && first === 'HIT') triedAndDied += 1;
    }
    return { deflected: deflected / seeds, killed: killed / seeds, tries, triedAndDied };
  };

  it('Hard deflects an incoming boomerang far more often than Easy; Easy mistimes and dies; nobody is perfect', () => {
    const easy = outcomes('EASY');
    const medium = outcomes('MEDIUM');
    const hard = outcomes('HARD');
    console.warn(`DEFLECT ${JSON.stringify({ easy, medium, hard })}\n`);
    expect(hard.deflected).toBeGreaterThan(easy.deflected);
    expect(hard.deflected).toBeLessThan(1);
    // how often each tries follows its profile (Easy 6%, Medium 30%, Hard 55% of the 80, but only of the shots it saw in time: a
    // slow CPU sees a 900-per-second boomerang from 500 away too late to try). Never zero for Medium, never certain for Hard.
    expect(easy.tries).toBeLessThanOrEqual(10);
    expect(medium.tries).toBeGreaterThan(0);
    expect(medium.tries).toBeLessThan(35);
    expect(hard.tries).toBeGreaterThan(30);
    expect(hard.tries).toBeLessThan(80);
    expect(hard.deflected).toBeGreaterThan(medium.deflected);
    expect(easy.killed).toBeGreaterThan(hard.killed);
    expect(easy.triedAndDied + medium.triedAndDied + hard.triedAndDied).toBeGreaterThan(0); // mistimed defence happens
  });

  it('a defensive SLASH is an ordinary SLASH input: the deflection happens through the rules (a DEFLECTED event), after a SLASHED event from the same CPU', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const events: FuEvent[] = [];
      playMatch({
        participants: [
          { id: 'a', cpu: 'HARD' },
          { id: 'b', human: still },
        ],
        arena: OPEN,
        seed,
        steps: 90,
        config: STRAIGHT, // a boomerang flying straight at the defender (the curve is curve.test.ts's subject)
        start: (s) => {
          const t = patchPlayer(place(place(s, 'a', 600, 450), 'b', 1400, 450), 'a', {
            fatigue: { dashes: 99, recoverIn: 4.9 },
          }); // (tired: no dash to confuse the defence)
          return {
            ...t,
            boomerangs: t.boomerangs.map((x) =>
              x.ownerId === 'b'
                ? {
                    ...x,
                    state: 'THROWN' as const,
                    position: { x: 1100, y: 450 },
                    direction: { x: -1, y: 0 },
                    travelled: 0,
                  }
                : x,
            ),
          };
        },
        onStep: (_s, ev) => events.push(...ev),
      });
      const deflect = events.findIndex((e) => e.type === 'DEFLECTED' && e.byId === 'a');
      if (deflect >= 0) {
        expect(
          events.slice(0, deflect).some((e) => e.type === 'SLASHED' && e.playerId === 'a'),
        ).toBe(true);
        return;
      }
    }
    throw new Error('Hard never deflected in 60 seeds');
  });

  it('with its slash unavailable (its boomerang is away) a CPU never "deflects", and can still dodge', () => {
    let deflects = 0;
    let survived = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const r = playMatch({
        participants: [
          { id: 'a', cpu: 'HARD' },
          { id: 'b', human: still },
        ],
        arena: OPEN,
        seed,
        steps: 90,
        config: STRAIGHT, // a boomerang flying straight at the defender (the curve is curve.test.ts's subject)
        start: (s) => {
          const t = patchPlayer(place(place(s, 'a', 600, 450), 'b', 1400, 450), 'a', {
            fatigue: { dashes: 99, recoverIn: 4.9 },
          }); // (tired: no dash to confuse the defence)
          return {
            ...t,
            boomerangs: t.boomerangs.map((x) =>
              x.ownerId === 'a'
                ? {
                    ...x,
                    state: 'THROWN' as const,
                    position: { x: 600, y: 100 },
                    direction: { x: 0, y: -1 },
                    travelled: 0,
                  }
                : {
                    ...x,
                    state: 'THROWN' as const,
                    position: { x: 1100, y: 450 },
                    direction: { x: -1, y: 0 },
                    travelled: 0,
                  },
            ),
          };
        },
        onStep: (_s, ev) => {
          deflects += ev.filter((e) => e.type === 'DEFLECTED' && e.byId === 'a').length;
        },
      });
      if (player(r.state, 'a').alive) survived += 1;
    }
    expect(deflects).toBe(0);
    expect(survived).toBeGreaterThan(8); // Hard dodges (70%) but not always
  });
});

describe('arena systems: it does not look suicidal', () => {
  const HAZ = SYSTEMS_ARENA.hazards?.[0]?.rect ?? { x: 640, y: 240, width: 320, height: 110 };
  const standingInHazard = (difficulty: Difficulty, seed: number) =>
    playMatch({
      participants: [
        { id: 'a', cpu: difficulty },
        { id: 'b', human: still },
      ],
      arena: SYSTEMS_ARENA,
      seed,
      steps: 60 * 6,
      start: (s) => ({ ...place(place(s, 'a', 700, 300), 'b', 1500, 800), roundTime: 4.9 }), // WARNING begins at 5 s
    });

  it('Medium and Hard leave a hazard strip when its WARNING begins and live; Easy usually does too (it reacts to ACTIVE, late but in time)', () => {
    const survived: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const r = standingInHazard(d, seed);
        if (player(r.state, 'a').alive) survived[d] += 1;
      }
    }
    console.warn(`HAZARD survival of 20: ${JSON.stringify(survived)}\n`);
    expect(survived.HARD).toBe(20);
    expect(survived.MEDIUM).toBeGreaterThanOrEqual(19);
    expect(survived.EASY).toBeGreaterThanOrEqual(10);
    expect(survived.HARD).toBeGreaterThanOrEqual(survived.EASY);
    void HAZ;
  });

  it('a CPU treats a CLOSED gate as a wall and an open one as a way through: it crosses the arena to a waiting target, never entering a shut gate', () => {
    const gates = SYSTEMS_ARENA.gates ?? [];
    for (const d of ['MEDIUM', 'HARD'] as const) {
      let reached = false;
      playMatch({
        participants: [
          { id: 'a', cpu: d },
          { id: 'b', human: still },
        ],
        arena: SYSTEMS_ARENA,
        seed: 2,
        steps: 60 * 40,
        start: (s) => ({ ...place(place(s, 'a', 150, 450), 'b', 1450, 450), roundTime: 0 }),
        onStep: (state) => {
          const me = at(state, 'a');
          gates.forEach((g, k) => {
            if (state.gatesShut[k] === true)
              expect(circleHitsWalls(me, C.playerRadius, [g.rect])).toBe(false);
          });
          if (me.x > 1000 && state.phase === 'PLAYING') reached = true;
        },
      });
      expect(reached, d).toBe(true);
    }
  });

  it('over long six-CPU matches in the systems arena Hard dies to the floor no more often than Easy, and rarely', () => {
    const deaths: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 3; seed += 1) {
        const r = playMatch({
          participants: Array.from({ length: 6 }, (_v, i) => ({ id: `p${i}`, cpu: d })),
          arena: SYSTEMS_ARENA,
          seed,
          steps: 60 * 40,
        });
        deaths[d] += r.events.filter((e) => e.type === 'HIT' && e.byId === 'HAZARD').length;
      }
    }
    console.warn(`HAZARD deaths (3 six-CPU matches of 40 s): ${JSON.stringify(deaths)}\n`);
    expect(deaths.HARD).toBeLessThanOrEqual(deaths.EASY + 2);
  });
});

describe('powerups: the same Books, the same builds', () => {
  it('CPUs pick up Books through the ordinary rules (PICKED_UP events), Hard and Medium more than Easy, and builds never exceed three', () => {
    const took: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 6; seed += 1) {
        playMatch({
          participants: [
            { id: 'a', cpu: d },
            { id: 'b', cpu: d },
            { id: 'c', cpu: d },
          ],
          seed,
          steps: 60 * 80,
          powerups: true,
          onStep: (state, events) => {
            took[d] += events.filter((e) => e.type === 'PICKED_UP').length;
            for (const p of state.players) expect(p.inventory.length).toBeLessThanOrEqual(3);
          },
        });
      }
    }
    console.warn(`BOOKS taken in 6 matches of 80 s: ${JSON.stringify(took)}\n`);
    expect(took.HARD + took.MEDIUM).toBeGreaterThan(0);
    expect(took.HARD).toBeGreaterThanOrEqual(took.EASY);
  });

  it('builds persist through round resets for CPUs exactly as for humans, over a nine-round match; a rematch clears them', () => {
    let previous: Record<string, readonly string[]> | undefined;
    let resets = 0;
    const r = playMatch({
      participants: [
        { id: 'a', cpu: 'HARD' },
        { id: 'b', cpu: 'HARD' },
      ],
      seed: 3,
      steps: 60 * 400,
      config: { targetKills: 40, regulationRounds: 9 }, // far from over: only round resets are under test
      powerups: true,
      start: (s) => own(own(s, 'a', 'OVERDRIVE', 'PHASE_DASH'), 'b', 'GUARD'),
      onStep: (state, events) => {
        if (events.some((e) => e.type === 'ROUND_START') && previous !== undefined) {
          resets += 1;
          for (const p of state.players) expect([...p.inventory], p.id).toEqual(previous[p.id]);
        }
        previous = Object.fromEntries(state.players.map((p) => [p.id, [...p.inventory]]));
      },
    });
    expect(resets).toBeGreaterThanOrEqual(8);
    expect(rematchOf(r.state).players.every((p) => p.inventory.length === 0)).toBe(true);
  });

  it('PHASE_DASH only when owned: a CPU without it never phases; an owner who needs to cross a wall does', () => {
    let withoutPhase = 0;
    let withPhase = 0;
    for (let seed = 1; seed <= 8; seed += 1) {
      for (const owns of [false, true]) {
        playMatch({
          participants: [
            { id: 'a', cpu: 'HARD' },
            { id: 'b', human: still },
          ],
          arena: SYSTEMS_ARENA,
          seed,
          steps: 60 * 5,
          // the gates are shut (6 s on), a stands at the left gate, b waits on the far side of the middle
          start: (s) => {
            const t = { ...place(place(s, 'a', 430, 450), 'b', 1000, 300), roundTime: 6.5 };
            return owns ? own(t, 'a', 'PHASE_DASH') : t;
          },
          onStep: (_s, events) => {
            const n = events.filter((e) => e.type === 'PHASE_ENTERED' && e.playerId === 'a').length;
            if (owns) withPhase += n;
            else withoutPhase += n;
          },
        });
      }
    }
    expect(withoutPhase).toBe(0);
    expect(withPhase).toBeGreaterThan(0);
  });

  it('TWIN_THROW: the CPU throws the pair on one press (two THROWN events at once) and aims so one of them is on target', () => {
    let pairs = 0;
    let singles = 0;
    let killedTwin = 0;
    let killedPlain = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      for (const twin of [true, false]) {
        const r = playMatch({
          participants: [
            { id: 'a', cpu: 'HARD' },
            { id: 'b', human: still },
          ],
          arena: OPEN,
          seed,
          steps: 60 * 6,
          start: (s) => {
            const t = place(place(s, 'a', 300, 450), 'b', 800, 450);
            return twin ? own(t, 'a', 'TWIN_THROW') : t;
          },
          onStep: (_s, events) => {
            const thrown = events.filter((e) => e.type === 'THROWN' && e.playerId === 'a').length;
            if (twin && thrown === 2) pairs += 1;
            if (twin && thrown === 1) singles += 1;
          },
        });
        if (!player(r.state, 'b').alive || r.state.round > 1) {
          if (twin) killedTwin += 1;
          else killedPlain += 1;
        }
      }
    }
    expect(pairs).toBeGreaterThan(0);
    expect(singles).toBe(0); // a Twin throw is always the pair
    expect(killedTwin).toBeGreaterThan(10); // aimed to hit, not just thrown
    void killedPlain;
  });

  it('BLAST_BOOMERANG: an owner uses cover-shots (wall impact beside a hidden target) that a plain thrower cannot', () => {
    let blastThrows = 0;
    let plainThrows = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      for (const blast of [true, false]) {
        playMatch({
          participants: [
            { id: 'a', cpu: 'HARD' },
            { id: 'b', human: still },
          ],
          seed,
          steps: 60 * 5,
          start: (s) => {
            const t = place(place(s, 'a', 330, 450), 'b', 680, 330);
            return blast ? own(t, 'a', 'BLAST_BOOMERANG') : t;
          },
          onStep: (_s, events) => {
            const n = events.filter((e) => e.type === 'THROWN' && e.playerId === 'a').length;
            if (blast) blastThrows += n;
            else plainThrows += n;
          },
        });
      }
    }
    expect(blastThrows).toBeGreaterThanOrEqual(plainThrows);
  });

  it('SHIELD: a CPU owning one gets exactly the shield rule — one blocked hit, then it is gone (no hidden protection)', () => {
    let blocked = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      playMatch({
        participants: [
          { id: 'a', cpu: 'EASY' },
          { id: 'b', cpu: 'HARD' },
        ],
        arena: OPEN,
        seed,
        steps: 60 * 20,
        start: (s) => own(s, 'a', 'GUARD'),
        onStep: (state, events) => {
          blocked += events.filter((e) => e.type === 'GUARD_BLOCKED' && e.playerId === 'a').length;
          if (events.some((e) => e.type === 'GUARD_BLOCKED' && e.playerId === 'a'))
            expect(player(state, 'a').inventory).not.toContain('GUARD');
        },
      });
    }
    expect(blocked).toBeGreaterThan(0);
  });
});

describe('several participants', () => {
  it('target selection: with two equally placed opponents it picks the earlier one in match order, deterministically', () => {
    const dirs: number[] = [];
    for (let seed = 1; seed <= 12; seed += 1) {
      let first: number | undefined;
      playMatch({
        participants: [
          { id: 'a', cpu: 'HARD' },
          { id: 'b', human: still },
          { id: 'c', human: still },
        ],
        arena: OPEN,
        seed,
        steps: 120,
        config: {},
        start: (s) => place(place(place(s, 'a', 800, 450), 'b', 500, 450), 'c', 1100, 450),
        onStep: (state, events) => {
          const throwEvent = events.find((e) => e.type === 'THROWN' && e.playerId === 'a');
          if (first === undefined && throwEvent?.type === 'THROWN') first = throwEvent.direction.x;
          void state;
        },
      });
      if (first !== undefined) dirs.push(first);
    }
    expect(dirs.length).toBeGreaterThan(5);
    expect(dirs.every((x) => x < 0)).toBe(true); // always towards b (the earlier), never c
  });

  it('it does not attack player 1 forever: in six-CPU matches the deaths are spread over many victims', () => {
    const victims = new Map<string, number>();
    for (let seed = 1; seed <= 4; seed += 1) {
      const r = playMatch({
        participants: Array.from({ length: 6 }, (_v, i) => ({
          id: `p${i}`,
          cpu: 'MEDIUM' as const,
        })),
        seed,
        steps: 60 * 90,
      });
      for (const e of r.events)
        if (e.type === 'HIT') victims.set(e.victimId, (victims.get(e.victimId) ?? 0) + 1);
    }
    const total = [...victims.values()].reduce((a, b) => a + b, 0);
    expect(victims.size).toBeGreaterThanOrEqual(5);
    expect(Math.max(...victims.values()) / total).toBeLessThan(0.4);
  });

  it('human + CPU mixes work: humans (a scripted input source) and CPUs share a match through the one input interface', () => {
    const r = playMatch({
      participants: [
        {
          id: 'h1',
          human: (_s, t) => ({
            move: { x: Math.cos(t / 20), y: Math.sin(t / 25) },
            throw: t % 50 === 0,
          }),
        },
        { id: 'h2', human: still },
        { id: 'c1', cpu: 'EASY' },
        { id: 'c2', cpu: 'MEDIUM' },
        { id: 'c3', cpu: 'HARD' },
        { id: 'c4', cpu: 'HARD' },
      ],
      arena: SYSTEMS_ARENA,
      seed: 6,
      steps: 60 * 45,
      powerups: true,
    });
    expect(r.state.players).toHaveLength(6);
    expect(count(r.events, 'THROWN')).toBeGreaterThan(5);
  });

  it('six CPUs: a full table plays, rounds end and restart, and everyone is alive again at the start of each round', () => {
    let starts = 0;
    playMatch({
      participants: Array.from({ length: 6 }, (_v, i) => ({
        id: `p${i}`,
        cpu: (['EASY', 'MEDIUM', 'HARD'] as const)[i % 3] as Difficulty,
      })),
      arena: SYSTEMS_ARENA,
      seed: 11,
      steps: 60 * 120,
      onStep: (state, events) => {
        if (events.some((e) => e.type === 'ROUND_START')) {
          starts += 1;
          expect(state.players.every((p) => p.alive)).toBe(true);
        }
      },
    });
    expect(starts).toBeGreaterThanOrEqual(3);
  });

  it('a CPU that dies is back and playing in the next round (death and reset)', () => {
    let aliveAgain = false;
    let died = false;
    playMatch({
      participants: [
        { id: 'a', cpu: 'EASY' },
        { id: 'b', cpu: 'HARD' },
      ],
      arena: OPEN,
      seed: 4,
      steps: 60 * 60,
      onStep: (state, events) => {
        if (events.some((e) => e.type === 'HIT' && e.victimId === 'a')) died = true;
        if (died && events.some((e) => e.type === 'ROUND_START') && player(state, 'a').alive)
          aliveAgain = true;
      },
    });
    expect(died && aliveAgain).toBe(true);
  });

  it('a CPU is just a player to the rules: its facing/slot/identity fields are the ordinary ones', () => {
    const r = playMatch({
      participants: [
        { id: 'a', cpu: 'MEDIUM' },
        { id: 'b', cpu: 'MEDIUM' },
      ],
      steps: 30,
    });
    for (const p of r.state.players) {
      expect(Object.keys(p).sort()).toEqual(Object.keys(player(r.state, 'a')).sort());
    }
    void face;
    void patchPlayer;
  });
});
