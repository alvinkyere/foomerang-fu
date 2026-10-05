/**
 * Fixed, numeric counters so a malfunctioning or hostile client is OBSERVABLE (silently
 * neutralizing bad input must not hide it). Counters only: never payloads, identities or
 * credentials.
 */
export const COUNTER_NAMES = [
  'connectionsAccepted',
  'connectionsRefused',
  'connectionsClosedForAbuse',
  'handshakesAccepted',
  'handshakesRejected',
  'handshakeTimeouts',
  'invalidMessages',
  'unauthorizedMessages',
  'rateLimitedMessages',
  'staleMovementDiscarded',
  'duplicateEventsDiscarded',
  'movementRouted',
  'eventsRouted',
  'inputDroppedNoHost',
  'heartbeats',
  'takeovers',
  'staleClosesIgnored',
  'internalErrors',
] as const;

export type CounterName = (typeof COUNTER_NAMES)[number];
export type DiagnosticsSnapshot = Readonly<Record<CounterName, number>>;

export class Diagnostics {
  readonly #counts = Object.fromEntries(COUNTER_NAMES.map((name) => [name, 0])) as Record<
    CounterName,
    number
  >;

  increment(name: CounterName): void {
    this.#counts[name] += 1;
  }

  /** A copy: mutating it changes nothing. */
  snapshot(): DiagnosticsSnapshot {
    return { ...this.#counts };
  }
}
