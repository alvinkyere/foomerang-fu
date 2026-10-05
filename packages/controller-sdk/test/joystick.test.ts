import { describe, expect, it } from 'vitest';
import { clampOrigin, joystickRadius, joystickVector } from '../src/joystick';

const magnitude = (v: { x: number; y: number }) => Math.sqrt(v.x * v.x + v.y * v.y);

// Foomerang convention: +X is right and +Y is DOWN, exactly like browser screen coordinates.
// A thumb moved down yields a positive Y. Nothing downstream flips it.
describe('joystickVector: pointer position → normalized movement', () => {
  const origin = { x: 200, y: 300 };
  const radius = 80;
  const at = (dx: number, dy: number) =>
    joystickVector(origin, { x: origin.x + dx, y: origin.y + dy }, radius);

  it('center → (0, 0)', () => {
    expect(at(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('right edge → (1, 0); left edge → (-1, 0)', () => {
    expect(at(radius, 0)).toEqual({ x: 1, y: 0 });
    expect(at(-radius, 0)).toEqual({ x: -1, y: 0 });
  });

  it('thumb DOWN → (0, 1); thumb UP → (0, -1)', () => {
    expect(at(0, radius)).toEqual({ x: 0, y: 1 });
    expect(at(0, -radius)).toEqual({ x: 0, y: -1 });
  });

  it('is proportional inside the radius', () => {
    expect(at(radius / 2, 0)).toEqual({ x: 0.5, y: 0 });
    expect(at(0, -radius / 4)).toEqual({ x: 0, y: -0.25 });
  });

  it('beyond the radius the magnitude stays at most 1 and the direction is kept', () => {
    expect(at(radius * 3, 0)).toEqual({ x: 1, y: 0 });
    const far = at(radius * 10, radius * 10);
    expect(magnitude(far)).toBeCloseTo(1, 12);
    expect(far.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(far.y).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it('never exceeds magnitude 1 anywhere, including far outside the control', () => {
    for (let dx = -400; dx <= 400; dx += 20) {
      for (let dy = -400; dy <= 400; dy += 20) {
        expect(magnitude(at(dx, dy)), `${dx},${dy}`).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });

  it('never yields negative zero', () => {
    for (const v of [at(0, 0), at(-0, 0), at(0, -0), at(radius, 0), at(0, radius)]) {
      expect(Object.is(v.x, -0) || Object.is(v.y, -0)).toBe(false);
    }
  });

  it.each([1, 37, 64, 200, 10_000])('is independent of the control’s size (radius %i)', (r) => {
    for (let degrees = 0; degrees < 360; degrees += 15) {
      const t = (degrees * Math.PI) / 180;
      const v = joystickVector(
        { x: 5, y: 7 },
        { x: 5 + r * Math.cos(t), y: 7 + r * Math.sin(t) },
        r,
      );
      expect(v.x, `${degrees}°`).toBeCloseTo(Math.cos(t), 9);
      expect(v.y, `${degrees}°`).toBeCloseTo(Math.sin(t), 9);
    }
  });

  it('is independent of where the origin is', () => {
    for (const o of [
      { x: 0, y: 0 },
      { x: -50, y: 900 },
      { x: 1e6, y: -1e6 },
    ]) {
      expect(joystickVector(o, { x: o.x + 40, y: o.y }, 80)).toEqual({ x: 0.5, y: 0 });
    }
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    'a radius of %s is a safe neutral',
    (r) => {
      expect(joystickVector(origin, { x: 999, y: 999 }, r)).toEqual({ x: 0, y: 0 });
    },
  );

  it('non-finite pointer coordinates are a safe neutral, never NaN', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(joystickVector(origin, { x: bad, y: 0 }, radius)).toEqual({ x: 0, y: 0 });
      expect(joystickVector(origin, { x: 0, y: bad }, radius)).toEqual({ x: 0, y: 0 });
    }
  });
});

describe('joystickRadius: derived from the control area, never from one phone’s resolution', () => {
  it.each([
    [320, 568],
    [390, 844],
    [844, 390],
    [1024, 768],
    [667, 375],
    [100, 100],
    [60, 60],
    [5_000, 5_000],
  ])('%i × %i gives a finite radius no bigger than half the short side', (w, h) => {
    const r = joystickRadius(w, h);
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(Math.min(w, h) / 2);
  });

  it('stays within comfortable thumb bounds on ordinary phones', () => {
    for (const [w, h] of [
      [390, 844],
      [844, 390],
      [360, 640],
    ] as const) {
      expect(joystickRadius(w, h)).toBeGreaterThanOrEqual(40);
      expect(joystickRadius(w, h)).toBeLessThanOrEqual(110);
    }
  });

  it.each([
    [0, 0],
    [-10, 50],
    [Number.NaN, 100],
    [100, Number.POSITIVE_INFINITY],
  ])('degenerate area %s × %s gives a zero radius, which is a safe neutral joystick', (w, h) => {
    expect(joystickRadius(w, h)).toBe(0);
  });
});

describe('clampOrigin: the joystick base must stay inside its area', () => {
  const bounds = { width: 400, height: 300 };
  const radius = 60;

  it('leaves a comfortable touch alone', () => {
    expect(clampOrigin({ x: 200, y: 150 }, bounds, radius)).toEqual({ x: 200, y: 150 });
  });

  it('pulls a touch near an edge or corner inward by the radius', () => {
    expect(clampOrigin({ x: 5, y: 150 }, bounds, radius)).toEqual({ x: 60, y: 150 });
    expect(clampOrigin({ x: 395, y: 150 }, bounds, radius)).toEqual({ x: 340, y: 150 });
    expect(clampOrigin({ x: 5, y: 5 }, bounds, radius)).toEqual({ x: 60, y: 60 });
    expect(clampOrigin({ x: 999, y: 999 }, bounds, radius)).toEqual({ x: 340, y: 240 });
  });

  it('centers the base when the area is too small to contain it', () => {
    expect(clampOrigin({ x: 10, y: 10 }, { width: 80, height: 80 }, 60)).toEqual({ x: 40, y: 40 });
  });
});
