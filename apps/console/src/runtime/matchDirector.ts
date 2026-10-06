import type { RosterEntry } from '@foomerang/protocol';
import { buildArenaView, type ArenaView } from '../render/viewModel';
import { GameRuntime } from './gameRuntime';
import { SlotAllocator } from './slots';

/**
 * Coordinates the room's PARTICIPANTS with the game's BODIES. It owns neither the network nor
 * rendering nor timers: it is told about the room (state + roster), movement and frames.
 *
 * - A participant is a person with a seat, a connection state and a slot. They exist in the lobby.
 * - A body exists only inside a running match, created once at its start for the seated players.
 *   Later roster changes (reconnecting, leaving) change whether a body is ACTIVE, never whether
 *   it exists, and a late arrival never conjures a body.
 *
 * "Frozen while reconnecting" is this primitive arena's rule, set here; it is not a rule of
 * game-core and future games decide for themselves.
 */
export class MatchDirector {
  readonly runtime = new GameRuntime();
  readonly slots = new SlotAllocator();
  #roster: readonly RosterEntry[] = [];
  #connected = new Set<string>();
  #inMatch = false;

  constructor() {
    this.runtime.setActivity((playerId) => this.#connected.has(playerId));
  }

  onRoom(roomState: string, roster: readonly RosterEntry[], nowMs: number): void {
    this.#roster = roster;
    this.#connected = new Set(
      roster.filter((r) => r.connection === 'CONNECTED').map((r) => r.playerId),
    );
    this.slots.sync(roster.map((r) => ({ playerId: r.playerId, seated: r.seat === 'HELD' })));

    if (roomState !== 'PLAYING') {
      this.#inMatch = false;
      return;
    }
    if (this.#inMatch) return;
    this.#inMatch = true;
    const bodies: { playerId: string; slot: number }[] = [];
    for (const r of roster) {
      const slot = this.slots.slotOf(r.playerId);
      if (r.seat === 'HELD' && slot !== undefined) bodies.push({ playerId: r.playerId, slot });
    }
    this.runtime.start(bodies, nowMs);
  }

  onMovement(playerId: string, x: number, y: number, nowMs: number): void {
    if (this.#inMatch) this.runtime.receiveInput(playerId, x, y, nowMs);
  }

  frame(nowMs: number): void {
    if (this.#inMatch) this.runtime.frame(nowMs);
  }

  /** What to draw, or undefined when no match is running. */
  arenaView(): ArenaView | undefined {
    const world = this.runtime.world;
    if (!this.#inMatch || world === undefined) return undefined;
    return buildArenaView(world, this.#roster, this.slots);
  }
}
