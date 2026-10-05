import { validateRoomConfig, type RoomConfig } from './config';
import type { RoomEnvironment } from './environment';
import { parseJoinCode, type JoinCode, type RoomId } from './ids';
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

export const DEFAULT_MAX_JOIN_CODE_ATTEMPTS = 10;

export interface RoomRegistryOptions {
  /** How many join-code candidates to try before giving up. Must be a positive integer. */
  readonly maxJoinCodeAttempts?: number;
}

export type CreateRoomFailure = 'INVALID_CONFIG' | 'JOIN_CODE_EXHAUSTED';
export type RegistryJoinFailure = JoinFailure | 'ROOM_NOT_FOUND';
export type RegistryTransitionFailure = TransitionFailure | 'ROOM_NOT_FOUND';

/**
 * Owns the live rooms of one process and the join-code index.
 *
 * It exists so that EVERY read-modify-write on a room happens here, inside one synchronous
 * method, and nowhere else. In a single Node process that makes check-and-update atomic (the last
 * seat can be taken once, never twice) — provided no `await` ever separates a read from a write.
 * Callers receive immutable snapshots and cannot mutate registry state. Beyond a single process
 * this becomes a distributed-coordination concern; see docs/ROOM_ENGINE.md.
 *
 * Rooms are stored until they reach CLOSED (then evicted and their join code freed). Automatic
 * expiry of abandoned rooms is a later requirement (FR-023).
 */
export class RoomRegistry {
  readonly #env: RoomEnvironment;
  readonly #maxJoinCodeAttempts: number;
  readonly #rooms = new Map<RoomId, Room>();
  readonly #roomIdByJoinCode = new Map<JoinCode, RoomId>();

  constructor(env: RoomEnvironment, options: RoomRegistryOptions = {}) {
    const attempts = options.maxJoinCodeAttempts ?? DEFAULT_MAX_JOIN_CODE_ATTEMPTS;
    if (!Number.isSafeInteger(attempts) || attempts < 1) {
      throw new Error('maxJoinCodeAttempts must be a positive integer');
    }
    this.#env = env;
    this.#maxJoinCodeAttempts = attempts;
  }

  get size(): number {
    return this.#rooms.size;
  }

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
      now: this.#env.now(),
    });
    this.#rooms.set(roomId, room);
    this.#roomIdByJoinCode.set(joinCode, roomId);
    return ok(room);
  }

  joinRoom(
    roomId: RoomId,
    displayName: string,
  ): Result<{ room: Room; player: Player }, RegistryJoinFailure> {
    const room = this.#rooms.get(roomId);
    if (room === undefined) return fail('ROOM_NOT_FOUND');
    const joined = joinRoom(room, displayName, this.#env);
    if (!joined.ok) return joined;
    this.#rooms.set(roomId, joined.value.room);
    return joined;
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

  beginStart = (roomId: RoomId) => this.#transition(roomId, beginStart);
  startPlaying = (roomId: RoomId) => this.#transition(roomId, startPlaying);
  finishGame = (roomId: RoomId) => this.#transition(roomId, finishGame);
  returnToLobby = (roomId: RoomId) => this.#transition(roomId, returnToLobby);
  closeRoom = (roomId: RoomId) => this.#transition(roomId, closeRoom);

  /** Completing the close evicts the room and frees its join code. It can never come back. */
  completeClose = (roomId: RoomId): Result<Room, RegistryTransitionFailure> => {
    const result = this.#transition(roomId, completeClose);
    if (result.ok) {
      this.#rooms.delete(roomId);
      this.#roomIdByJoinCode.delete(result.value.joinCode);
    }
    return result;
  };

  #transition(
    roomId: RoomId,
    operation: (room: Room) => Result<Room, TransitionFailure>,
  ): Result<Room, RegistryTransitionFailure> {
    const room = this.#rooms.get(roomId);
    if (room === undefined) return fail('ROOM_NOT_FOUND');
    const result = operation(room);
    if (result.ok) this.#rooms.set(roomId, result.value);
    return result;
  }

  /** Bounded: at most `maxJoinCodeAttempts` candidates are ever requested. */
  #allocateJoinCode(): JoinCode | undefined {
    for (let attempt = 0; attempt < this.#maxJoinCodeAttempts; attempt += 1) {
      const code = parseJoinCode(this.#env.nextJoinCodeCandidate());
      if (code !== undefined && !this.#roomIdByJoinCode.has(code)) return code;
    }
    return undefined;
  }
}
