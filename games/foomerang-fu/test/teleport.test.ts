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
  player,
  run,
  weaponsOf,
  type FuState,
} from './support/fixtures';

// TELEPORT_BOOMERANG (the owner, 2026-10-22; neither HQ video shows it used): the holder teleports to where their boomerang is,
// and that is the only way it works. Once they have thrown it, DASH takes them to it (flying, coming home or lying on the
// ground) instead of dashing, and they have it in hand again. With several out (MULTI_BOOMERANG's pieces, an EXTRA_BOOMERANG
// twin) each dash takes them to the next one.

const THROW = input({ a: { throw: true } });
const DASH = input({ a: { dash: true } });
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

  it('with her boomerang thrown, DASH puts her where it is instead of dashing, and it is in her hand again', () => {
    let s = run(alice('TELEPORT_BOOMERANG'), 1, THROW).state;
    s = run(s, 12).state; // flying out
    const there = boom(s, 'a').position;
    expect(boom(s, 'a').state).toBe('THROWN');
    const r = stepFu(s, DASH, DT);
    expect(close(at(r.state, 'a'), there, C.throwSpeed * DT + 1)).toBe(true);
    expect(boom(r.state, 'a').state).toBe('HELD');
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'TELEPORTED', playerId: 'a', from: expect.anything() }),
    );
    expect(r.events.some((e) => e.type === 'DASHED')).toBe(false); // a teleport, not a dash
    expect(player(r.state, 'a').dash.phase).not.toBe('DASHING');
    expect(player(r.state, 'a').fatigue.dashes).toBe(player(s, 'a').fatigue.dashes); // and no dash spent
  });

  it('THROW does nothing of the kind: with it out, a THROW press leaves her where she is', () => {
    let s = run(alice('TELEPORT_BOOMERANG'), 1, THROW).state;
    s = run(s, 12).state;
    const r = run(s, 10, input({ a: { throwHeld: true } }), { repeat: true });
    expect(r.events.some((e) => e.type === 'TELEPORTED')).toBe(false);
    expect(close(at(r.state, 'a'), { x: 300, y: 450 }, 1)).toBe(true);
  });

  it('works on a boomerang lying on the ground too', () => {
    const s = patchBoomerang(alice('TELEPORT_BOOMERANG'), 'a', {
      state: 'GROUNDED',
      position: { x: 900, y: 300 },
    });
    const r = stepFu(s, DASH, DT);
    expect(close(at(r.state, 'a'), { x: 900, y: 300 }, 1)).toBe(true);
    expect(boom(r.state, 'a').state).toBe('HELD');
  });

  it('without the power, DASH dashes as usual and the boomerang flies on', () => {
    let s = run(alice(), 1, THROW).state;
    s = run(s, 12).state;
    const r = stepFu(s, DASH, DT);
    expect(r.events.some((e) => e.type === 'DASHED')).toBe(true);
    expect(r.events.some((e) => e.type === 'TELEPORTED')).toBe(false);
    expect(boom(r.state, 'a').state).not.toBe('HELD');
  });

  it('with nothing thrown, DASH dashes as usual', () => {
    const r = stepFu(alice('TELEPORT_BOOMERANG'), DASH, DT);
    expect(r.events.some((e) => e.type === 'DASHED')).toBe(true);
    expect(r.events.some((e) => e.type === 'TELEPORTED')).toBe(false);
  });

  it('with EXTRA_BOOMERANG, one thrown and one still in hand: DASH takes her to the thrown one', () => {
    let s = run(alice('TELEPORT_BOOMERANG', 'EXTRA_BOOMERANG'), 1, THROW).state;
    s = run(s, 12).state;
    const out = weaponsOf(s, 'a').find((b) => b.state !== 'HELD');
    const r = stepFu(s, DASH, DT);
    expect(r.events.some((e) => e.type === 'TELEPORTED')).toBe(true);
    expect(close(at(r.state, 'a'), out?.position ?? { x: 0, y: 0 }, C.throwSpeed * DT + 1)).toBe(
      true,
    );
    expect(weaponsOf(r.state, 'a').every((b) => b.state === 'HELD')).toBe(true);
  });

  it('with MULTI_BOOMERANG, each dash takes her to the next piece, which she catches', () => {
    let s = run(alice('TELEPORT_BOOMERANG', 'MULTI_BOOMERANG'), 1, THROW).state;
    for (let i = 0; i < 200 && !run(s, 1).events.some((e) => e.type === 'SPLIT'); i += 1)
      s = run(s, 1).state;
    s = run(s, 4).state; // split, the pieces fanning out
    const pieces = () => weaponsOf(s, 'a').filter((b) => b.pieceOf !== undefined).length;
    const before = pieces();
    expect(before).toBeGreaterThan(1);
    const visited: { x: number; y: number }[] = [];
    for (let i = 0; i < 2; i += 1) {
      const r = stepFu(s, DASH, DT);
      const t = r.events.find((e) => e.type === 'TELEPORTED') as { to: { x: number; y: number } };
      expect(t).toBeDefined();
      visited.push(t.to);
      s = r.state;
    }
    expect(pieces()).toBeLessThanOrEqual(before - 2); // two pieces caught
    const [first, second] = visited as [{ x: number; y: number }, { x: number; y: number }];
    expect(close(first, second, 5)).toBe(false); // two different places
  });

  it('never leaves her outside the arena, even when the boomerang lies against its edge', () => {
    const s = patchBoomerang(alice('TELEPORT_BOOMERANG'), 'a', {
      state: 'GROUNDED',
      position: { x: 2, y: 300 },
    });
    const r = stepFu(s, DASH, DT);
    expect(at(r.state, 'a').x).toBeGreaterThanOrEqual(C.playerRadius - 1e-6);
  });

  it('a dead player teleports nowhere', () => {
    let s = run(alice('TELEPORT_BOOMERANG'), 1, THROW).state;
    s = run(s, 12).state;
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, alive: false } : p)) };
    const r = stepFu(s, DASH, DT);
    expect(r.events.some((e) => e.type === 'TELEPORTED')).toBe(false);
  });

  it('does nothing on its own: no press, no teleport', () => {
    let s = run(alice('TELEPORT_BOOMERANG'), 1, THROW).state;
    const r = run(s, 30);
    s = r.state;
    expect(r.events.some((e) => e.type === 'TELEPORTED')).toBe(false);
    expect(stepFu(s, NONE, DT).events.some((e) => e.type === 'TELEPORTED')).toBe(false);
  });
});
