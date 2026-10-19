import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FU_CONFIG as C,
  createFuMatch,
  stepFu,
  type FuArena,
  type FuEvent,
  type FuState,
} from '../src/rules';
import { distanceToSolid } from '../src/rules/arena';
import {
  DT,
  STRAIGHT,
  at,
  boom,
  face,
  flying,
  input,
  own,
  player,
  place,
} from './support/fixtures';

// Ricochets (owner, 2026-10-19; the reference video: a throw bounces off what it meets and flies on, still lethal). A boomerang
// on its way OUT (thrown or deflected) that meets a wall or the arena's edge is reflected, R = V − 2(V·N)N, and flies on for the
// rest of its range; after `maxRicochets` bounces in one throw the next impact sends it home as before. On its way home it does
// not bounce: it follows walls home. Most tests here fly straight (STRAIGHT) to make the geometry exact; one keeps the curve.

const WALL = { x: 800, y: 0, width: 60, height: 900 };
const ARENA: FuArena = {
  width: 1600,
  height: 900,
  walls: [WALL],
  spawns: [
    { x: 300, y: 450 },
    { x: 1300, y: 450 },
    { x: 200, y: 150 },
    { x: 200, y: 750 },
    { x: 1400, y: 150 },
    { x: 1400, y: 750 },
  ],
};
const RB = C.boomerangRadius;

function match(extra: object = STRAIGHT): FuState {
  return createFuMatch(
    [
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
      { id: 'c', slot: 2 },
    ],
    { arena: ARENA, ...extra },
  );
}
const bounces = (events: readonly FuEvent[]) =>
  events.filter((e): e is Extract<FuEvent, { type: 'RICOCHET' }> => e.type === 'RICOCHET');
function fly(s: FuState, steps: number) {
  const events: FuEvent[] = [];
  for (let i = 0; i < steps; i += 1) {
    const r = stepFu(s, input({}), DT);
    s = r.state;
    events.push(...r.events);
    expect(
      distanceToSolid(boom(s, 'a').position, WALL),
      `step ${i}: never inside the wall`,
    ).toBeGreaterThanOrEqual(RB - 1e-6);
  }
  return { s, events };
}

