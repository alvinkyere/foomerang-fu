import { describe, expect, it } from 'vitest';
import { stepFu } from '../src/rules';
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
  must,
  own,
  patchBoomerang,
  patchPlayer,
  place,
  player,
  run,
  types,
  weaponsOf,
  type FuEvent,
  type FuState,
  STRAIGHT,
} from './support/fixtures';

// EXTRA_BOOMERANG — the reference video (7:16, the eggplant takes it; 7:18.95 and 7:19.15 it throws twice, the second while the
// first is still out). The player owns two boomerangs, each with its own state. One THROW press throws ONE: the player's own
// boomerang first, then the extra; a press with both away does nothing. Each flies, hits walls, is deflected, returns and is
// caught on its own. SLASH needs at least one in hand. Both are the owner's: they never hurt the owner. Ownership persists.

const THROW = input({ a: { throw: true } });
const hits = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'HIT');

/** Alice at (600,450) facing right with EXTRA_BOOMERANG; Bob far away. */
function twinned(): FuState {
  const s = place(place(make(['a', 'b'], STRAIGHT), 'a', 600, 450), 'b', 1500, 850);
  return face(give(s, 'a', 'EXTRA_BOOMERANG'), 'a', 1, 0);
}

describe('getting the second boomerang', () => {
  it('appears in her hand, as a separate boomerang of hers, on the step she takes it', () => {
    const s = twinned();
    expect(s.extraBoomerangs).toHaveLength(1);
    expect(s.extraBoomerangs[0]).toMatchObject({ ownerId: 'a', state: 'HELD', blast: false });
    expect(weaponsOf(s, 'a')).toHaveLength(2);
    expect(weaponsOf(s, 'b')).toHaveLength(1);
    expect(s.extraBoomerangs[0]?.position).toEqual(at(s, 'a'));
  });

  it('a duplicate is refused: the Book stays, still exactly two boomerangs', () => {
    let s = twinned();
    s = {
      ...s,
      config: { ...s.config, enabledPowers: ['EXTRA_BOOMERANG'] },
      pickups: [{ id: 77, position: at(s, 'a') }],
    };
    s = stepFu(s, NONE, DT).state;
    expect(s.pickups).toHaveLength(1);
    expect(s.extraBoomerangs).toHaveLength(1);
  });

  it('a held twin rides along with its owner', () => {
    const s = run(twinned(), 10, input({ a: { move: { x: 0, y: 1 } } }), { repeat: true }).state;
    expect(s.extraBoomerangs[0]?.position).toEqual(at(s, 'a'));
    expect(boom(s, 'a').position).toEqual(at(s, 'a'));
  });
});

