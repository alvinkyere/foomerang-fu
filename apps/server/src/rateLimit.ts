/**
 * Per-connection abuse protection. Every inbound message is CLASSIFIED (cheaply, before parsing)
 * and charged against a token bucket for its class, so one broken or hostile controller cannot
 * monopolize the process. Time is injected (the server's monotonic clock).
 */

export interface BucketConfig {
  /** Largest burst accepted at once. */
  readonly burst: number;
  /** Sustained rate. */
  readonly refillPerSecond: number;
}

/**
 * Token bucket in milli-tokens, so integer-millisecond inputs refill with exact arithmetic.
 * A reading that is not later than the previous one never refills (and never throws).
 */
export class TokenBucket {
  readonly #capacity: number;
  readonly #refillPerSecond: number;
  #milliTokens: number;
  #last: number | undefined;

  constructor(config: BucketConfig) {
    this.#capacity = config.burst * 1000;
    this.#refillPerSecond = config.refillPerSecond;
    this.#milliTokens = this.#capacity;
  }

  tryTake(nowMs: number): boolean {
    if (this.#last === undefined) {
      this.#last = nowMs;
    } else if (nowMs > this.#last) {
      this.#milliTokens = Math.min(
        this.#capacity,
        this.#milliTokens + (nowMs - this.#last) * this.#refillPerSecond,
      );
      this.#last = nowMs;
    }
    if (this.#milliTokens < 1000) return false;
    this.#milliTokens -= 1000;
    return true;
  }
}

export type MessageClass = 'handshake' | 'room' | 'movement' | 'action' | 'heartbeat' | 'other';

export interface RateLimits {
  readonly handshake: BucketConfig;
  /** ROOM_CREATE / ROOM_JOIN / PLAYER_RECONNECT / HOST_RECONNECT. */
  readonly room: BucketConfig;
  readonly movement: BucketConfig;
  readonly action: BucketConfig;
  readonly heartbeat: BucketConfig;
  /** Unknown or malformed messages. */
  readonly other: BucketConfig;
  /** A connection that has had this many messages dropped for rate limiting is disconnected. */
  readonly maxDroppedMessages: number;
  /** A connection that has sent this many invalid messages is disconnected. */
  readonly maxInvalidMessages: number;
}

/**
 * Initial, configurable defaults — to be tuned from measurement, not truth. Movement allows
 * 120 msg/s sustained (a 60 Hz controller uses half) and a 4-second burst (240) for Wi-Fi
 * pile-ups, so legitimate traffic is never touched while a runaway client is cut off almost
 * immediately.
 */
export const DEFAULT_RATE_LIMITS: RateLimits = Object.freeze({
  handshake: { burst: 3, refillPerSecond: 1 },
  room: { burst: 5, refillPerSecond: 1 },
  movement: { burst: 240, refillPerSecond: 120 },
  action: { burst: 60, refillPerSecond: 30 },
  heartbeat: { burst: 10, refillPerSecond: 5 },
  other: { burst: 20, refillPerSecond: 5 },
  maxDroppedMessages: 1000,
  maxInvalidMessages: 50,
});

const CLASS_BY_TYPE: Readonly<Record<string, MessageClass>> = Object.freeze({
  HANDSHAKE: 'handshake',
  ROOM_CREATE: 'room',
  ROOM_JOIN: 'room',
  PLAYER_RECONNECT: 'room',
  HOST_RECONNECT: 'room',
  MATCH_START: 'room',
  MATCH_END: 'room',
  INPUT_MOVE: 'movement',
  INPUT_EVENT: 'action',
  HEARTBEAT: 'heartbeat',
});

/** Decides the bucket from UNTRUSTED data without parsing it fully, and without ever throwing. */
export function classifyMessage(raw: unknown): MessageClass {
  try {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'other';
    const type = (raw as { type?: unknown }).type;
    if (typeof type !== 'string') return 'other';
    return Object.hasOwn(CLASS_BY_TYPE, type) ? (CLASS_BY_TYPE[type] ?? 'other') : 'other';
  } catch {
    return 'other';
  }
}
