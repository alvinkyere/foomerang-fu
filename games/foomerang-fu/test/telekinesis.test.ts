import { describe, expect, it } from 'vitest';
import { POWER_KINDS, stepFu } from '../src/rules';
import {
  C,
  DT,
  NONE,
  STRAIGHT,
  at,
  boom,
  face,
  give,
  input,
  make,
  place,
  player,
  run,
  type FuState,
} from './support/fixtures';

// TELEKINESIS (the owner, 2026-10-22; neither HQ video shows it used): the holder steers their boomerang instead of walking.
// With it flying and nothing in hand, they hold THROW and the joystick moves the boomerang, as it would move them, while they
// stand still; it goes no further from them than a plain throw reaches (the owner's choice). Let go, it comes home.

const TAP = input({ a: { throw: true } });
const steer = (x: number, y: number) => input({ a: { throwHeld: true, move: { x, y } } });
const HOLD = input({ a: { throwHeld: true } });
const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y);

/** Alice at (600,450) facing right, her boomerang a few steps out; Bob out of the way. */
function out(...powers: Parameters<typeof give>[2][]): FuState {
  let s = place(place(make(['a', 'b'], STRAIGHT), 'a', 600, 450), 'b', 1500, 850);
  for (const p of powers) s = give(s, 'a', p);
  s = run(face(s, 'a', 1, 0), 1, TAP).state;
  return run(s, 6).state;
}

