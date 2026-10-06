/**
 * Foomerang Fu's game modes, as the HOST chooses them before starting. A mode is identified by a stable id; the room
 * and session model never branch on it (the server only knows 'foomerang-fu'), so a later mode is one more entry here
 * and one more rules configuration, not a rewrite. Deliberately not a framework: a list, a selection, a rule for
 * "can this start".
 */
export type GameModeId = 'FREE_FOR_ALL' | 'HIDE_AND_SEEK';

export interface GameModeInfo {
  readonly id: GameModeId;
  readonly title: string;
  /** One line under the title. */
  readonly summary: string;
  /** False: shown, but it cannot be chosen and cannot be started. This is a rule, not a styling. */
  readonly available: boolean;
}

export const GAME_MODES: readonly GameModeInfo[] = Object.freeze([
  {
    id: 'FREE_FOR_ALL',
    title: 'Free For All',
    summary: 'First to 14 kills wins',
    available: true,
  },
  {
    id: 'HIDE_AND_SEEK',
    title: 'Hide & Seek',
    summary: 'Coming soon',
    available: false,
  },
]);

export const DEFAULT_MODE: GameModeId = 'FREE_FOR_ALL';

export const modeInfo = (id: GameModeId): GameModeInfo =>
  GAME_MODES.find((m) => m.id === id) as GameModeInfo;

/** Whether a match of this mode may begin at all (independent of who is in the room). */
export const isStartableMode = (id: GameModeId): boolean => modeInfo(id).available;

/** The host's current choice. An unavailable mode can never be selected. */
export class ModeSelection {
  #id: GameModeId = DEFAULT_MODE;
  readonly #listeners = new Set<() => void>();

  get id(): GameModeId {
    return this.#id;
  }

  /** Returns whether the selection took: false (and nothing changes) for a mode that is not available. */
  select(id: GameModeId): boolean {
    if (!isStartableMode(id)) return false;
    if (id !== this.#id) {
      this.#id = id;
      for (const listener of this.#listeners) listener();
    }
    return true;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
