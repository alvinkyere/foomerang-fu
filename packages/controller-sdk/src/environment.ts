/**
 * Timers and time are injected, never ambient: the session's 60 Hz loop, 2 s heartbeat and
 * reconnect backoff are driven by hand in tests, and `dispose()` can PROVE it left nothing
 * scheduled. (The server has the same abstraction; they are deliberately separate packages.)
 */
export type Cancel = () => void;

export interface Scheduler {
  setTimeout(callback: () => void, delayMs: number): Cancel;
  setInterval(callback: () => void, intervalMs: number): Cancel;
}

export interface SessionEnvironment {
  readonly scheduler: Scheduler;
  /** Monotonic milliseconds. */
  now(): number;
}

export const browserEnvironment: SessionEnvironment = {
  scheduler: {
    setTimeout(callback, delayMs) {
      const handle = setTimeout(callback, delayMs);
      return () => clearTimeout(handle);
    },
    setInterval(callback, intervalMs) {
      const handle = setInterval(callback, intervalMs);
      return () => clearInterval(handle);
    },
  },
  now: () => performance.now(),
};
