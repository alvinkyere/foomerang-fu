import { describe, expect, it } from 'vitest';
import { stepFu } from '../src/rules';
import { ICE_FREEZE_SECONDS } from '../src/rules/ice';
import {
  DT,
  NONE,
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
  type FuEvent,
  type FuState,
  STRAIGHT,
} from './support/fixtures';

// ICE_BOOMERANG — the reference video (art/physics_reference/README.md, "Ice boomerang"): 6:54.55 the eggplant, hit, is encased
// in an ice block where it stands; 6:56.38 the block shatters and it moves again. An ice hit FREEZES (1.83 s), it does not kill.
// The shield it wore popped at the same moment (6:54.52).

const THROW = input({ a: { throw: true } });
const types = (events: readonly FuEvent[]) => events.map((e) => e.type);

/** Alice at (300,450) facing right with ICE_BOOMERANG; Bob in her lane at (520,450). */
function iced(): FuState {
  const s = place(place(make(['a', 'b'], STRAIGHT), 'a', 300, 450), 'b', 520, 450);
  return face(give(s, 'a', 'ICE_BOOMERANG'), 'a', 1, 0);
}

/** Throws and steps until Bob is frozen; returns that state and the step's events. */
function freezeBob(): { state: FuState; events: readonly FuEvent[] } {
  let s = stepFu(iced(), THROW, DT).state;
  for (let i = 0; i < 60; i += 1) {
    const r = stepFu(s, NONE, DT);
    s = r.state;
    if (r.events.some((e) => e.type === 'FROZEN')) return r;
  }
  throw new Error('Bob was never frozen');
}

describe('an ice hit', () => {
  it('the freeze lasts the measured 1.83 s', () => {
    expect(ICE_FREEZE_SECONDS).toBeCloseTo(1.83, 9);
  });

  it('freezes instead of killing: FROZEN, no HIT, Bob alive', () => {
    const r = freezeBob();
    expect(types(r.events)).toContain('FROZEN');
    expect(types(r.events)).not.toContain('HIT');
    expect(player(r.state, 'b')).toMatchObject({ alive: true });
    expect(player(r.state, 'b').frozen).toBeGreaterThan(0);
  });

  it('a frozen player stands still and can do nothing: no walking, throwing, slashing or dashing', () => {
    let s = freezeBob().state;
    const where = at(s, 'b');
    const r = run(
      s,
      30,
      input({ b: { move: { x: -1, y: 0 }, throw: true, slash: true, dash: true } }),
      { repeat: true },
    );
    s = r.state;
    expect(at(s, 'b')).toEqual(where);
    expect(
      types(r.events).filter((t) => t === 'THROWN' || t === 'SLASHED' || t === 'DASHED'),
    ).toEqual([]);
  });

  it('after 1.83 s the ice shatters (THAWED) and they move again', () => {
    let s = freezeBob().state;
    const steps = Math.ceil(ICE_FREEZE_SECONDS / DT);
    let thawedAt = -1;
    for (let i = 0; i < steps + 5 && thawedAt < 0; i += 1) {
      const r = stepFu(s, NONE, DT);
      s = r.state;
      if (r.events.some((e) => e.type === 'THAWED')) thawedAt = i + 1;
    }
    expect(Math.abs(thawedAt - steps)).toBeLessThanOrEqual(1);
    expect(player(s, 'b').frozen).toBeUndefined();
    const where = at(s, 'b');
    s = run(s, 10, input({ b: { move: { x: 0, y: 1 } } }), { repeat: true }).state;
    expect(at(s, 'b').y).toBeGreaterThan(where.y);
  });

  it('a frozen player can still be killed by a normal hit', () => {
    let s = freezeBob().state;
    // Alice, her boomerang back in hand, slashes him where he stands
    s = patchBoomerang(s, 'a', {
      state: 'HELD',
      position: at(s, 'a'),
      direction: { x: 0, y: 0 },
      travelled: 0,
    });
    s = face(place(s, 'a', 460, 450), 'a', 1, 0);
    s = stepFu(s, input({ a: { slash: true } }), DT).state;
    const r = run(s, 10);
    expect(player(r.state, 'b').alive).toBe(false);
  });

  it('a shielded player hit by ice: the shield pops and they are frozen (6:54.52–6:54.55)', () => {
    let s = give(iced(), 'b', 'SHIELD');
    s = stepFu(s, THROW, DT).state;
    let events: FuEvent[] = [];
    for (let i = 0; i < 60 && !events.some((e) => e.type === 'FROZEN'); i += 1) {
      const r = stepFu(s, NONE, DT);
      s = r.state;
      events = [...r.events];
    }
    expect(types(events)).toContain('FROZEN');
    expect(types(events)).toContain('SHIELD_BLOCKED');
    expect(player(s, 'b').inventory).not.toContain('SHIELD');
    expect(player(s, 'b').alive).toBe(true);
  });

  it('the boomerang flies on and comes home as usual, and the next throw is iced again', () => {
    let s = freezeBob().state;
    s = run(s, 300).state;
    expect(boom(s, 'a').state).toBe('HELD');
    expect(boom(s, 'a').ice).toBeFalsy(); // cleared in hand
    s = stepFu(s, THROW, DT).state;
    expect(boom(s, 'a').ice).toBe(true);
  });

  it('without the power the same throw kills', () => {
    const plain = face(
      place(place(make(['a', 'b'], STRAIGHT), 'a', 300, 450), 'b', 520, 450),
      'a',
      1,
      0,
    );
    const r = run(stepFu(plain, THROW, DT).state, 60);
    expect(types(r.events)).toContain('HIT');
    expect(player(r.state, 'b').alive).toBe(false);
  });

  it('a new round thaws everyone', () => {
    let s = freezeBob().state;
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, alive: false } : p)) };
    for (let i = 0; i < 600 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    expect(player(s, 'b').frozen).toBeUndefined();
  });
});

describe('ice with the other powers', () => {
  it('with MULTI every piece is iced', () => {
    let s = place(give(iced(), 'a', 'MULTI_BOOMERANG'), 'b', 1500, 850);
    s = stepFu(s, THROW, DT).state;
    for (let i = 0; i < 200 && !s.extraBoomerangs.some((b) => b.pieceOf !== undefined); i += 1)
      s = stepFu(s, NONE, DT).state;
    const pieces = s.extraBoomerangs.filter((b) => b.pieceOf !== undefined);
    expect(pieces.length).toBe(6);
    expect(pieces.every((p) => p.ice === true)).toBe(true);
  });
});
