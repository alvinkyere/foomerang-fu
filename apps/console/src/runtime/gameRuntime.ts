import { step, FIXED_TIMESTEP_SECONDS, type WorldState } from '@foomerang/game-core';
import type { RosterEntry } from '@foomerang/protocol';
import { buildArenaView, type ArenaView } from '../render/viewModel';
import { createArenaWorld } from './arena';
import { FrameStepper } from './frameStepper';
import { InputBuffer } from './inputBuffer';
import type { MatchPlayer, MatchRuntime, RuntimeMetrics } from './matchRuntime';
import type { SlotAllocator } from './slots';

export type { RuntimeMetrics } from './matchRuntime';

/**
 * The PRIMITIVE ARENA's simulation driver (test/integration infrastructure, not a game): circles
 * that follow thumbs. Per rendered frame it turns real elapsed time into 0..5 fixed 1/60 s steps
 * and hands game-core only `step(state, inputs, FIXED_TIMESTEP_SECONDS)`. It owns the latest-input
 * buffer; game-core stays free of time and network concerns.
 */
export class GameRuntime implements MatchRuntime {
  world: WorldState | undefined;
  #stepper = new FrameStepper();
  #inputs = new InputBuffer();
  #isActive: (playerId: string) => boolean = () => true;
  #playerIds = new Set<string>();

  start(players: readonly MatchPlayer[], nowMs: number): void {
    this.world = createArenaWorld(players);
    this.#stepper.start(nowMs);
    this.#inputs = new InputBuffer();
    this.#playerIds = new Set(players.map((p) => p.playerId));
  }

  setActivity(isActive: (playerId: string) => boolean): void {
    this.#isActive = isActive;
  }

  receiveInput(playerId: string, x: number, y: number, nowMs: number): void {
    if (!this.#playerIds.has(playerId)) return;
    this.#inputs.receive(playerId, x, y, nowMs);
  }

  /** The primitive arena has no buttons. */
  receiveAction(): void {}

  rebase(nowMs: number): void {
    this.#stepper.rebase(nowMs);
  }

  frame(nowMs: number): void {
    if (this.world === undefined) return;
    const steps = this.#stepper.advance(nowMs);
    let world = this.world;
    for (let i = 0; i < steps; i += 1) {
      world = step(world, this.#inputs.frame(nowMs, this.#isActive), FIXED_TIMESTEP_SECONDS);
    }
    this.world = world;
  }

  metrics(): RuntimeMetrics {
    return {
      ...this.#stepper.metrics(),
      staleNeutralizations: this.#inputs.staleNeutralizations,
      inputToSim: this.#inputs.latency(),
      players: this.#playerIds.size,
    };
  }

  view(roster: readonly RosterEntry[], slots: SlotAllocator): ArenaView | undefined {
    return this.world === undefined ? undefined : buildArenaView(this.world, roster, slots);
  }

  debugState(): unknown {
    return undefined;
  }
}
