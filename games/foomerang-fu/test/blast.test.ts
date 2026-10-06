import { describe, expect, it } from 'vitest';
import { PRIMITIVE_ARENA, stepFu } from '../src/rules';
import {
  C,
  DT,
  NONE,
  at,
  boom,
  face,
  flying,
  give,
  input,
  make,
  patchBoomerang,
  patchPlayer,
  place,
  player,
  run,
  types,
  weaponsOf,
  type FuEvent,
  type FuState,
} from './support/fixtures';

// BLAST_BOOMERANG — CONSUMED ON USE (the first detonation).
//   Arms the NEXT boomerang its owner throws. It detonates ONCE, on the first
//     (1) contact with a living enemy, or (2) wall impact (the moment a THROWN/DEFLECTED one turns back).
//   Range end and deflection do NOT detonate it. Afterwards it flies on as a plain boomerang.
//   Blast = every living non-owner within `blastRadius` of the explosion, with a clear line (walls are
//   cover). The owner is immune to their own blast. Deflection saves, and the deflector is immune to
//   that boomerang's blast on that leg. A guard absorbs a blast like any other lethal contact.
//   An armed boomerang that comes home unused gives the charge back.

const hits = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'HIT');
const blasted = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'BLASTED');
const victims = (events: readonly FuEvent[]) =>
  hits(events).map((e) => (e.type === 'HIT' ? e.victimId : ''));

/** Everyone parked far away along the bottom, in the open arena. */
function field(ids: string[] = ['a', 'b', 'c', 'd']): FuState {
  let s = make(ids);
  ids.forEach((id, i) => {
    s = place(s, id, 100 + i * 150, 850);
  });
  return s;
}
const armed = (
  s: FuState,
  owner: string,
  from = { x: 400, y: 450 },
  dir = { x: 1, y: 0 },
  which = 0,
) => flying(s, owner, from, dir, { blast: true }, which);

describe('arming: the charge and the throw', () => {
  it('taking it gives a charge; the next throw arms THAT boomerang and spends the charge', () => {
    let s = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
    s = face(give(s, 'a', 'BLAST_BOOMERANG'), 'a', 1, 0);
    expect(player(s, 'a').powers.blast).toBe(true);
    expect(boom(s, 'a').blast).toBe(false); // the boomerang in hand is not armed yet
    const r = stepFu(s, input({ a: { throw: true } }), DT);
    expect(boom(r.state, 'a').blast).toBe(true);
    expect(player(r.state, 'a').powers.blast).toBe(false);
  });

  it('while armed in flight it counts as held (a second pickup is refused)', () => {
    let s = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
    s = face(give(s, 'a', 'BLAST_BOOMERANG'), 'a', 1, 0);
    s = stepFu(s, input({ a: { throw: true } }), DT).state;
    s = { ...s, pickups: [{ id: 5, kind: 'BLAST_BOOMERANG', position: at(s, 'a') }] };
    expect(stepFu(s, NONE, DT).state.pickups).toHaveLength(1);
  });

  it('an unarmed boomerang kills by contact exactly as before (no blast, no radius)', () => {
    let s = field();
    s = place(s, 'b', 520, 450);
    s = place(s, 'c', 520, 570); // 120 from b: would be inside a blast
    s = flying(s, 'a', { x: 400, y: 450 }, { x: 1, y: 0 });
    const r = run(s, 12);
    expect(victims(r.events)).toEqual(['b']);
    expect(blasted(r.events)).toEqual([]);
  });
});

describe('detonation on contact', () => {
  /** a's armed boomerang meets b; c is a bystander ~110 away; d is ~250 away. */
  function boomScene(): FuState {
    let s = field();
    s = place(s, 'b', 520, 450);
    s = place(s, 'c', 475, 560);
    s = place(s, 'd', 475, 700);
    return armed(s, 'a');
  }

  it('kills everyone in the radius with a clear line — the contacted player AND the bystander — and nobody outside it', () => {
    const r = run(boomScene(), 14);
    expect(victims(r.events).sort()).toEqual(['b', 'c']);
    expect(player(r.state, 'd').alive).toBe(true);
    const [boomEvent] = blasted(r.events);
    expect(boomEvent).toMatchObject({ type: 'BLASTED', ownerId: 'a', radius: C.blastRadius });
    if (boomEvent?.type === 'BLASTED') expect([...boomEvent.victims].sort()).toEqual(['b', 'c']);
    for (const h of hits(r.events)) expect(h).toMatchObject({ byId: 'a' });
  });

  it('detonates ONCE: it is a plain boomerang afterwards (and no longer armed)', () => {
    const r = run(boomScene(), 30);
    expect(blasted(r.events)).toHaveLength(1);
    expect(boom(r.state, 'a').blast).toBe(false);
  });

  it('the owner is immune to their own blast, even standing in it', () => {
    let s = boomScene();
    s = place(s, 'a', 470, 380);
    const r = run(s, 14);
    expect(player(r.state, 'a').alive).toBe(true);
    expect(victims(r.events)).not.toContain('a');
  });

  it('the dead are not victims (no HIT for a corpse)', () => {
    let s = boomScene();
    s = { ...s, players: s.players.map((p) => (p.id === 'c' ? { ...p, alive: false } : p)) };
    const r = run(s, 14);
    expect(victims(r.events)).toEqual(['b']);
  });
});