describe('TELEKINESIS', () => {
  it('is a power a Book can award', () => {
    expect(POWER_KINDS).toContain('TELEKINESIS');
  });

  it('holding THROW, the joystick moves her boomerang at throw speed the way the thumb points, and she stands still', () => {
    const s = out('TELEKINESIS');
    const me = at(s, 'a');
    let r = run(s, 30, steer(0, -1), { repeat: true }); // up: settled into it
    const a = boom(r.state, 'a').position;
    r = run(r.state, 1, steer(0, -1));
    const b = boom(r.state, 'a').position;
    expect(a.y - b.y).toBeCloseTo(C.throwSpeed * DT, 0); // full speed up
    expect(Math.abs(b.x - a.x)).toBeLessThan(0.5);
    expect(dist(at(r.state, 'a'), me)).toBeLessThan(1e-6);
    expect(boom(r.state, 'a').state).not.toBe('HELD');
  });

  it('a half push steers it at half speed (the stick is analog)', () => {
    let r = run(out('TELEKINESIS'), 30, steer(0, -0.5), { repeat: true });
    const a = boom(r.state, 'a').position;
    r = run(r.state, 1, steer(0, -0.5));
    const dz = r.state.world.movement.deadZone;
    const pushed = (0.5 - dz) / (1 - dz);
    expect(a.y - boom(r.state, 'a').position.y).toBeCloseTo(C.throwSpeed * DT * pushed, 0);
  });

  it('it flows: it keeps the way it was going and bends round to the thumb, never turning a corner in one step', () => {
    const s = out('TELEKINESIS'); // flying right
    let prev = boom(s, 'a').position;
    let state = s;
    let prevV: { x: number; y: number } | undefined;
    let biggest = 0;
    for (let i = 0; i < 25; i += 1) {
      state = stepFu(state, steer(0, -1), DT).state; // the thumb points up at once (25 steps: before the arena's edge)
      const p = boom(state, 'a').position;
      const v = { x: (p.x - prev.x) / DT, y: (p.y - prev.y) / DT };
      if (prevV !== undefined)
        biggest = Math.max(biggest, Math.hypot(v.x - prevV.x, v.y - prevV.y));
      if (i === 0) expect(v.x).toBeGreaterThan(C.throwSpeed * 0.5); // still carried on its way at first
      prevV = v;
      prev = p;
    }
    expect(biggest).toBeLessThan(C.throwSpeed * 0.25); // a smooth bend, not a corner
    expect(prevV?.y ?? 0).toBeLessThan(-C.throwSpeed * 0.95); // and it ends up going where the thumb points
  });

  it('with the stick let go it glides to a stop and hangs there (it does not come home while she holds THROW)', () => {
    const s = out('TELEKINESIS');
    const settled = run(s, 60, HOLD, { repeat: true }).state;
    const later = run(settled, 60, HOLD, { repeat: true }).state;
    expect(boom(later, 'a').state).not.toBe('HELD');
    expect(dist(boom(later, 'a').position, boom(settled, 'a').position)).toBeLessThan(1);
    expect(dist(boom(settled, 'a').position, boom(s, 'a').position)).toBeGreaterThan(5); // it glided, not froze
  });

  it('goes no further from her than a plain throw reaches', () => {
    const r = run(out('TELEKINESIS'), 240, steer(1, 0), { repeat: true });
    expect(dist(boom(r.state, 'a').position, at(r.state, 'a'))).toBeLessThanOrEqual(
      C.throwRange + 1e-6,
    );
  });

  it('stays inside the arena', () => {
    const r = run(out('TELEKINESIS'), 240, steer(0, -1), { repeat: true });
    expect(boom(r.state, 'a').position.y).toBeGreaterThanOrEqual(C.boomerangRadius - 1e-6);
  });

  it('let go, it comes home and she catches it', () => {
    let s = run(out('TELEKINESIS'), 20, steer(0, -1), { repeat: true }).state;
    s = stepFu(s, NONE, DT).state;
    expect(boom(s, 'a').state).toBe('RETURNING');
    s = run(s, 600).state;
    expect(boom(s, 'a').state).toBe('HELD');
  });

  it('steered into Bob, it kills him', () => {
    let s = out('TELEKINESIS');
    s = place(s, 'b', boom(s, 'a').position.x + 220, boom(s, 'a').position.y); // ahead of it
    const r = run(s, 40, steer(1, 0), { repeat: true });
    expect(player(r.state, 'b').alive).toBe(false);
  });

  it('an armed one steered into Bob goes off on him, and holding on or letting go afterwards breaks nothing', () => {
    // (a third player keeps the round going after Bob)
    let s = place(
      place(place(make(['a', 'b', 'c'], STRAIGHT), 'a', 600, 450), 'b', 1500, 850),
      'c',
      1500,
      100,
    );
    s = give(give(s, 'a', 'TELEKINESIS'), 'a', 'EXPLOSIVE_BOOMERANG');
    s = run(run(face(s, 'a', 1, 0), 1, TAP).state, 6).state;
    s = place(s, 'b', boom(s, 'a').position.x + 220, boom(s, 'a').position.y); // ahead of it
    const r = run(s, 40, steer(1, 0), { repeat: true });
    expect(player(r.state, 'b').alive).toBe(false);
    expect(r.events.some((e) => e.type === 'BLASTED')).toBe(true);
    expect(() => run(run(r.state, 10, HOLD, { repeat: true }).state, 200)).not.toThrow();
  });

  it('a Multi throw steered into Bob splits on him, and letting go afterwards breaks nothing', () => {
    let s = out('TELEKINESIS', 'MULTI_BOOMERANG');
    s = place(s, 'b', boom(s, 'a').position.x + 220, boom(s, 'a').position.y); // ahead of it
    const r = run(s, 40, steer(1, 0), { repeat: true });
    expect(r.events.some((e) => e.type === 'SPLIT')).toBe(true);
    expect(() => run(r.state, 400)).not.toThrow();
    expect(boom(run(r.state, 400).state, 'a').state).toBe('HELD');
  });

  it('without the power, holding THROW and the stick walks her as usual, and the boomerang flies on its own', () => {
    const s = out();
    const me = at(s, 'a');
    const r = run(s, 10, steer(0, -1), { repeat: true });
    expect(me.y - at(r.state, 'a').y).toBeGreaterThan(10);
  });

  it('with TELEPORT_BOOMERANG too: holding THROW steers it (no teleport), and DASH takes her where she steered it', () => {
    let s = out('TELEKINESIS', 'TELEPORT_BOOMERANG');
    const r = run(s, 15, steer(0, -1), { repeat: true });
    expect(r.events.some((e) => e.type === 'TELEPORTED')).toBe(false);
    s = r.state;
    const done = stepFu(s, input({ a: { throwHeld: true, dash: true } }), DT);
    expect(done.events.some((e) => e.type === 'TELEPORTED')).toBe(true);
    expect(dist(at(done.state, 'a'), boom(s, 'a').position)).toBeLessThan(
      C.throwSpeed * DT + C.playerRadius,
    );
    expect(boom(done.state, 'a').state).toBe('HELD');
  });
});
