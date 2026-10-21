import { describe, expect, it } from 'vitest';
import { CpuController, DEFAULT_FU_CONFIG, SYSTEMS_ARENA, seedFor, type Difficulty } from '../src';
import { playMatch } from './support/cpuMatch';
import { DIFFICULTIES, PROFILES, createFuMatch, type FuPlayerInput, type FuState } from '../src';
import { patchPlayer, place } from './support/fixtures';

// Each test pins one measurable difference between the difficulties (found missing by mutation testing the
// CPU: a profile value changed to the wrong one must make a test fail).

const C = DEFAULT_FU_CONFIG;
const OPEN = { width: 1600, height: 900 };
const still = () => ({});
const sd = (xs: number[]) => {
  const mean = xs.reduce((n, x) => n + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((n, x) => n + (x - mean) ** 2, 0) / xs.length);
};

describe('aim error is part of every difficulty', () => {
  const spread = (difficulty: Difficulty): number => {
    const errors: number[] = [];
    for (let seed = 1; seed <= 60; seed += 1) {
      let done = false;
      playMatch({
        participants: [
          { id: 'a', cpu: difficulty },
          { id: 'b', human: still },
        ],
        arena: OPEN,
        seed,
        steps: 60 * 4,
        start: (s) => place(place(s, 'a', 500, 450), 'b', 850, 450),
        onStep: (_s, events) => {
          for (const e of events) {
            if (done || e.type !== 'THROWN' || e.playerId !== 'a') continue;
            done = true;
            const truth = Math.atan2(450 - e.position.y, 850 - e.position.x);
            errors.push(Math.atan2(e.direction.y, e.direction.x) - truth);
          }
        },
      });
    }
    return sd(errors);
  };

  it('a throw at a standing target scatters by about the profile’s error: Easy widest, Hard narrowest, Hard never exactly on', () => {
    const easy = spread('EASY');
    const medium = spread('MEDIUM');
    const hard = spread('HARD');
    console.warn(
      `AIM SPREAD easy=${easy.toFixed(3)} medium=${medium.toFixed(3)} hard=${hard.toFixed(3)}\n`,
    );
    expect(easy).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(hard);
    // (pacing to the reference video, 2026-10-21: its players hit with ≈ 1 throw in 5; Medium 0.6 rad, Hard 0.2)
    expect(medium).toBeGreaterThan(0.27);
    expect(hard).toBeGreaterThan(0.03);
    expect(hard).toBeLessThan(0.32); // 0.2 rad, and one throw in sixteen badly aimed (x 2.5): ≈ 0.23
  });
});

describe('each CPU is its own seeded self', () => {
  it('a seat changes the seed, so a table of CPUs of one difficulty does not react in lockstep', () => {
    const seeds = [0, 1, 2, 3, 4, 5].map((i) => seedFor(5, i));
    expect(new Set(seeds).size).toBe(6);
    const reactions = seeds.map((s) => new CpuController('x', 'HARD', s).reactionTicks);
    expect(new Set(reactions).size).toBeGreaterThan(1);
    for (const r of reactions) {
      expect(r).toBeGreaterThanOrEqual(11); // Hard: 180–280 ms
      expect(r).toBeLessThanOrEqual(17);
    }
  });
});

/**
 * The next three groups drive one CPU through a FROZEN world (the same state every tick, which is all a controller
 * ever reads) and look at what it presses: a clean way to isolate one decision from the fights that would end it.
 */
function drive(
  difficulty: Difficulty,
  state: FuState,
  ticks: number,
  seed: number,
): readonly FuPlayerInput[] {
  const cpu = new CpuController('a', difficulty, seed);
  const out: FuPlayerInput[] = [];
  for (let t = 0; t < ticks; t += 1) out.push(cpu.decide(state));
  return out;
}
const world = (arena: typeof OPEN | typeof SYSTEMS_ARENA): FuState =>
  createFuMatch(
    [
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
    ],
    { arena, seed: 1 },
  );
const meanOf = (inputs: readonly FuPlayerInput[], axis: 'x' | 'y', from = 60): number => {
  const moves = inputs.slice(from).map((i) => i.move?.[axis] ?? 0);
  return moves.reduce((n, v) => n + v, 0) / moves.length;
};

