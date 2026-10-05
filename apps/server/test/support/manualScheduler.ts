import type { CancelFn, Scheduler } from '../../src/scheduler';

interface Timer {
  readonly id: number;
  due: number;
  readonly callback: () => void;
  readonly interval: number | undefined;
}

/**
 * A scheduler driven by hand: tests call `advance(ms)` instead of waiting. Nothing here touches
 * real time, so a 5-second handshake timeout is exercised in microseconds.
 */
export class ManualScheduler implements Scheduler {
  #now = 0;
  #nextId = 1;
  readonly #timers = new Map<number, Timer>();

  /** Timers still scheduled — must be 0 after a clean shutdown. */
  get pending(): number {
    return this.#timers.size;
  }

  setTimeout(callback: () => void, delayMs: number): CancelFn {
    return this.#add(callback, delayMs, undefined);
  }

  setInterval(callback: () => void, intervalMs: number): CancelFn {
    return this.#add(callback, intervalMs, intervalMs);
  }

  /** Runs every timer that falls due within `ms`, in time order. */
  advance(ms: number): void {
    const target = this.#now + ms;
    for (;;) {
      const next = [...this.#timers.values()]
        .filter((timer) => timer.due <= target)
        .sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (next === undefined) break;
      this.#now = next.due;
      if (next.interval === undefined) this.#timers.delete(next.id);
      else next.due += next.interval;
      next.callback();
    }
    this.#now = target;
  }

  #add(callback: () => void, delayMs: number, interval: number | undefined): CancelFn {
    const id = this.#nextId++;
    this.#timers.set(id, { id, due: this.#now + delayMs, callback, interval });
    return () => {
      this.#timers.delete(id);
    };
  }
}
