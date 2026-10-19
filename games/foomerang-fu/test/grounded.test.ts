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
  input,
  kill,
  patchBoomerang,
  place,
  player,
} from './support/fixtures';

// A dropped boomerang (owner, 2026-10-19). One that cannot get home lands and lies on the ground: walk over it to pick it up, or
// hold THROW to pull it home (it shakes and the phone vibrates until it arrives). All of it is plain kinematics:
//  - dropping, it keeps the velocity it had and slides, slowed by friction at a constant deceleration μ = groundFriction: it stops
//    after v₀/μ seconds having slid v₀²/2μ, integrated exactly step by step; walls stop it (it never passes through one);
//  - pulled, it lifts after `recallDelaySeconds` of holding and accelerates towards its thrower at `recallAcceleration`, up to
//    `recallSpeed`, going round walls; let go, it drops again and slides to a stop from the speed it had.
// On the ground it is harmless; pulled home (airborne, moving) it is lethal like any flying boomerang.

const ARENA: FuArena = {
  width: 1600,
  height: 900,
  walls: [{ x: 900, y: 300, width: 60, height: 300 }],
  spawns: [
    { x: 300, y: 450 },
    { x: 1400, y: 150 },
    { x: 200, y: 150 },
    { x: 200, y: 750 },
    { x: 1400, y: 450 },
    { x: 1400, y: 750 },
  ],
};
const match = (): FuState =>
  createFuMatch(
    [
      { id: 'a', slot: 0 },
      { id: 'b', slot: 1 },
    ],
    { arena: ARENA, ...STRAIGHT },
  );
/** a's boomerang lying (or sliding) at `p` with velocity `v`. */
const dropped = (s: FuState, p: { x: number; y: number }, v = { x: 0, y: 0 }): FuState =>
  patchBoomerang(s, 'a', {
    state: 'GROUNDED',
    position: p,
    direction: { x: 0, y: 0 },
    velocity: v,
    recall: 0,
  });
const HOLD = input({ a: { throwHeld: true } });
function steps(s: FuState, n: number, inputs = input({})) {
  const events: FuEvent[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = stepFu(s, inputs, DT);
    s = r.state;
    events.push(...r.events);
  }
  return { s, events };
}
const speed = (s: FuState) => Math.hypot(boom(s, 'a').velocity.x, boom(s, 'a').velocity.y);

