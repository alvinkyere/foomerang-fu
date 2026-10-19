import { describe, expect, it } from 'vitest';
import { halvesFor, halfAt, puddleRadius, PUDDLE } from '../src/render/deathMotion';

// How a killed character comes apart (owner's brief, the reference video at 0:07, 1:03 and 2:21): soft characters split into
// two halves along the line of the hit, brittle ones (the mug) shatter and leave a puddle. Presentation of a rules fact, but
// physical: momentum is conserved, the halves fly under gravity, land and slide to a stop under friction, and the puddle
// spreads like a viscous liquid. Lengths are in units of the character's height; times in seconds.

const SIDE = { x: 1, z: 0 }; // the hit came from the left, going right

describe('halves', () => {
  const [left, right] = halvesFor(SIDE, 'bread-1');

  it('two halves, separating sideways across the line of the hit with equal and opposite speeds', () => {
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    if (left === undefined || right === undefined) return;
    // across the hit: z (the hit is along x)
    expect(left.velocity.z).toBeCloseTo(-right.velocity.z, 9);
    expect(Math.abs(left.velocity.z)).toBeGreaterThan(0.5);
  });

  it('momentum is conserved: together they carry on the way the hit pushed them', () => {
    if (left === undefined || right === undefined) return;
    const total = { x: left.velocity.x + right.velocity.x, z: left.velocity.z + right.velocity.z };
    expect(total.z).toBeCloseTo(0, 9);
    expect(total.x).toBeGreaterThan(0); // along the hit
    expect(left.velocity.x).toBeCloseTo(right.velocity.x, 9);
  });

  it('they pop up, fall under gravity, never go below the floor, and come to rest lying on it', () => {
    for (const h of [left, right]) {
      if (h === undefined) continue;
      expect(halfAt(h, 0.05).position.y).toBeGreaterThan(halfAt(h, 0).position.y);
      for (let t = 0; t <= 3; t += 0.01) expect(halfAt(h, t).position.y).toBeGreaterThanOrEqual(0);
      const end = halfAt(h, 3);
      expect(end.resting).toBe(true);
      expect(end.position.y).toBe(0);
      expect(Math.abs(end.tilt)).toBeCloseTo(Math.PI / 2, 6); // lying on its side
      expect(halfAt(h, 5)).toEqual(end);
    }
  });

  it('they tumble apart, the two turning opposite ways', () => {
    if (left === undefined || right === undefined) return;
    expect(Math.sign(halfAt(left, 0.2).tilt)).toBe(-Math.sign(halfAt(right, 0.2).tilt));
  });

  it('the same death comes apart the same way (seeded); with no direction they split across the view', () => {
    expect(halvesFor(SIDE, 'bread-1')).toEqual(halvesFor(SIDE, 'bread-1'));
    const [a, b] = halvesFor(undefined, 'x');
    expect((a?.velocity.x ?? 0) + (b?.velocity.x ?? 0)).toBeCloseTo(0, 9);
  });
});

describe('the puddle', () => {
  it('spreads like a viscous liquid: fast at first, slowing, never past its final size', () => {
    expect(puddleRadius(0)).toBe(0);
    let last = 0;
    for (let t = 0.05; t <= 5; t += 0.05) {
      const r = puddleRadius(t);
      expect(r).toBeGreaterThan(last);
      expect(r).toBeLessThan(PUDDLE.radius);
      last = r;
    }
    // r = R(1 − e^(−t/τ)): 63% of its size after τ
    expect(puddleRadius(PUDDLE.tau)).toBeCloseTo(PUDDLE.radius * (1 - Math.exp(-1)), 9);
    expect(puddleRadius(0.1) - puddleRadius(0)).toBeGreaterThan(
      puddleRadius(2.1) - puddleRadius(2),
    );
  });
});
