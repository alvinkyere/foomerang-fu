import type { RoomConfig } from './config';
import type { HostToken, ReconnectToken } from './credential';
import { validateDisplayName } from './displayName';
import type { RoomEnvironment } from './environment';
import type { HostId, JoinCode, PlayerId, RoomId } from './ids';
import { fail, ok, type Result } from './result';
import { canTransition, type RoomState } from './state';

/**
 * The room/session domain model (docs/ROOM_ENGINE.md).
 *
 * A room is NOT a connection. Nothing here references a socket: the server's session layer maps
 * connections to (room, player | host). Rooms are immutable values; every operation returns a new
 * room or a failure, so a failed operation cannot partially mutate state.
 */

export type ConnectionStatus = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

export interface Host {
  readonly hostId: HostId;
  /** Credential: redacts itself everywhere except an explicit `reveal()`. */
  readonly hostToken: HostToken;
}

export interface Player {
  readonly playerId: PlayerId;
  readonly displayName: string;
  /** Credential: redacts itself everywhere except an explicit `reveal()`. */
  readonly reconnectToken: ReconnectToken;
  readonly connectionStatus: ConnectionStatus;
  readonly joinedAt: number;
}

export interface Room {
  readonly roomId: RoomId;
  readonly joinCode: JoinCode;
  readonly state: RoomState;
  readonly config: RoomConfig;
  readonly host: Host;
  readonly players: readonly Player[];
  readonly createdAt: number;
}

export type JoinFailure = 'ROOM_NOT_JOINABLE' | 'INVALID_DISPLAY_NAME' | 'ROOM_FULL';
export type TransitionFailure = 'INVALID_TRANSITION' | 'NOT_ENOUGH_PLAYERS';

export function createRoom(params: {
  roomId: RoomId;
  joinCode: JoinCode;
  config: RoomConfig;
  host: Host;
  now: number;
}): Room {
  return Object.freeze({
    roomId: params.roomId,
    joinCode: params.joinCode,
    state: 'LOBBY',
    config: Object.freeze({ ...params.config }),
    host: Object.freeze({ ...params.host }),
    players: Object.freeze([]),
    createdAt: params.now,
  });
}

/**
 * Checks, in order: joinable state, display name, capacity — all BEFORE touching the environment,
 * so a failed join consumes no ids, credentials or capacity.
 */
export function joinRoom(
  room: Room,
  displayName: string,
  env: RoomEnvironment,
): Result<{ room: Room; player: Player }, JoinFailure> {
  if (room.state !== 'LOBBY') return fail('ROOM_NOT_JOINABLE');
  const name = validateDisplayName(displayName);
  if (name === undefined) return fail('INVALID_DISPLAY_NAME');
  if (room.players.length >= room.config.maxPlayers) return fail('ROOM_FULL');

  const playerId = env.newPlayerId();
  if (room.players.some((existing) => existing.playerId === playerId)) {
    throw new Error('RoomEnvironment produced a PlayerId already in use in this room');
  }
  const player: Player = Object.freeze({
    playerId,
    displayName: name,
    reconnectToken: env.newReconnectToken(),
    connectionStatus: 'CONNECTED',
    joinedAt: env.now(),
  });
  const next: Room = Object.freeze({
    ...room,
    players: Object.freeze([...room.players, player]),
  });
  return ok({ room: next, player });
}

/** The only place a room's state changes. Callers use the named operations below. */
function moveTo(room: Room, to: RoomState): Result<Room, TransitionFailure> {
  if (!canTransition(room.state, to)) return fail('INVALID_TRANSITION');
  return ok(Object.freeze({ ...room, state: to }));
}

export function beginStart(room: Room): Result<Room, TransitionFailure> {
  if (!canTransition(room.state, 'STARTING')) return fail('INVALID_TRANSITION');
  if (room.players.length < room.config.minPlayers) return fail('NOT_ENOUGH_PLAYERS');
  return moveTo(room, 'STARTING');
}
export const startPlaying = (room: Room) => moveTo(room, 'PLAYING');
export const finishGame = (room: Room) => moveTo(room, 'RESULTS');
export const returnToLobby = (room: Room) => moveTo(room, 'LOBBY');
export const closeRoom = (room: Room) => moveTo(room, 'CLOSING');
export const completeClose = (room: Room) => moveTo(room, 'CLOSED');

/**
 * Which player does this credential belong to? Compares against every player (no early exit)
 * in constant time per comparison. Wrong or empty credentials identify nobody.
 */
export function identifyPlayer(room: Room, candidate: string): Player | undefined {
  let match: Player | undefined;
  for (const player of room.players) {
    if (player.reconnectToken.equals(candidate)) match = player;
  }
  return match;
}

export function isHost(room: Room, candidate: string): boolean {
  return room.host.hostToken.equals(candidate);
}
