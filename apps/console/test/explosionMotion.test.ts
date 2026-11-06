import { describe, expect, it } from 'vitest';
import { EXPLOSION_SECONDS, explosionAt, shakeAt } from '../src/render/explosionMotion';

// The Explosive's blast as the HQ video draws it (foomerang-fu physics hq.mp4 5:22.47, every frame; art/physics_reference/README.md,
// "The Explosive's blast, measured on the HQ"). Lengths are fractions of R, the ring's final radius (the kill radius).

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a: string, b: string, tol: number) =>
  rgb(a).every((v, i) => Math.abs(v - (rgb(b)[i] ?? 0)) <= tol);

describe('the explosion, as measured', () => {
  it('opens with a solid white ball 0.27 R across, gone by 0.15 s', () => {
    expect(explosionAt(0.03).white?.radius).toBeCloseTo(0.27, 2);
    expect(explosionAt(0.12).white?.radius ?? 0).toBeLessThan(0.15);
    expect(explosionAt(0.16).white).toBeUndefined();
  });

  it('spreads a ring on the ground at the measured pace, filled until ~0.43 s, then a thinning band', () => {
    expect(explosionAt(0.1).ring?.outer).toBeCloseTo(0.27, 1);
    expect(explosionAt(0.3).ring?.outer).toBeCloseTo(0.81, 1);
    expect(explosionAt(0.6).ring?.outer).toBeCloseTo(0.97, 1);
    expect(explosionAt(0.3).ring?.inner).toBe(0);
    const late = explosionAt(0.7).ring;
    if (late === undefined) throw new Error('no ring at 0.7 s');
    expect(late.outer - late.inner).toBeGreaterThan(0.07);
    expect(late.outer - late.inner).toBeLessThan(0.14);
    expect(explosionAt(0.8).ring).toBeUndefined();
  });

  it('colours the ring yellow, then orange, pinkest at ~0.57 s, and fades it out', () => {
    expect(near(explosionAt(0.33).ring?.colour ?? '', '#fcfd1b', 12)).toBe(true);
    expect(near(explosionAt(0.5).ring?.colour ?? '', '#fca94d', 12)).toBe(true);
    expect(near(explosionAt(0.57).ring?.colour ?? '', '#fd7b69', 12)).toBe(true);
    expect(explosionAt(0.5).ring?.opacity).toBe(1);
    expect(explosionAt(0.76).ring?.opacity ?? 1).toBeLessThan(0.5);
  });

  it('throws fire balls from 0.22 s, ~0.7 R out, that cool from orange to dark red and end as smoke, gone by its end', () => {
    expect(explosionAt(0.15).balls).toHaveLength(0);
    const hot = explosionAt(0.3).balls;
    expect(hot.length).toBeGreaterThan(12);
    const out = hot.map((b) => Math.hypot(b.x, b.z)).sort((a, b) => a - b);
    expect(out[Math.floor(out.length * 0.75)] ?? 0).toBeGreaterThan(0.55);
    expect(hot.every((b) => near(b.colour, '#d43311', 40))).toBe(true);
    expect(explosionAt(0.52).balls.every((b) => near(b.colour, '#826776', 40))).toBe(true);
    expect(explosionAt(EXPLOSION_SECONDS).balls).toHaveLength(0);
  });

  it('is the same blast every time for a seed', () => {
    expect(explosionAt(0.4, 7)).toEqual(explosionAt(0.4, 7));
    expect(explosionAt(0.4, 7)).not.toEqual(explosionAt(0.4, 8));
  });

  it('shakes the screen up to 2% of its height, at random each frame, still by 0.5 s', () => {
    for (let f = 1; f < 12; f += 1) expect(Math.abs(shakeAt(f / 60).y)).toBeLessThanOrEqual(0.02);
    expect(new Set([1, 2, 3, 4, 5].map((f) => shakeAt(f / 60).y)).size).toBeGreaterThan(3);
    expect(shakeAt(0.5)).toEqual({ x: 0, y: 0 });
    expect(shakeAt(-0.1)).toEqual({ x: 0, y: 0 });
  });
});
