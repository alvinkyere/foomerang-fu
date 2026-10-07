import { validateRoomConfig, type RoomConfig } from './config';
import type { RoomEnvironment } from './environment';
import { parseJoinCode, type JoinCode, type PlayerId, type RoomId } from './ids';
import {
  disconnectHost,
  disconnectPlayer,
  reconcile,
  reconnectHost,
  reconnectPlayer,
  type DisconnectFailure,
  type HostDisconnectFailure,
  type HostReconnectFailure,
  type ReconnectFailure,
} from './lifecycle';
import { JoinCodeSpace } from './joinCodes';
import { fail, ok, type Result } from './result';
import {
  beginStart,
  closeRoom,
  completeClose,
  createRoom,
  finishGame,
  identifyPlayer,
  isHost,
  joinRoom,
  returnToLobby,
  startPlaying,
  type JoinFailure,
  type Player,
  type Room,
  type TransitionFailure,
} from './room';
import { resolveTimings, type RoomTimings } from './timing';

export const DEFAULT_MAX_JOIN_CODE_ATTEMPTS = 10;

export interface RoomRegistryOptions {
  /** How many join-code candidates to try before giving up. Must be a positive integer. */
  readonly maxJoinCodeAttempts?: number;
  /** Overrides for the reconnecting window / seat reservation (see DEFAULT_ROOM_TIMINGS). */
  readonly timings?: Partial<RoomTimings>;
  /** The codes in use, shared with the console registry while both exist. Default: its own. */
  readonly joinCodes?: JoinCodeSpace;
}

export type CreateRoomFailure = 'INVALID_CONFIG' | 'JOIN_CODE_EXHAUSTED';
export type RegistryJoinFailure = JoinFailure | 'ROOM_NOT_FOUND';
export type RegistryTransitionFailure = TransitionFailure | 'ROOM_NOT_FOUND';
export type RegistryDisconnectPlayerFailure = DisconnectFailure | 'ROOM_NOT_FOUND';
export type RegistryReconnectPlayerFailure = ReconnectFailure | 'ROOM_NOT_FOUND';
export type RegistryDisconnectHostFailure = HostDisconnectFailure | 'ROOM_NOT_FOUND';
export type RegistryReconnectHostFailure = HostReconnectFailure | 'ROOM_NOT_FOUND';

/**
 * Owns the live rooms of one process and the join-code index.
 *
 * It exists so that EVERY read-modify-write on a room happens here, inside one synchronous
 * method, and nowhere else. In a single Node process that makes check-and-update atomic (the last
 * seat can be taken once, never twice) — provided no `await` ever separates a read from a write.
 * Callers receive immutable snapshots and cannot mutate registry state. Beyond a single process
 * this becomes a distributed-coordination concern; see docs/ROOM_ENGINE.md.
 *
 * TIME. The registry never schedules anything. Each operation reads the injected monotonic clock
 * ONCE, brings the target room up to date with that instant (`reconcile`), then applies the
 * operation to the up-to-date room. Correctness therefore does not depend on how often the
 * server calls `reconcile()`; the sweep only makes status changes visible sooner. A reading
 * earlier than a previous one violates the clock contract and throws before anything changes.
 *
 * ATOMICITY. A room is committed only if the operation SUCCEEDS. A failed operation commits
 * nothing — not even the passage of time — so the stored room stays reference-identical.
 *
 * Rooms are stored until they reach CLOSED (then evicted and their join code freed). Automatic
 * expiry of abandoned rooms is a later requirement (FR-023).
 */
export class RoomRegistry {
  readonly #env: RoomEnvironment;
  readonly #maxJoinCodeAttempts: number;
  readonly #timings: RoomTimings;
  readonly #rooms = new Map<RoomId, Room>();
  readonly #roomIdByJoinCode = new Map<JoinCode, RoomId>();
  readonly #codes: JoinCodeSpace;
  #lastNow = Number.NEGATIVE_INFINITY;

