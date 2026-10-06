import { describe, expect, it } from 'vitest';
import { stepFu } from '../src/rules';
import {
  DT,
  NONE,
  boom,
  face,
  flying,
  give,
  has,
  input,
  make,
  patchBoomerang,
  patchPlayer,
  own,
  place,
  player,
  run,
  type FuEvent,
  type FuState,
} from './support/fixtures';

// GUARD: CONSUMED ON HIT. It absorbs exactly ONE valid lethal contact and is then gone. It is not
// invulnerability: no timer, no i-frames — the very next contact kills. A weapon that was absorbed
// cannot hit the same player again on that leg / that swing.

/** Alice (guarded) at (600,450); Bob 100 to her right facing her; Carol far away. */
function scene(ids = ['a', 'b', 'c']): FuState {
  let s = make(ids);
  s = place(place(place(s, 'a', 600, 450), 'b', 700, 450), 'c', 1500, 850);
  s = face(face(s, 'a', 1, 0), 'b', -1, 0);
  return give(s, 'a', 'GUARD');
}
const SLASH_B = input({ b: { slash: true } });
const hits = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'HIT');

describe('GUARD vs SLASH', () => {
  it('absorbs the swing: the player lives, the guard is spent, and it is announced', () => {
    const r = stepFu(scene(), SLASH_B, DT);
    expect(player(r.state, 'a').alive).toBe(true);
    expect(has(r.state, 'a', 'GUARD')).toBe(false);
    expect(r.events).toContainEqual({
      type: 'GUARD_BLOCKED',
      playerId: 'a',
      byId: 'b',
      position: { x: 600, y: 450 },
    });
    expect(hits(r.events)).toEqual([]);
  });

  it('the rest of THAT swing cannot hurt them (it already met their guard), but the next swing does', () => {
    let s = stepFu(scene(), SLASH_B, DT).state;
    for (let i = 0; i < 32; i += 1) {
      const r = stepFu(s, NONE, DT);
      s = r.state;
      expect(player(s, 'a').alive, `step ${i}`).toBe(true);
    }
    expect(player(s, 'b').slash.phase).toBe('READY');
    const again = stepFu(s, SLASH_B, DT);
    expect(player(again.state, 'a').alive).toBe(false); // no timer, no i-frames: it is just gone
  });

  it('a swing by someone ELSE on the very next step kills (a guard is one hit, not a grace period)', () => {
    let s = scene();
    s = place(s, 'c', 600, 350); // above Alice, within reach of her
    s = face(s, 'c', 0, 1);
    s = stepFu(s, SLASH_B, DT).state;
    const r = stepFu(s, input({ c: { slash: true } }), DT);
    expect(player(r.state, 'a').alive).toBe(false);
    expect(hits(r.events)).toEqual([expect.objectContaining({ victimId: 'a', byId: 'c' })]);
  });
});

