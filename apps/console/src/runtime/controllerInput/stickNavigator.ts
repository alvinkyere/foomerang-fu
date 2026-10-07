export type StickDirection = 'up' | 'down' | 'left' | 'right';

export interface StickConfig {
  /** Beyond this the stick is "tilted": a step is taken. */
  readonly engage: number;
  /** Below this it is "neutral": the latch resets. Lower than `engage`, so easing off a little does not flicker. */
  readonly release: number;
  /** The winning axis must beat the other by this factor; a half-diagonal is not a step. */
  readonly dominance: number;
  readonly repeatDelayMs: number;
  readonly repeatIntervalMs: number;
  /** A stick not heard from for this long (a lost phone) is treated as released. */
  readonly staleMs: number;
}

export const DEFAULT_STICK: StickConfig = Object.freeze({
  engage: 0.6,
  release: 0.3,
  dominance: 1.25,
  repeatDelayMs: 380,
  repeatIntervalMs: 130,
  staleMs: 650,
});

/**
 * A thumb stick as a D-pad, for one player. Pure: time is passed in.
 *
 * One deliberate tilt is one step. Holding it repeats (after a delay, then at a steady cadence,
 * driven by `tick`). Returning toward neutral resets the latch at once. Noise below the dead zone
 * never does anything; continuous analog movement is never fed to the UI.
 */
export class StickNavigator {
  readonly #config: StickConfig;
  #direction: StickDirection | undefined;
  #since = 0;
  #lastFired = 0;
  #heardAt = 0;
  #magnitude = 0;

  constructor(config: Partial<StickConfig> = {}) {
    this.#config = { ...DEFAULT_STICK, ...config };
  }

  get held(): StickDirection | undefined {
    return this.#direction;
  }

  update(x: number, y: number, nowMs: number): StickDirection[] {
    const c = this.#config;
    const magnitude = Math.hypot(x, y);
    this.#magnitude = magnitude;
    this.#heardAt = nowMs;
    if (magnitude < c.release) {
      this.#direction = undefined; // neutral: the latch resets
      return [];
    }
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const candidate: StickDirection | undefined =
      ax >= ay * c.dominance
        ? x > 0
          ? 'right'
          : 'left'
        : ay >= ax * c.dominance
          ? y > 0
            ? 'down'
            : 'up'
          : undefined;
    if (candidate === undefined || magnitude < c.engage) return []; // ambiguous, or not yet a tilt
    if (candidate === this.#direction) return []; // the same hold
    this.#direction = candidate; // a new tilt, or a change of direction: step now
    this.#since = nowMs;
    this.#lastFired = nowMs;
    return [candidate];
  }

  /** Repeat for a held direction. Call often (a few times per frame is plenty). */
  tick(nowMs: number): StickDirection[] {
    const c = this.#config;
    if (this.#direction === undefined) return [];
    if (nowMs - this.#heardAt > c.staleMs || this.#magnitude < c.release) {
      this.#direction = undefined;
      return [];
    }
    const due =
      this.#lastFired === this.#since
        ? nowMs - this.#since >= c.repeatDelayMs
        : nowMs - this.#lastFired >= c.repeatIntervalMs;
    if (!due) return [];
    this.#lastFired = nowMs;
    return [this.#direction];
  }

  reset(): void {
    this.#direction = undefined;
    this.#magnitude = 0;
  }
}
