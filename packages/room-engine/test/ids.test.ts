import { describe, expect, it } from 'vitest';
import {
  parseJoinCode,
  toHostId,
  toPlayerId,
  toRoomId,
  type PlayerId,
  type RoomId,
} from '../src/ids';

describe('opaque identity types', () => {
  it('are plain strings at runtime (they serialize naturally)', () => {
    expect(toRoomId('r-1')).toBe('r-1');
    expect(JSON.stringify({ id: toPlayerId('p-1') })).toBe('{"id":"p-1"}');
  });

  it('are not interchangeable at compile time', () => {
    // These are enforced by `tsc` (pnpm typecheck): an unused/missing @ts-expect-error fails it.
    const reconnect = (roomId: RoomId, playerId: PlayerId): number => [roomId, playerId].length;
    reconnect(toRoomId('r'), toPlayerId('p'));
    // @ts-expect-error arguments swapped: the exact bug opaque ids exist to prevent
    reconnect(toPlayerId('p'), toRoomId('r'));
    // @ts-expect-error raw strings are not ids
    reconnect('r', 'p');
    // @ts-expect-error a HostId is not a PlayerId
    reconnect(toRoomId('r'), toHostId('h'));
    expect(true).toBe(true);
  });
});

describe('parseJoinCode', () => {
  it('returns the canonical uppercase code for valid input of any case', () => {
    expect(parseJoinCode('K7M4PX')).toBe('K7M4PX');
    expect(parseJoinCode('k7m4px')).toBe('K7M4PX');
  });

  it.each(['', 'K7M4P', 'K7M4PXX', 'K7M4P0', 'K7M4PO', 'K7M4P1', ' K7M4PX', 'ſ7M4PX'])(
    'returns undefined for %j',
    (input) => {
      expect(parseJoinCode(input)).toBeUndefined();
    },
  );
});
