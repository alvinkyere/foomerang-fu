import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FU_CONFIG as C,
  createFuMatch,
  stepFu,
  type FuEvent,
  type FuState,
} from '../src/rules';
import { DT, at, boom, face, flying, input, make, place, player, run } from './support/fixtures';

// Charging a throw (owner, 2026-10-19; the reference video: art/physics_reference). Hold THROW with a boomerang in hand and the
// throw charges; let go and it flies, faster and further the longer it was held: a quick throw at the plain throw speed, a full
// charge straight and fast (the video's pink-trail throw, about 2,450 u/s). A tap is still a plain throw. A dash cancels the
// charge: nothing flies when the button is let go, and holding on does not charge again until the button is pressed afresh.

const HOLD = input({ a: { throwHeld: true } });
const LET_GO = input({});
const thrown = (events: readonly FuEvent[]) =>
  events.filter((e): e is Extract<FuEvent, { type: 'THROWN' }> => e.type === 'THROWN');

/** `a` alone at (300, 450) facing right in the open arena, `b` far away. */
const ready = (): FuState => face(place(place(make(), 'a', 300, 450), 'b', 1500, 120), 'a', 1, 0);

function hold(s: FuState, seconds: number): FuState {
  for (let t = 0; t < seconds - 1e-9; t += DT) s = stepFu(s, HOLD, DT).state;
  return s;
}

describe('charging a throw', () => {
  it('the defaults: a full charge takes 0.6 s and flies at 2,450 u/s for up to 1,000 u', () => {
    expect([C.fullChargeSeconds, C.chargedThrowSpeed, C.chargedThrowRange]).toEqual([
      0.6, 2450, 1000,
    ]);
  });

  it('a tap is still a plain throw: at the throw speed, power 0', () => {
    const r = stepFu(ready(), input({ a: { throw: true } }), DT);
    expect(thrown(r.events).map((e) => e.power)).toEqual([0]);
    expect(boom(r.state, 'a').power).toBe(0);
  });

  it('holding THROW charges and throws nothing yet', () => {
    const s = hold(ready(), 0.3);
    expect(player(s, 'a').charge).toEqual({ phase: 'CHARGING', seconds: expect.closeTo(0.3, 6) });
    expect(boom(s, 'a').state).toBe('HELD');
  });

  it('letting go after a full charge throws at the charged speed, straight', () => {
    const s = hold(ready(), 0.7);
    const r = stepFu(s, LET_GO, DT);
    expect(thrown(r.events).map((e) => e.power)).toEqual([1]);
    expect(player(r.state, 'a').charge).toEqual({ phase: 'NONE' });
    const from = boom(r.state, 'a').position.x;
    const next = stepFu(r.state, LET_GO, DT).state;
    expect(boom(next, 'a').position.x - from).toBeCloseTo(C.chargedThrowSpeed * DT, 6);
    expect(boom(next, 'a').position.y).toBeCloseTo(450, 9);
  });

  it('half a charge throws at half way between the two speeds', () => {
    const s = hold(ready(), C.fullChargeSeconds / 2);
    const r = stepFu(s, LET_GO, DT);
    const power = thrown(r.events)[0]?.power ?? -1;
    expect(power).toBeCloseTo(0.5, 1);
    const from = boom(r.state, 'a').position.x;
    const next = stepFu(r.state, LET_GO, DT).state;
    const speed = C.throwSpeed + (C.chargedThrowSpeed - C.throwSpeed) * power;
    expect(boom(next, 'a').position.x - from).toBeCloseTo(speed * DT, 6);
  });

  it('a full charge flies its whole range before it turns home', () => {
    let s = createFuMatch(
      [
        { id: 'a', slot: 0 },
        { id: 'b', slot: 1 },
      ],
      { arena: { width: 3000, height: 900 } },
    );
    s = face(place(place(s, 'a', 200, 450), 'b', 2900, 100), 'a', 1, 0);
    s = stepFu(hold(s, 0.7), LET_GO, DT).state;
    let furthest = 0;
    for (let i = 0; i < 60 && boom(s, 'a').state === 'THROWN'; i += 1) {
      s = stepFu(s, LET_GO, DT).state;
      furthest = Math.max(furthest, boom(s, 'a').position.x - 200);
    }
    expect(furthest).toBeGreaterThan(C.chargedThrowRange - 30);
    expect(furthest).toBeLessThan(C.chargedThrowRange + 80);
  });

  it('a dash cancels the charge: letting go throws nothing, and holding on does not charge again', () => {
    let s = hold(ready(), 0.3);
    s = stepFu(s, input({ a: { throwHeld: true, dash: true } }), DT).state;
    expect(player(s, 'a').charge).toEqual({ phase: 'CANCELLED' });
    s = hold(s, 0.5);
    expect(player(s, 'a').charge).toEqual({ phase: 'CANCELLED' });
    const r = stepFu(s, LET_GO, DT);
    expect(thrown(r.events)).toEqual([]);
    expect(player(r.state, 'a').charge).toEqual({ phase: 'NONE' });
    // pressed afresh, it charges again
    expect(player(hold(r.state, 0.2), 'a').charge.phase).toBe('CHARGING');
  });

  it('held while the boomerang is away, it starts charging when the boomerang is caught', () => {
    let s = flying(ready(), 'a', { x: 400, y: 450 }, { x: -1, y: 0 }, { state: 'RETURNING' });
    s = stepFu(s, HOLD, DT).state;
    expect(player(s, 'a').charge).toEqual({ phase: 'NONE' });
    for (let i = 0; i < 30 && boom(s, 'a').state !== 'HELD'; i += 1) s = stepFu(s, HOLD, DT).state;
    expect(boom(s, 'a').state).toBe('HELD');
    s = hold(s, 0.2);
    expect(player(s, 'a').charge.phase).toBe('CHARGING');
  });

  it('the dead do not charge', () => {
    let s = hold(ready(), 0.3);
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, alive: false } : p)) };
    s = stepFu(s, HOLD, DT).state;
    expect(player(s, 'a').charge).toEqual({ phase: 'NONE' });
  });

  it('charging is deterministic: the same holds give the same throw', () => {
    const one = run(hold(ready(), 0.45), 30);
    const two = run(hold(ready(), 0.45), 30);
    expect(two.events).toEqual(one.events);
    expect(at(two.state, 'a')).toEqual(at(one.state, 'a'));
  });

  it('a config must have a positive charge time and charged speed and range', () => {
    for (const bad of [
      { fullChargeSeconds: 0 },
      { chargedThrowSpeed: -1 },
      { chargedThrowRange: Number.NaN },
    ])
      expect(() => make(['a', 'b'], bad)).toThrow(RangeError);
  });
});
