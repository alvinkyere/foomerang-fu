import { ERROR_CODES } from '@foomerang/protocol';
import { describe, expect, it } from 'vitest';
import {
  CREATE_ROOM_ERRORS,
  JOIN_ERRORS,
  RECONNECT_HOST_ERRORS,
  RECONNECT_PLAYER_ERRORS,
} from '../src/translation';

// room-engine domain reason  →  server mapping  →  protocol error code  →  (clients) UI copy.
// The room engine does not know protocol codes and the protocol does not know UI copy.
describe('domain result → protocol error code', () => {
  it('joining', () => {
    expect(JOIN_ERRORS).toEqual({
      ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
      ROOM_NOT_JOINABLE: 'ROOM_NOT_JOINABLE',
      INVALID_DISPLAY_NAME: 'INVALID_DISPLAY_NAME',
      ROOM_FULL: 'ROOM_FULL',
    });
  });

  it('player reconnection (an unknown credential is “invalid reconnect token”)', () => {
    expect(RECONNECT_PLAYER_ERRORS).toEqual({
      ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
      INVALID_CREDENTIAL: 'INVALID_RECONNECT_TOKEN',
      SEAT_RELEASED: 'SEAT_RELEASED',
      ROOM_CLOSING: 'ROOM_CLOSING',
    });
  });

  it('host reconnection (a wrong host credential is simply “unauthorized”)', () => {
    expect(RECONNECT_HOST_ERRORS).toEqual({
      ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
      INVALID_CREDENTIAL: 'UNAUTHORIZED',
      ROOM_CLOSING: 'ROOM_CLOSING',
    });
  });

  it('room creation failures are server faults, not the client’s problem', () => {
    expect(CREATE_ROOM_ERRORS).toEqual({
      INVALID_CONFIG: 'INTERNAL_ERROR',
      JOIN_CODE_EXHAUSTED: 'INTERNAL_ERROR',
    });
  });

  it('every mapped value is a real, stable protocol error code', () => {
    for (const table of [
      JOIN_ERRORS,
      RECONNECT_PLAYER_ERRORS,
      RECONNECT_HOST_ERRORS,
      CREATE_ROOM_ERRORS,
    ]) {
      for (const code of Object.values(table)) expect(ERROR_CODES).toContain(code);
    }
  });
});

describe('starting a match', () => {
  it('maps transition failures to protocol codes', async () => {
    const { TRANSITION_ERRORS } = await import('../src/translation');
    expect(TRANSITION_ERRORS).toEqual({
      ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
      INVALID_TRANSITION: 'INVALID_STATE',
      NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
    });
  });
});
