import { describe, expect, it } from 'vitest';
import {
  CUT,
  DEAD_EYES_AT,
  GOO,
  GOO_COLOUR,
  gooColourOf,
  gooAt,
  gooColour,
  gooFor,
  topAt,
  topFor,
} from '../src/render/cutMotion';

// Every death in both HQs is the same cut (art/physics_reference/README.md, "Every death in both HQs"): level at ≈ 0.55–0.6 of the
// height; the top flies off along the hit and slides to a stop turning; the bottom stands; goo in the body's hue bursts from the
// cut, spreads, falls and is gone by ≈ 1.45 s; the eyes become X's at ≈ 0.7 s. Lengths in the character's widths (W).

const HIT = { x: 1, z: 0 };

describe('the cut', () => {
  it('runs level a little above the middle', () => {
    expect(CUT.height).toBeGreaterThanOrEqual(0.55);
    expect(CUT.height).toBeLessThanOrEqual(0.6);
  });

  it('turns the eyes to X’s at about 0.7 s', () => {
    expect(DEAD_EYES_AT).toBeCloseTo(0.7, 5);
  });
});

describe('the top piece', () => {
  const top = topFor(HIT, 'banana-1', false);

  it('starts where it was, on the body', () => {
    const p = topAt(top, 0);
    expect(Math.hypot(p.x, p.z)).toBeLessThan(1e-9);
    expect(p.y).toBeCloseTo(0, 9);
  });

  it('flies off along the hit and comes to rest within the measured range (0.9–2.6 W)', () => {
    const end = topAt(top, 10);
    const d = Math.hypot(end.x, end.z);
    expect(d).toBeGreaterThanOrEqual(0.9 - 1e-9);
    expect(d).toBeLessThanOrEqual(2.6 + 1e-9);
    expect(end.x / d).toBeGreaterThan(0.8); // along the hit, give or take a little play
    expect(end.resting).toBe(true);
  });

  it('rises off the cut and is back on the ground, falling to where the bottom’s cut was', () => {
    const peak = Math.max(...Array.from({ length: 60 }, (_, i) => topAt(top, i / 100).y));
    expect(peak).toBeGreaterThan(0);
    // it comes down to the ground: its drop is the cut's height (it lies on the ground, not on the bottom)
    expect(topAt(top, 10).y).toBeCloseTo(-CUT.height, 6);
  });

  it('never goes back the way it came, and slows to a stop', () => {
    let last = -1;
    let lastSpeed = Infinity;
    for (let t = CUT.flight; t <= 3; t += 0.05) {
      const p = topAt(top, t);
      const d = Math.hypot(p.x, p.z);
      expect(d).toBeGreaterThanOrEqual(last - 1e-9);
      expect(d - last).toBeLessThanOrEqual(lastSpeed + 1e-9);
      lastSpeed = d - last;
      last = d;
    }
  });

  it('turns as it goes (about a quarter turn)', () => {
    const end = topAt(top, 10);
    expect(Math.abs(end.turn)).toBeGreaterThan(Math.PI / 4);
    expect(Math.abs(end.turn)).toBeLessThan(Math.PI * 0.75);
  });

  it('flies several times as far from an explosion', () => {
    const blown = topFor(HIT, 'banana-1', true);
    const a = topAt(top, 10);
    const b = topAt(blown, 10);
    expect(Math.hypot(b.x, b.z)).toBeGreaterThan(2 * Math.hypot(a.x, a.z));
  });

  it('is the same for the same seed (a replay looks the same)', () => {
    expect(topAt(topFor(HIT, 's', false), 0.4)).toEqual(topAt(topFor(HIT, 's', false), 0.4));
  });
});

describe('the goo', () => {
  const goo = gooFor(HIT, 'eggplant-1');

  it('is up to about 22 blobs', () => {
    expect(goo.length).toBe(GOO.count);
    expect(GOO.count).toBeGreaterThanOrEqual(18);
    expect(GOO.count).toBeLessThanOrEqual(24);
  });

  it('bursts out of the cut, joined and big at first (≈ 0.18 W), small blobs later (≈ 0.09 W)', () => {
    const early = goo.map((b) => gooAt(b, 0.3)).filter((g) => g.size > 0);
    const late = goo.map((b) => gooAt(b, 0.9)).filter((g) => g.size > 0);
    const median = (xs: number[]) =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
    expect(median(early.map((g) => g.size))).toBeGreaterThan(0.13);
    expect(median(late.map((g) => g.size))).toBeGreaterThan(0.06);
    expect(median(late.map((g) => g.size))).toBeLessThan(0.12);
  });

  it('spreads out to about a width (median), at most about two', () => {
    const at = goo.map((b) => gooAt(b, 1.1));
    const r = at.map((g) => Math.hypot(g.x, g.z)).sort((a, b) => a - b);
    expect(r[Math.floor(r.length / 2)]).toBeGreaterThan(0.7);
    expect(r[Math.floor(r.length / 2)]).toBeLessThan(1.3);
    expect(r[r.length - 1]).toBeLessThanOrEqual(2.1);
  });

  it('falls to the ground and is gone by about 1.45 s', () => {
    for (const b of goo) {
      expect(gooAt(b, 1.0).y).toBeLessThanOrEqual(1e-9);
      expect(gooAt(b, 1.46).size).toBe(0);
    }
  });

  it('is the body’s own hue at full brightness (the eggplant: (105, 73, 157) -> ≈ (152, 118, 245))', () => {
    const [r, g, b] = gooColour('#69499d');
    expect(Math.max(r, g, b)).toBeGreaterThan(235);
    expect(b).toBeGreaterThan(r);
    expect(r).toBeGreaterThan(g);
    // same hue and saturation as the body
    expect(r / b).toBeCloseTo(105 / 157, 1);
  });
});

describe('each character’s goo, as the HQs show it', () => {
  it('is the colour measured on its kills (toast brown crumbs, not its pale body)', () => {
    expect(GOO_COLOUR['bread']).toBe('#9e8050');
    expect(GOO_COLOUR['banana']).toBe('#e6d644');
    expect(GOO_COLOUR['donut']).toBe('#e87198');
    expect(GOO_COLOUR['milk']).toBe('#83aeeb');
    expect(gooColourOf('bread', '#ffffff')).toEqual([0x9e, 0x80, 0x50]);
  });

  it('is derived from its colour where no HQ kill shows it', () => {
    expect(GOO_COLOUR['carrot']).toBeUndefined();
    expect(gooColourOf('carrot', '#69499d')).toEqual(gooColour('#69499d'));
  });
});
