import type { ErrorCode } from '@foomerang/protocol';
import type {
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
