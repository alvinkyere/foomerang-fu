import type { RosterEntry } from '@foomerang/protocol';
import type { PlayerAction } from '../host';
import type { ArenaView } from '../render/viewModel';
import { FuRuntime } from './fuRuntime';
import { GameRuntime } from './gameRuntime';
import type { MatchRuntime } from './matchRuntime';
import { SlotAllocator } from './slots';

/** The runtime for a game. Anything that is not Foomerang Fu is the primitive arena (test infrastructure). */
export function createRuntimeFor(gameId: string): MatchRuntime {
  return gameId === 'foomerang-fu' ? new FuRuntime() : new GameRuntime();
}

/**
 * Coordinates the room's PARTICIPANTS with the game's BODIES. It owns neither the network nor
 * rendering nor timers: it is told about the room (state + roster), movement and frames.
 *
 * - A participant is a person with a seat, a connection state and a slot. They exist in the lobby.
 * - A body exists only inside a running match, created once at its start for the seated players.
 *   Later roster changes (reconnecting, leaving) change whether a body is ACTIVE, never whether
 *   it exists, and a late arrival never conjures a body.
 *
 * "Inactive while reconnecting" (neutral input, no throws; same body, same place, resumes later)
 * is set here for the games we have; it is not a rule of game-core, and future games decide for
 * themselves.
 */
export class MatchDirector {
  /** The game currently (or last) running. Before the first match it is an idle placeholder. */
  runtime: MatchRuntime = new GameRuntime();
  readonly slots = new SlotAllocator();
  #roster: readonly RosterEntry[] = [];
  #connected = new Set<string>();
  #inMatch = false;

  readonly #createRuntime: (gameId: string) => MatchRuntime;

  constructor(createRuntime: (gameId: string) => MatchRuntime = createRuntimeFor) {
    this.#createRuntime = createRuntime;
    this.runtime.setActivity((playerId) => this.#connected.has(playerId));
  }

  onRoom(
    roomState: string,
    roster: readonly RosterEntry[],
    nowMs: number,
    gameId = 'primitive-arena',
  ): void {
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
    this.runtime = this.#createRuntime(gameId);
    this.runtime.setActivity((playerId) => this.#connected.has(playerId));
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

  onAction(action: PlayerAction): void {
    if (this.#inMatch) this.runtime.receiveAction(action);
  }

  frame(nowMs: number): void {
    if (this.#inMatch) this.runtime.frame(nowMs);
  }

  /** What to draw, or undefined when no match is running. */
  arenaView(): ArenaView | undefined {
    if (!this.#inMatch) return undefined;
    return this.runtime.view(this.#roster, this.slots);
  }
}
