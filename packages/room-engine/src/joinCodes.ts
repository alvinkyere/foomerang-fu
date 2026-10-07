import type { JoinCode } from './ids';

/**
 * The set of join codes in use. One instance may be shared by the legacy room registry and the
 * console registry while both exist (ADR-004 §10), so one code can never mean two things.
 * Synchronous, like the registries that use it: claim-if-free is atomic within the process.
 */
export class JoinCodeSpace {
  readonly #inUse = new Set<JoinCode>();

  /** Takes the code if it is free; false if somebody already holds it. */
  claim(code: JoinCode): boolean {
    if (this.#inUse.has(code)) return false;
    this.#inUse.add(code);
    return true;
  }

  release(code: JoinCode): void {
    this.#inUse.delete(code);
  }

  has(code: JoinCode): boolean {
    return this.#inUse.has(code);
  }
}
