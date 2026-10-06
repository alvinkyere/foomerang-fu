import type { RosterEntry } from '@foomerang/protocol';
import type { PlayerAction } from '../host';
import type { ArenaView } from '../render/viewModel';
import { GameRuntime } from './gameRuntime';
import { LazyFuRuntime, warmUpFu } from './lazyFuRuntime';
import type { MatchPlayer, MatchRuntime } from './matchRuntime';
import type { PowerKind } from '@foomerang/foomerang-fu';
import type { ArenaChoice, PowerupMode } from './powerupMode';
import { CpuRoster, isCpuId, type CpuEntry } from './cpuRoster';
import { SlotAllocator } from './slots';

/** The runtime for a game. Anything that is not Foomerang Fu is the primitive arena (test infrastructure). */
export function createRuntimeFor(
  gameId: string,
  powerups?: PowerupMode,
  enabled?: readonly PowerKind[],
  arena?: ArenaChoice,
): MatchRuntime {
  return gameId === 'foomerang-fu'
    ? new LazyFuRuntime(powerups, enabled, arena)
    : new GameRuntime();
}

/** Fetches what a game will need while players are still in the lobby (a no-op for games with nothing to fetch). */
export function warmUpFor(gameId: string): void {
  if (gameId === 'foomerang-fu') warmUpFu();
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
  /** The CPUs the host added in the lobby (software controllers; no seat, no connection, no socket). */
  readonly cpus = new CpuRoster();
  #roster: readonly RosterEntry[] = [];
  #connected = new Set<string>();
  #inMatch = false;

  readonly #createRuntime: (gameId: string) => MatchRuntime;

  readonly #warmUp: (gameId: string) => void;

  constructor(
    createRuntime: (gameId: string) => MatchRuntime = createRuntimeFor,
    warmUp: (gameId: string) => void = createRuntime === createRuntimeFor ? warmUpFor : () => {},
  ) {
    this.#createRuntime = createRuntime;
    this.#warmUp = warmUp;
    this.runtime.setActivity((playerId) => this.#isActive(playerId));
    this.cpus.subscribe(() => this.#syncSlots());
  }

  /** A CPU is always ready to act; a person only while connected. */
  #isActive(playerId: string): boolean {
    return isCpuId(playerId) || this.#connected.has(playerId);
  }

  /** The CPUs as roster entries, so the lobby and the arena name and colour them like anyone else. */
  #cpuRoster(): readonly RosterEntry[] {
    return this.cpus.entries.map((c: CpuEntry) => ({
      playerId: c.id,
      displayName: c.name,
      connection: 'CONNECTED' as const,
      seat: 'HELD' as const,
    }));
  }

  #syncSlots(): void {
    this.slots.sync(
      [...this.#roster, ...this.#cpuRoster()].map((r) => ({
        playerId: r.playerId,
        seated: r.seat === 'HELD',
      })),
    );
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
    this.#syncSlots();

    if (roomState !== 'PLAYING') {
      this.#inMatch = false;
      this.#warmUp(gameId);
      return;
    }
    if (this.#inMatch) return;
    this.#inMatch = true;
    this.runtime = this.#createRuntime(gameId);
    this.runtime.setActivity((playerId) => this.#isActive(playerId));
    const bodies: MatchPlayer[] = [];
    for (const r of roster) {
      const slot = this.slots.slotOf(r.playerId);
      if (r.seat === 'HELD' && slot !== undefined) bodies.push({ playerId: r.playerId, slot });
    }
    // CPUs join after the people, so a full table never turns a person away.
    for (const c of this.cpus.entries) {
      const slot = this.slots.slotOf(c.id);
      if (slot !== undefined) bodies.push({ playerId: c.id, slot, cpu: c.difficulty });
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
    return this.runtime.view([...this.#roster, ...this.#cpuRoster()], this.slots);
  }
}
