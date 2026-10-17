import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, MARKET_PLAZA_ARENA, type FuEvent } from '../src';
import { playMatch } from './support/cpuMatch';
import { place } from './support/fixtures';

// The plaza's border (owner, 2026-10-17): outside the dashed lines a player explodes after 5 s. A CPU is a player that knows
// this: it does not walk out, and if it is ever outside (dashed or knocked out) it heads straight back in.

const zone = MARKET_PLAZA_ARENA.safeZone;
const outsideDeaths = (events: readonly FuEvent[]) =>
  events.filter((e) => e.type === 'HIT' && e.source === 'OUT_OF_BOUNDS').length;

describe('CPUs and the border', () => {
  it('the plaza has a border', () => {
    expect(zone).toBeDefined();
  });

  it.each(DIFFICULTIES)(
    'a %s CPU placed outside the dashed lines walks back in well before it would explode',
    (d) => {
      let back: number | undefined;
      playMatch({
        participants: [
          { id: 'a', cpu: d },
          { id: 'b', cpu: d },
        ],
        arena: MARKET_PLAZA_ARENA,
        steps: 60 * 4,
        seed: 5,
        start: (s) => place(s, 'a', 120, 600),
        onStep: (s, _e, tick) => {
          const p = s.world.bodies.find((b) => b.id === 'a')?.position;
          if (back === undefined && p !== undefined && zone !== undefined && p.x > zone.x)
            back = tick;
        },
      });
      expect(back, 'came back inside').toBeDefined();
      expect((back ?? 1e9) / 60).toBeLessThan(3);
    },
  );

  it('in long six-CPU plaza matches no CPU ever explodes outside the border', () => {
    for (const seed of [1, 2, 3]) {
      const r = playMatch({
        participants: ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({
          id,
          cpu: DIFFICULTIES[i % DIFFICULTIES.length] ?? 'HARD',
        })),
        arena: MARKET_PLAZA_ARENA,
        steps: 60 * 60,
        seed,
      });
      expect(outsideDeaths(r.events), `seed ${seed}`).toBe(0);
    }
  }, 60_000);
});
