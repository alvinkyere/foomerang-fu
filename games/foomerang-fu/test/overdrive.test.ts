import { describe, expect, it } from 'vitest';
import { isFatigued, stepFu } from '../src/rules';
import {
  C,
  DT,
  LANE,
  NONE,
  at,
  give,
  input,
  make,
  place,
  player,
  run,
  types,
  type FuState,
} from './support/fixtures';

// OVERDRIVE: TIMED (8 s). Walking ×1.4 and a dash that STARTS under it ×1.3. It multiplies with the
// fatigue and slash slowdowns and does nothing else: the 8-dash allowance, the 9th-dash fatigue
// and the 5 s recovery are exactly as without it.

const lane = () => place(place(make(['a', 'b'], LANE), 'a', 100, 450), 'b', 29000, 800);
const FULL = C.dashSpeed * C.dashSeconds;
const RIGHT = input({ a: { dash: true, move: { x: 1, y: 0 } } });
const WALK = input({ a: { move: { x: 1, y: 0 } } });

/** One whole dash (press, then until it is over); returns the state and how far it went. */
function dashOnce(s: FuState): { state: FuState; moved: number } {
  const before = at(s, 'a').x;
  let state = stepFu(s, RIGHT, DT).state;
  for (let i = 0; i < 40 && player(state, 'a').dash.phase === 'DASHING'; i += 1) {
    state = stepFu(state, NONE, DT).state;
  }
  return { state, moved: at(state, 'a').x - before };
}

describe('OVERDRIVE: walking', () => {
  it('walks 1.4× as fast while it lasts, and at normal speed without it', () => {
    const plain = run(lane(), 10, WALK, { repeat: true }).state;
    expect(at(plain, 'a').x - 100).toBeCloseTo(10 * C.playerSpeed * DT, 6);
    const fast = give(lane(), 'a', 'OVERDRIVE');
    const before = at(fast, 'a').x;
    const after = run(fast, 10, WALK, { repeat: true }).state;
    expect(at(after, 'a').x - before).toBeCloseTo(
      10 * C.playerSpeed * C.overdriveMoveFactor * DT,
      6,
    );
  });

  it('never expires with time: still 1.4× after a minute of play, and still owned', () => {
    let s = give(lane(), 'a', 'OVERDRIVE');
    s = run(s, 60 * 60).state; // a whole minute standing still
    expect(player(s, 'a').inventory).toEqual(['OVERDRIVE']);
    const before = at(s, 'a').x;
    const after = run(s, 10, WALK, { repeat: true }).state;
    expect(at(after, 'a').x - before).toBeCloseTo(
      10 * C.playerSpeed * C.overdriveMoveFactor * DT,
      6,
    );
  });

  it('persists across a round reset (it is part of the build, not the round)', () => {
    let s = give(lane(), 'a', 'OVERDRIVE');
    s = stepFu(
      { ...s, players: s.players.map((p) => (p.id === 'b' ? { ...p, alive: false } : p)) },
      NONE,
      DT,
    ).state;
    for (let i = 0; i < 400 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    expect(player(s, 'a').inventory).toEqual(['OVERDRIVE']);
    const before = at(s, 'a').x;
    const after = run(s, 10, WALK, { repeat: true }).state;
    expect(at(after, 'a').x - before).toBeCloseTo(
      10 * C.playerSpeed * C.overdriveMoveFactor * DT,
      6,
    );
  });

  it('multiplies with the slash slowdown while swinging', () => {
    let s = give(lane(), 'a', 'OVERDRIVE');
    s = run(s, 1, input({ a: { slash: true } })).state;
    const before = at(s, 'a').x;
    const after = run(s, 3, WALK, { repeat: true }).state;
    expect(at(after, 'a').x - before).toBeCloseTo(
      3 * C.playerSpeed * C.slashMoveFactor * C.overdriveMoveFactor * DT,
      6,
    );
  });
});

describe('OVERDRIVE: DASH', () => {
  it('a dash that starts under it goes 1.3× as far, and records that speed', () => {
    const s = give(lane(), 'a', 'OVERDRIVE');
    const { state, moved } = dashOnce(s);
    expect(moved).toBeCloseTo(FULL * C.overdriveDashFactor, 6);
    expect(player(state, 'a').fatigue.dashes).toBe(1);
  });

  it('a dash that started BEFORE the pickup is unchanged; one that started under it keeps its speed after it ends', () => {
    // started plain, overdrive picked up mid-dash
    let s = stepFu(lane(), RIGHT, DT).state;
    const start = 100;
    s = give(s, 'a', 'OVERDRIVE');
    for (let i = 0; i < 40 && player(s, 'a').dash.phase === 'DASHING'; i += 1)
      s = stepFu(s, NONE, DT).state;
    expect(at(s, 'a').x - start).toBeCloseTo(FULL, 6);
    // started under overdrive: it keeps that speed for the whole dash
    const t = give(lane(), 'a', 'OVERDRIVE');
    const { moved } = dashOnce(t);
    expect(moved).toBeCloseTo(FULL * C.overdriveDashFactor, 6);
  });

  it('multiplies with fatigue: a fatigued dash under overdrive is 0.7 × 1.3', () => {
    let s = give(lane(), 'a', 'OVERDRIVE');
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === 'a' ? { ...p, fatigue: { dashes: 9, recoverIn: 4 } } : p,
      ),
    };
    const { moved } = dashOnce(s);
    expect(moved).toBeCloseTo(FULL * C.fatiguedDashFactor * C.overdriveDashFactor, 6);
  });
});

