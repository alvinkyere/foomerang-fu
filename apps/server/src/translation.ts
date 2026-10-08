import type { ErrorCode } from '@foomerang/protocol';
import type {
  CloseFailure,
  GameFailure,
  ConsoleJoinFailure,
  ControllerFailure,
  ControllerReconnectFailure,
  HostFailure,
  CreateRoomFailure,
  RegistryJoinFailure,
  RegistryTransitionFailure,
  RegistryReconnectHostFailure,
  RegistryReconnectPlayerFailure,
} from '@foomerang/room-engine';

/**
 * The seam between layers, spelled out:
 *
 *   room-engine domain reason  →  (this file)  →  protocol ErrorCode  →  (clients)  UI copy
 *
 * The room engine knows nothing of protocol codes; the protocol knows nothing of UI copy. Each
 * table is a `Record` over the domain's failure union, so adding a new domain failure without
 * deciding how it is reported is a COMPILE error.
 */

export const JOIN_ERRORS: Readonly<Record<RegistryJoinFailure, ErrorCode>> = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_NOT_JOINABLE: 'ROOM_NOT_JOINABLE',
  INVALID_DISPLAY_NAME: 'INVALID_DISPLAY_NAME',
  ROOM_FULL: 'ROOM_FULL',
};

export const RECONNECT_PLAYER_ERRORS: Readonly<Record<RegistryReconnectPlayerFailure, ErrorCode>> =
  {
    ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
    INVALID_CREDENTIAL: 'INVALID_RECONNECT_TOKEN',
    SEAT_RELEASED: 'SEAT_RELEASED',
    ROOM_CLOSING: 'ROOM_CLOSING',
  };

export const RECONNECT_HOST_ERRORS: Readonly<Record<RegistryReconnectHostFailure, ErrorCode>> = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  INVALID_CREDENTIAL: 'UNAUTHORIZED',
  ROOM_CLOSING: 'ROOM_CLOSING',
};

/** These are server faults or exhaustion, never something the client did wrong. */
export const CREATE_ROOM_ERRORS: Readonly<Record<CreateRoomFailure, ErrorCode>> = {
  INVALID_CONFIG: 'INTERNAL_ERROR',
  JOIN_CODE_EXHAUSTED: 'INTERNAL_ERROR',
};

export const TRANSITION_ERRORS: Readonly<Record<RegistryTransitionFailure, ErrorCode>> = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  INVALID_TRANSITION: 'INVALID_STATE',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
};

// --- console sessions (ADR-004) ------------------------------------------------------------------
// The registry adds 'CONSOLE_NOT_FOUND' to every operation's failures. Consumer copy for the reused
// codes still says "room" / "game" in places: the controller's words are revisited in C5.

type NotFound = 'CONSOLE_NOT_FOUND';

export const CONTROLLER_JOIN_ERRORS: Readonly<Record<ConsoleJoinFailure | NotFound, ErrorCode>> = {
  CONSOLE_NOT_FOUND: 'ROOM_NOT_FOUND',
  CONSOLE_NOT_JOINABLE: 'ROOM_CLOSING', // only a closing console refuses joins
  INVALID_DISPLAY_NAME: 'INVALID_DISPLAY_NAME',
  CONSOLE_FULL: 'CONSOLE_FULL',
};

export const CONTROLLER_RECONNECT_ERRORS: Readonly<
  Record<ControllerReconnectFailure | NotFound, ErrorCode>
> = {
  CONSOLE_NOT_FOUND: 'ROOM_NOT_FOUND',
  INVALID_CREDENTIAL: 'INVALID_RECONNECT_TOKEN',
  MEMBERSHIP_RELEASED: 'SEAT_RELEASED',
  CONSOLE_CLOSING: 'ROOM_CLOSING',
};

export const CONSOLE_HOST_ERRORS: Readonly<Record<HostFailure | NotFound, ErrorCode>> = {
  CONSOLE_NOT_FOUND: 'ROOM_NOT_FOUND',
  INVALID_CREDENTIAL: 'UNAUTHORIZED',
  CONSOLE_CLOSING: 'ROOM_CLOSING',
  ALREADY_DISCONNECTED: 'INTERNAL_ERROR', // never asked of a reconnect
};

/** The TV named a controller it cannot remove (unknown, not its own, or already gone). */
export const CONTROLLER_REMOVE_ERRORS: Readonly<Record<ControllerFailure | NotFound, ErrorCode>> = {
  CONSOLE_NOT_FOUND: 'ROOM_NOT_FOUND',
  CONTROLLER_NOT_FOUND: 'INVALID_STATE',
  ALREADY_RELEASED: 'INVALID_STATE',
  ALREADY_DISCONNECTED: 'INVALID_STATE',
};

export const CONSOLE_CLOSE_ERRORS: Readonly<Record<CloseFailure | NotFound, ErrorCode>> = {
  CONSOLE_NOT_FOUND: 'ROOM_NOT_FOUND',
  INVALID_TRANSITION: 'INVALID_STATE',
};

/**
 * Game operations on a console (C4). STALE_GAME never reaches the TV as an error: a message for an
 * ended launch is dropped quietly (and counted), like stale state.
 */
export const GAME_ERRORS: Readonly<Record<GameFailure | NotFound, ErrorCode>> = {
  CONSOLE_NOT_FOUND: 'ROOM_NOT_FOUND',
  STALE_GAME: 'INVALID_STATE',
  INVALID_STATE: 'INVALID_STATE',
  GAME_ALREADY_ACTIVE: 'INVALID_STATE',
  INVALID_GAME_CONFIG: 'INTERNAL_ERROR', // the server's own game table is wrong
  INVALID_TRANSITION: 'INVALID_STATE',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  INVALID_PARTICIPANTS: 'INVALID_STATE',
  INVALID_SEAT: 'INVALID_STATE',
  UNKNOWN_CONTROLLER: 'INVALID_STATE',
  TOO_MANY_PARTICIPANTS: 'INVALID_STATE',
};
