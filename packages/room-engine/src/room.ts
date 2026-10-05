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

/**
 * CONNECTION answers: "can we currently communicate with this controller?"
 * `disconnectedAt` exists only while not connected (a discriminated union, so it cannot be
 * read from a connected player).
 */
export type Connection =
  | { readonly status: 'CONNECTED' }
  | { readonly status: 'RECONNECTING' | 'DISCONNECTED'; readonly disconnectedAt: number };

/**
 * MEMBERSHIP answers: "does this participant still own one of the room's player seats?"
 * Independent of connection: a DISCONNECTED player whose seat is HELD still occupies capacity.
 * RELEASED is permanent and does NOT erase the participant — the record remains in
 * `room.players` (match history is a later concern; seat lifecycle ≠ participant lifecycle).
 *
 * Invariants (tested over arbitrary operation sequences): CONNECTED ⇒ HELD; RELEASED ⇒ DISCONNECTED.
 * Two independent facts, never combined states like DISCONNECTED_RESERVED.
 */
export type Membership =
  { readonly status: 'HELD' } | { readonly status: 'RELEASED'; readonly releasedAt: number };

export const CONNECTED: Connection = Object.freeze({ status: 'CONNECTED' });
export const HELD: Membership = Object.freeze({ status: 'HELD' });

/** The host consumes no seat, so it has a connection but no membership. */
export interface Host {
  readonly hostId: HostId;
  /** Credential: redacts itself everywhere except an explicit `reveal()`. Rotates on reconnect. */
  readonly hostToken: HostToken;
  readonly connection: Connection;
}

export interface Player {
  // identity
  readonly playerId: PlayerId;
  readonly displayName: string;
  /** Credential: redacts itself everywhere except an explicit `reveal()`. Rotates on reconnect. */
  readonly reconnectToken: ReconnectToken;
  readonly joinedAt: number;
  // connection
  readonly connection: Connection;
  // membership
  readonly membership: Membership;
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
  host: Pick<Host, 'hostId' | 'hostToken'>;
  now: number;
}): Room {
  return Object.freeze({
    roomId: params.roomId,
    joinCode: params.joinCode,
    state: 'LOBBY',
    config: Object.freeze({ ...params.config }),
    host: Object.freeze({ ...params.host, connection: CONNECTED }),
    players: Object.freeze([]),
    createdAt: params.now,
  });
}

/** Players who currently hold a seat (membership HELD), whatever their connection status. */
export function seatedPlayers(room: Room): readonly Player[] {
  return room.players.filter((player) => player.membership.status === 'HELD');
}

/**
 * THE definition of occupancy, used for capacity everywhere: a seat is occupied while the
 * player's membership is held, regardless of whether their transport is currently connected.
 */
export function occupiedSeats(room: Room): number {
  return seatedPlayers(room).length;
}

/** Defense in depth: a duplicate credential would let one player claim another's identity. */
export function assertFreshCredential(room: Room, candidate: string): void {
  if (
    room.host.hostToken.equals(candidate) ||
    room.players.some((p) => p.reconnectToken.equals(candidate))
  ) {
    throw new Error('RoomEnvironment produced a credential already in use in this room');
  }
}

/**
 * Checks, in order: joinable state, display name, capacity — all BEFORE touching the environment,
 * so a failed join consumes no ids, credentials or capacity.
 */
export function joinRoom(
  room: Room,
  displayName: string,
  now: number,
  env: RoomEnvironment,
): Result<{ room: Room; player: Player }, JoinFailure> {
  if (room.state !== 'LOBBY') return fail('ROOM_NOT_JOINABLE');
  const name = validateDisplayName(displayName);
  if (name === undefined) return fail('INVALID_DISPLAY_NAME');
  if (occupiedSeats(room) >= room.config.maxPlayers) return fail('ROOM_FULL');

  const playerId = env.newPlayerId();
  if (room.players.some((existing) => existing.playerId === playerId)) {
    throw new Error('RoomEnvironment produced a PlayerId already in use in this room');
  }
  const reconnectToken = env.newReconnectToken();
  assertFreshCredential(room, reconnectToken.reveal());
  const player: Player = Object.freeze({
    playerId,
    displayName: name,
    reconnectToken,
    joinedAt: now,
    connection: CONNECTED,
    membership: HELD,
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
  // Only players who can actually play count: a seat-holder who is reconnecting cannot.
  const ready = room.players.filter(
    (p) => p.membership.status === 'HELD' && p.connection.status === 'CONNECTED',
  );
  if (ready.length < room.config.minPlayers) return fail('NOT_ENOUGH_PLAYERS');
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
