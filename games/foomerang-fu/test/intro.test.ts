import { describe, expect, it } from 'vitest';
import { stepFu, type FuEvent, type FuState } from '../src/rules';
import { DT, at, boom, face, input, kill, make } from './support/fixtures';

// The start of a round, as the reference video shows it (0:30.96–0:34.4): the characters land one by one, READY, then GO, and
// nobody moves or acts before GO: 2.84 s from the round's start (art/physics_reference/README.md, "A round's start"). An
// optional `roundIntroSeconds` (the console sets the measured 2.84 s); absent, a round starts at once, as before.

const INTRO = 2.84;
const run = (s: FuState, seconds: number, inputs = input({})) => {
  const events: FuEvent[] = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    const r = stepFu(s, inputs, DT);
    s = r.state;
    events.push(...r.events);
  }
  return { s, events };
};

describe('the round intro', () => {
  it('absent, a round starts at once (no intro)', () => {
    const s = make(['a', 'b']);
    expect(s.intro ?? 0).toBe(0);
    const before = at(s, 'a');
    expect(at(run(s, 0.2, input({ a: { move: { x: 1, y: 0 } } })).s, 'a').x).toBeGreaterThan(
      before.x,
    );
  });

  it('with one, nobody moves, throws or swings until it is over; the round clock waits too', () => {
    let s = face(make(['a', 'b'], { roundIntroSeconds: INTRO }), 'a', 1, 0);
    expect(s.intro).toBeCloseTo(INTRO, 9);
    const before = at(s, 'a');
    const r = run(s, INTRO - 0.1, input({ a: { move: { x: 1, y: 0 }, throw: true, slash: true } }));
    s = r.s;
    expect(at(s, 'a')).toEqual(before);
    expect(boom(s, 'a').state).toBe('HELD');
    expect(s.players.find((p) => p.id === 'a')?.slash.phase).toBe('READY');
    expect(s.roundTime).toBe(0);
    expect(r.events).toEqual([]);
  });

  it('at its end, GO: then they play', () => {
    let s = make(['a', 'b'], { roundIntroSeconds: INTRO });
    const r = run(s, INTRO + DT);
    expect(r.events.filter((e) => e.type === 'GO')).toHaveLength(1);
    s = r.s;
    expect(s.intro ?? 0).toBe(0);
    const before = at(s, 'a');
    expect(at(run(s, 0.2, input({ a: { move: { x: 1, y: 0 } } })).s, 'a').x).toBeGreaterThan(
      before.x,
    );
  });

  it('every round starts with it again', () => {
    let s = make(['a', 'b'], { roundIntroSeconds: INTRO });
    s = run(s, INTRO + DT).s;
    s = kill(s, 'b');
    for (let i = 0; i < 60 * 6 && s.round === 1; i += 1) s = stepFu(s, input({}), DT).state;
    expect(s.round).toBe(2);
    expect(s.intro).toBeCloseTo(INTRO, 9);
  });
});
