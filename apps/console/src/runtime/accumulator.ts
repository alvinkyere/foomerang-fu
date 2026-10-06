import { FIXED_TIMESTEP_SECONDS } from '@foomerang/game-core';

export interface AccumulatorOptions {
  /** Seconds of simulation per step. Default 1/60. */
  readonly stepSeconds?: number;
  /** The most steps one rendered frame may run. Default 5 (≈ 83 ms of recovery). */
  readonly maxCatchUpSteps?: number;
}

export interface AdvanceResult {
  readonly steps: number;
  /** Real time that was dropped instead of simulated. */
  readonly discardedSeconds: number;
}

/** Guards `floor(x / step)` against 5.999999999 when x is really 6 steps. */
const EPSILON = 1e-9;

/**
 * The fixed-step accumulator. It lives HERE, on the host's runtime side — never in game-core,
 * which only ever sees `step(state, inputs, 1/60)`.
 *
 *   render frame ─► elapsed real time ─► accumulator += elapsed
 *                                           └─► while >= 1/60: one simulation step (at most 5)
 *
 * If more than 5 steps are owed (the tab stalled, the machine hiccuped) the extra time is
 * DISCARDED, not simulated: two seconds of stall must never mean 120 steps before the next frame
 * is drawn (the "spiral of death"). Discards are counted so they are visible, never silent.
 */
export class FixedStepAccumulator {
  readonly stepSeconds: number;
  readonly maxCatchUpSteps: number;
  #accumulated = 0;

  /** Rendered frames seen. */
  frames = 0;
  /** Simulation steps run. */
  totalSteps = 0;
  /** Frames that had to run more than one step to keep up. */
  catchUpFrames = 0;
  /** Total real time dropped instead of simulated. */
  discardedSeconds = 0;
  /** Frames on which time was dropped. */
  discardEvents = 0;

  constructor(options: AccumulatorOptions = {}) {
    this.stepSeconds = options.stepSeconds ?? FIXED_TIMESTEP_SECONDS;
    this.maxCatchUpSteps = options.maxCatchUpSteps ?? 5;
    if (!Number.isFinite(this.stepSeconds) || this.stepSeconds <= 0) {
      throw new RangeError('stepSeconds must be a positive, finite number');
    }
    if (!Number.isSafeInteger(this.maxCatchUpSteps) || this.maxCatchUpSteps < 1) {
      throw new RangeError('maxCatchUpSteps must be a positive integer');
    }
  }

  /** Real seconds since the previous frame → how many fixed steps to run now. */
  advance(elapsedSeconds: number): AdvanceResult {
    // A non-finite or negative delta (a clock hiccup) is treated as "no time passed".
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0)
      return { steps: 0, discardedSeconds: 0 };
    this.frames += 1;
    this.#accumulated += elapsedSeconds;

    const owed = Math.floor(this.#accumulated / this.stepSeconds + EPSILON);
    const steps = Math.min(owed, this.maxCatchUpSteps);
    const discarded = (owed - steps) * this.stepSeconds;
    this.#accumulated = Math.max(0, this.#accumulated - owed * this.stepSeconds);

    this.totalSteps += steps;
    if (steps > 1) this.catchUpFrames += 1;
    if (discarded > 0) {
      this.discardedSeconds += discarded;
      this.discardEvents += 1;
    }
    return { steps, discardedSeconds: discarded };
  }
}
