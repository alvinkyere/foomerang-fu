import { describe, expect, it } from 'vitest';
import { BLAST_SECONDS, blastAt } from '../src/render/blastMotion';

// An Explosive boomerang's blast as the reference video draws it (10:17.4, sampled every frame; art/physics_reference/README.md,
// "Explosive boomerang"). Lengths are fractions of the blast radius R (the full ring, which is what kills); t from the puff.

describe('the blast, as the video draws it', () => {
  it('a white puff first, then a yellow flash that fills out to the ring', () => {
    expect(blastAt(0.05).puff).toBeDefined();
    expect(blastAt(0.05).ring).toBeUndefined();
    expect(blastAt(0.12).flash?.radius).toBeCloseTo(0.24, 1);
    expect(blastAt(0.17).flash?.radius).toBeCloseTo(0.53, 1);
  });

  it('the ring grows fast, then slowly, to the full radius R by 0.6 s', () => {
    expect(blastAt(0.2).ring?.outer).toBeCloseTo(0.63, 2);
    expect(blastAt(0.3).ring?.outer).toBeCloseTo(0.84, 2);
    expect(blastAt(0.4).ring?.outer).toBeCloseTo(0.9, 2);
    expect(blastAt(0.6).ring?.outer).toBeCloseTo(1, 2);
    let last = 0;
    for (let t = 0.2; t < BLAST_SECONDS; t += 0.01) {
      const outer = blastAt(t).ring?.outer ?? 0;
      expect(outer).toBeGreaterThanOrEqual(last - 1e-9);
      expect(outer).toBeLessThanOrEqual(1 + 1e-9);
      last = outer;
    }
  });

  it('yellow, then orange, then red-pink as it thins out, and gone by 0.74 s', () => {
    expect(blastAt(0.3).ring?.colour).toBe('#fdfd8c');
    expect(blastAt(0.53).ring?.colour).toBe('#f79b76');
    expect(blastAt(0.6).ring?.colour).toBe('#f3857f');
    const late = blastAt(0.68).ring;
    expect(late !== undefined && late.outer - late.inner).toBeLessThan(0.06);
    expect(BLAST_SECONDS).toBeCloseTo(0.74, 2);
    expect(blastAt(BLAST_SECONDS)).toEqual({ smoke: [] });
  });

  it('dark smoke balls hang near the middle while it burns', () => {
    expect(blastAt(0.4).smoke.length).toBeGreaterThanOrEqual(3);
    for (const s of blastAt(0.4).smoke) expect(Math.hypot(s.x, s.z)).toBeLessThan(0.4);
    expect(blastAt(0.1).smoke).toEqual([]);
  });
});