  constructor(env: RoomEnvironment, options: RoomRegistryOptions = {}) {
    const attempts = options.maxJoinCodeAttempts ?? DEFAULT_MAX_JOIN_CODE_ATTEMPTS;
    if (!Number.isSafeInteger(attempts) || attempts < 1) {
      throw new Error('maxJoinCodeAttempts must be a positive integer');
    }
    this.#env = env;
    this.#maxJoinCodeAttempts = attempts;
    this.#timings = resolveTimings(options.timings);
    this.#codes = options.joinCodes ?? new JoinCodeSpace();
  }

  get size(): number {
    return this.#rooms.size;
  }

  /** A plain read of the last committed state; it does not advance time. */
  getRoom(roomId: RoomId): Room | undefined {
    return this.#rooms.get(roomId);
  }

  /** Accepts raw user input (any case). Malformed or unknown codes simply find nothing. */
  findByJoinCode(input: string): Room | undefined {
    const code = parseJoinCode(input);
    const roomId = code === undefined ? undefined : this.#roomIdByJoinCode.get(code);
    return roomId === undefined ? undefined : this.#rooms.get(roomId);
  }

  createRoom(config: RoomConfig): Result<Room, CreateRoomFailure> {
    const validConfig = validateRoomConfig(config);
    if (validConfig === undefined) return fail('INVALID_CONFIG');

    // Allocate the join code FIRST and bounded, before drawing any other id: a failed creation
    // leaves no trace.
    const joinCode = this.#allocateJoinCode();
    if (joinCode === undefined) return fail('JOIN_CODE_EXHAUSTED');

    const roomId = this.#env.newRoomId();
    if (this.#rooms.has(roomId)) {
      throw new Error('RoomEnvironment produced a RoomId already in use');
    }
    const room = createRoom({
      roomId,
      joinCode,
      config: validConfig,
      host: { hostId: this.#env.newHostId(), hostToken: this.#env.newHostToken() },
      now: this.#now(),
    });
    this.#rooms.set(roomId, room);
    this.#roomIdByJoinCode.set(joinCode, roomId);
    return ok(room);
  }

  joinRoom(
    roomId: RoomId,
    displayName: string,
  ): Result<{ room: Room; player: Player }, RegistryJoinFailure> {
    return this.#apply(
      roomId,
      (room, now) => joinRoom(room, displayName, now, this.#env),
      (value) => value.room,
    );
  }

  joinByCode(
    joinCode: string,
    displayName: string,
  ): Result<{ room: Room; player: Player }, RegistryJoinFailure> {
    const room = this.findByJoinCode(joinCode);
    return room === undefined ? fail('ROOM_NOT_FOUND') : this.joinRoom(room.roomId, displayName);
  }

  identifyPlayer(roomId: RoomId, candidate: string): Player | undefined {
    const room = this.#rooms.get(roomId);
    return room === undefined ? undefined : identifyPlayer(room, candidate);
  }

  isHost(roomId: RoomId, candidate: string): boolean {
    const room = this.#rooms.get(roomId);
    return room !== undefined && isHost(room, candidate);
  }

  // --- connection lifecycle -------------------------------------------------------------

  /** The server noticed this player's transport is gone. */
  disconnectPlayer(
    roomId: RoomId,
    playerId: PlayerId,
  ): Result<Room, RegistryDisconnectPlayerFailure> {
    return this.#apply(
      roomId,
      (room, now) => disconnectPlayer(room, playerId, now),
      (room) => room,
    );
  }

  /**
   * Same player, new transport. Rotates the credential. If `replacedActiveConnection` is true the
   * server transport layer MUST drop the stale connection and ignore its late close event
   * (otherwise that event would mark the freshly reconnected player as disconnected).
   */
  reconnectPlayer(
    roomId: RoomId,
    candidate: string,
  ): Result<
    { room: Room; player: Player; replacedActiveConnection: boolean },
    RegistryReconnectPlayerFailure
  > {
    return this.#apply(
      roomId,
      (room) => reconnectPlayer(room, candidate, this.#env),
      (value) => value.room,
    );
  }

