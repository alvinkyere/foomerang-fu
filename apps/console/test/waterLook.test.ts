import { describe, expect, it } from 'vitest';
import { WATER_LOOK, waterAt } from '../src/render/waterLook';

// The fountain's water as the reference video shows it (art/physics_reference/README.md, "The water"): not a flat disc. A pale
// glow hugs every edge, the basin's wall and the shell island alike; thin light foam lines are born at each edge and drift
// slowly away from it (≈ 0.06 units a second), fading, broken into pieces. `d` is how far a spot is from its nearest edge
// (scene units), `piece` the noise that breaks the lines (0…1), `t` seconds.

const foamAt = (d: number, t: number) => waterAt(d, 1, t).foam;

describe('the fountain’s water', () => {
  it('glows pale where it meets an edge, and is its own blue away from them', () => {
    expect(waterAt(0, 0, 0).glow).toBeCloseTo(1, 9);
    expect(waterAt(WATER_LOOK.glowWidth / 2, 0, 0).glow).toBeGreaterThan(0.3);
    expect(waterAt(WATER_LOOK.glowWidth, 0, 0).glow).toBe(0);
    expect(waterAt(1.5, 1, 3).glow).toBe(0);
    expect(waterAt(1.5, 1, 3).foam).toBe(0);
  });

  it('its colours are environ2’s: the water, and its light by the edges', () => {
    expect(WATER_LOOK.base).toBe('#78d2e7');
    expect(WATER_LOOK.light).toBe('#a9e6ec');
  });

  it('a foam line follows an edge at a distance, and drifts away from it as the video’s do', () => {
    // where the line is now, and a second later
    const peak = (t: number) => {
      let best = 0;
      let at = 0;
      for (let d = 0.12; d < 0.12 + WATER_LOOK.foamSpacing; d += 0.002) {
        const f = foamAt(d, t);
        if (f > best) [best, at] = [f, d];
      }
      return at;
    };
    const now = peak(10);
    const later = peak(11);
    expect(later - now).toBeCloseTo(WATER_LOOK.drift, 2);
    expect(WATER_LOOK.drift).toBeCloseTo(0.06, 2);
  });

  it('a line is thin: between lines the water is clear', () => {
    let lit = 0;
    const n = 400;
    for (let i = 0; i < n; i += 1)
      if (foamAt(0.15 + (i / n) * WATER_LOOK.foamSpacing, 4) > 0.5) lit += 1; // (a line at 0.24)
    expect(lit / n).toBeGreaterThan(0.02);
    expect(lit / n).toBeLessThan(0.25);
  });

  it('fades as it drifts out, and is gone before the middle of the open water', () => {
    const strongest = (from: number) => {
      let m = 0;
      for (let t = 0; t < WATER_LOOK.foamSpacing / WATER_LOOK.drift; t += 0.05)
        m = Math.max(m, foamAt(from, t));
      return m;
    };
    expect(strongest(0.3)).toBeGreaterThan(strongest(0.7));
    expect(strongest(WATER_LOOK.foamReach)).toBe(0);
  });

  it('is broken into pieces: where the noise is low there is no foam', () => {
    let best = 0;
    for (let d = 0.15; d < 0.6; d += 0.002) best = Math.max(best, waterAt(d, 0.1, 4).foam);
    expect(best).toBe(0);
  });
});