describe('the arena’s lethal floor: who reads the warning', () => {
  // a stands by the top edge of the strip (y 240–350): the way off is north; b is far to the south, so walking toward b is not
  const frozen = (): FuState => ({
    ...place(place(world(SYSTEMS_ARENA), 'a', 760, 262), 'b', 760, 800),
    roundTime: 5.2, // WARNING (5 s – 7 s)
  });
  const meanY = (difficulty: Difficulty): number => {
    let total = 0;
    for (let seed = 1; seed <= 20; seed += 1)
      total += meanOf(drive(difficulty, frozen(), 120, seed), 'y');
    return total / 20;
  };

  it('Medium and Hard walk off a floor that has begun to warn; Easy does not read the schedule and keeps coming', () => {
    const easy = meanY('EASY');
    const medium = meanY('MEDIUM');
    const hard = meanY('HARD');
    console.warn(
      `WARNING meanY easy=${easy.toFixed(2)} medium=${medium.toFixed(2)} hard=${hard.toFixed(2)}\n`,
    );
    expect(easy).toBeGreaterThan(0);
    expect(medium).toBeLessThan(-0.3);
    expect(hard).toBeLessThan(-0.3);
  });
});

describe('dashing and fatigue', () => {
  // b is far off with its boomerang away, so there is nothing to fear on the way and a long dash is attractive
  const frozen = (dashes: number): FuState => {
    const s = patchPlayer(place(place(world(OPEN), 'a', 100, 450), 'b', 1500, 450), 'a', {
      fatigue: { dashes, recoverIn: 4.9 },
    });
    return {
      ...s,
      boomerangs: s.boomerangs.map((x) =>
        x.ownerId === 'b'
          ? {
              ...x,
              state: 'THROWN' as const,
              position: { x: 1500, y: 100 },
              direction: { x: 0, y: -1 },
              travelled: 0,
            }
          : x,
      ),
    };
  };
  const dashes = (difficulty: Difficulty, fatigueDashes: number): number => {
    let total = 0;
    for (let seed = 1; seed <= 20; seed += 1)
      total += drive(difficulty, frozen(fatigueDashes), 300, seed).filter(
        (i) => i.dash === true,
      ).length;
    return total;
  };

  it('a Hard CPU one dash from FATIGUED does not dash; rested, it does; Easy has no such care and dashes far less', () => {
    const hardTired = dashes('HARD', C.dashFreeCount);
    const hardRested = dashes('HARD', 0);
    const easyTired = dashes('EASY', C.dashFreeCount);
    const easyRested = dashes('EASY', 0);
    console.warn(
      `DASH PRESSES hardTired=${hardTired} hardRested=${hardRested} easyTired=${easyTired} easyRested=${easyRested}\n`,
    );
    expect(hardTired).toBe(0);
    expect(hardRested).toBeGreaterThan(0);
    expect(easyTired).toBeGreaterThan(0); // Easy does not look at its fatigue
    expect(easyRested).toBeLessThan(hardRested);
    // a dash is a chance per decision, not a habit: far below one press per decision (20 × 75 of them for Hard)
    expect(easyRested).toBeLessThan(150);
    expect(hardRested).toBeLessThan(900);
  });
});

describe('Books', () => {
  // b is far to the east holding its boomerang; the only Book lies far to the west: going west is going for the Book
  const frozen = (): FuState => ({
    ...place(place(world(OPEN), 'a', 800, 450), 'b', 1500, 450),
    pickups: [{ id: 1, position: { x: 250, y: 450 } }],
  });
  const westward = (difficulty: Difficulty): number => {
    let total = 0;
    for (let seed = 1; seed <= 20; seed += 1)
      total += meanOf(drive(difficulty, frozen(), 150, seed), 'x');
    return total / 20;
  };

  it('Hard goes for a Book, Medium usually does, Easy (short range, little interest) goes for the opponent instead', () => {
    const easy = westward('EASY');
    const medium = westward('MEDIUM');
    const hard = westward('HARD');
    console.warn(
      `BOOK westward easy=${easy.toFixed(2)} medium=${medium.toFixed(2)} hard=${hard.toFixed(2)}\n`,
    );
    expect(hard).toBeLessThan(-0.4);
    expect(medium).toBeLessThan(easy);
    expect(easy).toBeGreaterThan(hard);
  });
});

