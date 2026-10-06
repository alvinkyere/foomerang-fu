import type { WorldState } from '@foomerang/game-core';
import type { RosterEntry } from '@foomerang/protocol';
import type { PlayerAction } from '../host';
import type { ArenaView } from '../render/viewModel';
import type { FuRuntime } from './fuRuntime';
import type { MatchPlayer, MatchRuntime, RuntimeMetrics } from './matchRuntime';
import type { PowerKind } from '@foomerang/foomerang-fu';
import type { ArenaChoice, PowerupMode } from './powerupMode';
import { DEFAULT_MODE, type GameModeId } from './gameMode';
import type { SlotAllocator } from './slots';

/** The game's rules, runtime and view model are a separate chunk: the lobby never downloads them. */
let loading: Promise<typeof import('./fuRuntime')> | undefined;
export const loadFuRuntime = (): Promise<typeof import('./fuRuntime')> =>
  (loading ??= import('./fuRuntime'));

/** Starts the download (idempotent) so it is usually finished before anyone presses Start. */
export function warmUpFu(): void {
  void loadFuRuntime().catch(() => {
    loading = undefined; // allow a retry when the match actually starts
  });
}

const NOT_LOADED: RuntimeMetrics = {
  fps: undefined,
  frameMs: undefined,
  frameMaxMs: undefined,
  simulationSteps: 0,
  catchUpFrames: 0,
  discardEvents: 0,
  discardedSimulationMs: 0,
  staleNeutralizations: 0,
  inputToSim: { samples: 0, lastMs: undefined, meanMs: undefined, maxMs: undefined },
  players: 0,
};

/**
 * Foomerang Fu's runtime as the console holds it: a thin stand-in that loads the real `FuRuntime`
 * on demand. Until it has loaded nothing is simulated and nothing is drawn; the thumb positions
 * and button presses that arrive meanwhile are kept (latest thumb per player, presses in order,
 * bounded) and handed over with their original timestamps, so the real runtime sees what it would
 * have seen. Once loaded every call is a direct delegation.
 */
export class LazyFuRuntime implements MatchRuntime {
  #real: FuRuntime | undefined;
  readonly #powerups: PowerupMode | undefined;

  readonly #enabled: readonly PowerKind[] | undefined;

  readonly #arena: ArenaChoice | undefined;

  readonly #mode: GameModeId;

  readonly #targetKills: number | undefined;

  constructor(
    powerups?: PowerupMode,
    enabled?: readonly PowerKind[],
    arena?: ArenaChoice,
    mode: GameModeId = DEFAULT_MODE,
    targetKills?: number,
  ) {
    this.#targetKills = targetKills;
    this.#mode = mode;
    this.#arena = arena;
    this.#powerups = powerups;
    this.#enabled = enabled;
  }

  #isActive: (playerId: string) => boolean = () => true;
  #thumbs = new Map<string, { x: number; y: number; nowMs: number }>();
  #presses: PlayerAction[] = [];

  /** The real runtime's state once it has loaded (for tests and tooling); undefined before. */
  get state(): FuRuntime['state'] {
    return this.#real?.state;
  }

  get world(): WorldState | undefined {
    return this.#real?.world;
  }

  start(players: readonly MatchPlayer[], nowMs: number): void {
    void loadFuRuntime().then(
      ({ FuRuntime: Real, SYSTEMS_ARENA, GARDEN_ARENA }) => {
        const real = new Real(
          this.#arena === 'systems'
            ? SYSTEMS_ARENA
            : this.#arena === 'garden'
              ? GARDEN_ARENA
              : undefined,
          this.#powerups,
          this.#enabled,
          this.#mode,
          this.#targetKills,
        );
        real.setActivity((playerId) => this.#isActive(playerId));
        real.start(players, nowMs);
        for (const [id, t] of this.#thumbs) real.receiveInput(id, t.x, t.y, t.nowMs);
        for (const press of this.#presses) real.receiveAction(press);
        this.#thumbs.clear();
        this.#presses = [];
        this.#real = real;
      },
      () => {
        loading = undefined;
      },
    );
  }

  setActivity(isActive: (playerId: string) => boolean): void {
    this.#isActive = isActive;
    this.#real?.setActivity(isActive);
  }

  receiveInput(playerId: string, x: number, y: number, nowMs: number): void {
    if (this.#real !== undefined) this.#real.receiveInput(playerId, x, y, nowMs);
    else this.#thumbs.set(playerId, { x, y, nowMs });
  }

  receiveAction(action: PlayerAction): void {
    if (this.#real !== undefined) this.#real.receiveAction(action);
    else if (this.#presses.length < 256) this.#presses.push(action);
  }

  frame(nowMs: number): void {
    this.#real?.frame(nowMs);
  }

  rebase(nowMs: number): void {
    this.#real?.rebase(nowMs);
  }

  metrics(): RuntimeMetrics {
    return this.#real?.metrics() ?? NOT_LOADED;
  }

  view(roster: readonly RosterEntry[], slots: SlotAllocator): ArenaView | undefined {
    return this.#real?.view(roster, slots);
  }

  debugState(): unknown {
    return this.#real?.debugState();
  }
}
