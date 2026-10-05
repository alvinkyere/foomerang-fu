import { describe, expect, it } from 'vitest';
import { DEFAULT_DEAD_ZONE, normalizeMovementInput } from '../src/input';

const magnitude = (v: { x: number; y: number }) => Math.sqrt(v.x * v.x + v.y * v.y);
const normalize = (x: number, y: number, deadZone?: number) =>
  deadZone === undefined
    ? normalizeMovementInput({ x, y })
    : normalizeMovementInput({ x, y }, deadZone);

describe('directional input is generic, not joystick-specific', () => {
  it('defaults to a 0.15 dead zone', () => {
    expect(DEFAULT_DEAD_ZONE).toBe(0.15);
  });

  it('turns zero input into zero movement', () => {
    expect(magnitude(normalize(0, 0))).toBe(0);
  });
});

describe('radial dead zone with rescaling', () => {
  it.each([0, 0.05, 0.1, 0.149, 0.15])(
    'magnitude %s is inside the dead zone → exactly zero',
    (m) => {
      const v = normalize(m, 0);
      expect(v.x).toBeCloseTo(0, 15);
      expect(v.y).toBeCloseTo(0, 15);
      expect(magnitude(v)).toBe(0);
    },
  );

  it('is radial: the dead zone is a circle, not a square', () => {
    // (0.1, 0.1) has magnitude 0.141 → inside; (0.12, 0.12) has 0.1697 → outside.
    expect(magnitude(normalize(0.1, 0.1))).toBe(0);
    expect(magnitude(normalize(0.12, 0.12))).toBeGreaterThan(0);
  });

  it('rescales the remaining range onto [0, 1] (0.15→0, 0.575→0.5, 1→1)', () => {
    expect(magnitude(normalize(0.575, 0))).toBeCloseTo(0.5, 12);
    expect(magnitude(normalize(1, 0))).toBeCloseTo(1, 12);
    expect(magnitude(normalize(0.15, 0))).toBe(0);
  });

  it('is continuous at the edge: no jump from 0 to 0.15', () => {
    const justOutside = magnitude(normalize(0.15 + 1e-6, 0));
    expect(justOutside).toBeGreaterThan(0);
    expect(justOutside).toBeLessThan(1e-5); // ≈ 1.2e-6, not 0.15
  });

  it('is strictly increasing in magnitude outside the dead zone', () => {
    let previous = 0;
    for (let m = 0.16; m <= 1.0001; m += 0.01) {
      const out = magnitude(normalize(Math.min(m, 1), 0));
      expect(out).toBeGreaterThanOrEqual(previous);
      previous = out;
    }
    expect(previous).toBeCloseTo(1, 12);
  });

  it('preserves direction', () => {
    const v = normalize(0.3, 0.4); // magnitude 0.5, direction (0.6, 0.8)
    expect(magnitude(v)).toBeCloseTo((0.5 - 0.15) / 0.85, 12);
    expect(v.x / magnitude(v)).toBeCloseTo(0.6, 12);
    expect(v.y / magnitude(v)).toBeCloseTo(0.8, 12);
  });

  it('is symmetric: negating the input negates the output', () => {
    const a = normalize(0.7, -0.3);
    const b = normalize(-0.7, 0.3);
    expect(b.x).toBeCloseTo(-a.x, 15);
    expect(b.y).toBeCloseTo(-a.y, 15);
  });

  it('honors a configured dead zone: 0 disables it, 0.5 rescales [0.5, 1]', () => {
    expect(magnitude(normalize(0.1, 0, 0))).toBeCloseTo(0.1, 12);
    expect(magnitude(normalize(0.5, 0, 0.5))).toBe(0);
    expect(magnitude(normalize(0.75, 0, 0.5))).toBeCloseTo(0.5, 12);
    expect(magnitude(normalize(1, 0, 0.5))).toBeCloseTo(1, 12);
  });

  it('with the dead zone disabled, zero input is still exactly zero — not 0/0 = NaN', () => {
    const v = normalize(0, 0, 0);
    expect(Number.isNaN(v.x) || Number.isNaN(v.y)).toBe(false);
    expect(magnitude(v)).toBe(0);
    expect(magnitude(normalize(-0, 0, 0))).toBe(0);
  });

  it.each([-0.1, 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid dead zone (%s) as a programming error',
    (deadZone) => {
      expect(() => normalize(0.5, 0, deadZone)).toThrow(RangeError);
    },
  );
});

describe('unit-disc magnitude clamp (the diagonal exploit)', () => {
  it('(1, 1) has magnitude 1, not √2', () => {
    expect(magnitude(normalize(1, 1))).toBeCloseTo(1, 12);
  });

  it('(1, 1) points along the exact diagonal', () => {
    const v = normalize(1, 1);
    expect(v.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(v.y).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it('every full-deflection direction yields the same magnitude as straight right', () => {
    const right = magnitude(normalize(1, 0));
    for (const [x, y] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
      [0, 1],
      [0, -1],
      [-1, 0],
    ] as const) {
      expect(magnitude(normalize(x, y)), `(${x}, ${y})`).toBeCloseTo(right, 12);
    }
  });

  it('never exceeds 1 anywhere on, or beyond, the [-1, 1]² square', () => {
    for (let ix = -20; ix <= 20; ix += 1) {
      for (let iy = -20; iy <= 20; iy += 1) {
        const v = normalize(ix / 20, iy / 20);
        expect(magnitude(v), `(${ix / 20}, ${iy / 20})`).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });

  it('never exceeds 1 for a full circle of full-deflection angles', () => {
    for (let degrees = 0; degrees < 360; degrees += 1) {
      const radians = (degrees * Math.PI) / 180;
      expect(magnitude(normalize(Math.cos(radians), Math.sin(radians)))).toBeLessThanOrEqual(
        1 + 1e-12,
      );
    }
  });

  it.each([
    [5, 5],
    [1000, 10],
    [-1e6, 3],
    [1e300, 1e300],
    [Number.MAX_VALUE, 0],
  ])(
    'clamps wildly out-of-range finite input (%s, %s) without overflow, keeping direction',
    (x, y) => {
      const v = normalize(x, y);
      expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
      expect(magnitude(v)).toBeCloseTo(1, 12);
      expect(Math.sign(v.x)).toBe(Math.sign(x));
    },
  );

  it('keeps the direction of an out-of-range input (1000, 10) ≈ almost purely right', () => {
    const v = normalize(1000, 10);
    expect(v.y / v.x).toBeCloseTo(0.01, 9);
  });
});

describe('non-finite input is a safe no-op, never a poisoned state', () => {
  it.each([
    [Number.NaN, 0],
    [0, Number.NaN],
    [Number.POSITIVE_INFINITY, 0],
    [0, Number.NEGATIVE_INFINITY],
    [1, Number.NaN], // a half-valid vector is still garbage: it is zeroed as a whole
    [Number.NaN, Number.NaN],
  ])('(%s, %s) → zero movement', (x, y) => {
    expect(magnitude(normalize(x, y))).toBe(0);
  });
});

describe('purity', () => {
  it('does not mutate its input and works on frozen objects', () => {
    const input = Object.freeze({ x: 0.5, y: 0.5 });
    const out = normalizeMovementInput(input);
    expect(input).toEqual({ x: 0.5, y: 0.5 });
    expect(out).not.toBe(input);
  });

  it('is deterministic', () => {
    expect(normalize(0.37, -0.81)).toEqual(normalize(0.37, -0.81));
  });
});
