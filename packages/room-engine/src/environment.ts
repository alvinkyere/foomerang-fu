import type { HostToken, ReconnectToken } from './credential';
import type { HostId, PlayerId, RoomId } from './ids';

/**
 * Everything nondeterministic the room engine needs, injected. Pure code may not read the clock,
 * generate randomness or call crypto itself. Production implementations (CSPRNG-backed, tokens of
 * at least 128 bits) live in the server; tests use deterministic fakes.
 *
 * Generators must return values unique within their scope. A generator that repeats an id is a
 * system fault, and the engine throws rather than corrupting state.
 */
export interface RoomEnvironment {
  /** Milliseconds; only ever compared with other values from the same clock. */
  now(): number;
  newRoomId(): RoomId;
  newPlayerId(): PlayerId;
  newHostId(): HostId;
  newReconnectToken(): ReconnectToken;
  newHostToken(): HostToken;
  /**
   * A *candidate* join code. The engine decides whether it is valid and available; collisions
   * are handled by asking again, a bounded number of times (see RoomRegistry).
   */
  nextJoinCodeCandidate(): string;
}
