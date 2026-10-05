/**
 * Timers are an injected dependency, not ambient globals, so handshake timeouts and the
 * reconciliation interval are testable without waiting (tests drive a manual scheduler by hand) and
 * so server shutdown can PROVE it left nothing scheduled.
 *
 * This is transport/runtime infrastructure. The pure packages (room-engine, game-core) never
 * schedule anything; they are told the time and asked to reconcile.
 */
export type CancelFn = () => void;

export interface Scheduler {
  setTimeout(callback: () => void, delayMs: number): CancelFn;
  setInterval(callback: () => void, intervalMs: number): CancelFn;
}

export const realScheduler: Scheduler = {
  setTimeout(callback, delayMs) {
    const handle = setTimeout(callback, delayMs);
    return () => clearTimeout(handle);
  },
  setInterval(callback, intervalMs) {
    const handle = setInterval(callback, intervalMs);
    return () => clearInterval(handle);
  },
};