describe('cover: a blast does not go through walls', () => {
  function gateScene(): FuState {
    let s = make(['a', 'b', 'c', 'd'], { arena: PRIMITIVE_ARENA });
    s = place(s, 'a', 100, 850);
    s = place(s, 'b', 640, 100);
    s = place(s, 'c', 600, 260); // ~160 from the blast, but the gate wall is between
    s = place(s, 'd', 700, 60); // same side, ~110 away
    return armed(s, 'a', { x: 540, y: 100 });
  }

  it('a player behind cover survives; one in the open dies', () => {
    const r = run(gateScene(), 10);
    expect(victims(r.events).sort()).toEqual(['b', 'd']);
    expect(player(r.state, 'c').alive).toBe(true);
    const [boomEvent] = blasted(r.events);
    if (boomEvent?.type === 'BLASTED') expect(boomEvent.victims).not.toContain('c');
  });

  it('detonates on WALL IMPACT too: at the wall, killing what is in the open beside it, not what is behind it', () => {
    let s = make(['a', 'b', 'c'], { arena: PRIMITIVE_ARENA });
    s = place(place(place(s, 'a', 100, 850), 'b', 140, 520), 'c', 300, 450); // c is inside the left corridor
    s = armed(s, 'a', { x: 100, y: 450 });
    const r = run(s, 12);
    const [boomEvent] = blasted(r.events);
    expect(boomEvent).toMatchObject({ type: 'BLASTED', ownerId: 'a' });
    if (boomEvent?.type === 'BLASTED') {
      expect(boomEvent.position.x).toBeCloseTo(200 - C.boomerangRadius, 6);
      expect(boomEvent.position.y).toBeCloseTo(450, 6);
    }
    expect(victims(r.events)).toEqual(['b']);
    expect(player(r.state, 'c').alive).toBe(true);
    expect(boom(r.state, 'a').state).toBe('RETURNING');
  });
});

describe('what does NOT detonate it', () => {
  it('reaching the end of its range does not; it stays armed and comes home armed', () => {
    let s = field();
    s = place(s, 'b', 700, 560);
    s = armed(s, 'a', { x: 400, y: 450 });
    s = patchBoomerang(s, 'a', { travelled: C.throwRange - 10 });
    const r = run(s, 3);
    expect(blasted(r.events)).toEqual([]);
    expect(boom(r.state, 'a')).toMatchObject({ state: 'RETURNING', blast: true });
    expect(player(r.state, 'b').alive).toBe(true);
  });

  it('…and the RETURNING armed boomerang detonates on contact with an enemy in its way home', () => {
    let s = field();
    s = place(s, 'a', 100, 450);
    s = place(s, 'b', 300, 450);
    s = patchBoomerang(s, 'a', {
      state: 'RETURNING',
      position: { x: 600, y: 450 },
      direction: { x: 0, y: 0 },
      blast: true,
    });
    const r = run(s, 30);
    expect(blasted(r.events)).toHaveLength(1);
    expect(victims(r.events)).toContain('b');
  });

  it('being deflected does not: the clank absorbs it, it stays armed and the deflector lives', () => {
    let s = field(['a', 'b', 'c']);
    s = place(place(s, 'b', 600, 450), 'c', 1500, 850);
    s = patchPlayer(s, 'b', {
      facing: { x: -1, y: 0 },
      slash: { phase: 'ACTIVE', direction: { x: -1, y: 0 }, remaining: 0.12 },
    });
    s = armed(s, 'a', { x: 500, y: 450 });
    const r = stepFu(s, NONE, DT);
    expect(types(r.events)).toContain('DEFLECTED');
    expect(blasted(r.events)).toEqual([]);
    expect(player(r.state, 'b').alive).toBe(true);
    expect(boom(r.state, 'a')).toMatchObject({ state: 'DEFLECTED', blast: true });
  });

  it('a deflected armed boomerang can still explode later; the deflector is safe from that blast on that leg', () => {
    let s = field(['a', 'b', 'c', 'd']);
    s = place(s, 'b', 600, 450);
    s = place(s, 'c', 461, 423); // where the deflected boomerang is heading
    s = place(s, 'd', 400, 330);
    s = patchPlayer(s, 'b', {
      facing: { x: -1, y: 0 },
      slash: { phase: 'ACTIVE', direction: { x: -1, y: 0 }, remaining: 0.12 },
    });
    s = armed(s, 'a', { x: 500, y: 450 });
    const r = run(s, 25);
    expect(blasted(r.events)).toHaveLength(1);
    expect(victims(r.events)).toContain('c');
    expect(player(r.state, 'b').alive).toBe(true); // ~125 from the blast, in the clear — but he knocked it away
  });

  it('coming home unused gives the charge back (nothing is wasted)', () => {
    let s = field(['a', 'b']);
    s = place(s, 'a', 300, 450);
    s = patchBoomerang(s, 'a', {
      state: 'RETURNING',
      position: { x: 400, y: 450 },
      direction: { x: 0, y: 0 },
      blast: true,
    });
    const r = run(s, 12);
    expect(boom(r.state, 'a')).toMatchObject({ state: 'HELD', blast: false });
    expect(player(r.state, 'a').powers.blast).toBe(true);
  });
});

