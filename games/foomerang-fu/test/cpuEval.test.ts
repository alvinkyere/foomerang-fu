import { describe, it } from 'vitest';
import { SYSTEMS_ARENA, type Difficulty, type FuEvent } from '../src';
import { playMatch } from './support/cpuMatch';

/**
 * DIAGNOSTIC, not a test of strength: deterministic bot-vs-bot play across many seeds, printed for a human to read.
 * Nothing here asserts a win rate, and nothing in the CPUs was tuned toward any figure it prints. Skipped unless
 * FU_CPU_EVAL=1 (pnpm --filter @foomerang/foomerang-fu eval:cpu); FU_CPU_EVAL_SEEDS sets the number of matches.
 */
// (this package has no Node types, and must not gain them: read the environment through the global)
const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const ON = env['FU_CPU_EVAL'] === '1';
const SEEDS = Number(env['FU_CPU_EVAL_SEEDS'] ?? 40);
const STEPS = 60 * 120; // two minutes of play per match (many rounds each)

interface Tally {
  rounds: number;
  wins: Record<string, number>;
  noWinner: number;
  roundTicks: number[];
  events: Record<string, number>;
  hitRounds: number;
}

function play(
  setup: readonly { id: string; cpu: Difficulty }[],
  seed: number,
  arena?: typeof SYSTEMS_ARENA,
): Tally {
  const tally: Tally = {
    rounds: 0,
    wins: {},
    noWinner: 0,
    roundTicks: [],
    events: {},
    hitRounds: 0,
  };
  let startedAt = 0;
  let hitThisRound = false;
  playMatch({
    participants: [...setup],
    seed,
    steps: STEPS,
    powerups: true,
    ...(arena === undefined ? {} : { arena }),
    onStep: (_s: unknown, events: readonly FuEvent[], tick: number) => {
      for (const e of events) {
        tally.events[e.type] = (tally.events[e.type] ?? 0) + 1;
        if (e.type === 'HIT') hitThisRound = true;
        if (e.type === 'ROUND_OVER') {
          tally.rounds += 1;
          tally.roundTicks.push(tick - startedAt);
          if (hitThisRound) tally.hitRounds += 1;
          if (e.winnerId === undefined) tally.noWinner += 1;
          else tally.wins[e.winnerId] = (tally.wins[e.winnerId] ?? 0) + 1;
        }
        if (e.type === 'ROUND_START') {
          startedAt = tick;
          hitThisRound = false;
        }
      }
    },
  });
  return tally;
}

const sum = (a: number[]): number => a.reduce((n, x) => n + x, 0);
const pct = (n: number, d: number): string => (d === 0 ? '—' : `${((100 * n) / d).toFixed(1)}%`);
const median = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;

describe.skipIf(!ON)('CPU evaluation (diagnostic only)', () => {
  const matchups: [Difficulty, Difficulty][] = [
    ['EASY', 'EASY'],
    ['MEDIUM', 'MEDIUM'],
    ['HARD', 'HARD'],
    ['EASY', 'MEDIUM'],
    ['MEDIUM', 'HARD'],
    ['EASY', 'HARD'],
  ];

  it('duels, sides swapped every other seed, in the baseline arena', { timeout: 3_600_000 }, () => {
    const lines: string[] = [`DUELS — ${SEEDS} matches × 2 min each, sides alternate, powerups on`];
    for (const [x, y] of matchups) {
      let rounds = 0;
      let xWins = 0;
      let yWins = 0;
      let none = 0;
      const ticks: number[] = [];
      const events: Record<string, number> = {};
      for (let seed = 1; seed <= SEEDS; seed += 1) {
        const swap = seed % 2 === 0;
        const setup = swap
          ? [
              { id: 'y', cpu: y },
              { id: 'x', cpu: x },
            ]
          : [
              { id: 'x', cpu: x },
              { id: 'y', cpu: y },
            ];
        const t = play(setup, seed);
        rounds += t.rounds;
        xWins += t.wins['x'] ?? 0;
        yWins += t.wins['y'] ?? 0;
        none += t.noWinner;
        ticks.push(...t.roundTicks);
        for (const [k, v] of Object.entries(t.events)) events[k] = (events[k] ?? 0) + v;
      }
      const per = (k: string): string => ((events[k] ?? 0) / Math.max(rounds, 1)).toFixed(2);
      lines.push(
        `${x} vs ${y}: rounds=${rounds} ${x}=${pct(xWins, rounds)} ${y}=${pct(yWins, rounds)} noWinner=${pct(none, rounds)} ` +
          `round(s) mean=${(sum(ticks) / Math.max(ticks.length, 1) / 60).toFixed(1)} median=${(median(ticks) / 60).toFixed(1)} max=${(Math.max(0, ...ticks) / 60).toFixed(1)} ` +
          `per round: throws=${per('THROWN')} slashes=${per('SLASHED')} dashes=${per('DASHED')} deflects=${per('DEFLECTED')} catches=${per('CAUGHT')} hits=${per('HIT')} fatigued=${per('FATIGUED')} books=${per('PICKED_UP')} guardBlocks=${per('GUARD_BLOCKED')}`,
      );
    }
    console.warn(lines.join('\n'));
  });

  it(
    'a table of four and a table of six (Easy, Medium, Hard mixed), in the arena with systems',
    { timeout: 3_600_000 },
    () => {
      const tables: [string, { id: string; cpu: Difficulty }[]][] = [
        [
          'four: E M H H',
          [
            { id: 'e', cpu: 'EASY' },
            { id: 'm', cpu: 'MEDIUM' },
            { id: 'h1', cpu: 'HARD' },
            { id: 'h2', cpu: 'HARD' },
          ],
        ],
        [
          'six: E E M M H H',
          [
            { id: 'e1', cpu: 'EASY' },
            { id: 'e2', cpu: 'EASY' },
            { id: 'm1', cpu: 'MEDIUM' },
            { id: 'm2', cpu: 'MEDIUM' },
            { id: 'h1', cpu: 'HARD' },
            { id: 'h2', cpu: 'HARD' },
          ],
        ],
      ];
      const lines: string[] = ['TABLES — systems arena, powerups on'];
      for (const [name, setup] of tables) {
        const wins: Record<string, number> = {};
        let rounds = 0;
        let none = 0;
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          // seats rotate with the seed so no CPU keeps the best spawn
          const rotated = setup.map(
            (_, i) => setup[(i + seed) % setup.length] as (typeof setup)[0],
          );
          const t = play(rotated, seed, SYSTEMS_ARENA);
          rounds += t.rounds;
          none += t.noWinner;
          for (const [k, v] of Object.entries(t.wins)) wins[k] = (wins[k] ?? 0) + v;
        }
        lines.push(
          `${name}: rounds=${rounds} noWinner=${pct(none, rounds)} wins: ` +
            setup.map((p) => `${p.id}(${p.cpu})=${pct(wins[p.id] ?? 0, rounds)}`).join(' '),
        );
      }
      console.warn(lines.join('\n'));
    },
  );
});
