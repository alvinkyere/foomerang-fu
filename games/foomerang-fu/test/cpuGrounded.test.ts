import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, PRIMITIVE_ARENA } from '../src';
import { playMatch } from './support/cpuMatch';
import { patchBoomerang, place } from './support/fixtures';

// A CPU whose boomerang has dropped (owner, 2026-10-19) gets it back the way a player can: it holds THROW and pulls it home.

describe('CPUs and a dropped boomerang', () => {
  it.each(DIFFICULTIES)('a %s CPU pulls its dropped boomerang home', (d) => {
    let back: number | undefined;
    playMatch({
      participants: [
        { id: 'a', cpu: d },
        { id: 'b', human: () => ({}) },
      ],
      arena: PRIMITIVE_ARENA,
      steps: 60 * 4,
      seed: 3,
      start: (s) =>
        patchBoomerang(place(place(s, 'a', 110, 110), 'b', 1490, 790), 'a', {
          state: 'GROUNDED',
          position: { x: 600, y: 110 },
          direction: { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          recall: 0,
        }),
      onStep: (s, _e, tick) => {
        if (back === undefined && s.boomerangs.find((b) => b.ownerId === 'a')?.state === 'HELD')
          back = tick;
      },
    });
    expect(back, 'got it back').toBeDefined();
    expect((back ?? 1e9) / 60).toBeLessThan(3);
  });
});
