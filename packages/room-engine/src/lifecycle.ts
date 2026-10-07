import type { RoomEnvironment } from './environment';
import type { PlayerId } from './ids';
import { reconcileConnection, reconcileMember } from './member';
import { fail, ok, type Result } from './result';
import {
  CONNECTED,
  assertFreshCredential,
  identifyPlayer,
  isHost,
  type Host,
  type Player,
  type Room,
} from './room';
import { elapsedSince, type RoomTimings } from './timing';

/**
 * Connection / seat lifecycle. Deterministic and timer-free: nothing here schedules anything or
 * reads a clock. Operations are evaluated against an injected, monotonic `now`; the server decides
 * WHEN to ask the domain to reconcile.
 */

function reconcilePlayer(player: Player, now: number, timings: RoomTimings): Player {
  return reconcileMember(player, now, {
    reconnectingWindowMs: timings.reconnectingWindowMs,
    reservationMs: timings.seatReservationMs,
  });
}

function reconcileHost(host: Host, now: number, timings: RoomTimings): Host {
  const settled = reconcileConnection(host.connection, now, timings.reconnectingWindowMs);
  if (settled === undefined || settled.connection === host.connection) return host;
  // The host holds no seat: only its connection status progresses. Players are never affected.
  return Object.freeze({ ...host, connection: settled.connection });
}

/**
 * Brings every time-driven status up to date as of `now`. Idempotent, and returns the SAME room
 * reference when nothing changed, so callers can detect change by identity. Throws if `now` is
 * earlier than a recorded disconnect (violated monotonic-clock contract) before changing anything.
 */
export function reconcile(room: Room, now: number, timings: RoomTimings): Room {
  const players = room.players.map((player) => reconcilePlayer(player, now, timings));
  const host = reconcileHost(room.host, now, timings);
  const playersChanged = players.some((player, index) => player !== room.players[index]);
  if (!playersChanged && host === room.host) return room;
  return Object.freeze({
    ...room,
    host,
    players: playersChanged ? Object.freeze(players) : room.players,
  });
}

export type DisconnectFailure = 'PLAYER_NOT_FOUND' | 'ALREADY_DISCONNECTED';

/**
 * The server noticed this player's transport is gone. Starts the reconnecting clock at `now`.
 * A repeated notification does NOT restart the clock (that would extend the seat hold).
 */
export function disconnectPlayer(
  room: Room,
  playerId: PlayerId,
  now: number,
): Result<Room, DisconnectFailure> {
  const index = room.players.findIndex((player) => player.playerId === playerId);
  const player = room.players[index];
  if (player === undefined) return fail('PLAYER_NOT_FOUND');
  elapsedSince(player.joinedAt, now); // a clock earlier than the join is a violated contract
  if (player.connection.status !== 'CONNECTED') return fail('ALREADY_DISCONNECTED');

  const dropped: Player = Object.freeze({
    ...player,
    connection: Object.freeze({ status: 'RECONNECTING', disconnectedAt: now }),
  });
  const players = Object.freeze(room.players.map((p, i) => (i === index ? dropped : p)));
  return ok(Object.freeze({ ...room, players }));
}

export type ReconnectFailure = 'INVALID_CREDENTIAL' | 'SEAT_RELEASED' | 'ROOM_CLOSING';

/**
 * A player presents their reconnect credential on a NEW transport connection.
 * Precondition: `room` has been reconciled as of the present moment (the registry guarantees it),
 * so a seat that has expired is already RELEASED.
 *
 * - Restores the SAME player (identity, name, join time, position): never a new PlayerId.
 * - ROTATES the credential: the one just used stops working; the player receives a new one.
 * - Takeover: if the player is still CONNECTED, the credential still wins, and
 *   `replacedActiveConnection` tells the server it must drop the stale transport. The domain
 *   guarantees one PlayerId ↔ at most one active controller; enforcing it on sockets is the
 *   server transport layer's job.
 * - The credential is checked first, so nothing about a room is revealed to a stranger.
 * - Any failure changes nothing and issues no credential.
 */
export function reconnectPlayer(
  room: Room,
  candidate: string,
  env: RoomEnvironment,
): Result<{ room: Room; player: Player; replacedActiveConnection: boolean }, ReconnectFailure> {
  const current = identifyPlayer(room, candidate);
  if (current === undefined) return fail('INVALID_CREDENTIAL');
  if (current.membership.status === 'RELEASED') return fail('SEAT_RELEASED');
  if (room.state === 'CLOSING' || room.state === 'CLOSED') return fail('ROOM_CLOSING');

  const reconnectToken = env.newReconnectToken();
  assertFreshCredential(room, reconnectToken.reveal());

  const player: Player = Object.freeze({ ...current, reconnectToken, connection: CONNECTED });
  const players = Object.freeze(room.players.map((p) => (p === current ? player : p)));
  return ok({
    room: Object.freeze({ ...room, players }),
    player,
    replacedActiveConnection: current.connection.status === 'CONNECTED',
  });
}

export type HostDisconnectFailure = 'ALREADY_DISCONNECTED';
export type HostReconnectFailure = 'INVALID_CREDENTIAL' | 'ROOM_CLOSING';

/**
 * The host's transport is gone. Only the host's connection status is affected: the room stays,
 * player seats are untouched, the host is not replaced or migrated, nothing closes. What a lost
 * host MEANS for a running match is a later product policy (see docs/ARCHITECTURE.md risks).
 */
export function disconnectHost(room: Room, now: number): Result<Room, HostDisconnectFailure> {
  elapsedSince(room.createdAt, now);
  if (room.host.connection.status !== 'CONNECTED') return fail('ALREADY_DISCONNECTED');
  const host: Host = Object.freeze({
    ...room.host,
    connection: Object.freeze({ status: 'RECONNECTING', disconnectedAt: now }),
  });
  return ok(Object.freeze({ ...room, host }));
}

/** Same rules as `reconnectPlayer`, for the host: same HostId, credential rotates, takeover reported. */
export function reconnectHost(
  room: Room,
  candidate: string,
  env: RoomEnvironment,
): Result<{ room: Room; replacedActiveConnection: boolean }, HostReconnectFailure> {
  if (!isHost(room, candidate)) return fail('INVALID_CREDENTIAL');
  if (room.state === 'CLOSING' || room.state === 'CLOSED') return fail('ROOM_CLOSING');

  const hostToken = env.newHostToken();
  assertFreshCredential(room, hostToken.reveal());

  const host: Host = Object.freeze({ ...room.host, hostToken, connection: CONNECTED });
  return ok({
    room: Object.freeze({ ...room, host }),
    replacedActiveConnection: room.host.connection.status === 'CONNECTED',
  });
}
