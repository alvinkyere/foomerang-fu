import { describe, it } from 'vitest';
import {
  PROFILES,
  SYSTEMS_ARENA,
  type Difficulty,
  type FuEvent,
  type FuState,
  type Profile,
} from '../src';
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

interface Meter {
  aliveTicks: number;
  moveChanges: number;
  dashes: number;
  throws: number;
  hits: number;
  deflects: number;
  oppThrows: number;
  killedByBoomerang: number;
  hazardDeaths: number;
  reactionTicks: number[];
  rounds: number;
}
const blank = (): Meter => ({
  aliveTicks: 0,
  moveChanges: 0,
  dashes: 0,
  throws: 0,
  hits: 0,
  deflects: 0,
  oppThrows: 0,
  killedByBoomerang: 0,
  hazardDeaths: 0,
  reactionTicks: [],
  rounds: 0,
});

/** Plays one match and credits every participant's measurements to its difficulty. */
function meter(
  setup: readonly { id: string; cpu: Difficulty }[],
  seed: number,
  into: Record<Difficulty, Meter>,
  arena?: typeof SYSTEMS_ARENA,
): void {
  const difficultyOf = new Map(setup.map((p) => [p.id, p.cpu]));
  const alive: Map<string, boolean>[] = [];
  const events: { tick: number; e: FuEvent }[] = [];
  const r = playMatch({
    participants: [...setup],
    seed,
    steps: STEPS,
    powerups: true,
    keepInputs: true,
    ...(arena === undefined ? {} : { arena }),
    onStep: (state: { players: readonly { id: string; alive: boolean }[] }, evs, tick) => {
      alive.push(new Map(state.players.map((q) => [q.id, q.alive])));
      for (const e of evs) events.push({ tick, e });
    },
  });
  for (const [id, d] of difficultyOf) {
    const m = into[d];
    m.reactionTicks.push(r.controllers.get(id)?.reactionTicks ?? 0);
    let prev: { x: number; y: number } | undefined;
    r.inputs.forEach((frame, t) => {
      if (alive[t]?.get(id) !== true) {
        prev = undefined;
        return;
      }
      m.aliveTicks += 1;
      const mv = frame.get(id)?.move ?? { x: 0, y: 0 };
      if (prev !== undefined) {
        const a = Math.hypot(prev.x, prev.y);
        const b = Math.hypot(mv.x, mv.y);
        const turned = a > 0.01 && b > 0.01 && (prev.x * mv.x + prev.y * mv.y) / (a * b) < 0.88;
        if (turned || a > 0.01 !== b > 0.01) m.moveChanges += 1;
      }
      prev = mv;
    });
  }
  for (const { e } of events) {
    if (e.type === 'THROWN') {
      const d = difficultyOf.get(e.playerId);
      if (d !== undefined) into[d].throws += 1;
      for (const [id, dd] of difficultyOf) if (id !== e.playerId) into[dd].oppThrows += 1;
    }
    if (e.type === 'DASHED') {
      const d = difficultyOf.get(e.playerId);
      if (d !== undefined) into[d].dashes += 1;
    }
    if (e.type === 'DEFLECTED') {
      const d = difficultyOf.get(e.byId);
      if (d !== undefined) into[d].deflects += 1;
    }
    if (e.type === 'HIT') {
      const by = difficultyOf.get(e.byId);
      if (by !== undefined) into[by].hits += 1;
      const victim = difficultyOf.get(e.victimId);
      if (victim !== undefined) {
        if (e.byId === 'HAZARD') into[victim].hazardDeaths += 1;
        else into[victim].killedByBoomerang += 1;
      }
    }
    if (e.type === 'ROUND_OVER') for (const m of Object.values(into)) m.rounds += 1;
  }
}

