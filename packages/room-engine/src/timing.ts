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

/**
 * Console-session durations (ADR-004). Product hypotheses, tuned from real play, hence configuration.
 *
 *   controller transport lost:  ≥ reconnectingWindowMs → DISCONNECTED; ≥ membershipReservationMs → RELEASED
 *   TV (host) transport lost:   the session closes after
 *     - unestablishedHostMs while no controller holds membership (an abandoned / never-used TV), or
 *     - hostRecoveryMs once a party exists (a TV that lost Wi-Fi must not destroy the party).
 */
export interface ConsoleTimings {
  readonly reconnectingWindowMs: number;
  readonly membershipReservationMs: number;
  readonly unestablishedHostMs: number;
  readonly hostRecoveryMs: number;
}

export const DEFAULT_CONSOLE_TIMINGS: ConsoleTimings = Object.freeze({
  reconnectingWindowMs: 10_000,
  membershipReservationMs: 60_000,
  unestablishedHostMs: 600_000,
  hostRecoveryMs: 1_800_000,
});

/** Invalid timings are a configuration fault, so this throws rather than returning a Result. */
export function resolveConsoleTimings(overrides: Partial<ConsoleTimings> = {}): ConsoleTimings {
  const timings = { ...DEFAULT_CONSOLE_TIMINGS, ...overrides };
  for (const value of Object.values(timings)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error('Console timings must be positive integers (milliseconds)');
    }
  }
  if (timings.membershipReservationMs < timings.reconnectingWindowMs) {
    throw new Error('membershipReservationMs must not be shorter than reconnectingWindowMs');
  }
  if (timings.hostRecoveryMs < timings.unestablishedHostMs) {
    throw new Error('hostRecoveryMs must not be shorter than unestablishedHostMs');
  }
  return Object.freeze(timings);
}
