import type { ErrorCode } from '@foomerang/protocol';
import type { HostFailure } from '../host';

const SERVER_COPY: Record<ErrorCode, string> = {
  INVALID_MESSAGE: 'The game server did not understand the console. Please reload the page.',
  UNSUPPORTED_PROTOCOL: 'This console is out of date for the game server. Please reload the page.',
  ROOM_NOT_FOUND: 'This room no longer exists.',
  ROOM_FULL: 'The room is full.',
  INVALID_RECONNECT_TOKEN: 'This room can no longer be reclaimed.',
  RATE_LIMITED: 'Slow down a moment, then try again.',
  UNAUTHORIZED: 'This console no longer controls that room.',
  ROOM_NOT_JOINABLE: 'The game has already started.',
  INVALID_DISPLAY_NAME: 'That name cannot be used.',
  SEAT_RELEASED: 'That seat was released.',
  ROOM_CLOSING: 'This room is closing.',
  UNKNOWN_GAME: 'The game server does not know this game.',
  HANDSHAKE_REQUIRED: 'The game server rejected the connection. Please reload the page.',
  INTERNAL_ERROR: 'The game server had a problem. Please try again.',
  NOT_ENOUGH_PLAYERS: 'Waiting for more players before the game can start.',
  INVALID_STATE: 'The game cannot start right now.',
};

export function failureCopy(failure: HostFailure): string {
  switch (failure.kind) {
    case 'CONNECTION_FAILED':
      return 'Cannot reach the game server. Check that it is running and that the address is right.';
    case 'CONNECTION_LOST':
      return 'Lost the connection to the game server and could not get it back.';
    case 'SERVER':
      return SERVER_COPY[failure.code];
  }
}

export const noticeCopy = (code: ErrorCode): string => SERVER_COPY[code];