describe('GUARD vs boomerangs (THROWN, RETURNING, DEFLECTED)', () => {
  const FROM = { x: 700, y: 450 };
  const passes = (s: FuState, steps: number) => {
    let current = s;
    const events: FuEvent[] = [];
    for (let i = 0; i < steps; i += 1) {
      const r = stepFu(current, NONE, DT);
      current = r.state;
      events.push(...r.events);
    }
    return { state: current, events };
  };

  it('absorbs a THROWN boomerang; it flies on and cannot hit them again on that leg', () => {
    const s = flying(scene(), 'b', FROM, { x: -1, y: 0 });
    const r = passes(s, 20);
    expect(r.events.filter((e) => e.type === 'GUARD_BLOCKED')).toHaveLength(1);
    expect(hits(r.events)).toEqual([]);
    expect(player(r.state, 'a').alive).toBe(true);
    expect(boom(r.state, 'b').travelled).toBeGreaterThan(100); // it did not stop
  });

  it('with the guard gone, the next boomerang kills', () => {
    let s = flying(scene(), 'b', FROM, { x: -1, y: 0 });
    s = place(passes(s, 20).state, 'b', 1500, 100); // Bob is out of the way now
    s = patchBoomerang(s, 'c', {
      state: 'THROWN',
      position: { x: 700, y: 450 },
      direction: { x: -1, y: 0 },
      travelled: 0,
    });
    const r = passes(s, 12);
    expect(hits(r.events)).toEqual([expect.objectContaining({ victimId: 'a', byId: 'c' })]);
  });

  it('absorbs a RETURNING boomerang on its way home', () => {
    let s = scene();
    s = patchBoomerang(s, 'b', {
      state: 'RETURNING',
      position: { x: 500, y: 450 },
      direction: { x: 0, y: 0 },
      travelled: 0,
    });
    const r = passes(s, 20);
    expect(r.events.filter((e) => e.type === 'GUARD_BLOCKED')).toHaveLength(1);
    expect(player(r.state, 'a').alive).toBe(true);
    expect(boom(r.state, 'b').state).toBe('HELD'); // and it got home
  });

  it('absorbs a DEFLECTED boomerang', () => {
    let s = scene();
    s = patchBoomerang(s, 'b', {
      state: 'DEFLECTED',
      position: { x: 500, y: 450 },
      direction: { x: 1, y: 0 },
      travelled: 0,
      deflections: 1,
      deflectedBy: 'c',
    });
    const r = passes(s, 12);
    expect(r.events.filter((e) => e.type === 'GUARD_BLOCKED')).toHaveLength(1);
    expect(player(r.state, 'a').alive).toBe(true);
  });

  it('a boomerang that was deflected AWAY from the guard holder never reaches their guard: nothing is spent', () => {
    let s = scene();
    s = patchBoomerang(s, 'b', {
      state: 'DEFLECTED',
      position: { x: 500, y: 450 },
      direction: { x: 1, y: 0 },
      travelled: 0,
      deflections: 1,
      deflectedBy: 'a', // Alice knocked it away: she is safe from it on this leg anyway
    });
    const r = passes(s, 12);
    expect(r.events.filter((e) => e.type === 'GUARD_BLOCKED')).toEqual([]);
    expect(has(r.state, 'a', 'GUARD')).toBe(true);
  });

  it('their OWN boomerang is never a lethal contact, so it spends nothing', () => {
    let s = scene();
    s = patchBoomerang(s, 'a', {
      state: 'RETURNING',
      position: { x: 500, y: 450 },
      direction: { x: 0, y: 0 },
    });
    const r = passes(s, 20);
    expect(has(r.state, 'a', 'GUARD')).toBe(true);
    expect(boom(r.state, 'a').state).toBe('HELD');
  });
});

describe('GUARD with several lethal contacts', () => {
  /** Bob swings at Alice while Carol's boomerang reaches her on the same step. */
  function double(order: string[]): FuState {
    let s = make(order);
    s = place(place(place(s, 'a', 600, 450), 'b', 725, 450), 'c', 1500, 850); // 125 from Alice: in reach; her boomerang's path is outside his arc
    s = face(face(s, 'a', 1, 0), 'b', -1, 0);
    s = give(s, 'a', 'GUARD');
    s = place(s, 'c', 1500, 850);
    return patchBoomerang(s, 'c', {
      state: 'THROWN',
      position: { x: 560, y: 450 },
      direction: { x: 1, y: 0 },
      travelled: 0,
    });
  }

  it('absorbs exactly ONE: the first in match order; the other one kills', () => {
    const r = stepFu(double(['a', 'b', 'c']), SLASH_B, DT);
    expect(player(r.state, 'a').alive).toBe(false);
    expect(r.events.filter((e) => e.type === 'GUARD_BLOCKED')).toEqual([
      expect.objectContaining({ playerId: 'a', byId: 'b' }), // Bob is earlier than Carol
    ]);
    expect(hits(r.events)).toEqual([expect.objectContaining({ victimId: 'a', byId: 'c' })]);
  });

  it('which one is absorbed follows the MATCH order, never the order inputs arrived', () => {
    const swapped = stepFu(double(['a', 'c', 'b']), SLASH_B, DT);
    expect(swapped.events.filter((e) => e.type === 'GUARD_BLOCKED')).toEqual([
      expect.objectContaining({ byId: 'c' }),
    ]);
    expect(hits(swapped.events)).toEqual([expect.objectContaining({ victimId: 'a', byId: 'b' })]);
  });

  it('simultaneous combat: both swing at each other, one guarded — the guarded one lives, the other dies', () => {
    let s = scene(['a', 'b']);
    s = face(s, 'a', 1, 0);
    const r = stepFu(s, input({ a: { slash: true }, b: { slash: true } }), DT);
    expect(player(r.state, 'a').alive).toBe(true);
    expect(player(r.state, 'b').alive).toBe(false);
    expect(r.state.phase).toBe('ROUND_OVER');
    expect(r.state.roundOver?.winnerId).toBe('a');
  });

  it('a guard is personal: only the guarded player in reach spends one', () => {
    let s = scene();
    s = give(patchPlayer(s, 'c', {}), 'c', 'GUARD');
    s = place(s, 'c', 500, 450);
    s = face(s, 'b', -1, 0);
    s = face(s, 'c', 1, 0);
    const r = stepFu(s, SLASH_B, DT);
    expect(has(r.state, 'a', 'GUARD')).toBe(false);
    expect(has(r.state, 'c', 'GUARD')).toBe(true); // Bob's swing is -x only: Carol is behind Alice, out of reach
  });
});

