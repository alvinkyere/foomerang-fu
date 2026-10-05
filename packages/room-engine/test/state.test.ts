import { describe, expect, it } from 'vitest';
import { ROOM_STATES, canTransition, type RoomState } from '../src/state';

// Written independently of the implementation's table, from docs/ROOM_ENGINE.md.
const PERMITTED: readonly (readonly [RoomState, RoomState])[] = [
  ['LOBBY', 'STARTING'],
  ['LOBBY', 'CLOSING'],
  ['STARTING', 'PLAYING'],
  ['STARTING', 'CLOSING'],
  ['PLAYING', 'RESULTS'],
  ['PLAYING', 'CLOSING'],
  ['RESULTS', 'LOBBY'],
  ['RESULTS', 'CLOSING'],
  ['CLOSING', 'CLOSED'],
];

const isPermitted = (from: RoomState, to: RoomState) =>
  PERMITTED.some(([f, t]) => f === from && t === to);

describe('room states', () => {
  it('are exactly these six (CREATING is not observable: creation is atomic)', () => {
    expect([...ROOM_STATES]).toEqual([
      'LOBBY',
      'STARTING',
      'PLAYING',
      'RESULTS',
      'CLOSING',
      'CLOSED',
    ]);
  });
});

describe('room state transitions: every (from, to) pair', () => {
  const pairs = ROOM_STATES.flatMap((from) => ROOM_STATES.map((to) => [from, to] as const));

  it('covers all 36 pairs, 9 permitted and 27 prohibited', () => {
    expect(pairs).toHaveLength(36);
    expect(pairs.filter(([f, t]) => isPermitted(f, t))).toHaveLength(9);
    expect(pairs.filter(([f, t]) => !isPermitted(f, t))).toHaveLength(27);
  });

  it.each(pairs)('%s → %s', (from, to) => {
    expect(canTransition(from, to)).toBe(isPermitted(from, to));
  });

  it('CLOSED is terminal: nothing leaves it, so a closed room can never reopen', () => {
    for (const to of ROOM_STATES) expect(canTransition('CLOSED', to)).toBe(false);
  });

  it('every live state can be closed, and CLOSING itself cannot be re-closed', () => {
    for (const from of ['LOBBY', 'STARTING', 'PLAYING', 'RESULTS'] as const) {
      expect(canTransition(from, 'CLOSING')).toBe(true);
    }
    expect(canTransition('CLOSING', 'CLOSING')).toBe(false);
  });
});