  /** The host's transport is gone. Does not close the room or affect any player's seat. */
  disconnectHost(roomId: RoomId): Result<Room, RegistryDisconnectHostFailure> {
    return this.#apply(
      roomId,
      (room, now) => disconnectHost(room, now),
      (room) => room,
    );
  }

  reconnectHost(
    roomId: RoomId,
    candidate: string,
  ): Result<{ room: Room; replacedActiveConnection: boolean }, RegistryReconnectHostFailure> {
    return this.#apply(
      roomId,
      (room) => reconnectHost(room, candidate, this.#env),
      (value) => value.room,
    );
  }

  /**
   * The sweep: advances every room to the present instant and returns the rooms that changed
   * (so the server can broadcast). The server decides how often to call this; correctness of
   * the other operations does not depend on it.
   */
  reconcile(): readonly Room[] {
    const now = this.#now();
    const changed: Room[] = [];
    for (const [roomId, room] of this.#rooms) {
      const current = reconcile(room, now, this.#timings);
      if (current !== room) {
        this.#rooms.set(roomId, current);
        changed.push(current);
      }
    }
    return changed;
  }

  // --- room lifecycle ---------------------------------------------------------------------

  beginStart = (roomId: RoomId) =>
    this.#apply(
      roomId,
      (room) => beginStart(room),
      (room) => room,
    );
  startPlaying = (roomId: RoomId) =>
    this.#apply(
      roomId,
      (room) => startPlaying(room),
      (room) => room,
    );
  finishGame = (roomId: RoomId) =>
    this.#apply(
      roomId,
      (room) => finishGame(room),
      (room) => room,
    );
  returnToLobby = (roomId: RoomId) =>
    this.#apply(
      roomId,
      (room) => returnToLobby(room),
      (room) => room,
    );
  closeRoom = (roomId: RoomId) =>
    this.#apply(
      roomId,
      (room) => closeRoom(room),
      (room) => room,
    );

  /** Completing the close evicts the room and frees its join code. It can never come back. */
  completeClose = (roomId: RoomId): Result<Room, RegistryTransitionFailure> => {
    const result = this.#apply(
      roomId,
      (room) => completeClose(room),
      (room) => room,
    );
    if (result.ok) {
      this.#rooms.delete(roomId);
      this.#roomIdByJoinCode.delete(result.value.joinCode);
      this.#codes.release(result.value.joinCode);
    }
    return result;
  };

  // --- internals ----------------------------------------------------------------------------

  /** The single clock read for an operation; enforces the monotonic contract before anything changes. */
  #now(): number {
    const now = this.#env.now();
    if (!(now >= this.#lastNow)) {
      // `!(a >= b)` also rejects NaN.
      throw new Error(`Clock went backwards or is not a number: ${now} after ${this.#lastNow}`);
    }
    this.#lastNow = now;
    return now;
  }

  /**
   * Read → reconcile to `now` → run the operation → commit ONLY on success.
   * Synchronous throughout, so the whole sequence is atomic within a process.
   */
  #apply<TValue, TFailure extends string>(
    roomId: RoomId,
    run: (room: Room, now: number) => Result<TValue, TFailure>,
    roomOf: (value: TValue) => Room,
  ): Result<TValue, TFailure | 'ROOM_NOT_FOUND'> {
    const stored = this.#rooms.get(roomId);
    if (stored === undefined) return fail('ROOM_NOT_FOUND');
    const now = this.#now();
    const result = run(reconcile(stored, now, this.#timings), now);
    if (result.ok) this.#rooms.set(roomId, roomOf(result.value));
    return result;
  }

  /** Bounded: at most `maxJoinCodeAttempts` candidates are ever requested. */
  #allocateJoinCode(): JoinCode | undefined {
    for (let attempt = 0; attempt < this.#maxJoinCodeAttempts; attempt += 1) {
      const code = parseJoinCode(this.#env.nextJoinCodeCandidate());
      if (code !== undefined && this.#codes.claim(code)) return code;
    }
    return undefined;
  }
}