describe('GUARD and BLAST', () => {
  it('a guard absorbs the blast (and is spent); the unguarded bystander still dies', () => {
    let s = field();
    s = place(s, 'b', 520, 450);
    s = give(s, 'b', 'GUARD');
    s = place(s, 'c', 475, 560);
    s = place(s, 'b', 520, 450);
    s = armed(s, 'a');
    const r = run(s, 14);
    expect(r.events.filter((e) => e.type === 'GUARD_BLOCKED')).toEqual([
      expect.objectContaining({ playerId: 'b', byId: 'a' }),
    ]);
    expect(victims(r.events)).toEqual(['c']);
    expect(player(r.state, 'b').alive).toBe(true);
    expect(player(r.state, 'b').powers.guard).toBe(false);
  });
});

describe('simultaneous explosions and ownership', () => {
  it('two armed boomerangs exploding on the same step each do their own work; a shared victim is credited to the earlier attacker', () => {
    let s = field(['a', 'b', 'c', 'd']);
    s = place(place(s, 'b', 600, 450), 'd', 600, 600);
    s = armed(s, 'a', { x: 500, y: 450 });
    s = armed(s, 'c', { x: 500, y: 450 });
    const r = run(s, 12);
    expect(blasted(r.events)).toHaveLength(2);
    const bHits = hits(r.events).filter((e) => e.type === 'HIT' && e.victimId === 'b');
    expect(bHits).toEqual([expect.objectContaining({ byId: 'a' })]);
    expect(victims(r.events).sort()).toEqual(['b', 'd']);
  });

  it("a dead owner's armed boomerang still detonates, for its owner (ownership outlives the owner)", () => {
    let s = field(['a', 'b', 'c']);
    s = place(s, 'b', 520, 450);
    s = armed(s, 'a');
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, alive: false } : p)) };
    const r = run(s, 14);
    expect(hits(r.events)).toEqual([expect.objectContaining({ victimId: 'b', byId: 'a' })]);
  });

  it('a new round starts with nothing armed', () => {
    let s = field(['a', 'b']);
    s = armed(s, 'a');
    s = { ...s, players: s.players.map((p) => (p.id === 'b' ? { ...p, alive: false } : p)) };
    s = stepFu(s, NONE, DT).state;
    for (let i = 0; i < 400 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    expect(weaponsOf(s, 'a').every((w) => !w.blast && w.state === 'HELD')).toBe(true);
    expect(player(s, 'a').powers.blast).toBe(false);
  });

  it('the blast radius is the same at any accepted dt (judged at the end-of-step position)', () => {
    for (const dt of [DT, 0.05]) {
      let s = field();
      s = place(s, 'b', 450, 450);
      s = place(s, 'c', 445, 600);
      s = armed(s, 'a', { x: 420, y: 450 });
      const r = run(s, 6, NONE, { dt });
      expect(victims(r.events).sort(), `dt ${dt}`).toEqual(['b', 'c']);
    }
  });
});
