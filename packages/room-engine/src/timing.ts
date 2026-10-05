/**
 * Lifecycle durations. These are initial product HYPOTHESES to be tuned from real play sessions,
 * not constants of the platform — hence configuration, with defaults.
 *
 * Both are measured from the moment the transport was lost (`disconnectedAt`):
 *   elapsed >= reconnectingWindowMs  → connection status RECONNECTING → DISCONNECTED
 *   elapsed >= seatReservationMs     → the player's seat is released
 * Boundaries are inclusive of the duration: at exactly 10,000 ms the window has ended.
 */
export interface RoomTimings {
  readonly reconnectingWindowMs: number;
  readonly seatReservationMs: number;
}

export const DEFAULT_ROOM_TIMINGS: RoomTimings = Object.freeze({
  reconnectingWindowMs: 10_000,
  seatReservationMs: 60_000,
});

/** Invalid timings are a programming/configuration fault, so this throws rather than returning a Result. */
export function resolveTimings(overrides: Partial<RoomTimings> = {}): RoomTimings {
  const timings = { ...DEFAULT_ROOM_TIMINGS, ...overrides };
  const { reconnectingWindowMs, seatReservationMs } = timings;
  for (const value of [reconnectingWindowMs, seatReservationMs]) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error('Room timings must be positive integers (milliseconds)');
    }
  }
  if (seatReservationMs < reconnectingWindowMs) {
    throw new Error('seatReservationMs must not be shorter than reconnectingWindowMs');
  }
  return Object.freeze(timings);
}

/**
 * Elapsed time between two readings of the injected clock.
 *
 * Clock contract: `RoomEnvironment.now()` is MONOTONIC (non-decreasing). It measures elapsed
 * time, not calendar time: wall-clock time can jump (NTP, DST, manual changes), which would
 * wrongly release seats or hold them forever. A reading earlier than the one it is compared with
 * is a violated dependency contract, and is rejected loudly rather than turned into nonsense.
 */
export function elapsedSince(since: number, now: number): number {
  if (now < since) {
    throw new Error(
      `Clock went backwards: ${now} is earlier than ${since} (monotonic contract violated)`,
    );
  }
  return now - since;
}
