import { describe, expect, it } from 'vitest';
import { GROUND_MOTION, dustAt, fireAt, iceAt } from '../src/render/groundMarkMotion';

// Fire and ice on the ground, timed from the reference video (10:00.16–10:03.0; 6:02.45–6:05.6 and 6:53–6:57).

describe('fire on the ground', () => {
  const c = GROUND_MOTION.fire.colours;
  it('a spark swells into a yellow puff in 0.1 s', () => {
    expect(fireAt(0, 0.5)).toMatchObject({ colour: c.spark, size: GROUND_MOTION.fire.sparkSize });
    expect(fireAt(0.1, 0.5)?.colour).toBe(c.fresh);
    expect(fireAt(0.1, 0.5)?.size).toBeGreaterThan(0.27);
  });

  it('burns yellow, then orange, then red, and is gone by 1.7 s', () => {
    expect(fireAt(0.5, 0.5)?.colour).toMatch(/^#f[a-c]/);
    const green = (hex: string | undefined) => parseInt((hex ?? '#000000').slice(3, 5), 16);
    expect(green(fireAt(0.5, 0.5)?.colour)).toBeGreaterThan(0xd0); // yellow
    expect(green(fireAt(1.0, 0.5)?.colour)).toBeLessThan(0xb0); // orange
    expect(fireAt(1.6, 0.9)?.opacity).toBeLessThan(0.5);
    expect(fireAt(1.7, 0.5)).toBeUndefined();
  });

  it('about a third of the puffs end as dark smoke', () => {
    expect(fireAt(1.4, 0.1)?.colour).toBe(c.smoke);
    expect(fireAt(1.4, 0.9)?.colour).not.toBe(c.smoke);
  });
});

describe('ice on the ground', () => {
  it('a solid band for 3 s, then each patch breaks up on its own, gone by 4.3 s', () => {
    expect(iceAt(0, 0.5)).toMatchObject({ colour: GROUND_MOTION.ice.colours.band, opacity: 1 });
    expect(iceAt(2.9, 0.5)?.opacity).toBe(1);
    expect(iceAt(3.3, 0)?.opacity).toBeLessThan(1); // an early one is going
    expect(iceAt(3.3, 1)?.opacity).toBe(1); // a late one not yet
    expect(iceAt(4.3, 0.5)).toBeUndefined();
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