describe('OVERDRIVE does not touch the fatigue system', () => {
  const dashN = (start: FuState, n: number) => {
    let s = start;
    const moved: number[] = [];
    const events: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const before = at(s, 'a').x;
      let r = stepFu(s, RIGHT, DT);
      events.push(...types(r.events));
      s = r.state;
      for (let k = 0; k < 40 && player(s, 'a').dash.phase === 'DASHING'; k += 1) {
        r = stepFu(s, NONE, DT);
        s = r.state;
        events.push(...types(r.events));
      }
      moved.push(at(s, 'a').x - before);
    }
    return { s, moved, events };
  };

  it('the allowance is still 8 free dashes and the 9th still triggers FATIGUED', () => {
    const over = give(lane(), 'a', 'OVERDRIVE');
    const withIt = dashN(over, 10);
    const without = dashN(lane(), 10);
    expect(withIt.events.filter((e) => e === 'FATIGUED')).toHaveLength(1);
    // the same dash numbers go fatigued with and without it
    expect(withIt.moved.map((m) => m > FULL * C.overdriveDashFactor * 0.9)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(without.moved.map((m) => m > FULL * 0.9)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(isFatigued(player(withIt.s, 'a').fatigue, C)).toBe(true);
    expect(player(withIt.s, 'a').fatigue.dashes).toBe(10);
  });

  it('the 5 s recovery clock is unchanged: the same count and the same time left, with or without it', () => {
    let a = lane();
    let b = give(lane(), 'a', 'OVERDRIVE');
    for (let i = 0; i < 9; i += 1) {
      a = dashN(a, 1).s;
      b = dashN(b, 1).s;
    }
    expect(player(b, 'a').fatigue.dashes).toBe(player(a, 'a').fatigue.dashes);
    expect(player(b, 'a').fatigue.recoverIn).toBeCloseTo(player(a, 'a').fatigue.recoverIn, 9);
    const wait = Math.round(C.fatigueRecoverySeconds / DT) - 12;
    expect(isFatigued(player(run(b, wait).state, 'a').fatigue, C)).toBe(
      isFatigued(player(run(a, wait).state, 'a').fatigue, C),
    );
    const done = run(b, Math.round(C.fatigueRecoverySeconds / DT)).state;
    expect(player(done, 'a').fatigue).toEqual({ dashes: 0, recoverIn: 0 });
  });

  it('fatigued walking under overdrive is 0.7 × 1.4 (it offsets the fatigue, it does not remove it)', () => {
    let s = give(lane(), 'a', 'OVERDRIVE');
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === 'a' ? { ...p, fatigue: { dashes: 9, recoverIn: 4 } } : p,
      ),
    };
    const before = at(s, 'a').x;
    const after = run(s, 10, WALK, { repeat: true }).state;
    expect(at(after, 'a').x - before).toBeCloseTo(
      10 * C.playerSpeed * C.fatiguedMoveFactor * C.overdriveMoveFactor * DT,
      6,
    );
  });
});
