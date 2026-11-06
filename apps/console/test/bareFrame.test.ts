import { describe, expect, it } from 'vitest';
import { isBareFrame, withoutActors } from '../src/render/three/bareFrame';

// `?frame=hq&bare=on` (a developer's check of a map against its HQ frame): the map alone, no characters, boomerangs or pickups, so a
// pixel comparison measures the map and not where the players happen to stand.
describe('the bare frame', () => {
  it('is asked for with bare=on, and only then', () => {
    expect(isBareFrame('?arena=bridge&frame=hq&bare=on')).toBe(true);
    expect(isBareFrame('?arena=bridge&frame=hq')).toBe(false);
    expect(isBareFrame('?bare=off')).toBe(false);
  });

  it('keeps the map’s own moving parts but drops the actors', () => {
    const view = {
      circles: [{ id: 'a' }],
      boomerangs: [{ id: 'b' }],
      pickups: [{ id: 'p' }],
      sliders: [{ progress: 0.5 }],
    };
    const bare = withoutActors(view);
    expect(bare.circles).toEqual([]);
    expect(bare.boomerangs).toEqual([]);
    expect(bare.pickups).toEqual([]);
    expect(bare.sliders).toEqual(view.sliders);
  });
});
