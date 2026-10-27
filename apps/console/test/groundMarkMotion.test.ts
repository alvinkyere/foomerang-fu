import { describe, expect, it } from 'vitest';
import { GROUND_MOTION, dustAt, fireAt, iceAt } from '../src/render/groundMarkMotion';

// Fire and ice on the ground, from the HQ videos at 60 fps (2026-10-27: foomerang-fu physics hq.mp4 7:05.9-7:08.6, a fire throw
// across the pink tree's plaza; 6:51.5-6:59.5, ice trails round the pink tree; ff physics hq 2.mp4 6:29-6:51).

describe('fire on the ground', () => {
  const c = GROUND_MOTION.fire.colours;
  it('a spark swells into a lemon-yellow puff ~0.5 W across in 0.08 s', () => {
    expect(fireAt(0, 0.5)).toMatchObject({ colour: c.spark });
    expect(fireAt(0.08, 0.5)?.colour).toBe(c.fresh);
    expect(fireAt(0.08, 0.5)?.size).toBeCloseTo(0.5, 1);
  });

  it('burns lemon yellow ~0.9 s, then orange, and is gone by 2.2 s', () => {
    const green = (hex: string | undefined) => parseInt((hex ?? '#000000').slice(3, 5), 16);
    expect(green(fireAt(0.5, 0.9)?.colour)).toBeGreaterThan(0xe0); // lemon (#fdec21)
    expect(green(fireAt(1.15, 0.9)?.colour)).toBeLessThan(0xc0); // orange (#f99b36)
    expect(fireAt(2.2, 0.5)).toBeUndefined();
  });

  it('about half the puffs end as grey smoke that rises off the ground (the HQ: #7f7d76)', () => {
    const smoke = fireAt(1.7, 0.1);
    expect(smoke?.colour).toBe(c.smoke);
    expect(smoke?.rise ?? 0).toBeGreaterThan(0.2);
    expect(fireAt(1.0, 0.1)?.rise ?? 0).toBe(0);
    expect(fireAt(1.7, 0.9)?.colour).not.toBe(c.smoke);
  });
});

describe('ice on the ground', () => {
  it('a solid cyan band for 4 s (#94edfa), then each patch pales and breaks up on its own, gone by 7 s', () => {
    expect(iceAt(0, 0.5)).toMatchObject({ colour: GROUND_MOTION.ice.colours.band, opacity: 1 });
    expect(iceAt(3.9, 0.5)?.opacity).toBe(1);
    expect(iceAt(4.6, 0)?.opacity).toBeLessThan(1); // an early one is going
    expect(iceAt(4.6, 1)?.opacity).toBe(1); // a late one not yet
    expect(iceAt(7.0, 0.5)).toBeUndefined();
  });

  it('its patches are not all one size: the band’s edge is lumpy, like the HQ’s', () => {
    expect(iceAt(1, 0.1)?.size).not.toBeCloseTo(iceAt(1, 0.6)?.size ?? 0, 2);
  });
});

// The dust a running player kicks up, from the HQ video (foomerang-fu physics hq.mp4: the banana 2:10.85–2:11.70 on the plaza's
// sand, the white mug 2:10.3–2:11.35 and the pink donut 10:26.05–10:26.8 on its pavement).
describe('dust behind a running player', () => {
  const d = GROUND_MOTION.dust;
  it('a puff every 0.17 s, each living 0.7 s', () => {
    expect(d.everySeconds).toBe(0.17);
    expect(d.lifeSeconds).toBe(0.7);
  });

  it('swells for 0.15 s to 0.6 W, then shrinks away (its area falling steadily) until gone at 0.7 s', () => {
    expect(dustAt(0, 1)?.size).toBeCloseTo(d.startSize, 5);
    expect(dustAt(d.swellSeconds, 1)?.size).toBeCloseTo(d.size, 5);
    const area = (t: number) => (dustAt(t, 1)?.size ?? 0) ** 2;
    // (seed 1: the puff's main circle, which lives the whole 0.7 s) halfway through the shrink, about half its area is left
    expect(
      area(d.swellSeconds + (d.lifeSeconds - d.swellSeconds) / 2) / area(d.swellSeconds),
    ).toBeCloseTo(0.5, 1);
    expect(dustAt(d.lifeSeconds, 1)).toBeUndefined();
    expect(dustAt(0.4, 1)?.opacity).toBe(1); // solid, never see-through (the same colour over sun and shadow)
  });

  it('the pieces of a puff go at different times (it breaks into smaller circles)', () => {
    expect(dustAt(0.6, 0.1)).toBeUndefined();
    expect(dustAt(0.6, 0.9)).toBeDefined();
  });

  it('is one yellow on the whole plaza, whoever runs, on sand or pavement, in sun or shadow (#eecb6a)', () => {
    expect(dustAt(0.3, 0.5)?.colour).toBe('#eecb6a');
  });
});
