import { describe, expect, it } from 'vitest';
import {
  GONG_ISLANDS_ARENA,
  GONG_ISLANDS_BOOK_SPOTS,
  GONG_ISLANDS_BREAKABLES,
  GONG_ISLANDS_GROUND,
  GONG_ISLANDS_SPAWNS,
  GONG_ISLANDS_WALLS,
  createFuMatch,
  stepFu,
} from '../src/rules';
import { circleHitsWalls, onGround } from '../src/rules/arena';
import { DT, R, at, input, make, place, player } from './support/fixtures';
import { playMatch } from './support/cpuMatch';

// The gong islands: the sky islands of the HQ videos (art/sky_islands, generated). Their ground is the island tops and the
// bridges; walking off falls (falling.test.ts has the rule itself).

describe('the gong islands', () => {
  it('six islands and three bridges are its ground; blocks, posts, trunks and bamboo are solid; pots and crates break', () => {
    expect(GONG_ISLANDS_GROUND).toHaveLength(9);
    expect(GONG_ISLANDS_WALLS.filter((w) => w.kind === 'GONG')).toHaveLength(2);
    expect(GONG_ISLANDS_WALLS.filter((w) => w.kind === 'BLOCK').length).toBeGreaterThan(8);
    expect(GONG_ISLANDS_BREAKABLES.filter((b) => b.kind === 'POT')).toHaveLength(10);
    expect(GONG_ISLANDS_BREAKABLES.filter((b) => b.kind === 'CRATE')).toHaveLength(2);
    expect(createFuMatch([{ id: 'a', slot: 0 }], { arena: GONG_ISLANDS_ARENA }).config.arena).toBe(
      GONG_ISLANDS_ARENA,
    );
  });

  it('every spawn and Book spot stands on open ground, a body’s width from any edge', () => {
    const solids = [...GONG_ISLANDS_WALLS, ...GONG_ISLANDS_BREAKABLES];
    for (const p of [...GONG_ISLANDS_SPAWNS, ...GONG_ISLANDS_BOOK_SPOTS]) {
      expect(circleHitsWalls(p, R + 10, solids), `${p.x},${p.y}`).toBe(false);
      for (let k = 0; k < 8; k += 1) {
        const q = {
          x: p.x + Math.cos((k * Math.PI) / 4) * R * 2,
          y: p.y + Math.sin((k * Math.PI) / 4) * R * 2,
        };
        expect(onGround(q, GONG_ISLANDS_ARENA), `${p.x},${p.y} toward ${k}`).toBe(true);
      }
    }
  });

  it('the north bridge carries a player from the centre island to the north one', () => {
    const north = GONG_ISLANDS_GROUND[6]; // the bridges come after the six islands
    expect(north).toBeDefined();
    const xs = (north ?? []).map((p) => p.x);
    const ys = (north ?? []).map((p) => p.y);
    const x = (Math.min(...xs) + Math.max(...xs)) / 2;
    let s = make(['a', 'b'], { arena: GONG_ISLANDS_ARENA, roundIntroSeconds: 0 });
    s = place(s, 'a', x, Math.max(...ys) + 40);
    // walking north until just past the bridge's far end
    for (let t = 0; t < 3 && at(s, 'a').y > Math.min(...ys) - 40; t += DT)
      s = stepFu(s, input({ a: { move: { x: 0, y: -1 } } }), DT).state;
    expect(player(s, 'a').alive).toBe(true);
    expect(at(s, 'a').y).toBeLessThan(Math.min(...ys));
  });

  it('CPUs play on it without walking off its edges', () => {
    let falls = 0;
    playMatch({
      participants: [
        { id: 'a', cpu: 'HARD' },
        { id: 'b', cpu: 'MEDIUM' },
        { id: 'c', cpu: 'EASY' },
        { id: 'd', cpu: 'MEDIUM' },
      ],
      arena: GONG_ISLANDS_ARENA,
      seed: 4,
      steps: 60 * 40,
      onStep: (_s, events) => {
        for (const e of events) if (e.type === 'HIT' && e.source === 'FALL') falls += 1;
      },
    });
    expect(falls).toBe(0);
  }, 60_000);
});
