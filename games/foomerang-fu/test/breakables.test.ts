import { describe, expect, it } from 'vitest';
import {
  MARKET_PLAZA_ARENA,
  MARKET_PLAZA_BREAKABLES,
  MARKET_PLAZA_WALLS,
  createFuMatch,
  distanceToSolid,
  stepFu,
  type FuArena,
  type FuEvent,
  type FuState,
} from '../src/rules';
import {
  DT,
  R,
  at,
  boom,
  face,
  flying,
  input,
  kill,
  make,
  own,
  place,
  run,
  STRAIGHT,
} from './support/fixtures';

// Breakables (owner, 2026-10-17; the reference video at 02:21): crates and pots break when a boomerang or a slash hits
// them, never a dash. Until then they are solid to bodies like any wall. A boomerang is not stopped by one: it flies
// straight through and breaks it (the pots burst as the boomerang passes). A blast breaks every one in its radius. Broken
// props are back at the start of every round.

const CRATE = {
  id: 'crate',
  shape: 'box',
  x: 800,
  y: 450,
  halfWidth: 25,
  halfHeight: 25,
  angle: 0.3,
} as const;
const POT = { id: 'pot', shape: 'disc', x: 800, y: 700, radius: 20 } as const;
const ARENA: FuArena = {
  width: 1600,
  height: 900,
  breakables: [CRATE, POT],
  spawns: [
    { x: 400, y: 450 },
    { x: 1300, y: 200 },
    { x: 200, y: 150 },
    { x: 200, y: 750 },
    { x: 1400, y: 450 },
    { x: 1400, y: 750 },
  ],
};
const match = (): FuState => make(['a', 'b'], { ...STRAIGHT, arena: ARENA, seed: 4 });
const broken = (events: readonly FuEvent[]) =>
  events.filter((e): e is Extract<FuEvent, { type: 'PROP_BROKEN' }> => e.type === 'PROP_BROKEN');