describe('ricochets', () => {
  it('the default: up to 3 bounces a throw', () => {
    expect(C.maxRicochets).toBe(3);
  });

  it('a throw into a wall at 45° comes off it at 45°, the mirror image, still on its way out', () => {
    let s = flying(match(), 'a', { x: 700, y: 400 }, { x: Math.SQRT1_2, y: Math.SQRT1_2 });
    const r = fly(s, 10);
    s = r.s;
    expect(bounces(r.events)).toHaveLength(1);
    expect(boom(s, 'a').state).toBe('THROWN');
    expect(boom(s, 'a').direction.x).toBeCloseTo(-Math.SQRT1_2, 9);
    expect(boom(s, 'a').direction.y).toBeCloseTo(Math.SQRT1_2, 9);
    expect(boom(s, 'a').position.x).toBeLessThan(WALL.x - RB);
  });

  it('head on, it comes straight back the way it came, and kills on the way', () => {
    let s = place(place(match(), 'c', 500, 400), 'b', 1300, 800);
    s = flying(s, 'a', { x: 600, y: 400 }, { x: 1, y: 0 });
    const r = fly(s, 30);
    expect(bounces(r.events).map((e) => e.ownerId)).toEqual(['a']);
    expect(r.events.some((e) => e.type === 'HIT' && e.victimId === 'c')).toBe(true);
    expect(player(r.s, 'c').alive).toBe(false);
  });

  it('it flies its whole range, bounces included, then turns home', () => {
    let s = flying(match(), 'a', { x: 700, y: 450 }, { x: 1, y: 0 });
    let steps = 0;
    while (boom(s, 'a').state === 'THROWN' && steps < 200) {
      s = stepFu(s, input({}), DT).state;
      steps += 1;
    }
    expect(boom(s, 'a').state).toBe('RETURNING');
    expect(steps * C.throwSpeed * DT).toBeGreaterThan(C.throwRange - 20);
    expect(steps * C.throwSpeed * DT).toBeLessThan(C.throwRange + 40);
  });

  it('after the last allowed bounce, the next impact sends it home', () => {
    let s = flying(
      match({ ...STRAIGHT, maxRicochets: 1 }),
      'a',
      { x: 700, y: 450 },
      { x: 1, y: 0 },
    );
    // between the wall (x 800) and a second one would need a box: the arena's own edge at x 0 is the second impact
    s = flying(s, 'a', { x: 700, y: 450 }, { x: 1, y: 0 }, { travelled: 0 });
    s = { ...s, config: { ...s.config, throwRange: 2000 } };
    const r = fly(s, 80);
    expect(bounces(r.events)).toHaveLength(1);
    expect(['RETURNING', 'HELD']).toContain(boom(r.s, 'a').state);
  });

  it('the arena’s edge bounces it too', () => {
    const s = flying(match(), 'a', { x: 300, y: 100 }, { x: Math.SQRT1_2, y: -Math.SQRT1_2 });
    const r = fly(s, 10);
    expect(bounces(r.events)).toHaveLength(1);
    expect(boom(r.s, 'a').direction.y).toBeGreaterThan(0);
    expect(boom(r.s, 'a').direction.x).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it('a curved throw bounces too and keeps curving from its new heading', () => {
    const s = flying(match({}), 'a', { x: 700, y: 450 }, { x: 1, y: 0 });
    const r = fly(s, 12);
    expect(bounces(r.events)).toHaveLength(1);
    expect(boom(r.s, 'a').direction.x).toBeLessThan(0); // came back off the wall
  });

  it('on its way home it does not bounce: it follows the wall', () => {
    let s = place(match(), 'a', 300, 450);
    s = flying(s, 'a', { x: 760, y: 450 }, { x: 1, y: 0 }, { state: 'RETURNING' });
    const r = fly(s, 40);
    expect(bounces(r.events)).toEqual([]);
  });

  it('an armed EXPLOSIVE boomerang bounces off a wall still armed: a wall does not set it off (the video, 5:20 and 10:16)', () => {
    let s = own(match(), 'a', 'EXPLOSIVE_BOOMERANG');
    s = flying(s, 'a', { x: 700, y: 450 }, { x: 1, y: 0 }, { blast: true });
    const r = fly(s, 12);
    expect(r.events.filter((e) => e.type === 'BLASTED')).toEqual([]);
    expect(bounces(r.events)).toHaveLength(1);
    expect(boom(r.s, 'a')).toMatchObject({ state: 'THROWN', blast: true });
  });

  it('a full charge bounces at full speed', () => {
    let s = face(place(match(), 'a', 500, 450), 'a', 1, 0);
    for (let t = 0; t < 0.7; t += DT) s = stepFu(s, input({ a: { throwHeld: true } }), DT).state;
    const r = fly(stepFu(s, input({}), DT).state, 14);
    expect(bounces(r.events)).toHaveLength(1);
    const before = boom(r.s, 'a').position.x;
    const next = stepFu(r.s, input({}), DT).state;
    expect(before - boom(next, 'a').position.x).toBeCloseTo(C.chargedThrowSpeed * DT, 6);
    expect(at(next, 'a').x).toBe(500);
  });

  it('the bounce count is per throw: home again, it starts at 0', () => {
    let s = flying(match(), 'a', { x: 700, y: 450 }, { x: 1, y: 0 });
    for (let i = 0; i < 200 && !(boom(s, 'a').state === 'HELD' && i > 0); i += 1)
      s = stepFu(s, input({}), DT).state;
    expect(boom(s, 'a').state).toBe('HELD');
    expect(boom(s, 'a').ricochets).toBe(0);
  });
});
