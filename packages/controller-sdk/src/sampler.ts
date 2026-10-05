import type { Point } from './joystick';

/**
 * Three different rates, kept apart:
 *   - touch/pointer event rate: irregular, set by the browser; it only UPDATES the state here;
 *   - sampling rate: a fixed loop (60 Hz) that looks at that state;
 *   - transmission rate: only what is worth sending.
 *
 *   pointer events → current state → sample @ 60 Hz ─┬─ meaningfully changed ─────► SEND
 *                                                    ├─ released to neutral ──────► SEND (promptly)
 *                                                    ├─ unchanged, refresh due ───► SEND (self-healing)
 *                                                    └─ otherwise ────────────────► nothing
 */
export interface SamplerConfig {
  /** Per-axis change smaller than this is jitter. Compared against what was last SENT. */
  readonly epsilon: number;
  /** Re-send the current state at least this often, so one lost or ancient packet never rules. */
  readonly refreshMs: number;
}

/** Initial hypotheses, to be tuned from measurement. */
export const DEFAULT_SAMPLER_CONFIG: SamplerConfig = Object.freeze({
  epsilon: 0.01,
  refreshMs: 250,
});

interface Sent {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

const isNeutral = (p: Point): boolean => p.x === 0 && p.y === 0;

export class MovementSampler {
  readonly #config: SamplerConfig;
  #current: Point = { x: 0, y: 0 };
  #lastSent: Sent | undefined;

  constructor(config: Partial<SamplerConfig> = {}) {
    const merged = { ...DEFAULT_SAMPLER_CONFIG, ...config };
    if (!Number.isFinite(merged.epsilon) || merged.epsilon < 0) {
      throw new RangeError('epsilon must be a finite number >= 0');
    }
    if (!Number.isFinite(merged.refreshMs) || merged.refreshMs <= 0) {
      throw new RangeError('refreshMs must be a finite number > 0');
    }
    this.#config = merged;
  }

  get current(): Point {
    return this.#current;
  }

  /** Updates the state (called from pointer events, at any rate). Never sends. */
  setMovement(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      this.#current = { x: 0, y: 0 };
      return;
    }
    const clamp = (v: number) => Math.min(1, Math.max(-1, v)) + 0; // `+ 0` normalizes -0
    this.#current = { x: clamp(x), y: clamp(y) };
  }

  neutralize(): void {
    this.#current = { x: 0, y: 0 };
  }

  /** A new connection epoch: forget what the old connection was told, so the next sample re-announces. */
  reset(): void {
    this.#lastSent = undefined;
  }

  /** Called by the 60 Hz loop. Returns the state to send, or nothing. */
  sample(nowMs: number): Point | undefined {
    const current = this.#current;
    const last = this.#lastSent;
    const due =
      last === undefined ||
      Math.abs(current.x - last.x) > this.#config.epsilon ||
      Math.abs(current.y - last.y) > this.#config.epsilon ||
      // Release is significant even when it is only a hair away from what was last sent.
      (isNeutral(current) && !isNeutral(last)) ||
      nowMs - last.at >= this.#config.refreshMs;
    if (!due) return undefined;
    this.#lastSent = { x: current.x, y: current.y, at: nowMs };
    return { x: current.x, y: current.y };
  }
}
