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

export { DEFAULT_CONSOLE_TIMINGS, DEFAULT_ROOM_TIMINGS } from './timing';
export type { ConsoleTimings, RoomTimings } from './timing';

// Console sessions (ADR-004, Checkpoint C). Mutation only through ConsoleRegistry; the queries are
// pure reads of a session snapshot.
export { ConsoleRegistry } from './consoleRegistry';
export type { ConsoleRegistryOptions } from './consoleRegistry';
export {
  DEFAULT_MAX_CONTROLLERS,
  effectiveContext,
  heldControllers,
  mayPause,
  participationOf,
} from './console';
export type {
  CloseFailure,
  ConsoleCloseReason,
  ConsoleContext,
  ConsoleJoinFailure,
  ConsoleSession,
  ConsoleState,
  Controller,
  ControllerFailure,
  ControllerReconnectFailure,
  GameConfig,
  GameFailure,
  GameSession,
  GameState,
  HostFailure,
  ReleaseReason,
} from './console';
export { JoinCodeSpace } from './joinCodes';

export { ROOM_STATES, canTransition } from './state';
export type { RoomState } from './state';

export { occupiedSeats, seatedPlayers } from './room';
export type { Connection, ConnectionStatus, Host, Membership, Player, Room } from './room';
export type { RoomConfig } from './config';
export type { ConsoleEnvironment, RoomEnvironment } from './environment';
export type { Result } from './result';

export {
  parseJoinCode,
  toConsoleId,
  toControllerId,
  toGameSessionId,
  toHostId,
  toPlayerId,
  toRoomId,
} from './ids';
export type {
  ConsoleId,
  ControllerId,
  GameSessionId,
  HostId,
  JoinCode,
  PlayerId,
  RoomId,
} from './ids';

export { toHostToken, toReconnectToken } from './credential';
export type { HostToken, ReconnectToken } from './credential';
