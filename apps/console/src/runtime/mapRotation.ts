import { RECONSTRUCTED_MAPS, type ReconstructedArena } from '../render/reconstructed/maps';

/**
 * The maps a real match is played on: every map built from the rendered reference files, and
 * nothing else (no test arenas). Derived from the reconstructed-map table, so a map added there
 * joins the rotation by itself.
 */
export const MAP_POOL: readonly ReconstructedArena[] = Object.freeze(
  Object.keys(RECONSTRUCTED_MAPS) as ReconstructedArena[],
);

/**
 * Every match is on a different map, always. A shuffle bag: each map is played once before any map
 * comes back, the order differs every time, and the first map of a new bag is never the last map of
 * the previous one, so the same map is never played twice in a row. Randomness is injected
 * (`random()` in [0, 1)), so tests are deterministic.
 */
export class MapRotation {
  readonly #random: () => number;
  #bag: ReconstructedArena[] = [];
  #last: ReconstructedArena | undefined;

  constructor(random: () => number = Math.random) {
    this.#random = random;
  }

  /** The map for the next match. */
  next(): ReconstructedArena {
    if (this.#bag.length === 0) this.#refill();
    const map = this.#bag.pop() as ReconstructedArena;
    this.#last = map;
    return map;
  }

  #refill(): void {
    const bag = [...MAP_POOL];
    // Fisher–Yates, drawing from the injected source (clamped: a source returning 1 is out of contract).
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.min(i, Math.floor(this.#random() * (i + 1)));
      [bag[i], bag[j]] = [bag[j] as ReconstructedArena, bag[i] as ReconstructedArena];
    }
    // `next()` pops from the end: the map about to be played must not repeat the one just played.
    if (bag.length > 1 && bag[bag.length - 1] === this.#last) {
      [bag[0], bag[bag.length - 1]] = [
        bag[bag.length - 1] as ReconstructedArena,
        bag[0] as ReconstructedArena,
      ];
    }
    this.#bag = bag;
  }
}
