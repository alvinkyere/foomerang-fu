import { describe, expect, it } from 'vitest';
import {
  DIFFICULTIES,
  FREE_FOR_ALL,
  GARDEN_ARENA,
  GARDEN_BOOK_SPOTS,
  GARDEN_SPAWNS,
  powerupsFor,
  type Difficulty,
  type FuState,
} from '../src';
import { circleHitsWalls, wallsOf } from '../src/rules/arena';
import { playMatch, type Participant } from './support/cpuMatch';
import { at } from './support/fixtures';

// CPUs on Garden: the Slice 7 calibration is untouched; this checks they can PLAY the new map (corridors, corners, dead ends,
// Books) and never get permanently stuck, and that complete Free For All matches finish on it.

const walls = wallsOf(GARDEN_ARENA);
const cpus = (levels: Difficulty[]): Participant[] =>
  levels.map((cpu, i) => ({ id: `c${i}`, cpu }));
const config = { ...FREE_FOR_ALL, powerups: powerupsFor('HIGH', GARDEN_BOOK_SPOTS) as never };

/** Longest stretch (seconds) in which a living CPU, in a live round, neither moved 60 units nor had a foe within 450. */
function longestIdle(
  setup: Participant[],
  seed: number,
  seconds: number,
): { idle: number; state: FuState } {
  const last = new Map<string, { x: number; y: number; t: number }>();
  let worst = 0;
  const r = playMatch({
    participants: setup,
    arena: GARDEN_ARENA,
    seed,
    steps: 60 * seconds,
    powerups: false,
    config: { ...FREE_FOR_ALL, powerups: powerupsFor('HIGH', GARDEN_BOOK_SPOTS) as never },
    onStep: (state, _events, tick) => {
      if (state.phase !== 'PLAYING') {
        last.clear();
        return;
      }
      for (const p of state.players) {
        if (!p.alive) {
          last.delete(p.id);
          continue;
        }
        const pos = at(state, p.id);
        const near = state.players.some(
          (q) =>
            q.alive &&
            q.id !== p.id &&
            Math.hypot(at(state, q.id).x - pos.x, at(state, q.id).y - pos.y) < 450,
        );
        const prev = last.get(p.id);
        if (prev === undefined || near || Math.hypot(pos.x - prev.x, pos.y - prev.y) > 60) {
          last.set(p.id, { ...pos, t: tick });
        } else worst = Math.max(worst, (tick - prev.t) / 60);
      }
    },
  });
  return { idle: worst, state: r.state };
}

describe('CPUs play Garden', () => {
  it('a CPU of every difficulty finds and reaches an idle opponent standing at every Book spot and every other spawn (routes through every corridor and corner)', () => {
    const goals = [...GARDEN_BOOK_SPOTS, ...GARDEN_SPAWNS.slice(1)];
    for (const d of DIFFICULTIES) {
      let reached = 0;
      for (const goal of goals) {
        let closest = Infinity;
        let killed = false;
        playMatch({
          participants: [
            { id: 'a', cpu: d },
            { id: 'b', human: () => ({}) },
          ],
          arena: GARDEN_ARENA,
          seed: 3,
          steps: 60 * 60,
          config: { ...FREE_FOR_ALL, targetKills: 99 },
          start: (st) => ({
            ...st,
            world: {
              ...st.world,
              bodies: st.world.bodies.map((body) =>
                body.id === 'b' ? { ...body, position: { ...goal } } : body,
              ),
            },
          }),
          onStep: (st, events) => {
            closest = Math.min(closest, Math.hypot(at(st, 'a').x - goal.x, at(st, 'a').y - goal.y));
            if (events.some((e) => e.type === 'HIT' && e.victimId === 'b')) killed = true;
          },
        });
        if (killed || closest < 220) reached += 1;
      }
      expect(reached, `${d} reached ${reached} of ${goals.length}`).toBe(goals.length);
    }
  });

  it('no CPU is ever inside a wall, and none sits idle for long, in 4-CPU and 6-CPU matches of every mix (seeded)', () => {
    const mixes: Difficulty[][] = [
      ['EASY', 'EASY', 'EASY', 'EASY'],
      ['MEDIUM', 'MEDIUM', 'MEDIUM', 'MEDIUM'],
      ['HARD', 'HARD', 'HARD', 'HARD'],
      ['EASY', 'EASY', 'MEDIUM', 'MEDIUM', 'HARD', 'HARD'],
      ['HARD', 'HARD', 'HARD', 'HARD', 'HARD', 'HARD'],
    ];
    const results: string[] = [];
    mixes.forEach((mix, k) => {
      for (const seed of [1, 2, 3]) {
        const { idle, state } = longestIdle(cpus(mix), seed * 10 + k, 90);
        results.push(`${mix.join('/')} seed ${seed}: longest idle ${idle.toFixed(1)} s`);
        for (const p of state.players)
          if (p.alive) expect(circleHitsWalls(at(state, p.id), 35.9, walls)).toBe(false);
        expect(idle, `${mix.join('/')} seed ${seed}`).toBeLessThan(12);
      }
    });
    console.warn(results.join('\n'));
  });
});

describe('Free For All on Garden', () => {
  it.each([
    ['2 CPUs', ['MEDIUM', 'HARD']],
    ['4 CPUs', ['EASY', 'MEDIUM', 'HARD', 'HARD']],
    ['6 CPUs', ['EASY', 'EASY', 'MEDIUM', 'MEDIUM', 'HARD', 'HARD']],
  ] as [string, Difficulty[]][])(
    '%s play a complete match to the 14-kill win (and replay identically)',
    (_name, mix) => {
      const play = (seed: number) =>
        playMatch({
          participants: cpus(mix),
          arena: GARDEN_ARENA,
          seed,
          steps: 60 * 1500,
          config,
        });
      const a = play(7);
      expect(a.state.phase).toBe('MATCH_OVER');
      const winner = a.state.matchOver?.winnerId ?? '';
      expect(a.state.scores[winner]).toBeGreaterThanOrEqual(14);
      console.warn(
        `${_name}: match won at ${a.state.elapsed.toFixed(0)} s, round ${a.state.round}, scores ${JSON.stringify(a.state.scores)}`,
      );
      expect(JSON.stringify(play(7).state)).toBe(JSON.stringify(a.state));
    },
  );
});
