import { describe, expect, it } from 'vitest';
import { BOOMERANG_SHAPE, boomerangMesh } from '../src/render/boomerangShape';

// The boomerang as the store's full-HD shots draw it (the yellow one lying at ss05, the pink and yellow ones held at ss01): a
// fat "<", two thick arms meeting at a smoothly rounded elbow, opening at ≈ 90°, rounded at the tips, with a real thickness
// (we see it edge-on when held). Half a character's height long: ≈ 36 u (characters are drawn ≈ 70–76 u tall; the video's
// flying boomerang is 0.46 of the 27 px donut's width).

const pts = (m: ReturnType<typeof boomerangMesh>) => {
  const out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < m.positions.length; i += 3)
    out.push({
      x: m.positions[i] as number,
      y: m.positions[i + 1] as number,
      z: m.positions[i + 2] as number,
    });
  return out;
};

describe('the boomerang’s shape', () => {
  const m = boomerangMesh();
  const p = pts(m);

  it('is the measured size: about half a character tall, tip to tip', () => {
    expect(BOOMERANG_SHAPE.span).toBe(36);
    const xs = p.map((q) => q.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(BOOMERANG_SHAPE.span, 0);
  });

  it('is flat with a real thickness, a fraction of an arm’s width', () => {
    const ys = p.map((q) => q.y);
    const thick = Math.max(...ys) - Math.min(...ys);
    expect(thick).toBeGreaterThan(0.05 * BOOMERANG_SHAPE.span);
    expect(thick).toBeLessThan(0.2 * BOOMERANG_SHAPE.span);
  });

  it('is a "<": symmetric about its middle, the elbow out in front of the tips', () => {
    for (const q of p)
      expect(p.some((r) => Math.hypot(r.x + q.x, r.y - q.y, r.z - q.z) < 1e-6)).toBe(true);
    const front = Math.max(...p.map((q) => q.z));
    const tips = p.filter((q) => Math.abs(Math.abs(q.x) - BOOMERANG_SHAPE.span / 2) < 2);
    expect(tips.length).toBeGreaterThan(0);
    for (const t of tips) expect(t.z).toBeLessThan(front - 0.25 * BOOMERANG_SHAPE.span);
  });

  it('is a closed, indexed mesh', () => {
    expect(m.indices.length % 3).toBe(0);
    expect(Math.max(...m.indices)).toBeLessThan(p.length);
  });
});