describe('THROW with two: one press, one boomerang; the second can go while the first is out (the video, 7:18.95 and 7:19.15)', () => {
  it('ONE press throws exactly ONE boomerang, straight ahead: her own first; the extra stays in hand', () => {
    const r = stepFu(twinned(), THROW, DT); // she faces (1, 0)
    expect(r.events.filter((e) => e.type === 'THROWN')).toHaveLength(1);
    const [own, extra] = weaponsOf(r.state, 'a');
    expect(own?.state).toBe('THROWN');
    expect(own?.direction).toEqual({ x: 1, y: 0 });
    expect(extra?.state).toBe('HELD');
  });

  it('a second press while the first is still flying throws the extra, straight ahead too', () => {
    let s = stepFu(twinned(), THROW, DT).state;
    s = run(s, 3).state;
    expect(boom(s, 'a').state).toBe('THROWN');
    const r = stepFu(s, THROW, DT);
    expect(r.events.filter((e) => e.type === 'THROWN')).toHaveLength(1);
    const [own, extra] = weaponsOf(r.state, 'a');
    expect(own?.state).toBe('THROWN');
    expect(extra?.state).toBe('THROWN');
    expect(extra?.direction).toEqual({ x: 1, y: 0 });
  });

  it('with both away a press does nothing; with either one home it throws that one', () => {
    let s = stepFu(twinned(), THROW, DT).state;
    s = stepFu(s, THROW, DT).state;
    expect(types(stepFu(s, THROW, DT).events)).not.toContain('THROWN'); // both are away
    // the extra comes home first: it is the one thrown
    s = patchBoomerang(
      s,
      'a',
      { state: 'HELD', position: at(s, 'a'), direction: { x: 0, y: 0 }, travelled: 0 },
      1,
    );
    const r = stepFu(s, THROW, DT);
    expect(r.events.filter((e) => e.type === 'THROWN')).toHaveLength(1);
    expect(weaponsOf(r.state, 'a')[1]?.state).toBe('THROWN');
  });

  it('a charged throw charges with one in hand and throws one', () => {
    let s = stepFu(twinned(), THROW, DT).state; // her own is away, the extra in hand
    s = run(s, 10, input({ a: { throwHeld: true } }), { repeat: true }).state;
    expect(player(s, 'a').charge.phase).toBe('CHARGING');
    const r = stepFu(s, NONE, DT); // let go
    expect(r.events.filter((e) => e.type === 'THROWN')).toHaveLength(1);
    expect(weaponsOf(r.state, 'a')[1]?.state).toBe('THROWN');
  });

  it('a normal THROW without the power is unchanged: one boomerang straight ahead', () => {
    const plain = place(place(make(['a', 'b'], STRAIGHT), 'a', 600, 450), 'b', 1500, 850);
    const r = stepFu(face(plain, 'a', 1, 0), THROW, DT);
    expect(r.events.filter((e) => e.type === 'THROWN')).toHaveLength(1);
    expect(boom(r.state, 'a').direction).toEqual({ x: 1, y: 0 });
  });

  it('both come home on their own and are caught — including on the very same step', () => {
    let s = stepFu(twinned(), THROW, DT).state;
    s = stepFu(s, THROW, DT).state;
    s = run(s, 2 * Math.ceil(C.throwRange / (C.throwSpeed * DT)) + 30).state; // out its range and back
    expect(weaponsOf(s, 'a').every((w) => w.state === 'HELD')).toBe(true);
    let t = twinned();
    const near = { x: 650, y: 450 };
    t = {
      ...t,
      boomerangs: t.boomerangs.map((b) =>
        b.ownerId === 'a' ? { ...b, state: 'RETURNING', position: near } : b,
      ),
      extraBoomerangs: t.extraBoomerangs.map((b) => ({ ...b, state: 'RETURNING', position: near })),
    };
    const r = run(t, 10);
    expect(r.events.filter((e) => e.type === 'CAUGHT')).toHaveLength(2);
  });

  it('a throw against a wall starts as close as the wall allows and turns back', () => {
    let s = make(['a', 'b'], {
      ...STRAIGHT,
      maxRicochets: 0, // (no bounce: the impact turns them home; ricochets are ricochet.test.ts's subject)
      arena: { width: 1600, height: 900, walls: [{ x: 660, y: 0, width: 60, height: 900 }] },
    });
    s = own(place(place(s, 'a', 600, 450), 'b', 1500, 850), 'a', 'EXTRA_BOOMERANG');
    s = face(s, 'a', 1, 0);
    s = stepFu(stepFu(s, THROW, DT).state, THROW, DT).state;
    const r = run(s, 12);
    for (const w of weaponsOf(r.state, 'a'))
      expect(w.position.x).toBeLessThanOrEqual(660 - C.boomerangRadius + 1e-6);
    expect(
      weaponsOf(r.state, 'a').every((w) => w.state === 'RETURNING' || w.state === 'HELD'),
    ).toBe(true);
  });
});

describe('SLASH with two', () => {
  it('works while ONE is still in hand, and not while BOTH are away', () => {
    let s = twinned();
    s = patchBoomerang(
      s,
      'a',
      { state: 'THROWN', position: { x: 800, y: 450 }, direction: { x: 1, y: 0 }, travelled: 0 },
      1,
    );
    expect(types(stepFu(s, input({ a: { slash: true } }), DT).events)).toContain('SLASHED');
    const away = stepFu(stepFu(twinned(), THROW, DT).state, THROW, DT).state; // both thrown
    const refused = stepFu(away, input({ a: { slash: true } }), DT).state;
    expect(player(refused, 'a').slash.phase).toBe('READY');
  });

  it('a THROW during an ACTIVE swing is still refused (the weapon is mid-swing)', () => {
    let s = twinned();
    s = stepFu(s, input({ a: { slash: true } }), DT).state;
    expect(types(stepFu(s, THROW, DT).events)).not.toContain('THROWN');
  });
});

