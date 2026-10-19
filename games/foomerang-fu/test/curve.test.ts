import { describe, expect, it } from 'vitest';
import { DEFAULT_FU_CONFIG as C, stepFu, type FuState } from '../src/rules';
import { DT, boom, face, flying, input, make, place } from './support/fixtures';

// Curved flight (owner, 2026-10-19; the reference video: art/physics_reference). A quick throw does not fly straight: it curves
// clockwise on screen (+y is down), along an arc of about 300 u radius (measured; ±100), so over its 520 u it turns about 100°.
// The more it was charged the straighter it flies: a full charge is dead straight. On the way home it keeps its heading and
// turns towards the thrower at a limited (and growing) rate, so it swings round them before it is caught.

const CURVED = { arena: { width: 3000, height: 2000 } } as const;
/** `a` at (1000, 1000) facing right in a big open arena, `b` far away. */
const ready = (): FuState =>
  face(place(place(make(['a', 'b'], CURVED), 'a', 1000, 1000), 'b', 2900, 100), 'a', 1, 0);
const heading = (s: FuState) => Math.atan2(boom(s, 'a').direction.y, boom(s, 'a').direction.x);

function fly(s: FuState, seconds: number): FuState {
  for (let t = 0; t < seconds - 1e-9; t += DT) s = stepFu(s, input({}), DT).state;
  return s;
}

describe('curved flight', () => {
  it('the defaults: an arc of 300 u radius; the return turns at its own radius of 150 u, tightening by 20 rad/s²', () => {
    expect(C.throwCurvature).toBeCloseTo(1 / 300, 12);
    expect([C.returnTurnRadius, C.returnTurnGrowth]).toEqual([150, 20]);
  });

  it('a quick throw curves clockwise on screen: thrown right, it bends downwards', () => {
    let s = stepFu(ready(), input({ a: { throw: true } }), DT).state;
    s = fly(s, 0.3);
    expect(boom(s, 'a').state).toBe('THROWN');
    expect(boom(s, 'a').position.y).toBeGreaterThan(1000 + 20);
    expect(heading(s)).toBeGreaterThan(0.5); // turned clockwise (positive angle with +y down)
  });

  it('it turns by its curvature times the distance flown: about 100° by the end of its range', () => {
    let s = stepFu(ready(), input({ a: { throw: true } }), DT).state;
    let last = s;
    while (boom(s, 'a').state === 'THROWN') {
      last = s;
      s = stepFu(s, input({}), DT).state;
    }
    const turned = heading(last);
    expect(turned).toBeCloseTo(boom(last, 'a').travelled * C.throwCurvature, 2);
    expect(turned).toBeGreaterThan(1.5);
    expect(turned).toBeLessThan(1.9);
  });

  it('a full charge flies dead straight', () => {
    let s = ready();
    for (let t = 0; t < 0.7; t += DT) s = stepFu(s, input({ a: { throwHeld: true } }), DT).state;
    s = stepFu(s, input({}), DT).state;
    s = fly(s, 0.2);
    expect(boom(s, 'a').power).toBe(1);
    expect(boom(s, 'a').position.y).toBeCloseTo(1000, 9);
  });

  it('half a charge curves half as tightly', () => {
    let s = ready();
    for (let t = 0; t < C.fullChargeSeconds / 2 - 1e-9; t += DT)
      s = stepFu(s, input({ a: { throwHeld: true } }), DT).state;
    s = stepFu(s, input({}), DT).state;
    const power = boom(s, 'a').power;
    s = fly(s, 0.15);
    expect(heading(s)).toBeCloseTo(boom(s, 'a').travelled * C.throwCurvature * (1 - power), 2);
  });

  it('a deflected boomerang flies straight', () => {
    let s = flying(
      ready(),
      'a',
      { x: 1300, y: 1000 },
      { x: 1, y: 0 },
      { state: 'DEFLECTED', deflectedBy: 'b' },
    );
    s = fly(s, 0.2);
    expect(boom(s, 'a').position.y).toBeCloseTo(1000, 9);
  });

  it('a quick throw comes home on a curve, still turning the way it was thrown, and is caught', () => {
    let s = stepFu(ready(), input({ a: { throw: true } }), DT).state;
    while (boom(s, 'a').state === 'THROWN') s = stepFu(s, input({}), DT).state;
    const path: { x: number; y: number }[] = [boom(s, 'a').position];
    const headings: number[] = [heading(s)];
    while (boom(s, 'a').state === 'RETURNING' && path.length < 240) {
      s = stepFu(s, input({}), DT).state;
      if (boom(s, 'a').state === 'RETURNING') {
        path.push(boom(s, 'a').position);
        headings.push(heading(s));
      }
    }
    expect(boom(s, 'a').state, 'caught').toBe('HELD');
    // not a straight line home: the path bows well away from the chord between where it turned and where it was caught
    const p0 = path[0] as { x: number; y: number };
    const p1 = path.at(-1) as { x: number; y: number };
    const len = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const bow = Math.max(
      ...path.map((p) =>
        Math.abs(((p.x - p0.x) * (p1.y - p0.y) - (p.y - p0.y) * (p1.x - p0.x)) / len),
      ),
    );
    expect(bow).toBeGreaterThan(40);
    // and it keeps turning clockwise, as it was thrown
    let turned = 0;
    for (let k = 1; k < headings.length; k += 1) {
      let d = (headings[k] as number) - (headings[k - 1] as number);
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      turned += d;
    }
    expect(turned).toBeGreaterThan(0.5);
  });

  it('a quick throw always comes home to a thrower who stands still', () => {
    let s = stepFu(ready(), input({ a: { throw: true } }), DT).state;
    let i = 0;
    for (; i < 60 * 4 && !(boom(s, 'a').state === 'HELD' && i > 0); i += 1)
      s = stepFu(s, input({}), DT).state;
    expect(boom(s, 'a').state).toBe('HELD');
  });

  it('a curvature below 0 or a negative turn radius is a bad config; 0 means straight / straight home', () => {
    expect(() => make(['a', 'b'], { throwCurvature: -0.001 })).toThrow(RangeError);
    expect(() => make(['a', 'b'], { returnTurnRadius: -1 })).toThrow(RangeError);
    expect(() => make(['a', 'b'], { throwCurvature: 0, returnTurnRadius: 0 })).not.toThrow();
  });
});