describe('a dropped boomerang', () => {
  it('the defaults: friction 2,500 u/s² and the 0.25 s delay (proposals); the pull as measured, 4,500 u/s² up to 1,800 u/s', () => {
    // the video's tutorial at 0:18.7–0:19.2 (art/physics_reference/README.md): from rest, ~530 u home in ~0.45 s at a near
    // constant ~4,500 u/s², still speeding up at ~1,800 u/s when caught (no cap seen; 1,800 is the fastest seen)
    expect([C.groundFriction, C.recallDelaySeconds, C.recallAcceleration, C.recallSpeed]).toEqual([
      2500, 0.25, 4500, 1800,
    ]);
  });

  it('slides to a stop exactly as friction says: after v₀/μ seconds, v₀²/2μ along', () => {
    let s = dropped(match(), { x: 300, y: 750 }, { x: 1000, y: 0 });
    const stopAfter = 1000 / C.groundFriction; // 0.4 s
    s = steps(s, Math.round(stopAfter / DT) - 3).s;
    expect(speed(s)).toBeGreaterThan(0);
    s = steps(s, 6).s;
    expect(speed(s)).toBe(0);
    expect(boom(s, 'a').position.x).toBeCloseTo(300 + (1000 * 1000) / (2 * C.groundFriction), 6);
    expect(boom(s, 'a').position.y).toBe(750);
    expect(boom(s, 'a').state).toBe('GROUNDED');
  });

  it('a wall stops its slide: it never passes into it', () => {
    let s = dropped(match(), { x: 800, y: 450 }, { x: 1000, y: 0 });
    for (let i = 0; i < 40; i += 1) {
      s = stepFu(s, input({}), DT).state;
      expect(
        distanceToSolid(boom(s, 'a').position, ARENA.walls?.[0] as never),
      ).toBeGreaterThanOrEqual(C.boomerangRadius - 1e-6);
    }
    expect(speed(s)).toBe(0);
  });

  it('lying on the ground it is harmless: an enemy standing on it lives', () => {
    let s = place(dropped(match(), { x: 600, y: 750 }), 'b', 600, 750);
    s = steps(s, 30).s;
    expect(player(s, 'b').alive).toBe(true);
  });

  it('its thrower picks it up by walking over it; nobody else can', () => {
    let s = place(dropped(match(), { x: 600, y: 750 }), 'b', 600, 760);
    s = steps(s, 10).s;
    expect(boom(s, 'a').state).toBe('GROUNDED'); // b stood on it: still a's, still lying there
    s = place(s, 'b', 1400, 150);
    s = place(s, 'a', 600 - C.playerRadius - 30, 750);
    const r = steps(s, 30, input({ a: { move: { x: 1, y: 0 } } }));
    expect(boom(r.s, 'a').state).toBe('HELD');
    expect(r.events).toContainEqual({ type: 'CAUGHT', playerId: 'a' });
  });

  it('a tap of THROW does not pull it: the hold must last recallDelaySeconds', () => {
    let s = dropped(match(), { x: 700, y: 750 });
    s = steps(s, 5, HOLD).s; // 0.083 s
    s = steps(s, 30).s;
    expect(boom(s, 'a').state).toBe('GROUNDED');
    expect(boom(s, 'a').position).toEqual({ x: 700, y: 750 });
  });

  it('holding THROW pulls it home: it lifts after the delay and accelerates at recallAcceleration, up to recallSpeed', () => {
    let s = dropped(match(), { x: 1300, y: 750 });
    s = place(s, 'a', 300, 750);
    s = steps(s, Math.round(C.recallDelaySeconds / DT), HOLD).s;
    expect(boom(s, 'a').state).toBe('RECALLING');
    s = steps(s, 15, HOLD).s; // 0.25 s of pull: v = a·t
    expect(speed(s)).toBeCloseTo(C.recallAcceleration * 15 * DT, 6);
    expect(boom(s, 'a').velocity.x).toBeLessThan(0); // towards her
    // on until it is home: never faster than the cap on the way
    const events: FuEvent[] = [];
    for (let i = 0; i < 120 && boom(s, 'a').state === 'RECALLING'; i += 1) {
      const r = steps(s, 1, HOLD);
      s = r.s;
      events.push(...r.events);
      expect(speed(s)).toBeLessThanOrEqual(C.recallSpeed + 1e-9);
    }
    expect(boom(s, 'a').state).toBe('HELD');
    expect(events).toContainEqual({ type: 'CAUGHT', playerId: 'a' });
  });

  it('let go mid-pull, it drops again and slides to a stop from the speed it had', () => {
    let s = dropped(match(), { x: 1300, y: 750 });
    s = place(s, 'a', 300, 750);
    s = steps(s, Math.round(C.recallDelaySeconds / DT) + 15, HOLD).s;
    const v0 = speed(s);
    expect(v0).toBeGreaterThan(400);
    const from = boom(s, 'a').position.x;
    s = steps(s, 60).s;
    expect(boom(s, 'a').state).toBe('GROUNDED');
    expect(speed(s)).toBe(0);
    expect(from - boom(s, 'a').position.x).toBeCloseTo((v0 * v0) / (2 * C.groundFriction), 0);
  });

  it('pulled home it goes round walls, never through them', () => {
    let s = dropped(match(), { x: 1100, y: 450 }); // behind the wall from her
    s = place(s, 'a', 700, 450);
    for (let i = 0; i < 240 && boom(s, 'a').state !== 'HELD'; i += 1) {
      s = stepFu(s, HOLD, DT).state;
      expect(
        distanceToSolid(boom(s, 'a').position, ARENA.walls?.[0] as never),
      ).toBeGreaterThanOrEqual(C.boomerangRadius - 1e-6);
    }
    expect(boom(s, 'a').state).toBe('HELD');
  });

  it('pulled home it is airborne and lethal to an enemy in its way', () => {
    let s = dropped(match(), { x: 1300, y: 750 });
    s = place(place(s, 'a', 300, 750), 'b', 800, 750);
    s = steps(s, 120, HOLD).s;
    expect(player(s, 'b').alive).toBe(false);
  });

  it('a trip home that cannot get round the walls ends on the ground, not in her hand', () => {
    // a sealed box round her: no route home at all
    const sealed: FuArena = {
      ...ARENA,
      walls: [
        { x: 700, y: 300, width: 200, height: 40 },
        { x: 700, y: 460, width: 200, height: 40 },
        { x: 700, y: 340, width: 40, height: 120 },
        { x: 860, y: 340, width: 40, height: 120 },
      ],
      spawns: ARENA.spawns ?? [],
    };
    let s = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 1 },
      ],
      { arena: sealed, ...STRAIGHT },
    );
    s = place(s, 'a', 800, 400);
    s = patchBoomerang(s, 'a', {
      state: 'RETURNING',
      position: { x: 400, y: 400 },
      direction: { x: 0, y: 0 },
    });
    const r = steps(s, 60 * 5);
    expect(boom(r.s, 'a').state).toBe('GROUNDED');
    expect(r.events.map((e) => e.type)).toContain('DROPPED');
    expect(r.events.map((e) => e.type)).not.toContain('CAUGHT');
  });

  it('a boomerang whose thrower dies on its way home drops: there is no hand to return to', () => {
    let s = match();
    s = patchBoomerang(s, 'a', {
      state: 'RETURNING',
      position: { x: 700, y: 750 },
      direction: { x: -1, y: 0 },
    });
    s = kill(s, 'a');
    s = steps(s, 3).s;
    expect(boom(s, 'a').state).toBe('GROUNDED');
  });

  it('with it on the ground nothing can be thrown, and holding THROW pulls rather than charges', () => {
    let s = dropped(match(), { x: 1300, y: 750 });
    s = steps(s, 5, input({ a: { throw: true } })).s;
    expect(boom(s, 'a').state).toBe('GROUNDED');
    s = steps(s, 20, HOLD).s;
    expect(player(s, 'a').charge.phase).toBe('NONE');
  });

  it('caught by the pull while THROW is still held, the same press goes on to charge the next throw', () => {
    let s = dropped(match(), { x: 500, y: 450 });
    s = place(s, 'a', 300, 450);
    for (let i = 0; i < 120 && boom(s, 'a').state !== 'HELD'; i += 1) s = stepFu(s, HOLD, DT).state;
    expect(boom(s, 'a').state).toBe('HELD');
    s = steps(s, 6, HOLD).s;
    expect(player(s, 'a').charge.phase).toBe('CHARGING');
  });

  it('is deterministic, and at rest it stays exactly where it lies', () => {
    const s = dropped(match(), { x: 300, y: 750 }, { x: 700, y: -300 });
    const one = steps(s, 50);
    const two = steps(s, 50);
    expect(two.s).toEqual(one.s);
    expect(steps(one.s, 50).s.boomerangs).toEqual(one.s.boomerangs);
    expect(at(one.s, 'a')).toEqual(at(s, 'a'));
  });
});
