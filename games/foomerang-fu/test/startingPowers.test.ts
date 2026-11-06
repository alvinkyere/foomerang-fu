import { describe, expect, it } from 'vitest';
import { createFuMatch } from '../src/rules';

// For testing a power (owner, 2026-11-06: "make it possible to test explosive boomerang"): a match can start with every player already
// holding powers, so the power is in hand from the first throw (the console's ?give=, a developer's switch).

const players = [
  { id: 'a', slot: 0 },
  { id: 'b', slot: 1 },
];

describe('starting powers', () => {
  it('puts the powers in every player’s hands at the start of the match', () => {
    const s = createFuMatch(players, { startingPowers: ['EXPLOSIVE_BOOMERANG'] });
    for (const p of s.players) expect(p.inventory).toEqual(['EXPLOSIVE_BOOMERANG']);
  });

  it('gives nothing without them, as before', () => {
    for (const p of createFuMatch(players).players) expect(p.inventory).toEqual([]);
  });

  it('refuses what is not a power', () => {
    expect(() => createFuMatch(players, { startingPowers: ['NOT_A_POWER' as never] })).toThrow(
      RangeError,
    );
  });
});
