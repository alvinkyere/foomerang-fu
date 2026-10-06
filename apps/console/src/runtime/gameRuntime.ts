import { step, FIXED_TIMESTEP_SECONDS, type WorldState } from '@foomerang/game-core';
import { createArenaWorld } from './arena';
import { FixedStepAccumulator } from './accumulator';
import { InputBuffer, type LatencyStats } from './inputBuffer';

export interface RuntimeMetrics {
  /** Rendered frames per second over the recent window; undefined until measured. */
  readonly fps: number | undefined;
  readonly frameMs: number | undefined;
  readonly frameMaxMs: number | undefined;
  readonly simulationSteps: number;
  readonly catchUpFrames: number;
  readonly discardEvents: number;
  readonly discardedSimulationMs: number;
  readonly staleNeutralizations: number;
  /** Host receive → first simulation step that used it. One clock; not network latency. */
  readonly inputToSim: LatencyStats;
  readonly players: number;
}

const WINDOW = 120;

/**
 * The console's simulation driver. Per rendered frame it turns real elapsed time into 0..5 fixed
 * 1/60 s steps and hands game-core only `step(state, inputs, FIXED_TIMESTEP_SECONDS)`. It owns the
 * accumulator and the latest-input buffer; game-core stays free of time and network concerns.
 * It never measures anything across two devices' clocks.
 */
export class GameRuntime {
  world: WorldState | undefined;
  #accumulator = new FixedStepAccumulator();
  #inputs = new InputBuffer();
  #isActive: (playerId: string) => boolean = () => true;
  #lastFrameAt: number | undefined;
  #frameTimes: number[] = [];
  #playerIds = new Set<string>();

  start(
    players: readonly { readonly playerId: string; readonly slot: number }[],
    nowMs: number,
  ): void {
    this.world = createArenaWorld(players);
    this.#accumulator = new FixedStepAccumulator();
    this.#inputs = new InputBuffer();
    this.#playerIds = new Set(players.map((p) => p.playerId));
    this.#lastFrameAt = nowMs;
    this.#frameTimes = [];
  }

  /** Who may move right now (e.g. not while reconnecting). Inactive players are neutral. */
  setActivity(isActive: (playerId: string) => boolean): void {
    this.#isActive = isActive;
  }

  receiveInput(playerId: string, x: number, y: number, nowMs: number): void {
    if (!this.#playerIds.has(playerId)) return;
    this.#inputs.receive(playerId, x, y, nowMs);
  }

  frame(nowMs: number): void {
    if (this.world === undefined || this.#lastFrameAt === undefined) return;
    const elapsedMs = nowMs - this.#lastFrameAt;
    if (!(elapsedMs > 0)) return; // time did not move forward: nothing to measure or simulate
    this.#lastFrameAt = nowMs;
    this.#frameTimes.push(elapsedMs);
    if (this.#frameTimes.length > WINDOW) this.#frameTimes.shift();

    const { steps } = this.#accumulator.advance(elapsedMs / 1000);
    let world = this.world;
    for (let i = 0; i < steps; i += 1) {
      world = step(world, this.#inputs.frame(nowMs, this.#isActive), FIXED_TIMESTEP_SECONDS);
    }
    this.world = world;
  }

  metrics(): RuntimeMetrics {
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
      staleNeutralizations: this.#inputs.staleNeutralizations,
      inputToSim: this.#inputs.latency(),
      players: this.#playerIds.size,
    };
  }
}
