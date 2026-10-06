import { FixedStepAccumulator } from './accumulator';

/** The most recent rendered frames used for FPS and frame-time figures. */
const WINDOW = 120;

export interface TimingMetrics {
  /** Rendered frames per second over the recent window; undefined until measured. */
  readonly fps: number | undefined;
  readonly frameMs: number | undefined;
  readonly frameMaxMs: number | undefined;
  readonly simulationSteps: number;
  readonly catchUpFrames: number;
  readonly discardEvents: number;
  readonly discardedSimulationMs: number;
}

/**
 * Real elapsed time → how many fixed 1/60 s steps to run now, plus the honest frame timing around
 * it. Shared by every game the console can run, so they all get the same accumulator rules (at
 * most 5 catch-up steps; the rest is discarded and counted) and the same measurements. Everything
 * is on the host's own clock; nothing compares clocks of two devices.
 */
export class FrameStepper {
  #accumulator = new FixedStepAccumulator();
  #lastFrameAt: number | undefined;
  #frameTimes: number[] = [];

  /** Begin a new match at host time `nowMs`: counters and the accumulator start from zero. */
  start(nowMs: number): void {
    this.#accumulator = new FixedStepAccumulator();
    this.#lastFrameAt = nowMs;
    this.#frameTimes = [];
  }

  /** Restart the clock at `nowMs` without touching the counters or the state of the game (after a pause). */
  rebase(nowMs: number): void {
    this.#lastFrameAt = nowMs;
  }

  get started(): boolean {
    return this.#lastFrameAt !== undefined;
  }

  /** Steps to run for a frame at `nowMs`. A timestamp that does not move forward is ignored (0). */
  advance(nowMs: number): number {
    if (this.#lastFrameAt === undefined) return 0;
    const elapsedMs = nowMs - this.#lastFrameAt;
    if (!(elapsedMs > 0)) return 0;
    this.#lastFrameAt = nowMs;
    this.#frameTimes.push(elapsedMs);
    if (this.#frameTimes.length > WINDOW) this.#frameTimes.shift();
    return this.#accumulator.advance(elapsedMs / 1000).steps;
  }

  metrics(): TimingMetrics {
    const times = this.#frameTimes;
    const total = times.reduce((a, b) => a + b, 0);
    const mean = times.length === 0 ? undefined : total / times.length;
    return {
      fps: mean === undefined ? undefined : 1000 / mean,
      frameMs: mean,
      frameMaxMs: times.length === 0 ? undefined : Math.max(...times),
      simulationSteps: this.#accumulator.totalSteps,
      catchUpFrames: this.#accumulator.catchUpFrames,
      discardEvents: this.#accumulator.discardEvents,
      discardedSimulationMs: this.#accumulator.discardedSeconds * 1000,
    };
  }
}
