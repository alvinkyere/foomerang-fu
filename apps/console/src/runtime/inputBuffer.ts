import type { InputFrame } from '@foomerang/game-core';

export interface LatencyStats {
  readonly samples: number;
  readonly lastMs: number | undefined;
  readonly meanMs: number | undefined;
  readonly maxMs: number | undefined;
}

interface Entry {
  x: number;
  y: number;
  receivedAt: number;
  /** Has the simulation used this message yet? (for the receive → step measurement) */
  consumed: boolean;
  /** Already reported as having gone stale? (so it is counted once, not once per step) */
  staleCounted: boolean;
}

/**
 * The console's view of "what is each thumb doing right now": the LATEST movement per player,
 * held until replaced, so every simulation step has an input for every player.
 *
 * It is allowed to repeat the latest state (game-core itself treats a missing input as neutral),
 * but it must never let a character run forever because a release was lost. So movement that has
 * not been refreshed within `freshnessMs` (default 500 ms; the controller refreshes every 250 ms)
 * becomes NEUTRAL. That is purely an input decision: it never disconnects anybody — connection
 * and session status are a separate concern.
 *
 * All times are the HOST's own monotonic clock; nothing here compares clocks of two devices.
 */
export class InputBuffer {
  readonly #freshnessMs: number;
  readonly #entries = new Map<string, Entry>();
  #staleNeutralizations = 0;
  #samples = 0;
  #sumMs = 0;
  #lastMs: number | undefined;
  #maxMs: number | undefined;

  constructor(options: { readonly freshnessMs?: number } = {}) {
    this.#freshnessMs = options.freshnessMs ?? 500;
    if (!Number.isFinite(this.#freshnessMs) || this.#freshnessMs <= 0) {
      throw new RangeError('freshnessMs must be a positive, finite number');
    }
  }

  /** Times a non-neutral movement went stale and was neutralized. */
  get staleNeutralizations(): number {
    return this.#staleNeutralizations;
  }

  receive(playerId: string, x: number, y: number, nowMs: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.#entries.set(playerId, { x, y, receivedAt: nowMs, consumed: false, staleCounted: false });
  }

  /** Forget every thumb: after this, everybody reads as neutral until they move again. */
  clear(): void {
    this.#entries.clear();
  }

  forget(playerId: string): void {
    this.#entries.delete(playerId);
  }

  /**
   * The input frame for one simulation step at host time `nowMs`. Players who are not `isActive`
   * (reconnecting, away) are neutral immediately; stale movement is neutral and counted.
   */
  frame(nowMs: number, isActive: (playerId: string) => boolean = () => true): InputFrame {
    const frame = new Map<string, { x: number; y: number }>();
    for (const [playerId, entry] of this.#entries) {
      if (!isActive(playerId)) continue;
      if (nowMs - entry.receivedAt >= this.#freshnessMs) {
        if (!entry.staleCounted && (entry.x !== 0 || entry.y !== 0))
          this.#staleNeutralizations += 1;
        entry.staleCounted = true;
        continue;
      }
      if (!entry.consumed) {
        entry.consumed = true;
        this.#recordLatency(nowMs - entry.receivedAt);
      }
      frame.set(playerId, { x: entry.x, y: entry.y });
    }
    return frame;
  }

  /** Host receive → the step that first used it. A single clock, so this is a real measurement. */
  latency(): LatencyStats {
    return {
      samples: this.#samples,
      lastMs: this.#lastMs,
      meanMs: this.#samples === 0 ? undefined : this.#sumMs / this.#samples,
      maxMs: this.#maxMs,
    };
  }

  #recordLatency(ms: number): void {
    this.#samples += 1;
    this.#sumMs += ms;
    this.#lastMs = ms;
    this.#maxMs = this.#maxMs === undefined ? ms : Math.max(this.#maxMs, ms);
  }
}
