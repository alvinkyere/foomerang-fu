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
  own,
  place,
  player,
  run,
  types,
  weaponsOf,
  type FuEvent,
  type FuState,
  STRAIGHT,
} from './support/fixtures';

// EXPLOSIVE_BOOMERANG, as the reference video shows it (5:20 and 10:16; art/physics_reference/README.md) and as the owner
// decided where it does not (2026-10-19). While owned, every boomerang its owner throws is armed. An armed boomerang
//   - bounces off walls and the arena's edge like any other, still armed (it does not go off at a wall);
//   - goes off where its flight out ENDS (its range, or the impact that would turn it home), instead of coming home;
//   - goes off at once on the first living enemy it touches (owner).
// The blast: every living non-owner within `blastRadius` (the full drawn ring: ~215 u, the video against our characters as drawn) with a clear line (walls are
// cover). The owner is immune; deflection does not set it off, and the deflector is immune on that leg. A shield absorbs it.
// The boomerang is destroyed by its own blast (SPENT) and a new one is in its thrower's hand `explosiveRespawnSeconds`
// (1.5 s, owner) later.

const hits = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'HIT');
const blasted = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'BLASTED');
const victims = (events: readonly FuEvent[]) =>
  hits(events).map((e) => (e.type === 'HIT' ? e.victimId : ''));

