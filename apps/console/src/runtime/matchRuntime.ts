import type { WorldState } from '@foomerang/game-core';
import type { Difficulty } from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import type { PlayerAction } from '../host';
import type { ArenaView } from '../render/viewModel';
import type { LatencyStats } from './inputBuffer';
import type { TimingMetrics } from './frameStepper';
import type { SlotAllocator } from './slots';

export interface RuntimeMetrics extends TimingMetrics {
  readonly staleNeutralizations: number;
  /** Host receive → first simulation step that used it. One clock; not network latency. */
  readonly inputToSim: LatencyStats;
  readonly players: number;
}

/** A player in a starting match: who they are and which slot (spawn point, colour, number, shape) they hold. */
export interface MatchPlayer {
  readonly playerId: string;
  readonly slot: number;
  /** Present for a CPU participant: its controller is software of this difficulty (no network, no seat). */
  readonly cpu?: Difficulty;
}

/**
 * What the console needs from whichever game it is running. The console owns the clock, the
 * network and the drawing; the runtime owns the game's state and turns real elapsed time into
 * fixed steps. Both the primitive arena and Foomerang Fu implement it.
 */
export interface MatchRuntime {
  /** The player bodies (game-core), or undefined before a match starts. */
  readonly world: WorldState | undefined;
  start(players: readonly MatchPlayer[], nowMs: number): void;
  /** Who may act right now (e.g. not while reconnecting). Inactive players are neutral. */
  setActivity(isActive: (playerId: string) => boolean): void;
  receiveInput(playerId: string, x: number, y: number, nowMs: number): void;
  /** An authenticated button event. Games without buttons ignore it. */
  receiveAction(action: PlayerAction): void;
  frame(nowMs: number): void;
  /** After a pause: restart the clock at `nowMs` so the time that passed is not simulated or counted as discarded. */
  rebase?(nowMs: number): void;
  /** Forget every held thumb and every action not yet used (a pause begins): nothing is carried across it. */
  neutralizeInput?(): void;
  /** Where the match is, for the games that have rounds and results (the host uses it to tell controllers what their buttons mean). */
  matchPhase?(): 'PLAYING' | 'ROUND_OVER' | 'MATCH_OVER' | undefined;
  metrics(): RuntimeMetrics;
  /**
   * What to draw. One-shot presentation events (a throw, a hit) are delivered with the FIRST view
   * built after they happen and not again, so call it once per rendered frame.
   */
  view(roster: readonly RosterEntry[], slots: SlotAllocator): ArenaView | undefined;
  /** A read-only snapshot of the game's own state, for development tooling. */
  debugState(): unknown;
}
