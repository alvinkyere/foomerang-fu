import { describe, expect, it } from 'vitest';
import { BRIDGE_ISLANDS_ARENA } from '../src/rules/bridgeIslandsArena';
import { advanceSlider, sliderBox, toggleSlider, SLIDER_HOME } from '../src/rules/sliders';

// The bridge islands' bridge walls (the HQ, foomerang-fu physics hq.mp4 1:17-1:19): a lever pulled, both walls slide in across the deck and
// meet side by side on its middle line in about 1.6 s; pulled again they go back (sliders.ts, as the lily island's rock).
const [nw, se] = BRIDGE_ISLANDS_ARENA.sliders ?? [];

describe('the bridge islands’ sliding bridge walls', () => {
  it('are two sliders, worked by the same levers', () => {
    expect(BRIDGE_ISLANDS_ARENA.sliders).toHaveLength(2);
    expect(nw?.levers.length).toBeGreaterThanOrEqual(2);
    expect(se?.levers).toEqual(nw?.levers);
  });

  it('slide towards each other and end side by side on the deck’s middle line', () => {
    if (nw === undefined || se === undefined) throw new Error('no sliders');
    const a = sliderBox(nw, 1);
    const b = sliderBox(se, 1);
    // their runs point at each other
    expect(nw.by.x * se.by.x + nw.by.y * se.by.y).toBeLessThan(0);
    // at the end the two are as far apart as their half thicknesses together (touching), give or take a few units
    const gap = Math.hypot(a.x - b.x, a.y - b.y);
    expect(Math.abs(gap - (a.halfHeight + b.halfHeight))).toBeLessThan(12);
  });

  it('get there in about 1.6 seconds', () => {
    if (nw === undefined) throw new Error('no sliders');
    let s = toggleSlider(SLIDER_HOME);
    let t = 0;
    while (s.progress < 1 && t < 10) {
      s = advanceSlider(nw, s, 1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(1.3);
    expect(t).toBeLessThan(1.9);
  });
});
