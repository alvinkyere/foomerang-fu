import type { Difficulty } from '@foomerang/foomerang-fu';

/** A CPU participant as the host configured it: who it is and how well it plays. It has no connection, no seat and no socket. */
export interface CpuEntry {
  readonly id: string;
  readonly name: string;
  readonly difficulty: Difficulty;
}

/** The choices in the lobby, listed here (not imported from the game) so the lobby never pulls the game's code into the first download. */
export const CPU_DIFFICULTIES: readonly Difficulty[] = ['EASY', 'MEDIUM', 'HARD'];

/** A match holds at most six participants, humans and CPUs together (one per slot). */
export const MAX_PARTICIPANTS = 6;

/** CPU ids can never collide with a server-issued player id: no player id contains a colon. */
export const isCpuId = (id: string): boolean => id.startsWith('cpu:');

/**
 * The CPUs the host has added in the lobby: host-side configuration, kept in the console because
 * the server only knows people. Humans still arrive over the network; a CPU enters the match as a
 * body with a software controller (see FuRuntime).
 */
export class CpuRoster {
  #entries: readonly CpuEntry[] = [];
  #next = 1;
  readonly #listeners = new Set<() => void>();

  get entries(): readonly CpuEntry[] {
    return this.#entries;
  }

  /** Adds a CPU if there is still a free participant slot (`humans` people are already seated). */
  add(difficulty: Difficulty, humans: number): CpuEntry | undefined {
    if (humans + this.#entries.length >= MAX_PARTICIPANTS) return undefined;
    const n = this.#next;
    this.#next += 1;
    const entry = Object.freeze({ id: `cpu:${n}`, name: `CPU ${n}`, difficulty });
    this.#set([...this.#entries, entry]);
    return entry;
  }

  remove(id: string): void {
    if (this.#entries.some((e) => e.id === id)) this.#set(this.#entries.filter((e) => e.id !== id));
  }

  setDifficulty(id: string, difficulty: Difficulty): void {
    this.#set(this.#entries.map((e) => (e.id === id ? Object.freeze({ ...e, difficulty }) : e)));
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #set(entries: readonly CpuEntry[]): void {
    this.#entries = entries;
    for (const listener of this.#listeners) listener();
  }
}
