import { describe, expect, it } from 'vitest';
import { createFuMatch, stepFu, type FuArena, type FuEvent, type FuState } from '../src/rules';
import { C, DT, NONE, at, boom, face, flying, input, place } from './support/fixtures';

// How a boomerang flies, as the reference video shows it (owner, 2026-10-19: "study exactly from the video"; 0:36.9–0:43.6, the
// pink and the brown throws; art/physics_reference/README.md, "The boomerang's flight"):
//  - out: a straight line, bouncing off what it meets, for ~0.9 s;
//  - at the end of its range it hooks round tightly and homes on its thrower;
//  - meeting anything on its way home (or once its bounces out are used up) it bounces off and DROPS: it slides to a stop in
//    ~1.1 s and stays there; it does not come home by itself;
//  - its thrower calls it by holding THROW: they stand still (the calling pose) and it is pulled home.

const OPEN: FuArena = {
  width: 3000,
  height: 1600,
  spawns: [
    { x: 400, y: 800 },
    { x: 2600, y: 1400 },
    { x: 400, y: 200 },
    { x: 2600, y: 200 },
    { x: 400, y: 1400 },
    { x: 2600, y: 800 },
  ],
};
const WALLED: FuArena = {
  ...OPEN,
  walls: [{ x: 1500, y: 0, width: 60, height: 1600 }],
};
const match = (arena: FuArena = OPEN): FuState =>
  createFuMatch(
    [
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
    ],
    { arena },
  );
const fly = (s: FuState, steps: number, inputs = NONE) => {
  const events: FuEvent[] = [];
  const states: FuState[] = [];
  for (let i = 0; i < steps; i += 1) {
    const r = stepFu(s, inputs, DT);
    s = r.state;
    events.push(...r.events);
    states.push(s);
  }
  return { s, events, states };
};

describe('the numbers, from the video', () => {
  it('out straight for ~0.9 s (810 u at 900 u/s), a tight turn home (70 u), a dropped one stops in ~1.1 s, the pull after 0.2 s', () => {
    expect(C.throwCurvature).toBe(0);
    expect(C.throwRange).toBe(810);
    expect(C.throwRange / C.throwSpeed).toBeCloseTo(0.9, 6);
    expect(C.returnTurnRadius).toBe(70);
    expect(C.groundFriction).toBe(900);
    expect(C.returnSpeed / C.groundFriction).toBeCloseTo(1.1, 1);
    expect(C.recallDelaySeconds).toBe(0.2);
  });
});

describe('out: a straight line', () => {
  it('a quick throw keeps its heading all the way out, and turns home at the end of its range', () => {
    let s = face(match(), 'a', 1, 0);
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    const r = fly(s, 80);
    const out = r.states.filter((x) => boom(x, 'a').state === 'THROWN');
    for (const x of out) {
      expect(boom(x, 'a').direction.x).toBeCloseTo(1, 9);
      expect(boom(x, 'a').position.y).toBeCloseTo(800, 6);
    }
    expect(out.length * DT).toBeCloseTo(C.throwRange / C.throwSpeed, 1);
    expect(boom(r.s, 'a').state).toBe('RETURNING');
  });
});

describe('home: a tight hook, then homing', () => {
  it('it turns round within a small circle and is caught by its thrower', () => {
    let s = face(match(), 'a', 1, 0);
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    let furthest = 0;
    let caught = false;
    for (let i = 0; i < 400 && !caught; i += 1) {
      const r = stepFu(s, NONE, DT);
      s = r.state;
      furthest = Math.max(furthest, boom(s, 'a').position.x - 400);
      caught = r.events.some((e) => e.type === 'CAUGHT');
    }
    expect(caught).toBe(true);
    // the hook adds no more than its diameter to the range
    expect(furthest).toBeLessThan(C.throwRange + 2 * C.returnTurnRadius + C.boomerangRadius);
  });
});

