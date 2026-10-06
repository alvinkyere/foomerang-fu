import type { RosterEntry } from '@foomerang/protocol';
import type { PlayerAction } from '../host';
import type { ArenaView } from '../render/viewModel';
import { GameRuntime } from './gameRuntime';
import { LazyFuRuntime, warmUpFu } from './lazyFuRuntime';
import type { MatchPlayer, MatchRuntime } from './matchRuntime';
import type { PowerKind } from '@foomerang/foomerang-fu';
import type { ArenaChoice, PowerupMode } from './powerupMode';
import { CpuRoster, isCpuId, type CpuEntry } from './cpuRoster';
import { DEFAULT_MODE, ModeSelection, isStartableMode, type GameModeId } from './gameMode';
import { MAX_PARTICIPANTS } from './cpuRoster';
import { SlotAllocator } from './slots';

/** The runtime for a game. Anything that is not Foomerang Fu is the primitive arena (test infrastructure). */
export function createRuntimeFor(
  gameId: string,
  powerups?: PowerupMode,
  enabled?: readonly PowerKind[],
  arena?: ArenaChoice,
  mode: GameModeId = DEFAULT_MODE,
  targetKills?: number,
): MatchRuntime {
  return gameId === 'foomerang-fu'
    ? new LazyFuRuntime(powerups, enabled, arena, mode, targetKills)
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
  /** The game mode the host has chosen (Free For All is the only one that can start). */
  readonly mode = new ModeSelection();
  #roster: readonly RosterEntry[] = [];
  #connected = new Set<string>();
  #inMatch = false;
  #gameId = 'primitive-arena';
  /** The people who have a body in the match that is running (anyone else seated is waiting for the next one). */
  #matchHumans = new Set<string>();
  #paused = false;

  readonly #createRuntime: (gameId: string, mode: GameModeId) => MatchRuntime;

  readonly #warmUp: (gameId: string) => void;

  constructor(
    createRuntime?: (gameId: string, mode: GameModeId) => MatchRuntime,
    warmUp: (gameId: string) => void = createRuntime === undefined ? warmUpFor : () => {},
  ) {
    this.#createRuntime =
      createRuntime ??
      ((gameId, mode) => createRuntimeFor(gameId, undefined, undefined, undefined, mode));
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
    if (!isStartableMode(this.mode.id)) return; // a mode that is not available can never begin, whatever the room says
    this.#begin(gameId, nowMs);
  }

  /** Builds the bodies for a match about to begin: the people who were there (and any who have since arrived, while there is room), then the CPUs. */
  #bodies(): { bodies: MatchPlayer[]; humans: Set<string> } {
    const bodies: MatchPlayer[] = [];
    const humans = new Set<string>();
    const room = MAX_PARTICIPANTS - this.cpus.entries.length;
    for (const r of this.#roster) {
      const slot = this.slots.slotOf(r.playerId);
      if (r.seat !== 'HELD' || slot === undefined || humans.size >= room) continue;
      bodies.push({ playerId: r.playerId, slot });
      humans.add(r.playerId);
    }
    // CPUs join after the people, so a full table never turns a person away.
    for (const c of this.cpus.entries) {
      const slot = this.slots.slotOf(c.id);
      if (slot !== undefined) bodies.push({ playerId: c.id, slot, cpu: c.difficulty });
    }
    return { bodies, humans };
  }

  #begin(gameId: string, nowMs: number): void {
    this.#inMatch = true;
    this.#gameId = gameId;
    this.runtime = this.#createRuntime(gameId, this.mode.id);
    this.runtime.setActivity((playerId) => this.#isActive(playerId));
    const { bodies, humans } = this.#bodies();
    this.#matchHumans = humans;
    this.runtime.start(bodies, nowMs);
  }

  /**
   * REMATCH: the same participants and CPU difficulties, a brand-new match (round 1, empty meters, empty inventories,
   * nothing carried). People who joined while the last match was running are waiting; they are included now, as far as
   * the table has room.
   */
  rematch(nowMs: number): void {
    if (!this.#inMatch) return;
    this.#begin(this.#gameId, nowMs);
  }

  /** The match is over for good: back to the lobby (the console tells the server). */
  returnToLobby(): void {
    this.#inMatch = false;
    this.#matchHumans = new Set();
    this.#paused = false;
  }

  /** People seated now who have no body in the running match: they take part in the next one. */
  waitingForNextMatch(): readonly RosterEntry[] {
    if (!this.#inMatch) return [];
    return this.#roster.filter((r) => r.seat === 'HELD' && !this.#matchHumans.has(r.playerId));
  }

  /**
   * Whether a match may begin now, and if not why. Free For All needs two to six participants, people and CPUs
   * together: any mix (all people, all CPUs, or both) is the host's choice.
   */
  startBlock(): 'MODE_UNAVAILABLE' | 'TOO_FEW' | 'TOO_MANY' | undefined {
    if (!isStartableMode(this.mode.id)) return 'MODE_UNAVAILABLE';
    const participants =
      this.#roster.filter((r) => r.seat === 'HELD').length + this.cpus.entries.length;
    if (participants < 2) return 'TOO_FEW';
    if (participants > MAX_PARTICIPANTS) return 'TOO_MANY';
    return undefined;
  }

  /** The host's own connection to the server is down: the match waits (nothing steps), and resumes where it was. */
  setPaused(paused: boolean, nowMs: number): void {
    if (paused === this.#paused) return;
    this.#paused = paused;
    if (!paused) this.runtime.rebase?.(nowMs);
  }

  get paused(): boolean {
    return this.#paused;
  }

  onMovement(playerId: string, x: number, y: number, nowMs: number): void {
    if (this.#inMatch) this.runtime.receiveInput(playerId, x, y, nowMs);
  }

  onAction(action: PlayerAction): void {
    if (this.#inMatch) this.runtime.receiveAction(action);
  }

  frame(nowMs: number): void {
    if (this.#inMatch && !this.#paused) this.runtime.frame(nowMs);
  }

  /** What to draw, or undefined when no match is running. */
  arenaView(): ArenaView | undefined {
    if (!this.#inMatch) return undefined;
    return this.runtime.view([...this.#roster, ...this.#cpuRoster()], this.slots);
  }
}
