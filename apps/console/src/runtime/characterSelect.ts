import type { PackCharacter } from '../render/reconstructed/maps';

/**
 * Character select, as in the reference video (game-setting.mp4): every player moves their OWN cursor over one shared grid,
 * SELECT readies them on the character under it, BACK un-readies. A character someone is ready on is theirs (a player's colour
 * is their character's colour, so two of one would be indistinguishable). CPUs are always ready, on a free character. Pure:
 * the host feeds it participants and each phone's menu actions; nothing here knows about screens or the network.
 */
export const SELECT_GRID: readonly (readonly PackCharacter[])[] = Object.freeze([
  Object.freeze(['avocado', 'banana', 'milk', 'watermelon', 'donut'] as const),
  Object.freeze(['coffee', 'icecream', 'bread', 'bacon', 'carrot'] as const),
]);

/** The character each seat had before anyone could choose (the market plaza's roster): where a new cursor starts. */
const SEAT_DEFAULT: readonly PackCharacter[] = [
  'bread',
  'coffee',
  'watermelon',
  'icecream',
  'banana',
  'carrot',
];

const ALL: readonly PackCharacter[] = SELECT_GRID.flat();

export interface SelectParticipant {
  readonly id: string;
  /** Their seat (0-based): decides where their cursor starts. */
  readonly slot: number;
  readonly cpu: boolean;
}

export interface Pick {
  readonly character: PackCharacter;
  readonly ready: boolean;
}

export type SelectDirection = 'up' | 'down' | 'left' | 'right';

/** What a SELECT did: readied them, was refused (someone is ready on it), asked to begin (everyone is ready), or nothing. */
export type SelectResult = 'READY' | 'TAKEN' | 'BEGIN' | 'NONE';

interface Cursor {
  row: number;
  col: number;
  ready: boolean;
  readonly cpu: boolean;
}

const at = (character: PackCharacter): { row: number; col: number } => {
  for (let row = 0; row < SELECT_GRID.length; row += 1) {
    const col = (SELECT_GRID[row] as readonly PackCharacter[]).indexOf(character);
    if (col >= 0) return { row, col };
  }
  return { row: 0, col: 0 };
};
const characterAt = (c: Cursor): PackCharacter =>
  (SELECT_GRID[c.row] as readonly PackCharacter[])[c.col] as PackCharacter;

export class CharacterSelect {
  readonly #cursors = new Map<string, Cursor>();
  readonly #listeners = new Set<() => void>();
  #version = 0;

  /** Goes up on every change: a stable snapshot for subscribers. */
  get version(): number {
    return this.#version;
  }

  /** The participants now (people and CPUs): newcomers get a cursor, leavers lose theirs. */
  sync(participants: readonly SelectParticipant[]): void {
    let changed = false;
    const present = new Set(participants.map((p) => p.id));
    for (const id of [...this.#cursors.keys()])
      if (!present.has(id)) {
        this.#cursors.delete(id);
        changed = true;
      }
    for (const p of participants) {
      if (this.#cursors.has(p.id)) continue;
      const wanted = SEAT_DEFAULT[p.slot % SEAT_DEFAULT.length] as PackCharacter;
      // a CPU takes a free character at once; a person may hover anything
      const start = p.cpu ? ([wanted, ...ALL].find((c) => !this.isTaken(c)) ?? wanted) : wanted;
      this.#cursors.set(p.id, { ...at(start), ready: p.cpu, cpu: p.cpu });
      changed = true;
    }
    if (changed) this.#emit();
  }

  pick(id: string): Pick | undefined {
    const c = this.#cursors.get(id);
    return c === undefined ? undefined : { character: characterAt(c), ready: c.ready };
  }

  /** Every participant's pick, in no particular order. */
  picks(): ReadonlyMap<string, Pick> {
    return new Map(
      [...this.#cursors].map(([id, c]) => [id, { character: characterAt(c), ready: c.ready }]),
    );
  }

  /** Someone is ready on it. */
  isTaken(character: PackCharacter, except?: string): boolean {
    for (const [id, c] of this.#cursors)
      if (id !== except && c.ready && characterAt(c) === character) return true;
    return false;
  }

  /** There is someone, and every person is ready (CPUs always are). */
  get allReady(): boolean {
    if (this.#cursors.size === 0) return false;
    for (const c of this.#cursors.values()) if (!c.ready) return false;
    return true;
  }

  move(id: string, direction: SelectDirection): void {
    const c = this.#cursors.get(id);
    if (c === undefined || c.ready || c.cpu) return;
    const row = c.row + (direction === 'down' ? 1 : direction === 'up' ? -1 : 0);
    const col = c.col + (direction === 'right' ? 1 : direction === 'left' ? -1 : 0);
    if (row < 0 || row >= SELECT_GRID.length) return;
    if (col < 0 || col >= (SELECT_GRID[row] as readonly PackCharacter[]).length) return;
    c.row = row;
    c.col = col;
    this.#emit();
  }

  select(id: string): SelectResult {
    const c = this.#cursors.get(id);
    if (c === undefined || c.cpu) return 'NONE';
    if (c.ready) return this.allReady ? 'BEGIN' : 'NONE';
    if (this.isTaken(characterAt(c), id)) return 'TAKEN';
    c.ready = true;
    this.#emit();
    return 'READY';
  }

  back(id: string): void {
    const c = this.#cursors.get(id);
    if (c === undefined || c.cpu || !c.ready) return;
    c.ready = false;
    this.#emit();
  }

  /** A fresh lobby: every person chooses again (their cursor stays where it was). */
  unready(): void {
    let changed = false;
    for (const c of this.#cursors.values())
      if (!c.cpu && c.ready) {
        c.ready = false;
        changed = true;
      }
    if (changed) this.#emit();
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(): void {
    this.#version += 1;
    for (const listener of [...this.#listeners]) listener();
  }
}