describe('meeting something on its way home, it drops and stays', () => {
  function returningIntoWall(): FuState {
    let s = place(match(WALLED), 'a', 400, 800);
    s = flying(s, 'a', { x: 1300, y: 800 }, { x: 1, y: 0 }, { state: 'RETURNING' });
    // the thrower stands on the far side of the wall: home is through it
    return place(s, 'a', 2400, 800);
  }

  it('it bounces off (a RICOCHET), drops to the ground and slides back the way it bounced', () => {
    const r = fly(returningIntoWall(), 30);
    expect(r.events.some((e) => e.type === 'RICOCHET')).toBe(true);
    expect(r.events.some((e) => e.type === 'DROPPED')).toBe(true);
    expect(boom(r.s, 'a').state).toBe('GROUNDED');
    expect(boom(r.s, 'a').position.x).toBeLessThan(1500 - C.boomerangRadius);
  });

  it('it slides to a stop in returnSpeed / groundFriction (~1.1 s) and then lies there: it does not come home by itself', () => {
    let s = fly(returningIntoWall(), 15).s;
    const stopAt = Math.ceil(C.returnSpeed / C.groundFriction / DT) + 2;
    s = fly(s, stopAt).s;
    const rest = boom(s, 'a').position;
    expect(boom(s, 'a').velocity).toEqual({ x: 0, y: 0 });
    s = fly(s, 600).s; // ten seconds more
    expect(boom(s, 'a').state).toBe('GROUNDED');
    expect(boom(s, 'a').position).toEqual(rest);
  });

  it('out of bounces on the way out, the next impact drops it too', () => {
    let s = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 1 },
      ],
      { arena: WALLED, maxRicochets: 0 },
    );
    s = flying(s, 'a', { x: 1300, y: 800 }, { x: 1, y: 0 });
    const r = fly(s, 20);
    expect(boom(r.s, 'a').state).toBe('GROUNDED');
    expect(r.events.some((e) => e.type === 'DROPPED')).toBe(true);
  });
});

describe('calling it home', () => {
  it('while THROW is held to call a dropped boomerang, its thrower stands still (the calling pose), whatever the stick says', () => {
    let s = place(match(), 'a', 400, 800);
    s = flying(s, 'a', { x: 1200, y: 800 }, { x: 0, y: 0 }, { state: 'GROUNDED' });
    const before = at(s, 'a');
    const r = fly(s, 20, input({ a: { move: { x: 0, y: -1 }, throwHeld: true } }));
    expect(at(r.s, 'a')).toEqual(before);
    expect(boom(r.s, 'a').state).toBe('RECALLING');
  });

  it('the hold that called it is not a throw: home in her hand, letting go of THROW throws nothing; a new press does', () => {
    let s = place(match(), 'a', 400, 800);
    s = face(flying(s, 'a', { x: 600, y: 800 }, { x: 0, y: 0 }, { state: 'GROUNDED' }), 'a', 1, 0);
    s = fly(s, 60, input({ a: { throwHeld: true } })).s; // called home, finger still down
    expect(boom(s, 'a').state).toBe('HELD');
    const released = fly(s, 5);
    expect(released.events.filter((e) => e.type === 'THROWN')).toEqual([]);
    expect(boom(released.s, 'a').state).toBe('HELD');
    const again = fly(released.s, 1, input({ a: { throw: true } }));
    expect(boom(again.s, 'a').state).toBe('THROWN');
  });

  it('once it is home, she walks again', () => {
    let s = place(match(), 'a', 400, 800);
    s = flying(s, 'a', { x: 600, y: 800 }, { x: 0, y: 0 }, { state: 'GROUNDED' });
    s = fly(s, 60, input({ a: { throwHeld: true } })).s;
    expect(boom(s, 'a').state).toBe('HELD');
    const before = at(s, 'a');
    s = fly(s, 10, input({ a: { move: { x: 0, y: -1 } } })).s;
    expect(at(s, 'a').y).toBeLessThan(before.y - 10);
  });
});
