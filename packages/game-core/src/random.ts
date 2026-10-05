/**
 * Deterministic randomness, injected wherever a game rule needs it. The simulation never touches
 * `Math.random`: same seed + same inputs ⇒ same game.
 */
export interface RandomSource {
  /** A number in [0, 1). */
  next(): number;
}

const SEED_MAX = 4_294_967_295; // 2^32 − 1

/**
 * mulberry32: a small, fast 32-bit generator. Integer arithmetic only (Math.imul, shifts), so the
 * sequence is exactly reproducible on any conforming JavaScript engine. Not cryptographic — and
 * must never be used for credentials or identifiers.
 *
 * NOTE: the generator's internal state is private. If a game rule ever draws from it during a
 * match and that match must be snapshot/replayed mid-way, the RNG state has to become part of the
 * serialized world state. Nothing needs that yet.
 */
export function createSeededRandom(seed: number): RandomSource {
  if (!Number.isInteger(seed) || seed < 0 || seed > SEED_MAX) {
    throw new RangeError(`seed must be an integer in [0, ${SEED_MAX}], got ${seed}`);
  }
  let state = seed | 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    },
  };
}
