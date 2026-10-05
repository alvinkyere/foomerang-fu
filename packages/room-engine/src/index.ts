// Public API of @foomerang/room-engine. Deliberately small: test/public-api.test.ts guards it.
// All room mutation goes through RoomRegistry, which keeps read-modify-write encapsulated.
// Raw domain operations, Credential and validators stay internal.

export { DEFAULT_MAX_JOIN_CODE_ATTEMPTS, RoomRegistry } from './registry';
export type {
  CreateRoomFailure,
  RegistryDisconnectHostFailure,
  RegistryDisconnectPlayerFailure,
  RegistryJoinFailure,
  RegistryReconnectHostFailure,
  RegistryReconnectPlayerFailure,
  RegistryTransitionFailure,
  RoomRegistryOptions,
} from './registry';

export { DEFAULT_ROOM_TIMINGS } from './timing';
export type { RoomTimings } from './timing';

export { ROOM_STATES, canTransition } from './state';
export type { RoomState } from './state';

export { occupiedSeats, seatedPlayers } from './room';
export type { Connection, ConnectionStatus, Host, Membership, Player, Room } from './room';
export type { RoomConfig } from './config';
export type { RoomEnvironment } from './environment';
export type { Result } from './result';

export { parseJoinCode, toHostId, toPlayerId, toRoomId } from './ids';
export type { HostId, JoinCode, PlayerId, RoomId } from './ids';

export { toHostToken, toReconnectToken } from './credential';
export type { HostToken, ReconnectToken } from './credential';
