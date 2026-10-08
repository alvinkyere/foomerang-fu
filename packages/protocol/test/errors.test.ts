import { describe, expect, it } from 'vitest';
import { ERROR_CODES, errorCodeSchema } from '../src/errors';

describe('protocol error codes', () => {
  // Codes are wire-stable identifiers: renaming or removing one is a breaking change.
  // Adding one is additive. This list is intentionally explicit so a change is a conscious act.
  it('are exactly the stable set', () => {
    expect([...ERROR_CODES]).toEqual([
      'INVALID_MESSAGE',
      'UNSUPPORTED_PROTOCOL',
      'ROOM_NOT_FOUND',
      'ROOM_FULL',
      'INVALID_RECONNECT_TOKEN',
      'RATE_LIMITED',
      'UNAUTHORIZED',
      // Added in Slice 6 as the server's translation layer needed them (additive, wire-stable):
      'ROOM_NOT_JOINABLE',
      'INVALID_DISPLAY_NAME',
      'SEAT_RELEASED',
      'ROOM_CLOSING',
      'UNKNOWN_GAME',
      'HANDSHAKE_REQUIRED',
      'INTERNAL_ERROR',
      // Added in Slice 8 for host-driven match start:
      'NOT_ENOUGH_PLAYERS',
      'INVALID_STATE',
      'CONSOLE_FULL',
    ]);
  });

  it.each([...['INVALID_MESSAGE', 'ROOM_FULL', 'UNAUTHORIZED']])('accepts %s', (code) => {
    expect(errorCodeSchema.safeParse(code).success).toBe(true);
  });

  it.each(['bad room bro', 'room_full', 'ROOM FULL', '', 42, null, undefined, {}])(
    'rejects %j (codes are machine identifiers, never free text)',
    (value) => {
      expect(errorCodeSchema.safeParse(value).success).toBe(false);
    },
  );
});
