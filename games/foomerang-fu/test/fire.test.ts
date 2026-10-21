import { describe, expect, it } from 'vitest';
import { stepFu } from '../src/rules';
import { FIRE_BURN_SECONDS } from '../src/rules/fire';
import {
  DT,
  NONE,
  at,
  boom,
  face,
  flying,
  give,
  input,
  make,
  place,
  player,
  run,
  type FuEvent,
  type FuState,
  STRAIGHT,
} from './support/fixtures';

// FIRE_BOOMERANG — the reference video (art/physics_reference/README.md, "Fire boomerang"): 9:55.8 the eggplant, hit, catches
// fire; it runs on, burning, for about 1.7 s, leaving fire on the ground; by 9:57.9 it is charred and dead (≈ 2.1 s). A fire hit
// does not kill at once: it sets the victim burning, and the burn kills, credited to the thrower.

const THROW = input({ a: { throw: true } });
const types = (events: readonly FuEvent[]) => events.map((e) => e.type);

/** Alice at (300,450) facing right with FIRE_BOOMERANG; Bob in her lane at (520,450). */
function fiery(): FuState {
  const s = place(place(make(['a', 'b'], STRAIGHT), 'a', 300, 450), 'b', 520, 450);
  return face(give(s, 'a', 'FIRE_BOOMERANG'), 'a', 1, 0);
}

function igniteBob(): { state: FuState; events: readonly FuEvent[] } {
  let s = stepFu(fiery(), THROW, DT).state;
  for (let i = 0; i < 60; i += 1) {
    const r = stepFu(s, NONE, DT);
    s = r.state;
    if (r.events.some((e) => e.type === 'IGNITED')) return r;
  }
  throw new Error('Bob never caught fire');
}

describe('a fire hit', () => {
  it('the burn lasts the measured 2.1 s', () => {
    expect(FIRE_BURN_SECONDS).toBeCloseTo(2.1, 9);
  });

  it('sets the victim burning instead of killing at once: IGNITED, no HIT, still alive', () => {
    const r = igniteBob();
    expect(types(r.events)).toContain('IGNITED');
    expect(types(r.events)).not.toContain('HIT');
    expect(player(r.state, 'b').alive).toBe(true);
    expect(player(r.state, 'b').burning).toMatchObject({ byId: 'a' });
  });

  it('a burning player keeps moving (the eggplant ran on, 9:55.9–9:57.6)', () => {
    let s = igniteBob().state;
    const where = at(s, 'b');
    s = run(s, 20, input({ b: { move: { x: 0, y: 1 } } }), { repeat: true }).state;
    expect(at(s, 'b').y).toBeGreaterThan(where.y + 50);
    expect(player(s, 'b').alive).toBe(true);
  });

  it('the burn kills after 2.1 s, credited to the thrower', () => {
    let s = igniteBob().state;
    const steps = Math.ceil(FIRE_BURN_SECONDS / DT);
    let hit: FuEvent | undefined;
    let at_ = -1;
    for (let i = 0; i < steps + 5 && hit === undefined; i += 1) {
      const r = stepFu(s, NONE, DT);
      s = r.state;
      hit = r.events.find((e) => e.type === 'HIT');
      if (hit !== undefined) at_ = i + 1;
    }
    expect(Math.abs(at_ - steps)).toBeLessThanOrEqual(1);
    expect(hit).toMatchObject({ victimId: 'b', byId: 'a', creditedTo: 'a' });
    expect(player(s, 'b').alive).toBe(false);
  });

  it('the burn kills even on a step a fire boomerang is touching them again', () => {
    let s = igniteBob().state;
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === 'b' && p.burning !== undefined
          ? { ...p, burning: { ...p.burning, seconds: DT / 2 } }
          : p,
      ),
    };
    s = flying(s, 'a', { x: at(s, 'b').x - 30, y: at(s, 'b').y }, { x: 1, y: 0 }, { fire: true });
    const r = stepFu(s, NONE, DT);
    expect(r.events.find((e) => e.type === 'HIT')).toMatchObject({
      victimId: 'b',
      creditedTo: 'a',
    });
    expect(player(r.state, 'b').alive).toBe(false);
  });

  it('a shield takes the fire hit like any lethal contact: no burn', () => {
    let s = give(fiery(), 'b', 'SHIELD');
    const r = run(stepFu(s, THROW, DT).state, 40);
    s = r.state;
    expect(types(r.events)).toContain('SHIELD_BLOCKED');
    expect(types(r.events)).not.toContain('IGNITED');
    expect(player(s, 'b').burning).toBeUndefined();
    expect(player(s, 'b').alive).toBe(true);
  });

  it('a second fire hit while burning changes nothing (one burn)', () => {
    let s = igniteBob().state;
    const left = player(s, 'b').burning?.seconds ?? 0;
    s = stepFu(s, NONE, DT).state;
    expect(player(s, 'b').burning?.seconds).toBeCloseTo(left - DT, 9);
  });

  it('the boomerang comes home as usual; the next throw is on fire again', () => {
    let s = igniteBob().state;
    s = run(s, 300).state;
    expect(boom(s, 'a').state).toBe('HELD');
    expect(boom(s, 'a').fire).toBeFalsy();
    s = stepFu(s, THROW, DT).state;
    expect(boom(s, 'a').fire).toBe(true);
  });

  it('a new round puts the fire out', () => {
    let s = igniteBob().state;
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, alive: false } : p)) };
    for (let i = 0; i < 600 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    expect(player(s, 'b').burning).toBeUndefined();
  });
});

describe('fire with the other powers', () => {
  it('with MULTI every piece is on fire (the video, 10:43.5)', () => {
    let s = place(give(fiery(), 'a', 'MULTI_BOOMERANG'), 'b', 1500, 850);
    s = stepFu(s, THROW, DT).state;
    for (let i = 0; i < 200 && !s.extraBoomerangs.some((b) => b.pieceOf !== undefined); i += 1)
      s = stepFu(s, NONE, DT).state;
    const pieces = s.extraBoomerangs.filter((b) => b.pieceOf !== undefined);
    expect(pieces.length).toBe(6);
    expect(pieces.every((p) => p.fire === true)).toBe(true);
  });
});
