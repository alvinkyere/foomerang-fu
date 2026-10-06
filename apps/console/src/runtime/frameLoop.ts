/**
 * A tiny, injectable requestAnimationFrame loop. At most one frame is ever pending, `stop()`
 * cancels it, and a throwing callback is contained so the arena keeps running.
 */
export class FrameLoop {
  readonly #request: (callback: (timestampMs: number) => void) => number;
  readonly #cancel: (id: number) => void;
  readonly #onError: (error: unknown) => void;
  #pending: number | undefined;
  #callback: ((timestampMs: number) => void) | undefined;

  constructor(
    request: (callback: (timestampMs: number) => void) => number = (cb) =>
      requestAnimationFrame(cb),
    cancel: (id: number) => void = (id) => cancelAnimationFrame(id),
    onError: (error: unknown) => void = (error) => {
      console.error('frame callback failed', error);
    },
  ) {
    this.#request = request;
    this.#cancel = cancel;
    this.#onError = onError;
  }

  start(callback: (timestampMs: number) => void): void {
    this.stop();
    this.#callback = callback;
    this.#schedule();
  }

  stop(): void {
    if (this.#pending !== undefined) this.#cancel(this.#pending);
    this.#pending = undefined;
    this.#callback = undefined;
  }

  #schedule(): void {
    this.#pending = this.#request((timestampMs) => {
      this.#pending = undefined;
      const callback = this.#callback;
      if (callback === undefined) return;
      try {
        callback(timestampMs);
      } catch (error) {
        this.#onError(error); // reported, never swallowed — but one bad frame must not stop the arena
      } finally {
        if (this.#callback === callback) this.#schedule();
      }
    });
  }
}
