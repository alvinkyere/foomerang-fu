import { describe, expect, it } from 'vitest';
import { sliderNodeIndex, sliderOffset } from '../src/render/three/sliderNodes';

// Rocks that levers move (rules sliders.ts): each is a glTF node SLIDER_<k>, moved by the rules' slider k (the lily island has one; the
// bridge islands two, its bridge walls, which slide in across the deck and meet in the middle as the HQ's do, 1:17-1:19).
describe('slider nodes', () => {
  it('a node named SLIDER_<k> is slider k; anything else is none', () => {
    expect(sliderNodeIndex('SLIDER_0')).toBe(0);
    expect(sliderNodeIndex('SLIDER_1')).toBe(1);
    expect(sliderNodeIndex('SLIDER_12')).toBe(12);
    expect(sliderNodeIndex('SLIDER_0_brick')).toBeNull();
    expect(sliderNodeIndex('STONE_3')).toBeNull();
  });

  it('a slider moves by its run times its progress, in scene units', () => {
    const toScene = (x: number, y: number) => ({ x: x / 10, z: y / 10 });
    expect(sliderOffset({ progress: 0.5, by: { x: 100, y: -40 } }, toScene)).toEqual({
      x: 5,
      z: -2,
    });
    expect(sliderOffset({ progress: 0, by: { x: 100, y: -40 } }, toScene)).toEqual({ x: 0, z: 0 });
  });
});