describe('two boomerangs in combat', () => {
  it("the extra kills like any boomerang, and the kill is its owner's", () => {
    let s = twinned();
    s = place(s, 'b', 800, 450);
    s = stepFu(s, THROW, DT).state;
    s = stepFu(s, THROW, DT).state;
    const r = run(s, 30);
    expect(hits(r.events).length).toBeGreaterThan(0);
    expect(hits(r.events)[0]).toMatchObject({ victimId: 'b', byId: 'a' });
  });

  it('neither boomerang ever hurts its owner', () => {
    let s = twinned();
    s = stepFu(s, THROW, DT).state;
    s = stepFu(s, THROW, DT).state;
    s = run(s, 120).state;
    expect(player(s, 'a').alive).toBe(true);
  });

  it('each is deflected on its own: one defender can knock BOTH away on the same step', () => {
    let s = make(['a', 'b'], STRAIGHT);
    s = place(place(s, 'a', 100, 850), 'b', 600, 450);
    s = give(place(s, 'a', 100, 850), 'a', 'EXTRA_BOOMERANG');
    s = patchPlayer(s, 'b', {
      facing: { x: -1, y: 0 },
      slash: { phase: 'ACTIVE', direction: { x: -1, y: 0 }, remaining: 0.12 },
    });
    s = flying(s, 'a', { x: 500, y: 450 }, { x: 1, y: 0 }, {}, 0);
    s = flying(s, 'a', { x: 500, y: 420 }, { x: 1, y: 0 }, {}, 1);
    const r = stepFu(s, NONE, DT);
    expect(r.events.filter((e) => e.type === 'DEFLECTED')).toHaveLength(2);
    expect(weaponsOf(r.state, 'a').map((w) => w.state)).toEqual(['DEFLECTED', 'DEFLECTED']);
    expect(player(r.state, 'b').alive).toBe(true);
  });

  it('each meets walls on its own', () => {
    let s = make(['a', 'b'], {
      ...STRAIGHT,
      arena: { width: 1600, height: 900, walls: [{ x: 900, y: 0, width: 60, height: 900 }] },
    });
    s = place(place(s, 'a', 600, 450), 'b', 1500, 850);
    s = face(give(s, 'a', 'EXTRA_BOOMERANG'), 'a', 1, 0);
    s = stepFu(s, THROW, DT).state;
    s = run(s, 4).state;
    s = stepFu(s, THROW, DT).state; // the second, later, at the same wall
    const r = run(s, 40);
    // each flies at the wall and bounces off it on its own: two RICOCHETs, both heading back
    expect(r.events.filter((e) => e.type === 'RICOCHET')).toHaveLength(2);
    for (const w of weaponsOf(r.state, 'a')) expect(w.direction.x).toBeLessThan(0);
  });

  it("a dead owner's boomerangs keep flying, and death does not take the power", () => {
    let s = twinned();
    s = stepFu(s, THROW, DT).state;
    s = stepFu(s, THROW, DT).state;
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, alive: false } : p)) };
    s = stepFu(s, NONE, DT).state;
    expect(weaponsOf(s, 'a')).toHaveLength(2);
    expect(weaponsOf(s, 'a').every((w) => w.state !== 'HELD')).toBe(true);
    expect(player(s, 'a').inventory).toEqual(['EXTRA_BOOMERANG']);
  });

  it('a new round gives the owner their second boomerang again, in hand (it persists; thrown ones are restored)', () => {
    let s = twinned();
    s = stepFu(s, THROW, DT).state;
    s = stepFu(s, THROW, DT).state;
    s = stepFu(
      { ...s, players: s.players.map((p) => (p.id === 'b' ? { ...p, alive: false } : p)) },
      NONE,
      DT,
    ).state;
    for (let i = 0; i < 400 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    expect(player(s, 'a').inventory).toEqual(['EXTRA_BOOMERANG']);
    expect(weaponsOf(s, 'a')).toHaveLength(2);
    expect(weaponsOf(s, 'a').every((w) => w.state === 'HELD')).toBe(true);
    expect(weaponsOf(s, 'b')).toHaveLength(1); // nobody else gained one
  });

  it('losing EXTRA_BOOMERANG (FIFO eviction) takes the second boomerang away', () => {
    let s = twinned();
    s = give(give(give(s, 'a', 'SHIELD'), 'a', 'EXPLOSIVE_BOOMERANG'), 'a', 'CAFFEINATED'); // the 4th power pushes EXTRA_BOOMERANG out
    expect(player(s, 'a').inventory).toEqual(['SHIELD', 'EXPLOSIVE_BOOMERANG', 'CAFFEINATED']);
    expect(s.extraBoomerangs.filter((b) => b.ownerId === 'a')).toHaveLength(0);
  });

  it('a boomerang whose owner is not in the match is inert and cannot hurt anyone (impossible state is rejected, not obeyed)', () => {
    let s = twinned();
    s = {
      ...s,
      extraBoomerangs: [
        ...s.extraBoomerangs,
        {
          ...must(s.extraBoomerangs[0], 'twin'),
          ownerId: 'ghost',
          state: 'THROWN',
          position: at(s, 'a'),
          direction: { x: 1, y: 0 },
        },
      ],
    };
    const r = run(s, 5);
    expect(player(r.state, 'a').alive).toBe(true);
    expect(r.state.extraBoomerangs.every((b) => b.ownerId !== 'ghost')).toBe(true);
  });
});

describe('EXTRA_BOOMERANG and EXPLOSIVE_BOOMERANG', () => {
  it('owning both: each boomerang thrown is armed', () => {
    let s = give(twinned(), 'a', 'EXPLOSIVE_BOOMERANG');
    s = stepFu(s, THROW, DT).state;
    s = stepFu(s, THROW, DT).state;
    const [own, extra] = weaponsOf(s, 'a');
    expect(own?.blast).toBe(true);
    expect(extra?.blast).toBe(true);
    expect(player(s, 'a').inventory).toEqual(['EXTRA_BOOMERANG', 'EXPLOSIVE_BOOMERANG']);
  });
});
