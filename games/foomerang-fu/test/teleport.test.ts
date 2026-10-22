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
  patchBoomerang,
  place,
  run,
  weaponsOf,
  type FuState,
} from './support/fixtures';

// TELEPORT_BOOMERANG (the owner, 2026-10-22; neither HQ video shows it used): the holder teleports to where their boomerang is,
// and that is the only way it works. With nothing in hand, a press of THROW takes them to their boomerang that is out (flying,
// coming home or lying on the ground) and they have it in hand again. With several out (MULTI_BOOMERANG's pieces, an
// EXTRA_BOOMERANG twin) each press takes them to the next one.

const TAP = input({ a: { throw: true } });
const close = (p: { x: number; y: number }, q: { x: number; y: number }, within: number) =>
  Math.hypot(p.x - q.x, p.y - q.y) <= within;

/** Alice at (300,450) facing right; Bob out of the way. */
function alice(...powers: Parameters<typeof give>[2][]): FuState {
  let s = place(place(make(['a', 'b'], STRAIGHT), 'a', 300, 450), 'b', 1500, 850);
  for (const p of powers) s = give(s, 'a', p);
  return face(s, 'a', 1, 0);
}

describe('TELEPORT_BOOMERANG', () => {
  it('is a power a Book can award', () => {
    expect(POWER_KINDS).toContain('TELEPORT_BOOMERANG');
  });

  it('with her boomerang out, a press of THROW puts her where it is, and it is in her hand again', () => {
    let s = run(alice('TELEPORT_BOOMERANG'), 1, TAP).state; // thrown
    s = run(s, 12).state; // flying out
    const there = boom(s, 'a').position;
    expect(boom(s, 'a').state).toBe('THROWN');
    const r = stepFu(s, TAP, DT);
    expect(close(at(r.state, 'a'), there, C.throwSpeed * DT + 1)).toBe(true);
    expect(boom(r.state, 'a').state).toBe('HELD');
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'TELEPORTED', playerId: 'a', from: expect.anything() }),
    );
  });

  it('pressing THROW down is enough (a phone press lasts several steps): she goes once, and letting go throws nothing', () => {
    let s = run(alice('TELEPORT_BOOMERANG'), 1, TAP).state;
    s = run(s, 12).state;
    const there = boom(s, 'a').position;
    const HOLD = input({ a: { throwHeld: true } });
    const r1 = stepFu(s, HOLD, DT); // pressed
    expect(r1.events.filter((e) => e.type === 'TELEPORTED')).toHaveLength(1);
    expect(close(at(r1.state, 'a'), there, C.throwSpeed * DT + 1)).toBe(true);
    const held = run(r1.state, 20, HOLD, { repeat: true }); // still down: no second teleport, no charge
    expect(held.events.some((e) => e.type === 'TELEPORTED')).toBe(false);
    const let_go = stepFu(held.state, NONE, DT); // let go
    expect(let_go.events.some((e) => e.type === 'THROWN')).toBe(false);
    expect(boom(let_go.state, 'a').state).toBe('HELD');
  });

  it('works on a boomerang lying on the ground too', () => {
    const s = patchBoomerang(alice('TELEPORT_BOOMERANG'), 'a', {
      state: 'GROUNDED',
      position: { x: 900, y: 300 },
    });
    const r = stepFu(s, TAP, DT);
    expect(close(at(r.state, 'a'), { x: 900, y: 300 }, 1)).toBe(true);
    expect(boom(r.state, 'a').state).toBe('HELD');
  });

  it('without the power, the same press does nothing: she stays where she is and the boomerang flies on', () => {
    let s = run(alice(), 1, TAP).state;
    s = run(s, 12).state;
    const r = stepFu(s, TAP, DT);
    expect(close(at(r.state, 'a'), { x: 300, y: 450 }, 1)).toBe(true);
    expect(boom(r.state, 'a').state).not.toBe('HELD');
    expect(r.events.some((e) => e.type === 'TELEPORTED')).toBe(false);
  });

  it('with a boomerang still in hand (EXTRA_BOOMERANG), a press throws it: no teleport', () => {
    let s = run(alice('TELEPORT_BOOMERANG', 'EXTRA_BOOMERANG'), 1, TAP).state; // one out, one in hand
    s = run(s, 12).state;
    const r = stepFu(s, TAP, DT);
    expect(r.events.some((e) => e.type === 'TELEPORTED')).toBe(false);
    expect(r.events.some((e) => e.type === 'THROWN')).toBe(true);
  });

  it('with MULTI_BOOMERANG, each press takes her to the next piece, which she catches', () => {
    let s = run(alice('TELEPORT_BOOMERANG', 'MULTI_BOOMERANG'), 1, TAP).state;
    for (let i = 0; i < 200 && !run(s, 1).events.some((e) => e.type === 'SPLIT'); i += 1)
      s = run(s, 1).state;
    s = run(s, 4).state; // split, the pieces fanning out
    const pieces = () => weaponsOf(s, 'a').filter((b) => b.pieceOf !== undefined).length;
    const before = pieces();
    expect(before).toBeGreaterThan(1);
    const visited: { x: number; y: number }[] = [];
    for (let i = 0; i < 2; i += 1) {
      const r = stepFu(s, TAP, DT);
      const t = r.events.find((e) => e.type === 'TELEPORTED') as { to: { x: number; y: number } };
      expect(t).toBeDefined();
      visited.push(t.to);
      s = r.state;
    }
    expect(pieces()).toBeLessThanOrEqual(before - 2); // two pieces caught
    expect(
      close(visited[0] as { x: number; y: number }, visited[1] as { x: number; y: number }, 5),
    ).toBe(false); // two different places
  });

  it('never leaves her outside the arena, even when the boomerang lies against its edge', () => {
    const s = patchBoomerang(alice('TELEPORT_BOOMERANG'), 'a', {
      state: 'GROUNDED',
      position: { x: 2, y: 300 },
    });
    const r = stepFu(s, TAP, DT);
    expect(at(r.state, 'a').x).toBeGreaterThanOrEqual(C.playerRadius - 1e-6);
  });

  it('a dead player teleports nowhere', () => {
    let s = run(alice('TELEPORT_BOOMERANG'), 1, TAP).state;
    s = run(s, 12).state;
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, alive: false } : p)) };
    const r = stepFu(s, TAP, DT);
    expect(r.events.some((e) => e.type === 'TELEPORTED')).toBe(false);
  });

  it('does nothing with nothing out to go to', () => {
    const s = { ...alice('TELEPORT_BOOMERANG') };
    const r = stepFu(s, NONE, DT);
    expect(r.events.some((e) => e.type === 'TELEPORTED')).toBe(false);
  });
});