describe('decision commitment, hesitation and tempo', () => {
  // b is far to the east, its boomerang away: a has nothing to do but walk toward it, so every change of heading is a decision
  const chase = (): FuState => {
    const s = place(place(world(OPEN), 'a', 100, 450), 'b', 1500, 450);
    return {
      ...s,
      boomerangs: s.boomerangs.map((x) =>
        x.ownerId === 'b'
          ? {
              ...x,
              state: 'THROWN' as const,
              position: { x: 1500, y: 100 },
              direction: { x: 0, y: -1 },
              travelled: 0,
            }
          : x,
      ),
    };
  };
  const runs = (difficulty: Difficulty, seed: number): number[] => {
    const inputs = drive(difficulty, chase(), 600, seed).slice(60);
    const lengths: number[] = [];
    let length = 0;
    let prev = '';
    for (const i of inputs) {
      const key = JSON.stringify(i.move);
      if (key === prev) length += 1;
      else {
        if (length > 0) lengths.push(length);
        length = 1;
        prev = key;
      }
    }
    return lengths.slice(1); // (the first run is cut by the window)
  };

  it('a CPU keeps a heading for its whole commitment: no run of one heading is shorter than the profile’s shortest commitment or hesitation, and slower CPUs commit longer', () => {
    const medianRun: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    for (const d of DIFFICULTIES) {
      const all: number[] = [];
      for (let seed = 1; seed <= 20; seed += 1) all.push(...runs(d, seed));
      all.sort((a, b) => a - b);
      medianRun[d] = all[Math.floor(all.length * 0.75)] ?? 0; // (the longer runs: the commitments themselves, not the brief hesitations and lapses between them)
      const p = PROFILES[d];
      // (a lapse can end a run early, so look at the 10th percentile, not the minimum)
      expect(all[Math.floor(all.length / 10)] ?? 0, d).toBeGreaterThanOrEqual(
        Math.min(p.commitTicks[0], p.hesitateTicks[0]) - 2,
      );
    }
    console.warn(`75th-PERCENTILE HEADING RUN (ticks) ${JSON.stringify(medianRun)}\n`);
    expect(medianRun.EASY).toBeGreaterThan(medianRun.MEDIUM);
    expect(medianRun.MEDIUM).toBeGreaterThan(medianRun.HARD);
    expect(medianRun.MEDIUM).toBeGreaterThanOrEqual(20); // clearly perceptible: a third of a second or more
  });

  it('a CPU does not fire as fast as it can: throws are at least `throwGap` apart, and a ready throw is sometimes held back', () => {
    // b stands 300 away in the open with its boomerang in hand; the frozen world never changes, so a throw is always available
    const frozen = (): FuState => place(place(world(OPEN), 'a', 800, 450), 'b', 1100, 450);
    for (const d of DIFFICULTIES) {
      let presses = 0;
      let possible = 0;
      for (let seed = 1; seed <= 20; seed += 1) {
        const inputs = drive(d, frozen(), 600, seed).slice(60);
        let last = -1000;
        inputs.forEach((i, t) => {
          if (i.throw !== true) return;
          presses += 1;
          expect(t - last, `${d} seed ${seed}`).toBeGreaterThanOrEqual(PROFILES[d].throwGap);
          last = t;
        });
        possible += Math.floor(540 / PROFILES[d].decisionTicks);
      }
      expect(presses, d).toBeGreaterThan(0);
      expect(presses, d).toBeLessThan(possible * 0.5);
    }
  });

  it('a CPU is not dashing its way round the arena: successive dashes are at least `dashGap` apart', () => {
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const s = chase();
        const inputs = drive(d, s, 900, seed);
        let last = -10_000;
        inputs.forEach((i, t) => {
          if (i.dash !== true) return;
          expect(t - last, `${d} seed ${seed}`).toBeGreaterThanOrEqual(PROFILES[d].dashGap);
          last = t;
        });
      }
    }
  });

  it('the difficulty ladder is monotone in every tempo dimension (slower, more hesitant, sloppier, quicker to forget, scarcer dashes as it gets easier)', () => {
    const [e, m, h] = [PROFILES.EASY, PROFILES.MEDIUM, PROFILES.HARD];
    for (const key of [
      'decisionTicks',
      'aimError',
      'aimLapse',
      'throwHold',
      'throwGap',
      'hesitate',
      'routeNoise',
      'dashGap',
      'lapse',
    ] as const) {
      expect(e[key], key).toBeGreaterThan(m[key]);
      expect(m[key], key).toBeGreaterThan(h[key]);
    }
    for (const key of [
      'lead',
      'deflectTry',
      'dodge',
      'returnAwareness',
      'dashUse',
      'throwReach',
    ] as const) {
      expect(e[key], key).toBeLessThan(m[key]);
      expect(m[key], key).toBeLessThan(h[key]);
    }
    expect(m.commitTicks[0]).toBeGreaterThan(h.commitTicks[0]);
    expect(e.commitTicks[0]).toBeGreaterThan(m.commitTicks[0]);
    // the playtest's starting points: Medium 300–450 ms, Hard 180–280 ms
    expect(m.reactionTicks).toEqual([18, 27]);
    expect(h.reactionTicks).toEqual([11, 17]);
  });
});