/** Everyone parked far away along the bottom right, in the open arena (beyond the blast's reach of the scenes below). */
function field(ids: string[] = ['a', 'b', 'c', 'd']): FuState {
  let s = make(ids, STRAIGHT);
  ids.forEach((id, i) => {
    s = place(s, id, 1050 + i * 150, 850);
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

describe('the numbers', () => {
  it('the blast reaches the full drawn ring, ~215 u (the video, against our characters as drawn); a new boomerang is in hand 1.5 s after the blast (owner)', () => {
    expect(C.blastRadius).toBe(215);
    expect(C.explosiveRespawnSeconds).toBe(1.5);
  });
});

describe('arming: the charge and the throw', () => {
  it('owning it arms EVERY throw; the power stays owned; an explosion spends only that projectile', () => {
    let s = place(place(make(undefined, STRAIGHT), 'a', 600, 450), 'b', 1500, 800);
    s = face(give(s, 'a', 'EXPLOSIVE_BOOMERANG'), 'a', 1, 0);
    expect(player(s, 'a').inventory).toEqual(['EXPLOSIVE_BOOMERANG']);
    expect(boom(s, 'a').blast).toBe(false); // nothing is armed until it is thrown
    const r = stepFu(s, input({ a: { throw: true } }), DT);
    expect(boom(r.state, 'a').blast).toBe(true);
    expect(player(r.state, 'a').inventory).toEqual(['EXPLOSIVE_BOOMERANG']); // throwing does not use the power up
  });

  it('while owned it cannot be awarded again (the Book stays for someone else)', () => {
    let s = place(place(make(undefined, STRAIGHT), 'a', 600, 450), 'b', 1500, 800);
    s = give(s, 'a', 'EXPLOSIVE_BOOMERANG');
    s = {
      ...s,
      config: { ...s.config, enabledPowers: ['EXPLOSIVE_BOOMERANG'] },
      pickups: [{ id: 5, position: at(s, 'a') }],
    };
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
  /** a's armed boomerang meets b; c is a bystander ~110 away; d is ~550 away, beyond the ring. */
  function boomScene(): FuState {
    let s = field();
    s = place(s, 'b', 520, 450);
    s = place(s, 'c', 475, 560);
    s = place(s, 'd', 950, 800);
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

  it('detonates ONCE: its blast destroys it (SPENT, nowhere to be seen), and it does nothing more', () => {
    const r = run(boomScene(), 30);
    expect(blasted(r.events)).toHaveLength(1);
    expect(boom(r.state, 'a')).toMatchObject({ state: 'SPENT', blast: false });
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
    let s = make(['a', 'b', 'c', 'd'], { ...STRAIGHT, arena: PRIMITIVE_ARENA });
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

  it('a wall does NOT set it off: it bounces off still armed (the video: 3 bounces, then the blast)', () => {
    let s = make(['a', 'b', 'c'], { ...STRAIGHT, arena: PRIMITIVE_ARENA });
    s = place(place(place(s, 'a', 100, 850), 'b', 1500, 850), 'c', 1400, 100);
    s = armed(s, 'a', { x: 100, y: 450 });
    const r = run(s, 6);
    expect(r.events.filter((e) => e.type === 'RICOCHET')).toHaveLength(1);
    expect(blasted(r.events)).toEqual([]);
    expect(boom(r.state, 'a')).toMatchObject({ state: 'THROWN', blast: true });
  });
});

describe('where its flight ends, it goes off', () => {
  it('at the end of its range it explodes there, instead of coming home', () => {
    let s = field();
    s = place(s, 'b', 480, 540); // ~114 from where it ends (410, 450), off its path
    s = armed(s, 'a', { x: 400, y: 450 });
    s = patchBoomerang(s, 'a', { travelled: C.throwRange - 10 });
    const r = run(s, 3);
    const [boomEvent] = blasted(r.events);
    expect(boomEvent).toMatchObject({ type: 'BLASTED', ownerId: 'a', victims: ['b'] });
    if (boomEvent?.type === 'BLASTED') {
      expect(boomEvent.position.x).toBeCloseTo(410, 6); // 10 further on: where its range ran out
      expect(boomEvent.position.y).toBeCloseTo(450, 6);
    }
    expect(boom(r.state, 'a').state).toBe('SPENT');
    expect(player(r.state, 'b').alive).toBe(false);
  });

  it('at the impact that knocks it down, once its bounces are used up', () => {
    let s = make(['a', 'b', 'c'], { ...STRAIGHT, arena: PRIMITIVE_ARENA, maxRicochets: 0 });
    s = place(place(place(s, 'a', 100, 850), 'b', 140, 520), 'c', 300, 450); // c is inside the left corridor
    s = armed(s, 'a', { x: 100, y: 450 });
    const r = run(s, 12);
    const [boomEvent] = blasted(r.events);
    expect(boomEvent).toMatchObject({ type: 'BLASTED', ownerId: 'a' });
    if (boomEvent?.type === 'BLASTED') {
      expect(boomEvent.position.x).toBeCloseTo(200 - C.boomerangRadius, 6);
      expect(boomEvent.position.y).toBeCloseTo(450, 6);
    }
    expect(victims(r.events)).toEqual(['b']); // in the open beside the wall; not c, behind it
    expect(player(r.state, 'c').alive).toBe(true);
    expect(boom(r.state, 'a').state).toBe('SPENT');
  });

  it('a deflected armed boomerang goes off where its deflected flight ends', () => {
    let s = field(['a', 'b', 'c']);
    s = place(place(s, 'b', 600, 450), 'c', 1500, 850);
    s = patchPlayer(s, 'b', {
      facing: { x: -1, y: 0 },
      slash: { phase: 'ACTIVE', direction: { x: -1, y: 0 }, remaining: 0.12 },
    });
    s = armed(s, 'a', { x: 500, y: 450 });
    const r = run(s, 60);
    expect(types(r.events)).toContain('DEFLECTED');
    expect(blasted(r.events)).toHaveLength(1);
    expect(player(r.state, 'b').alive).toBe(true); // the deflector is immune on that leg
  });
});

describe('the boomerang it destroyed comes back', () => {
  function spent(): FuState {
    let s = field(['a', 'b']);
    s = own(s, 'a', 'EXPLOSIVE_BOOMERANG');
    s = place(place(s, 'b', 1500, 850), 'a', 300, 450);
    s = armed(s, 'a', { x: 400, y: 450 });
    s = patchBoomerang(s, 'a', { travelled: C.throwRange - 10 });
    return run(s, 2).state;
  }

  it("it is gone for 1.5 s: harmless, nothing to throw, then in its thrower's hand again, and the next throw is armed", () => {
    let s = spent();
    expect(boom(s, 'a').state).toBe('SPENT');
    const steps = Math.round(C.explosiveRespawnSeconds / DT);
    for (let i = 0; i < steps - 2; i += 1) {
      const r = stepFu(face(s, 'a', 1, 0), input({ a: { throw: true } }), DT);
      s = r.state;
      expect(types(r.events)).not.toContain('THROWN');
      expect(boom(s, 'a').state).toBe('SPENT');
    }
    s = run(s, 3).state;
    expect(boom(s, 'a').state).toBe('HELD');
    expect(boom(s, 'a').position).toEqual(at(s, 'a'));
    const again = stepFu(face(s, 'a', 1, 0), input({ a: { throw: true } }), DT).state;
    expect(boom(again, 'a')).toMatchObject({ state: 'THROWN', blast: true });
  });

  it('a spent boomerang cannot be knocked away, breaks nothing and kills nobody', () => {
    let s = spent();
    s = place(s, 'b', boom(s, 'a').position.x + 20, boom(s, 'a').position.y);
    s = patchPlayer(s, 'b', {
      facing: { x: -1, y: 0 },
      slash: { phase: 'ACTIVE', direction: { x: -1, y: 0 }, remaining: 0.12 },
    });
    const r = run(s, 10);
    expect(types(r.events)).not.toContain('DEFLECTED');
    expect(hits(r.events)).toEqual([]);
  });
});

describe('contact, and what does NOT set it off', () => {
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

  it('the capability survives an explosion: still owned after it', () => {
    let s = field(['a', 'b', 'c']);
    s = own(s, 'a', 'EXPLOSIVE_BOOMERANG');
    s = place(place(s, 'b', 520, 450), 'a', 300, 450);
    s = armed(s, 'a', { x: 400, y: 450 });
    const exploded = run(s, 14);
    expect(blasted(exploded.events)).toHaveLength(1);
    expect(player(exploded.state, 'a').inventory).toEqual(['EXPLOSIVE_BOOMERANG']);
  });
});

describe('SHIELD and BLAST', () => {
  it('a shield absorbs the blast (and breaks); the unshielded bystander still dies', () => {
    let s = field();
    s = place(s, 'b', 520, 450);
    s = give(s, 'b', 'SHIELD');
    s = place(s, 'c', 475, 560);
    s = place(s, 'b', 520, 450);
    s = armed(s, 'a');
    const r = run(s, 14);
    expect(r.events.filter((e) => e.type === 'SHIELD_BLOCKED')).toEqual([
      expect.objectContaining({ playerId: 'b', byId: 'a' }),
    ]);
    expect(victims(r.events)).toEqual(['c']);
    expect(player(r.state, 'b').alive).toBe(true);
    expect(player(r.state, 'b').inventory).toEqual([]);
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

  it('a new round starts with nothing armed in flight, and the owner still owns it', () => {
    let s = field(['a', 'b']);
    s = own(s, 'a', 'EXPLOSIVE_BOOMERANG');
    s = armed(s, 'a');
    s = { ...s, players: s.players.map((p) => (p.id === 'b' ? { ...p, alive: false } : p)) };
    s = stepFu(s, NONE, DT).state;
    for (let i = 0; i < 400 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    expect(weaponsOf(s, 'a').every((w) => !w.blast && w.state === 'HELD')).toBe(true);
    expect(player(s, 'a').inventory).toEqual(['EXPLOSIVE_BOOMERANG']);
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
