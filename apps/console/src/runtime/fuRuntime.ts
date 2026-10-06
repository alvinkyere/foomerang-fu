import { FIXED_TIMESTEP_SECONDS, type WorldState } from '@foomerang/game-core';
import {
  createFuMatch,
  stepFu,
  type FuEvent,
  type FuPlayerInput,
  type FuState,
} from '@foomerang/foomerang-fu';
import type { RosterEntry } from '@foomerang/protocol';
import type { PlayerAction } from '../host';
import { buildFuView } from '../render/fuView';
import type { ArenaView } from '../render/viewModel';
import { FrameStepper } from './frameStepper';
import { InputBuffer } from './inputBuffer';
import type { MatchPlayer, MatchRuntime, RuntimeMetrics } from './matchRuntime';
import type { SlotAllocator } from './slots';

/** Event ids remembered per player: far more than any real burst of presses. */
const DEDUP_WINDOW = 64;
/** Presentation events waiting for the next view; bounded so an unwatched match cannot grow without limit. */
const MAX_PENDING_EVENTS = 256;

/**
 * Foomerang Fu's driver in the console: the platform's input and clock in, Fu's rules out.
 *
 * It owns what the RULES must not know about — wall-clock frames, the latest-thumb buffer and its
 * 500 ms freshness, who is currently connected, and button event ids. Per rendered frame it runs
 * 0..5 fixed 1/60 s steps of `stepFu`. A THROW press becomes a one-step `throw: true` request on the
 * next step that runs; the same event id can never throw twice (the server already deduplicates,
 * this is the second line of defence), and a press that cannot be applied now (the player is
 * reconnecting) is dropped, never remembered to fire later.
 */
export class FuRuntime implements MatchRuntime {
  state: FuState | undefined;
  /** Repeated event ids the console itself discarded (the server normally catches them first). */
  duplicatesIgnored = 0;

  #stepper = new FrameStepper();
  #inputs = new InputBuffer();
  #isActive: (playerId: string) => boolean = () => true;
  #playerIds = new Set<string>();
  #pendingThrows = new Set<string>();
  #seenEvents = new Map<string, { order: string[]; set: Set<string> }>();
  #events: FuEvent[] = [];

  get world(): WorldState | undefined {
    return this.state?.world;
  }

  start(players: readonly MatchPlayer[], nowMs: number): void {
    this.state = createFuMatch(players.map((p) => ({ id: p.playerId, slot: p.slot })));
    this.#stepper.start(nowMs);
    this.#inputs = new InputBuffer();
    this.#playerIds = new Set(players.map((p) => p.playerId));
    this.#pendingThrows = new Set();
    this.#seenEvents = new Map();
    this.#events = [];
    this.duplicatesIgnored = 0;
  }

  setActivity(isActive: (playerId: string) => boolean): void {
    this.#isActive = isActive;
  }

  receiveInput(playerId: string, x: number, y: number, nowMs: number): void {
    if (!this.#playerIds.has(playerId)) return;
    this.#inputs.receive(playerId, x, y, nowMs);
  }

  receiveAction(action: PlayerAction): void {
    if (this.state === undefined || !this.#playerIds.has(action.playerId)) return;
    if (this.#alreadySeen(action.playerId, action.eventId)) {
      this.duplicatesIgnored += 1;
      return;
    }
    if (action.action !== 'PRIMARY' || action.phase !== 'pressed') return; // PRIMARY is THROW; a release does nothing
    if (!this.#isActive(action.playerId)) return; // dropped, not remembered
    this.#pendingThrows.add(action.playerId);
  }

  frame(nowMs: number): void {
    if (this.state === undefined) return;
    const steps = this.#stepper.advance(nowMs);
    for (let i = 0; i < steps; i += 1) {
      const thumbs = this.#inputs.frame(nowMs, this.#isActive);
      const inputs = new Map<string, FuPlayerInput>();
      for (const player of this.state.players) {
        const move = thumbs.get(player.id);
        const wantsThrow =
          i === 0 && this.#pendingThrows.has(player.id) && this.#isActive(player.id);
        if (move !== undefined || wantsThrow) {
          inputs.set(player.id, {
            ...(move === undefined ? {} : { move }),
            ...(wantsThrow ? { throw: true } : {}),
          });
        }
      }
      if (i === 0) this.#pendingThrows.clear(); // a press waits for a step that actually runs
      const result = stepFu(this.state, inputs, FIXED_TIMESTEP_SECONDS);
      this.state = result.state;
      this.#events.push(...result.events);
    }
    if (this.#events.length > MAX_PENDING_EVENTS)
      this.#events.splice(0, this.#events.length - MAX_PENDING_EVENTS);
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
    if (this.state === undefined) return undefined;
    return buildFuView(this.state, this.#events.splice(0), roster, slots);
  }

  debugState(): unknown {
    const state = this.state;
    if (state === undefined) return undefined;
    return {
      round: state.round,
      phase: state.phase,
      elapsed: state.elapsed,
      winnerId: state.roundOver?.winnerId,
      players: state.players.map((p) => ({
        id: p.id,
        slot: p.slot,
        alive: p.alive,
        facing: { ...p.facing },
      })),
      boomerangs: state.boomerangs.map((b) => ({
        ownerId: b.ownerId,
        state: b.state,
        x: b.position.x,
        y: b.position.y,
        travelled: b.travelled,
      })),
      duplicatesIgnored: this.duplicatesIgnored,
    };
  }

  /** Records an event id; true if it had been seen already. Bounded per player. */
  #alreadySeen(playerId: string, eventId: string): boolean {
    let window = this.#seenEvents.get(playerId);
    if (window === undefined) {
      window = { order: [], set: new Set() };
      this.#seenEvents.set(playerId, window);
    }
    if (window.set.has(eventId)) return true;
    window.set.add(eventId);
    window.order.push(eventId);
    if (window.order.length > DEDUP_WINDOW) {
      const oldest = window.order.shift();
      if (oldest !== undefined) window.set.delete(oldest);
    }
    return false;
  }
}