describe('breakable props', () => {
  it('an unbroken crate is solid to a player walking into it: she slides round its turned face, never into it', () => {
    let s = place(match(), 'a', 650, 450);
    for (let i = 0; i < 60; i += 1) {
      s = stepFu(s, input({ a: { move: { x: 1, y: 0 } } }), DT).state;
      expect(distanceToSolid(at(s, 'a'), CRATE), `step ${i}`).toBeGreaterThan(R - 0.5);
    }
    expect(s.broken).toEqual([]);
  });

  it('a thrown boomerang breaks a crate and flies straight on through it', () => {
    let s = place(match(), 'a', 650, 450);
    s = face(s, 'a', 1, 0);
    const r = run(s, 20, input({ a: { throw: true } }));
    expect(broken(r.events)).toEqual([
      {
        type: 'PROP_BROKEN',
        id: 'crate',
        byId: 'a',
        cause: 'BOOMERANG',
        position: { x: 800, y: 450 },
      },
    ]);
    expect(r.state.broken).toEqual(['crate']);
    // not turned back by it: still on its way out, beyond where the crate stood
    expect(boom(r.state, 'a').state).toBe('THROWN');
    expect(boom(r.state, 'a').position.x).toBeGreaterThan(830);
  });

  it('once broken it is gone: a player walks through where it stood', () => {
    let s = place(match(), 'a', 650, 450);
    s = { ...face(s, 'a', 1, 0) };
    s = run(s, 20, input({ a: { throw: true } })).state;
    s = run(s, 90, input({ a: { move: { x: 1, y: 0 } } }), { repeat: true }).state;
    expect(at(s, 'a').x).toBeGreaterThan(850);
  });

  it('a boomerang coming home breaks a pot on its way too', () => {
    let s = place(match(), 'a', 800, 820);
    s = flying(s, 'a', { x: 800, y: 600 }, { x: 0, y: -1 }, { state: 'RETURNING' });
    const r = run(s, 30);
    expect(broken(r.events).map((e) => [e.id, e.cause])).toEqual([['pot', 'BOOMERANG']]);
  });

  it('a slash breaks a crate within its reach', () => {
    let s = place(match(), 'a', 800 - 25 - R - 20, 450);
    s = face(s, 'a', 1, 0);
    const r = run(s, 10, input({ a: { slash: true } }));
    expect(broken(r.events).map((e) => [e.id, e.byId, e.cause])).toEqual([['crate', 'a', 'SLASH']]);
  });

  it('a dash into a crate does not break it: the dash stops against it', () => {
    let s = place(match(), 'a', 650, 450);
    s = face(s, 'a', 1, 0);
    const r = run(s, 30, input({ a: { move: { x: 1, y: 0 }, dash: true } }));
    expect(broken(r.events)).toEqual([]);
    expect(at(r.state, 'a').x).toBeLessThan(800 - 25 - R + 6);
  });

  it('a blast breaks every prop in its radius', () => {
    let s = place(match(), 'a', 650, 580);
    s = own(face(s, 'a', 1, 0), 'a', 'BLAST_BOOMERANG');
    s = place(s, 'b', 830, 575); // the armed boomerang meets b between the crate and the pot, and explodes
    const r = run(s, 30, input({ a: { throw: true } }));
    expect(new Set(broken(r.events).map((e) => e.id))).toEqual(new Set(['crate', 'pot']));
    expect(broken(r.events).every((e) => e.cause === 'BLAST' || e.cause === 'BOOMERANG')).toBe(
      true,
    );
  });

  it('every new round puts the broken props back', () => {
    let s = place(match(), 'a', 650, 450);
    s = face(s, 'a', 1, 0);
    s = run(s, 20, input({ a: { throw: true } })).state;
    expect(s.broken).toEqual(['crate']);
    s = kill(s, 'b'); // the round is won...
    for (let i = 0; i < 60 * 4 && s.round === 1; i += 1) s = stepFu(s, input({}), DT).state;
    expect(s.round).toBe(2); // ...and the next one starts with the crate whole again
    expect(s.broken).toEqual([]);
  });

  it('a breakable must be a proper solid with its own id, clear of the spawns', () => {
    const bad = (breakables: NonNullable<FuArena['breakables']>) => () =>
      createFuMatch([{ id: 'a', slot: 0 }], { ...STRAIGHT, arena: { ...ARENA, breakables } });
    expect(bad([CRATE, { ...POT, id: 'crate' }])).toThrow(/breakable/);
    expect(bad([{ ...POT, radius: 5 }])).toThrow(/thinner/);
    expect(bad([{ ...POT, x: 400, y: 450 }])).toThrow(/spawn/);
  });

  it('a replay is identical (breaking is deterministic)', () => {
    let s = place(match(), 'a', 650, 450);
    s = face(s, 'a', 1, 0);
    const one = run(s, 40, input({ a: { throw: true } }));
    const two = run(s, 40, input({ a: { throw: true } }));
    expect(two.events).toEqual(one.events);
    expect(stepFu(two.state, input({}), DT).state).toEqual(stepFu(one.state, input({}), DT).state);
  });
});

describe('the plaza’s breakables', () => {
  it('its crates and pots break; stalls, the fountain, poles, the sign, fences and the terrace are walls', () => {
    const kinds = new Set(MARKET_PLAZA_BREAKABLES.map((b) => b.kind));
    expect(kinds).toEqual(new Set(['CRATE', 'POT']));
    expect(MARKET_PLAZA_BREAKABLES.length).toBe(16);
    const wallKinds: readonly string[] = MARKET_PLAZA_WALLS.map((w) => w.kind);
    expect(wallKinds.some((k) => k === 'CRATE' || k === 'POT')).toBe(false);
    expect(MARKET_PLAZA_ARENA.breakables).toHaveLength(16);
  });
});
