import { describe, expect, it } from 'vitest';
import { CpuController, DEFAULT_FU_CONFIG, SYSTEMS_ARENA, seedFor, type Difficulty } from '../src';
import { playMatch } from './support/cpuMatch';
import { createFuMatch, type FuPlayerInput, type FuState } from '../src';
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
    expect(hard).toBeGreaterThan(0.015);
    expect(hard).toBeLessThan(0.08);
  });
});

describe('each CPU is its own seeded self', () => {
  it('a seat changes the seed, so a table of CPUs of one difficulty does not react in lockstep', () => {
    const seeds = [0, 1, 2, 3, 4, 5].map((i) => seedFor(5, i));
    expect(new Set(seeds).size).toBe(6);
    const reactions = seeds.map((s) => new CpuController('x', 'HARD', s).reactionTicks);
    expect(new Set(reactions).size).toBeGreaterThan(1);
    for (const r of reactions) {
      expect(r).toBeGreaterThanOrEqual(6);
      expect(r).toBeLessThanOrEqual(11);
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
