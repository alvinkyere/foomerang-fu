import { describe, expect, it } from 'vitest';
import { BRIDGE_ISLANDS_ARENA } from '../src/rules/bridgeIslandsArena';
import {
  advanceSlider,
  sliderBox,
  toggleSlider,
  SLIDER_HOME,
  type SliderState,
} from '../src/rules/sliders';

// The bridge islands' bridge walls (the HQ, foomerang-fu physics hq.mp4 1:17-1:19 and 1:33-1:34): a lever pulled, every slab of both walls
// slides in across the deck, but not as one: each sets off a beat after the one before it (from the south-west end), a staircase across the
// deck, and they end side by side on its middle line about 1.4 s after the pull; pulled again they go back the same way at the same pace.
const sliders = BRIDGE_ISLANDS_ARENA.sliders ?? [];
const nw = sliders.slice(0, 3);
const se = sliders.slice(3, 6);

const run = (forward: boolean, seconds: number) =>
  sliders.map((spec) => {
    let s: SliderState = forward ? SLIDER_HOME : { progress: 1, dir: 0, last: 1 };
    s = toggleSlider(s, spec);
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) s = advanceSlider(spec, s, 1 / 60);
    return s.progress;
  });

describe('the bridge islands’ sliding bridge walls', () => {
  it('are three slabs a wall, each its own slider, all worked by the same levers', () => {
    expect(sliders).toHaveLength(6);
    for (const s of sliders) expect(s.levers).toEqual(sliders[0]?.levers);
  });

  it('set off one after another: a staircase across the deck part way through', () => {
    const p = run(true, 0.5);
    for (const wall of [p.slice(0, 3), p.slice(3, 6)])
      for (let j = 1; j < 3; j += 1) expect(wall[j] as number).toBeLessThan(wall[j - 1] as number);
    expect(p[0]).toBeGreaterThan(0.3);
    expect(p[2]).toBeLessThan(0.25);
  });

  it('end side by side on the deck’s middle line, about 1.3 s after the pull', () => {
    expect(Math.min(...run(true, 1.2))).toBeLessThan(1);
    expect(run(true, 1.45).every((v) => v === 1)).toBe(true);
    for (let j = 0; j < 3; j += 1) {
      const a = sliderBox(nw[j] as (typeof sliders)[number], 1);
      const b = sliderBox(se[j] as (typeof sliders)[number], 1);
      const n = {
        x: (nw[0]?.by.x ?? 0) / Math.hypot(nw[0]?.by.x ?? 0, nw[0]?.by.y ?? 1),
        y: (nw[0]?.by.y ?? 0) / Math.hypot(nw[0]?.by.x ?? 0, nw[0]?.by.y ?? 1),
      };
      const across = Math.abs((a.x - b.x) * n.x + (a.y - b.y) * n.y);
      expect(Math.abs(across - (a.halfHeight + b.halfHeight))).toBeLessThan(12);
    }
  });

  it('go back exactly as they came: the same pace and the same staircase, the other way', () => {
    const out = run(true, 0.5);
    const back = run(false, 0.5);
    out.forEach((p, k) => expect(back[k] as number).toBeCloseTo(1 - p, 6));
    expect(run(false, 1.45).every((v) => v === 0)).toBe(true);
  });
});