describe('SHIELD (GUARD) lifecycle: owned until it blocks a hit', () => {
  const nextRound = (start: FuState): FuState => {
    let s = stepFu(
      { ...start, players: start.players.map((p) => (p.id === 'b' ? { ...p, alive: false } : p)) },
      NONE,
      DT,
    ).state;
    for (let i = 0; i < 400 && s.round === start.round; i += 1) s = stepFu(s, NONE, DT).state;
    return s;
  };

  it('never expires with time, and moving or dashing does not break it', () => {
    let s = scene(['a', 'b']);
    s = run(s, 400, input({ a: { move: { x: -1, y: 0 }, dash: true } }), { repeat: true }).state;
    expect(has(s, 'a', 'GUARD')).toBe(true);
    expect(player(run(s, 60 * 60).state, 'a').inventory).toContain('GUARD'); // a minute later
  });

  it('survives a round transition, and several, if it is never hit', () => {
    let s = scene(['a', 'b']);
    for (let r = 1; r <= 3; r += 1) {
      s = nextRound(s);
      expect(s.round).toBe(r + 1);
      expect(player(s, 'a').inventory).toEqual(['GUARD']);
    }
  });

  it('a valid lethal hit breaks it: the player lives, the power leaves the inventory and says why', () => {
    const r = stepFu(scene(), SLASH_B, DT);
    expect(player(r.state, 'a').alive).toBe(true);
    expect(player(r.state, 'a').inventory).toEqual([]);
    expect(r.events).toContainEqual({
      type: 'POWER_LOST',
      playerId: 'a',
      kind: 'GUARD',
      reason: 'SHIELD_BROKEN',
    });
  });

  it('a broken shield frees its slot at once and the others keep their order; the next power fills the freed slot', () => {
    let s = place(place(make(['a', 'b']), 'a', 600, 450), 'b', 700, 450);
    s = face(face(s, 'a', 1, 0), 'b', -1, 0);
    s = own(s, 'a', 'PHASE_DASH', 'GUARD', 'TWIN_THROW');
    s = stepFu(s, SLASH_B, DT).state;
    expect(player(s, 'a').inventory).toEqual(['PHASE_DASH', 'TWIN_THROW']);
    s = place(s, 'a', 600, 450);
    s = give(s, 'a', 'OVERDRIVE');
    expect(player(s, 'a').inventory).toEqual(['PHASE_DASH', 'TWIN_THROW', 'OVERDRIVE']); // nothing was evicted
  });

  it('death does not remove an unused shield (ownership outlives the round)', () => {
    let s = scene(['a', 'b', 'c']);
    s = patchPlayer(s, 'a', { alive: false });
    s = stepFu(s, NONE, DT).state;
    expect(player(s, 'a').inventory).toEqual(['GUARD']);
  });
});
