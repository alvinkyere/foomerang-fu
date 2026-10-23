import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, GONG_ISLANDS_ARENA, type FuArena } from '../src';
import { playMatch } from './support/cpuMatch';
import { place } from './support/fixtures';

// CPUs on islands (owner, 2026-10-22: the gong islands are in the rotation). Some ground cannot be walked to from other ground
// (the gong islands' south island stands alone in the mist, as in the video), so a CPU must fight across a gap: when it
// cannot walk to its opponent it goes where it can throw at them. And it keeps off the edges.

// two islands with no bridge: x 100–1300 and x 1400–1800 (y 100–500); a wall on the near one stands in the straight line
const APART: FuArena = Object.freeze({
  width: 1900,
  height: 600,
  ground: [
    [
      { x: 100, y: 100 },
      { x: 1300, y: 100 },
      { x: 1300, y: 500 },
      { x: 100, y: 500 },
    ],
    [
      { x: 1400, y: 100 },
      { x: 1800, y: 100 },
      { x: 1800, y: 500 },
      { x: 1400, y: 500 },
    ],
  ],
  walls: [{ shape: 'box' as const, x: 1000, y: 300, halfWidth: 60, halfHeight: 80, angle: 0 }],
  spawns: [
    { x: 200, y: 300 },
    { x: 1600, y: 300 },
    { x: 200, y: 200 },
    { x: 1600, y: 200 },
    { x: 200, y: 400 },
    { x: 1600, y: 400 },
  ],
});

describe('CPUs on islands', () => {
  it.each(DIFFICULTIES)(
    'a %s CPU that cannot walk to its opponent goes where it can throw at them',
    (d) => {
      let thrown = false;
      playMatch({
        participants: [
          { id: 'a', cpu: d },
          { id: 'b', human: () => ({}) },
        ],
        arena: APART,
        steps: 60 * 10,
        seed: 2,
        start: (s) => place(place(s, 'a', 200, 300), 'b', 1600, 300),
        onStep: (_s, events) => {
          for (const e of events) if (e.type === 'THROWN' && e.playerId === 'a') thrown = true;
        },
      });
      expect(thrown).toBe(true);
    },
  );

  it('on the gong islands every CPU round ends, and CPUs seldom fall', () => {
    let rounds = 0;
    let falls = 0;
    let longest = 0;
    for (const seed of [1, 2]) {
      let start = 0;
      playMatch({
        participants: ['a', 'b', 'c', 'd'].map((id) => ({ id, cpu: 'MEDIUM' as const })),
        arena: GONG_ISLANDS_ARENA,
        seed,
        steps: 60 * 120,
        onStep: (s, events, tick) => {
          for (const e of events) {
            if (e.type === 'ROUND_START') start = tick;
            if (e.type === 'ROUND_OVER') rounds += 1;
            if (e.type === 'HIT' && e.source === 'FALL') falls += 1;
          }
          if (s.phase === 'PLAYING') longest = Math.max(longest, (tick - start) / 60);
        },
      });
    }
    // the plaza's CPU rounds last 13–80 s; before this a round here could stall for good (CPUs stood at the edges)
    expect(longest).toBeLessThan(100);
    expect(rounds).toBeGreaterThanOrEqual(4);
    // falls still happen (a slash or a shield's pop can shove a body over), but not a fall a round
    expect(falls).toBeLessThan(rounds);
  }, 240_000);
});
