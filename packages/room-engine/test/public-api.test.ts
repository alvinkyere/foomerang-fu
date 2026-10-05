import { describe, expect, it } from 'vitest';
import * as api from '../src/index';

describe('public API surface', () => {
  // Guards against accidental exports and removals; changing this list is a conscious act.
  it('exports exactly the intended runtime values', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'DEFAULT_MAX_JOIN_CODE_ATTEMPTS',
        'ROOM_STATES',
        'RoomRegistry',
        'canTransition',
        'parseJoinCode',
        'toHostId',
        'toHostToken',
        'toPlayerId',
        'toReconnectToken',
        'toRoomId',
      ].sort(),
    );
  });

  it('keeps the raw domain operations and credential internals private', () => {
    // All room mutation goes through RoomRegistry so read-modify-write stays encapsulated.
    for (const internal of [
      'createRoom',
      'joinRoom',
      'beginStart',
      'moveTo',
      'Credential',
      'validateDisplayName',
      'validateRoomConfig',
      'ok',
      'fail',
    ]) {
      expect(api, internal).not.toHaveProperty(internal);
    }
  });
});
