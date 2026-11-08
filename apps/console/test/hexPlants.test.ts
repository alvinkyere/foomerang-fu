import { describe, expect, it } from 'vitest';
import {
  BURN,
  burnAt,
  parsePlantGroups,
  parsePlants,
  PlantField,
  type PlantsData,
} from '../src/render/hexPlants';

// The hex meadow's plants (ff physics hq 2.mp4 20:02; art/hex_meadow/README.md): pads on stems that players and boomerangs push
// aside and that spring back, and that fire burns pad by pad, spreading to the touching ones.

const s = 0.675;
const row = (n: number): PlantsData => ({
  s,
  height: 2.9,
  pads: Array.from({ length: n }, (_, i) => [i * Math.sqrt(3) * s, 0, 1, false] as const),
  shade: ['#6cc791', '#7bd29a', '#8bdda2'],
});
const step = (
  f: PlantField,
  from: number,
  to: number,
  input: Parameters<PlantField['step']>[1],
) => {
  for (let t = from; t < to; t += 1 / 60) f.step(1 / 60, { ...input, now: t });
};
const none = { now: 0, pushers: [], fires: [] };

describe('the hex plants', () => {
  it('reads only well-formed data', () => {
    expect(parsePlants(undefined)).toBeUndefined();
    expect(
      parsePlants({ s: 0.6, height: 2.9, pads: [[0, 0, 5, false]], shade: [] }),
    ).toBeUndefined();
    expect(parsePlants({ s: 0.6, height: -1, pads: [], shade: [] })).toBeUndefined();
    expect(parsePlants(row(3))?.pads).toHaveLength(3);
  });

  it('takes a map’s own shadow (colour and fall per unit of height: the temple court’s sun is in the east), checked', () => {
    const own = parsePlants({ ...row(2), shadow: { colour: '#c2c883', perHeight: [-0.7, -0.1] } });
    expect(own?.shadow).toEqual({ colour: '#c2c883', perHeight: [-0.7, -0.1] });
    expect(parsePlants(row(2))?.shadow).toBeUndefined(); // (the meadow's own, in the view)
    expect(
      parsePlants({ ...row(2), shadow: { colour: 'red', perHeight: [0, 0] } }),
    ).toBeUndefined();
    expect(
      parsePlants({ ...row(2), shadow: { colour: '#c2c883', perHeight: [0] } }),
    ).toBeUndefined();
    expect(
      parsePlants({ ...row(2), shadow: { colour: '#c2c883', perHeight: [Number.NaN, 0] } }),
    ).toBeUndefined();
  });

  it('stand still untouched, each at its own rest: heights within ~0.3 of the stems’, leaning a little (measured: sd 0.2, 0.1)', () => {
    const f = new PlantField(row(40));
    const rest = Array.from({ length: 40 }, (_, i) => f.pose(i));
    step(f, 0, 1, none);
    const tops = rest.map((p) => p.top);
    for (let i = 0; i < 40; i += 1) {
      expect(f.pose(i)).toEqual(rest[i]);
      expect(Math.abs((tops[i] as number) - 2.9)).toBeLessThanOrEqual(0.36);
      expect(Math.hypot(rest[i]?.dx ?? 0, rest[i]?.dz ?? 0)).toBeLessThanOrEqual(0.2);
    }
    const mean = tops.reduce((a, b) => a + b, 0) / 40;
    const sd = Math.sqrt(tops.reduce((a, b) => a + (b - mean) ** 2, 0) / 40);
    expect(sd).toBeGreaterThan(0.1);
    expect(sd).toBeLessThan(0.3);
  });

  it('lean away from a player standing among them, clear of its body, and spring back once it has gone', () => {
    const f = new PlantField(row(1));
    const rest = f.pose(0);
    step(f, 0, 0.5, { ...none, pushers: [{ x: -0.4, z: 0, radius: 1.2 }] });
    const bent = f.pose(0);
    expect(bent.dx).toBeGreaterThan(0.7); // (away from it: its top at least ~the push radius from it)
    expect(Math.abs(bent.dz - rest.dz)).toBeLessThan(0.1);
    expect(bent.top).toBeLessThan(rest.top);
    // still bent a little after a second (the HQ: lanes stay open ~1 s), back at rest after three
    step(f, 0.5, 1.2, none);
    expect(f.pose(0).dx - rest.dx).toBeGreaterThan(0.1);
    step(f, 1.2, 4, none);
    expect(Math.abs(f.pose(0).dx - rest.dx)).toBeLessThan(0.05);
  });

  it('never lean further than the stem allows', () => {
    const f = new PlantField(row(1));
    step(f, 0, 0.3, { ...none, pushers: [{ x: -0.1, z: 0, radius: 6 }] });
    const p = f.pose(0);
    expect(Math.hypot(p.dx, p.dz)).toBeLessThanOrEqual(
      3.25 * Math.sin((65 * Math.PI) / 180) + 1e-6,
    );
    expect(p.top).toBeGreaterThan(0);
  });

  it('catch fire where fire touches them and pass it on to the touching ones, one after another', () => {
    const f = new PlantField(row(6));
    f.step(1 / 60, { now: 0, pushers: [], fires: [{ x: 0, z: 0, radius: 0.5 }] });
    expect(f.burning(0)).toBe(0);
    expect(f.burning(1)).toBeUndefined();
    step(f, 1 / 60, 3, none);
    const lit = [0, 1, 2, 3, 4, 5].map((i) => f.burning(i));
    expect(lit.every((t) => t !== undefined)).toBe(true);
    for (let i = 1; i < 6; i += 1) {
      const gap = (lit[i] as number) - (lit[i - 1] as number);
      expect(gap).toBeGreaterThanOrEqual(BURN.spread[0] - 1e-9);
      expect(gap).toBeLessThanOrEqual(BURN.spread[1] + 1 / 60 + 1e-9);
    }
  });

  it('does not jump a gap between fields', () => {
    const data = row(2);
    const far: PlantsData = {
      ...data,
      pads: [data.pads[0] as PlantsData['pads'][number], [5, 0, 1, false]],
    };
    const f = new PlantField(far);
    f.step(1 / 60, { now: 0, pushers: [], fires: [{ x: 0, z: 0, radius: 0.5 }] });
    step(f, 1 / 60, 4, none);
    expect(f.burning(1)).toBeUndefined();
  });

  it('a burnt pad is gone, and a new round grows every pad back', () => {
    const f = new PlantField(row(2));
    f.ignite(0, 0);
    expect(f.gone(0, BURN.gone + 0.01)).toBe(true);
    expect(f.gone(0, BURN.gone - 0.01)).toBe(false);
    f.reset();
    expect(f.burning(0)).toBeUndefined();
    expect(f.gone(0, 10)).toBe(false);
  });

  it('burns as the HQ shows: yellow at once, golden, orange, then dark smoke; gone by its end', () => {
    expect(burnAt(-0.1)).toBeUndefined();
    expect(burnAt(0.05)?.colour).toBe('#f7e91f');
    expect(burnAt(0.5)?.smoke).toBe(false);
    expect(burnAt(BURN.gone + 0.1)?.smoke).toBe(true);
    expect(burnAt(BURN.end + 0.01)).toBeUndefined();
  });

  it('wherever they grow (the gong islands, the plaza): groups of their own size, turn, colours and plate heights', () => {
    const group = {
      s: 0.5,
      height: 2.4,
      turn: Math.PI / 6,
      shade: ['#6bc691', '#7ed39a'],
      flower: '#f4d98c',
      stem: '#6bc691',
      pads: [
        [0, 0, 0, true, 2.3],
        [0.9, 0, 1, false, 2.5],
      ],
    };
    const groups = parsePlantGroups([group, row(2)]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.turn).toBeCloseTo(Math.PI / 6);
    expect(groups[0]?.flower).toBe('#f4d98c');
    expect(parsePlantGroups(row(2))).toHaveLength(1);
    expect(parsePlantGroups([group, { s: -1 }])).toHaveLength(0); // (one bad group: none trusted)
    expect(parsePlantGroups({ ...group, flower: 'red' })).toHaveLength(0);
    // a plate's own height is its stem's: no more than the field's own small spread off it
    const f = new PlantField(groups[0] as PlantsData);
    expect(Math.abs(f.pose(0).top - 2.3)).toBeLessThan(0.05);
    expect(Math.abs(f.pose(1).top - 2.5)).toBeLessThan(0.05);
  });
});
