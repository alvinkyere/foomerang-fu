/**
 * Bounded deduplication of action events by `eventId`. A retried press must never apply twice,
 * and the memory spent on remembering must never grow without bound (a room can live for hours).
 *
 * Policy: remember the most recent `capacity` ids and forget the oldest first. An event retried
 * after `capacity` NEWER events have passed is treated as new; retries happen within seconds, so
 * the window only needs to outlast the retry horizon, not the room.
 */
export class BoundedEventWindow {
  readonly #capacity: number;
  readonly #seen = new Set<string>(); // a Set keeps insertion order; safe for ids like "__proto__"

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError(`capacity must be a positive integer, got ${capacity}`);
    }
    this.#capacity = capacity;
  }

  get size(): number {
    return this.#seen.size;
  }

  /** Records `eventId` and reports whether it was new. */
  record(eventId: string): 'NEW' | 'DUPLICATE' {
    if (this.#seen.has(eventId)) return 'DUPLICATE';
    this.#seen.add(eventId);
    if (this.#seen.size > this.#capacity) {
      const oldest = this.#seen.values().next();
      if (!oldest.done) this.#seen.delete(oldest.value);
    }
    return 'NEW';
  }
}
