import { describe, expect, it } from 'vitest';
import * as api from '../src/index';

describe('public API surface', () => {
  // Guards against accidental exports and removals; changing this list is a conscious act.
  it('exports exactly the intended runtime values', () => {
    expect(Object.keys(api).sort()).toEqual(
      [
        'ConsoleRegistry',
        'DEFAULT_CONSOLE_TIMINGS',
        'DEFAULT_MAX_CONTROLLERS',
        'DEFAULT_MAX_JOIN_CODE_ATTEMPTS',
        'DEFAULT_ROOM_TIMINGS',
        'JoinCodeSpace',
        'ROOM_STATES',
        'RoomRegistry',
        'canTransition',
        'occupiedSeats',
        'parseJoinCode',
        'effectiveContext',
        'heldControllers',
        'mayPause',
        'participationOf',
        'seatOf',
        'seatedPlayers',
        'toConsoleId',
        'toControllerId',
        'toGameSessionId',
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
      'reconcile',
      'disconnectPlayer',
      'reconnectPlayer',
      'disconnectHost',
      'reconnectHost',
      'elapsedSince',
      'resolveTimings',
      'moveTo',
      'Credential',
      'validateDisplayName',
      'validateRoomConfig',
      'ok',
      'fail',
      // console sessions: mutation only through ConsoleRegistry
      'createConsole',
      'joinConsole',
      'reconnectController',
      'releaseController',
      'reconcileConsole',
      'launchGame',
      'setParticipants',
      'setContext',
      'beginClose',
      'reconcileMember',
      'releaseMember',
      'resolveConsoleTimings',
    ]) {
      expect(api, internal).not.toHaveProperty(internal);
    }
  });
});
