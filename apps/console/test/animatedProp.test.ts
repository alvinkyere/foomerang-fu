import { describe, expect, it } from 'vitest';
import { animationFrame } from '../src/render/reconstructed/animatedProp';

// Environment animation of a reconstructed map (sky_islands' croissant): presentation only, driven by the clock, never by the
// simulation. The frame shown is the fraction of the MEASURED period that has elapsed.
describe('animated environment props', () => {
  it('starts at frame 0 and steps evenly through the period', () => {
    expect(animationFrame(0, 4.8, 36)).toBe(0);
    expect(animationFrame(4800 / 36, 4.8, 36)).toBe(1);
    expect(animationFrame(2400, 4.8, 36)).toBe(18);
  });

  it('wraps after one period and never leaves the sheet', () => {
    expect(animationFrame(4800, 4.8, 36)).toBe(0);
    expect(animationFrame(4800 * 7 + 1, 4.8, 36)).toBe(0);
    for (let t = 0; t < 20_000; t += 37) {
      const f = animationFrame(t, 4.8, 36);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(36);
    }
  });
});
