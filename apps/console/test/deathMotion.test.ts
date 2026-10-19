import { describe, expect, it } from 'vitest';
import {
  BITS,
  DROPS,
  FAR_HALF,
  HALF_FRICTION,
  NEAR_HALF_DISTANCE,
  PUDDLE,
  SHARDS,
  bitAt,
  bitsFor,
  deathOf,
  dropAt,
  dropsFor,
  halfAt,
  halvesFor,
  puddleRadius,
  shardAt,
  shardsFor,
} from '../src/render/deathMotion';

// How a killed character comes apart, as the reference video shows it (owner, 2026-10-19: "all effects must be equal to what
// is in the video"; measured in art/physics_reference/README.md, "Deaths"). The donut at 1:03: its far half slides away along
// the ground (no flight), slowing, turning; the near half stays about where it died; a burst of bits in its colour. The mug at
// 2:21: a splash, droplets drifting out, a puddle that spreads from ~1.2 s to its full size by ~1.9 s, and a few shards.

const SIDE = { x: 1, z: 0 }; // the hit came from the left, going right

describe('a soft character’s halves (the donut at 1:03)', () => {
  const [far, near] = halvesFor(SIDE, 'bread-1');

  it('the far half slides on along the hit, the near half the other way, both on the ground', () => {
    expect(far.direction.x).toBeGreaterThan(0.9);
    expect(near.direction.x).toBeCloseTo(-far.direction.x, 9);
    for (let t = 0; t <= 4; t += 0.05) {
      expect(halfAt(far, t).position.y).toBe(0);
      expect(halfAt(near, t).position.y).toBe(0);
    }
  });

  it('the far half goes 2.6 widths in 2.3 s, at one constant deceleration, then rests', () => {
    expect(HALF_FRICTION).toBeCloseTo((2 * FAR_HALF.distance) / FAR_HALF.seconds ** 2, 12);
    const end = halfAt(far, FAR_HALF.seconds);
    expect(Math.hypot(end.position.x, end.position.z)).toBeCloseTo(FAR_HALF.distance, 9);
    expect(end.resting).toBe(true);
    expect(halfAt(far, 10)).toEqual(end);
    // decelerating: it covers more in its first half-second than in its last
    const d = (a: number, b: number) =>
      Math.hypot(
        halfAt(far, b).position.x - halfAt(far, a).position.x,
        halfAt(far, b).position.z - halfAt(far, a).position.z,
      );
    expect(d(0, 0.5)).toBeGreaterThan(d(FAR_HALF.seconds - 0.5, FAR_HALF.seconds));
  });

  it('the near half stays about where it died', () => {
    const end = halfAt(near, 10);
    expect(Math.hypot(end.position.x, end.position.z)).toBeCloseTo(NEAR_HALF_DISTANCE, 9);
    expect(NEAR_HALF_DISTANCE).toBeLessThanOrEqual(0.2);
  });

  it('they turn opposite ways as they slide, and stop turning when they stop', () => {
    expect(Math.sign(halfAt(far, 0.5).tilt)).toBe(-Math.sign(halfAt(near, 0.5).tilt));
    expect(halfAt(far, 3).tilt).toBe(far.turn);
  });

  it('the same death comes apart the same way (seeded); with no direction they still part', () => {
    expect(halvesFor(SIDE, 'bread-1')).toEqual(halvesFor(SIDE, 'bread-1'));
    const [a, b] = halvesFor(undefined, 'x');
    expect(a.direction.x).toBeCloseTo(-b.direction.x, 9);
  });

  it('bits burst out in its colour and are gone by 1.6 s', () => {
    const bits = bitsFor('bread-1');
    expect(bits).toHaveLength(BITS.count);
    expect(BITS.count).toBeLessThanOrEqual(14);
    for (const b of bits) {
      const p = bitAt(b, BITS.outSeconds);
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(BITS.reach + 1e-9);
      expect(bitAt(b, 0.1).opacity).toBe(1);
      expect(bitAt(b, BITS.goneBy).opacity).toBe(0);
    }
  });
});

describe('the mug (2:21)', () => {
  it('a splash at once, then the puddle spreads from ~1.2 s to its full 50 u by ~1.9 s and stays', () => {
    expect(puddleRadius(0)).toBe(0);
    expect(puddleRadius(0.1)).toBeGreaterThan(5);
    expect(puddleRadius(0.6)).toBeGreaterThan(20);
    expect(puddleRadius(0.6)).toBeLessThan(30);
    expect(puddleRadius(1.2)).toBeLessThan(30);
    expect(puddleRadius(1.55)).toBeGreaterThan(35);
    expect(puddleRadius(1.9)).toBeGreaterThan(48);
    expect(puddleRadius(5)).toBe(PUDDLE.radius);
    expect(PUDDLE.aspect).toBeCloseTo(121 / 104, 12);
    for (let t = 1.2; t <= 3; t += 0.05)
      expect(puddleRadius(t + 0.05)).toBeGreaterThanOrEqual(puddleRadius(t));
  });

  it('droplets start ~35 u out, drift outward no faster than 70 u/s, and are gone by 1.6 s', () => {
    const drops = dropsFor('mug');
    expect(drops).toHaveLength(DROPS.count);
    for (const d of drops) {
      expect(d.speed).toBeLessThanOrEqual(DROPS.maxSpeed);
      const p0 = dropAt(d, 0);
      expect(Math.hypot(p0.x, p0.z)).toBeCloseTo(DROPS.start, 9);
      expect(dropAt(d, DROPS.goneBy).visible).toBe(false);
    }
  });

  it('a few shards come to rest 40–60 u out', () => {
    const shards = shardsFor('mug');
    expect(shards.length).toBeGreaterThanOrEqual(3);
    expect(shards.length).toBeLessThanOrEqual(5);
    for (const s of shards) {
      const p = shardAt(s, 5);
      expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(SHARDS.near);
      expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(SHARDS.far);
      expect(shardAt(s, 10)).toEqual(p);
    }
  });
});

describe('who comes apart how', () => {
  // the owner, 2026-10-19: the milk is liquid too, so slashed through it spills like the mug (in milk)
  it('the mug shatters and spills coffee; the milk is cut in two and spills milk; the rest are cut in two, dry', () => {
    expect(deathOf('coffee')).toEqual({ shatters: true, spills: 'coffee' });
    expect(deathOf('milk')).toEqual({ shatters: false, spills: 'milk' });
    for (const k of ['bread', 'donut', 'banana', 'watermelon', undefined] as const)
      expect(deathOf(k)).toEqual({ shatters: false, spills: undefined });
  });
});