describe('the finer imperfections', () => {
  const frozenDuel = (): FuState => place(place(world(OPEN), 'a', 800, 450), 'b', 1100, 450);

  it('a ready throw is sometimes held back: of the decisions on which it could throw, Easy takes the fewest and Hard the most', () => {
    const ratio: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    for (const d of DIFFICULTIES) {
      const gap =
        Math.ceil(PROFILES[d].throwGap / PROFILES[d].decisionTicks) * PROFILES[d].decisionTicks;
      let presses = 0;
      for (let seed = 1; seed <= 40; seed += 1)
        presses += drive(d, frozenDuel(), 1200, seed)
          .slice(60)
          .filter((i) => i.throw === true).length;
      ratio[d] = presses / (40 * (1140 / gap)); // 1.0 would be a throw the moment the gap allows
    }
    console.warn(`THROW TAKEN RATIO ${JSON.stringify(ratio)}\n`);
    expect(ratio.EASY).toBeLessThan(ratio.MEDIUM);
    expect(ratio.MEDIUM).toBeLessThan(ratio.HARD);
    expect(ratio.EASY).toBeLessThan(0.9);
    expect(ratio.MEDIUM).toBeLessThan(0.95);
  });

  it('it stops to look now and then (hesitation): Easy most, Hard least, and none of them stand still all the time', () => {
    const chase: FuState = (() => {
      const s = place(place(world(OPEN), 'a', 100, 450), 'b', 1500, 450);
      return {
        ...s,
        boomerangs: s.boomerangs.map((x) =>
          x.ownerId === 'b'
            ? {
                ...x,
                state: 'THROWN' as const,
                position: { x: 1500, y: 100 },
                direction: { x: 0, y: -1 },
                travelled: 0,
              }
            : x,
        ),
      };
    })();
    const idle: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    for (const d of DIFFICULTIES) {
      let still = 0;
      let total = 0;
      for (let seed = 1; seed <= 20; seed += 1) {
        for (const i of drive(d, chase, 900, seed).slice(60)) {
          total += 1;
          if ((i.move?.x ?? 0) === 0 && (i.move?.y ?? 0) === 0) still += 1;
        }
      }
      idle[d] = still / total;
    }
    console.warn(`STANDING STILL ${JSON.stringify(idle)}\n`);
    expect(idle.EASY).toBeGreaterThan(idle.MEDIUM);
    expect(idle.MEDIUM).toBeGreaterThan(idle.HARD);
    expect(idle.MEDIUM).toBeGreaterThan(0.04);
    expect(idle.EASY).toBeLessThan(0.5);
  });

  it('it forgets a boomerang that is coming back more readily the easier it is: with equal reaction time, the share of RETURNING boomerangs it registers is the profile’s', () => {
    // b's boomerang is returning along the line to b, and a stands in the way
    const frozen = (): FuState => {
      const s = place(place(world(OPEN), 'a', 900, 450), 'b', 1500, 450);
      return {
        ...s,
        boomerangs: s.boomerangs.map((x) =>
          x.ownerId === 'b'
            ? {
                ...x,
                state: 'RETURNING' as const,
                position: { x: 600, y: 450 },
                direction: { x: 1, y: 0 },
                travelled: 500,
              }
            : x,
        ),
      };
    };
    const noticed: Record<Difficulty, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    for (const d of DIFFICULTIES) {
      // (reaction time is held equal so that only the awareness differs; a slow CPU would see it too late to count)
      const profile = { ...PROFILES[d], reactionTicks: [8, 8] as const, lapse: 0 };
      for (let seed = 1; seed <= 200; seed += 1) {
        const cpu = new CpuController('a', d, seed, profile);
        const s = frozen();
        for (let t = 0; t < 120; t += 1) cpu.decide(s);
        noticed[d] += cpu.stats.threats;
      }
    }
    console.warn(`RETURNING NOTICED ${JSON.stringify(noticed)}\n`);
    expect(noticed.EASY).toBeGreaterThan(0);
    expect(noticed.EASY).toBeLessThan(noticed.MEDIUM);
    expect(noticed.MEDIUM).toBeLessThan(noticed.HARD);
    expect(noticed.EASY).toBeLessThan(noticed.HARD * 0.5);
  });
});
