import { describe, expect, it } from 'vitest';
import { createSeededRandom, type RandomSource } from '../src/random';

const take = (source: RandomSource, count: number) =>
  Array.from({ length: count }, () => source.next());

describe('seeded RandomSource', () => {
  it('same seed → exactly the same sequence', () => {
    expect(take(createSeededRandom(12345), 1000)).toEqual(take(createSeededRandom(12345), 1000));
  });

  it('different seeds → different sequences', () => {
    expect(take(createSeededRandom(1), 50)).not.toEqual(take(createSeededRandom(2), 50));
    expect(take(createSeededRandom(0), 50)).not.toEqual(take(createSeededRandom(1), 50));
  });

  it('instances are independent: consuming one does not advance another', () => {
    const a = createSeededRandom(7);
    const b = createSeededRandom(7);
    take(a, 100);
    expect(b.next()).toBe(createSeededRandom(7).next());
  });

  it('only ever yields numbers in [0, 1)', () => {
    const source = createSeededRandom(99);
    for (let i = 0; i < 20_000; i += 1) {
      const value = source.next();
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is not degenerate: 1000 draws are almost all distinct and spread across the range', () => {
    const values = take(createSeededRandom(5), 1000);
    expect(new Set(values).size).toBeGreaterThan(990);
    expect(Math.min(...values)).toBeLessThan(0.05);
    expect(Math.max(...values)).toBeGreaterThan(0.95);
  });

  // Golden values from an independent run of the canonical mulberry32 algorithm. They pin the
  // exact sequence so an accidental algorithm change (which would silently change every replay)
  // fails loudly. Integer arithmetic only, so they hold on any conforming JS engine.
  it.each([
    [
      0,
      [
        0.26642920868471265, 0.0003297457005828619, 0.2232720274478197, 0.1462021479383111,
        0.46732782293111086,
      ],
    ],
    [
      1,
      [
        0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741,
        0.9683778982143849,
      ],
    ],
    [
      42,
      [
        0.6011037519201636, 0.44829055899754167, 0.8524657934904099, 0.6697340414393693,
        0.17481389874592423,
      ],
    ],
    [
      4294967295,
      [
        0.8964226141106337, 0.189478256739676, 0.7156526781618595, 0.9440599093213677,
        0.8452364315744489,
      ],
    ],
  ])('seed %i reproduces the known sequence', (seed, expected) => {
    expect(take(createSeededRandom(seed), 5)).toEqual(expected);
  });

  it.each([-1, 1.5, 2 ** 32, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid seed (%s): seeds are integers in [0, 2^32 − 1]',
    (seed) => {
      expect(() => createSeededRandom(seed)).toThrow(RangeError);
    },
  );
});
