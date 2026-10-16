import { describe, expect, it } from 'vitest';
import { RECONSTRUCTED_MAPS } from '../src/render/reconstructed/maps';
import { MAP_POOL, MapRotation } from '../src/runtime/mapRotation';

/** Small deterministic PRNG so a failing run can be replayed. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('the map changes every match', () => {
  it('the pool is exactly the maps built from the rendered files: no Garden, no test arenas', () => {
    expect([...MAP_POOL].sort()).toEqual(Object.keys(RECONSTRUCTED_MAPS).sort());
    expect(MAP_POOL).toHaveLength(14);
    for (const excluded of ['garden', 'primitive', 'systems']) {
      expect(MAP_POOL as readonly string[]).not.toContain(excluded);
    }
  });

  it('never the same map twice in a row, over thousands of matches and many seeds', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const maps = new MapRotation(seeded(seed));
      let last = maps.next();
      for (let i = 0; i < 1_000; i += 1) {
        const next = maps.next();
        expect(next, `seed ${seed}, match ${i}`).not.toBe(last);
        last = next;
      }
    }
  });

  it('every map is played before any map comes back (each run of 14 matches is all 14 maps)', () => {
    const maps = new MapRotation(seeded(7));
    for (let round = 0; round < 20; round += 1) {
      const run = Array.from({ length: MAP_POOL.length }, () => maps.next());
      expect(new Set(run).size, `round ${round}`).toBe(MAP_POOL.length);
    }
  });

  it('the order is not fixed: different randomness, different order', () => {
    const a = new MapRotation(seeded(1));
    const b = new MapRotation(seeded(2));
    const runA = Array.from({ length: 14 }, () => a.next());
    const runB = Array.from({ length: 14 }, () => b.next());
    expect(runA).not.toEqual(runB);
  });

  it('a random source at the edge of its range (0, just under 1) still yields valid maps', () => {
    for (const value of [0, 0.999_999_999]) {
      const maps = new MapRotation(() => value);
      let last = maps.next();
      for (let i = 0; i < 40; i += 1) {
        const next = maps.next();
        expect(MAP_POOL).toContain(next);
        expect(next).not.toBe(last);
        last = next;
      }
    }
  });
});
