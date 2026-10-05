import type { SessionFailure } from '@foomerang/controller-sdk';
import type { ErrorCode } from '@foomerang/protocol';

/**
 * Consumer words for protocol outcomes. The protocol carries stable machine codes; what a player
 * reads is decided here. A Record over ErrorCode, so a new code without copy cannot compile.
 */
const SOMETHING_WRONG = 'Something went wrong. Please try again.';

export const ERROR_COPY: Readonly<Record<ErrorCode, string>> = {
  ROOM_NOT_FOUND: 'We couldn’t find that room. Check the code on the screen.',
  ROOM_FULL: 'This game is full.',
  ROOM_NOT_JOINABLE: 'This game has already started.',
  INVALID_DISPLAY_NAME: 'Pick a name with 1 to 16 characters.',
  RATE_LIMITED: 'Too many tries. Wait a moment and try again.',
  SEAT_RELEASED: 'You were away too long, so your spot was given up. Join again to keep playing.',
  INVALID_RECONNECT_TOKEN: 'This controller was replaced by another device.',
  ROOM_CLOSING: 'This game is ending.',
  UNSUPPORTED_PROTOCOL: 'This controller is out of date. Reload the page.',
  UNKNOWN_GAME: SOMETHING_WRONG,
  HANDSHAKE_REQUIRED: SOMETHING_WRONG,
  INTERNAL_ERROR: SOMETHING_WRONG,
  INVALID_MESSAGE: SOMETHING_WRONG,
  UNAUTHORIZED: SOMETHING_WRONG,
};

export function failureMessage(failure: SessionFailure): string {
  switch (failure.kind) {
    case 'SERVER':
      return ERROR_COPY[failure.code];
    case 'CONNECTION_FAILED':
      return 'Couldn’t reach the game. Is your phone on the same Wi-Fi as the screen?';
    case 'CONNECTION_LOST':
      return 'The connection was lost. Join again to keep playing.';
  }
}
