import { describe, expect, it } from 'vitest';
import { validateRoomConfig } from '../src/config';

const config = (overrides: Record<string, unknown> = {}) =>
  ({ gameId: 'foomerang-fu', minPlayers: 2, maxPlayers: 6, ...overrides }) as never;

describe('room configuration (capacity is configuration, not a platform constant)', () => {
  it('accepts Foomerang Fu: 2–6 players', () => {
    expect(validateRoomConfig(config())).toEqual({
      gameId: 'foomerang-fu',
      minPlayers: 2,
      maxPlayers: 6,
    });
  });

  it.each([
    [1, 1],
    [2, 2],
    [2, 4],
    [2, 8],
    [4, 12],
  ])('accepts %i–%i (other games have other capacities)', (minPlayers, maxPlayers) => {
    expect(validateRoomConfig(config({ minPlayers, maxPlayers }))).toBeDefined();
  });

  it('returns a frozen copy so later caller mutation cannot change a room', () => {
    const input = { gameId: 'foomerang-fu', minPlayers: 2, maxPlayers: 6 };
    const validated = validateRoomConfig(input);
    input.maxPlayers = 99;
    expect(validated?.maxPlayers).toBe(6);
    expect(Object.isFrozen(validated)).toBe(true);
  });

  it('accepts min 0: a game whose participants can all be software (Foomerang Fu CPUs) may start with nobody on a phone', () => {
    expect(validateRoomConfig(config({ minPlayers: 0 }))).toBeDefined();
  });

  it.each([
    ['negative min', { minPlayers: -1 }],
    ['fractional min', { minPlayers: 1.5 }],
    ['NaN min', { minPlayers: Number.NaN }],
    ['min greater than max', { minPlayers: 7, maxPlayers: 6 }],
    ['max 0', { minPlayers: 0, maxPlayers: 0 }], // (a game needs room for somebody)
    ['Infinity max', { maxPlayers: Number.POSITIVE_INFINITY }],
    ['fractional max', { maxPlayers: 6.5 }],
    ['string max', { maxPlayers: '6' }],
    ['empty gameId', { gameId: '' }],
    ['uppercase gameId', { gameId: 'Foomerang' }],
    ['gameId with spaces', { gameId: 'foomerang fu' }],
    ['overlong gameId', { gameId: 'a'.repeat(65) }],
    ['missing gameId', { gameId: undefined }],
  ])('rejects %s', (_label, overrides) => {
    expect(validateRoomConfig(config(overrides))).toBeUndefined();
  });
});
