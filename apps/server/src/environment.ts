import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '@foomerang/protocol';
import {
  toHostId,
  toHostToken,
  toPlayerId,
  toReconnectToken,
  toRoomId,
  type RoomEnvironment,
} from '@foomerang/room-engine';

/** 256 bits. The requirement is at least 128. */
const TOKEN_BYTES = 32;

const token = (): string => randomBytes(TOKEN_BYTES).toString('base64url');

/**
 * The production RoomEnvironment: runtime infrastructure that the pure packages deliberately do
 * not contain.
 *
 * - Identifiers: random UUIDs from the platform CSPRNG.
 * - Credentials: 256 bits from the platform CSPRNG (`crypto.randomBytes`), base64url.
 * - Join codes: candidates drawn uniformly (`crypto.randomInt`, unbiased) from the unambiguous
 *   alphabet. They are only CANDIDATES — the room engine decides availability.
 * - Time: `performance.now()`, a MONOTONIC clock measuring elapsed time since the process
 *   started. It is not a calendar timestamp; wall time must never leak into room lifecycle logic.
 */
export function createNodeEnvironment(): RoomEnvironment {
  return {
    now: () => performance.now(),
    newRoomId: () => toRoomId(randomUUID()),
    newPlayerId: () => toPlayerId(randomUUID()),
    newHostId: () => toHostId(randomUUID()),
    newReconnectToken: () => toReconnectToken(token()),
    newHostToken: () => toHostToken(token()),
    nextJoinCodeCandidate: () =>
      Array.from({ length: JOIN_CODE_LENGTH }, () =>
        JOIN_CODE_ALPHABET.charAt(randomInt(JOIN_CODE_ALPHABET.length)),
      ).join(''),
  };
}
