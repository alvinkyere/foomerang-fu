/** A small seeded generator (mulberry32). Every bit of CPU variability comes from one of these: no ambient randomness. */
export class Rng {
  #state: number;
  constructor(seed: number) {
    this.#state = seed >>> 0;
  }
  /** Uniform in [0, 1). */
  next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(low: number, high: number): number {
    return low + (high - low) * this.next();
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Roughly normal with standard deviation 1 (the sum of four uniforms, rescaled). */
  gauss(): number {
    return ((this.next() + this.next() + this.next() + this.next() - 2) * Math.sqrt(3)) / 1;
  }
}

/** Mixes a match seed and a small integer into a CPU's own seed. */
export function seedFor(matchSeed: number, index: number): number {
  let x = (matchSeed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}