const report = (name: string, m: Record<Difficulty, Meter>): string[] => [
  name,
  ...(['EASY', 'MEDIUM', 'HARD'] as const).map((d) => {
    const x = m[d];
    const minutes = x.aliveTicks / 3600;
    const seconds = x.aliveTicks / 60;
    return (
      `  ${d.padEnd(6)} reaction=${((x.reactionTicks.reduce((n, v) => n + v, 0) / Math.max(x.reactionTicks.length, 1)) * (1000 / 60)).toFixed(0)}ms ` +
      `moveChanges/s=${(x.moveChanges / Math.max(seconds, 1)).toFixed(2)} dashes/min=${(x.dashes / Math.max(minutes, 0.01)).toFixed(1)} ` +
      `throws/min=${(x.throws / Math.max(minutes, 0.01)).toFixed(1)} throwAccuracy=${pct(x.hits, x.throws)} ` +
      `deflectSuccess=${pct(x.deflects, x.oppThrows)} diedToBoomerang/oppThrow=${pct(x.killedByBoomerang, x.oppThrows)} hazardDeaths/100rounds=${((100 * x.hazardDeaths) / Math.max(x.rounds, 1)).toFixed(2)}`
    );
  }),
];

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

  it(
    'ladder diagnostics: tempo, dashes, accuracy and defence by difficulty (all pairings; hazards in the systems arena)',
    { timeout: 3_600_000 },
    () => {
      const duels = { EASY: blank(), MEDIUM: blank(), HARD: blank() };
      for (const [x, y] of matchups)
        for (let seed = 1; seed <= SEEDS; seed += 1)
          meter(
            seed % 2 === 0
              ? [
                  { id: 'y', cpu: y },
                  { id: 'x', cpu: x },
                ]
              : [
                  { id: 'x', cpu: x },
                  { id: 'y', cpu: y },
                ],
            seed,
            duels,
          );
      const tables = { EASY: blank(), MEDIUM: blank(), HARD: blank() };
      for (let seed = 1; seed <= SEEDS; seed += 1)
        meter(
          [
            { id: 'e', cpu: 'EASY' as Difficulty },
            { id: 'm', cpu: 'MEDIUM' as Difficulty },
            { id: 'h', cpu: 'HARD' as Difficulty },
            { id: 'h2', cpu: 'HARD' as Difficulty },
          ],
          seed,
          tables,
          SYSTEMS_ARENA,
        );
      console.warn(
        [
          ...report('LADDER — duels, every pairing, baseline arena', duels),
          ...report('LADDER — table of four in the systems arena', tables),
        ].join('\n'),
      );
    },
  );

  it(
    'ablation: which dimension makes a CPU lethal? (a wandering, sidestepping human-proxy that never attacks, 10 s, one dimension changed at a time)',
    { timeout: 3_600_000 },
    () => {
      const lethality = (profile: Profile, difficulty: Difficulty) => {
        let kills = 0;
        let total = 0;
        let firstHits = 0;
        let firstTotal = 0;
        let firstCount = 0;
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          let killedAt = 600;
          let throws = 0;
          let firstAt = -1;
          let firstKilled = false;
          playMatch({
            participants: [
              { id: 'a', cpu: difficulty, profile },
              (() => {
                // a plausible human: wanders (new direction every 0.4–1.2 s, the odd pause) and, once a boomerang of the CPU's
                // has been closing on it for 250 ms, sidesteps across its line — except one time in three, when it misses it
                let threatSince = -1;
                let fails = false;
                return {
                  id: 'b',
                  human: (st: FuState, t: number) => {
                    const me = st.world.bodies.find((q) => q.id === 'b')?.position ?? {
                      x: 0,
                      y: 0,
                    };
                    const shot = st.boomerangs.find(
                      (q) =>
                        q.ownerId === 'a' &&
                        (q.state === 'THROWN' || q.state === 'DEFLECTED') &&
                        Math.hypot(q.position.x - me.x, q.position.y - me.y) < 380 &&
                        (me.x - q.position.x) * q.direction.x +
                          (me.y - q.position.y) * q.direction.y >
                          0,
                    );
                    if (shot === undefined) threatSince = -1;
                    else if (threatSince < 0) {
                      threatSince = t;
                      fails =
                        ((Math.imul(t + 7, 2246822519) ^ Math.imul(seed, 3266489917)) >>> 0) % 3 ===
                        0;
                    }
                    if (shot !== undefined && !fails && t - threatSince >= 15) {
                      const side =
                        (me.x - shot.position.x) * shot.direction.y -
                          (me.y - shot.position.y) * shot.direction.x >=
                        0
                          ? 1
                          : -1;
                      return { move: { x: -shot.direction.y * side, y: shot.direction.x * side } };
                    }
                    const slot = Math.floor(t / 36);
                    const h = Math.imul(slot + 1, 2654435761) ^ Math.imul(seed, 40503);
                    const k = (h >>> 0) % 9;
                    return k === 8 ? {} : { move: { x: Math.cos(k), y: Math.sin(k) } };
                  },
                };
              })(),
            ],
            seed,
            steps: 600,
            onStep: (_st, events, tick) => {
              for (const e of events) {
                if (e.type === 'THROWN' && e.playerId === 'a') {
                  throws += 1;
                  if (firstAt < 0) firstAt = tick;
                }
                if (e.type === 'HIT' && e.victimId === 'b') {
                  if (killedAt === 600) killedAt = tick;
                  if (throws === 1) firstKilled = true;
                }
              }
            },
          });
          if (killedAt < 600) kills += 1;
          if (firstKilled) firstHits += 1;
          if (firstAt >= 0) {
            firstTotal += firstAt;
            firstCount += 1;
          }
          total += killedAt / 60;
        }
        return `killed<10s=${pct(kills, SEEDS)} meanKill=${(total / SEEDS).toFixed(2)}s firstThrowAt=${(firstTotal / Math.max(firstCount, 1) / 60).toFixed(2)}s firstThrowKills=${pct(firstHits, SEEDS)}`;
      };
      const m = PROFILES.MEDIUM;
      const variants: [string, Profile][] = [
        ['MEDIUM as is', m],
        ['reaction 300–450 ms', { ...m, reactionTicks: [18, 27] }],
        ['decides every 16 (was 8)', { ...m, decisionTicks: 16 }],
        ['aim error 0.2 (was 0.1)', { ...m, aimError: 0.2 }],
        ['lead 0.2 (was 0.6)', { ...m, lead: 0.2 }],
        ['throw reach 0.6 (was 0.85)', { ...m, throwReach: 0.6 }],
        ['lapse 25% (was 5%)', { ...m, lapse: 0.25 }],
        ['dash use 0.1 (was 0.5)', { ...m, dashUse: 0.1 }],
        ['pursuit retarget 120 (was 60)', { ...m, retarget: 120 }],
      ];
      const lines = [
        'ABLATION — Medium, one change at a time, against a wandering, sidestepping proxy',
      ];
      for (const [name, profile] of variants)
        lines.push(`  ${name.padEnd(34)} ${lethality(profile, 'MEDIUM')}`);
      lines.push(`  ${'EASY as is'.padEnd(34)} ${lethality(PROFILES.EASY, 'EASY')}`);
      lines.push(`  ${'HARD as is'.padEnd(34)} ${lethality(PROFILES.HARD, 'HARD')}`);
      console.warn(lines.join('\n'));
    },
  );
});
