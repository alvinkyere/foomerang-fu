import { describe, expect, it } from 'vitest';
import { stepFu } from '../src/rules';
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
  must,
  patchPlayer,
  place,
  player,
  run,
  types,
  weaponsOf,
  type FuEvent,
  type FuState,
} from './support/fixtures';

// TWIN_THROW — PERSISTENT (until death or round reset). The player owns two boomerangs, each with
// its own state. One THROW press throws ONE: the player's own boomerang first, then the twin; a press
// with both away does nothing. Each flies, hits walls, is deflected, returns and is caught on its own.
// SLASH needs at least one in hand. Both are the owner's: they never hurt the owner. A dead owner's
// boomerangs keep flying. Round reset takes the twin away.

const THROW = input({ a: { throw: true } });
const hits = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'HIT');

/** Alice at (600,450) facing right with TWIN_THROW; Bob far away. */
function twinned(): FuState {
  const s = place(place(make(['a', 'b']), 'a', 600, 450), 'b', 1500, 850);
  return face(give(s, 'a', 'TWIN_THROW'), 'a', 1, 0);
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
      config: { ...s.config, enabledPowers: ['TWIN_THROW'] },
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

describe('THROW with two', () => {
  it("throws the player's own boomerang first, then the twin, one per press, and a third press does nothing", () => {
    let s = twinned();
    s = stepFu(s, THROW, DT).state;
    expect(boom(s, 'a').state).toBe('THROWN');
    expect(s.extraBoomerangs[0]?.state).toBe('HELD');
    s = stepFu(s, THROW, DT).state;
    expect(s.extraBoomerangs[0]?.state).toBe('THROWN');
    const before = JSON.stringify(s.boomerangs.concat(s.extraBoomerangs).map((b) => b.state));
    const third = stepFu(s, THROW, DT);
    expect(types(third.events)).not.toContain('THROWN');
    expect(
      JSON.stringify(
        third.state.boomerangs.concat(third.state.extraBoomerangs).map((b) => b.state),
      ),
    ).toBe(before);
  });

  it('one press on one step throws exactly one (never both)', () => {
    const r = stepFu(twinned(), THROW, DT);
    expect(r.events.filter((e) => e.type === 'THROWN')).toHaveLength(1);
  });

  it('throws are independent: a second throw can go a different way while the first is still flying', () => {
    let s = twinned();
    s = stepFu(s, THROW, DT).state;
    s = run(s, 10).state;
    s = stepFu(s, input({ a: { throw: true, move: { x: 0, y: -1 } } }), DT).state;
    const [own, twin] = weaponsOf(s, 'a');
    expect(own?.direction).toEqual({ x: 1, y: 0 });
    expect(twin?.direction).toEqual({ x: 0, y: -1 });
    expect(own?.position.y).toBe(450);
    expect(twin?.position.y).toBeLessThan(450);
  });

  it('both come home on their own and are caught — including on the very same step', () => {
    let s = twinned();
    s = stepFu(s, THROW, DT).state;
    s = stepFu(s, THROW, DT).state; // own thrown, twin thrown one step later: ~15 units behind
    s = run(s, 80).state;
    expect(weaponsOf(s, 'a').every((w) => w.state === 'HELD')).toBe(true);
    // simultaneous return: both RETURNING right beside her
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
    expect(weaponsOf(r.state, 'a').every((w) => w.state === 'HELD')).toBe(true);
  });
});

describe('SLASH with two', () => {
  it('works while ONE is still in hand, and not while BOTH are away', () => {
    let s = twinned();
    s = stepFu(s, THROW, DT).state; // one away, one in hand
    const ok = stepFu(s, input({ a: { slash: true } }), DT);
    expect(types(ok.events)).toContain('SLASHED');
    let t = stepFu(stepFu(twinned(), THROW, DT).state, THROW, DT).state; // both away
    t = stepFu(t, input({ a: { slash: true } }), DT).state;
    expect(player(t, 'a').slash.phase).toBe('READY');
  });

  it('a THROW during an ACTIVE swing is still refused (the weapon is mid-swing)', () => {
    let s = twinned();
    s = stepFu(s, input({ a: { slash: true } }), DT).state;
    const r = stepFu(s, THROW, DT);
    expect(types(r.events)).not.toContain('THROWN');
  });
});

describe('twin boomerangs in combat', () => {
  it("the twin kills like any boomerang, and the kill is its owner's", () => {
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
    let s = make(['a', 'b']);
    s = place(place(s, 'a', 100, 850), 'b', 600, 450);
    s = give(place(s, 'a', 100, 850), 'a', 'TWIN_THROW');
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
      arena: { width: 1600, height: 900, walls: [{ x: 900, y: 0, width: 60, height: 900 }] },
    });
    s = place(place(s, 'a', 600, 450), 'b', 1500, 850);
    s = face(give(s, 'a', 'TWIN_THROW'), 'a', 1, 0);
    s = stepFu(s, THROW, DT).state;
    s = stepFu(s, input({ a: { throw: true, move: { x: 0, y: 1 } } }), DT).state; // second one goes down, the other still goes right
    s = run(s, 40).state;
    const own = weaponsOf(s, 'a')[0];
    expect(own?.state === 'RETURNING' || own?.state === 'HELD').toBe(true);
  });

  it("a dead owner's boomerangs keep flying, and death does not take the power", () => {
    let s = twinned();
    s = stepFu(s, THROW, DT).state;
    s = stepFu(s, THROW, DT).state;
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, alive: false } : p)) };
    s = stepFu(s, NONE, DT).state;
    expect(weaponsOf(s, 'a')).toHaveLength(2);
    expect(weaponsOf(s, 'a').every((w) => w.state !== 'HELD')).toBe(true);
    expect(player(s, 'a').inventory).toEqual(['TWIN_THROW']);
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
    expect(player(s, 'a').inventory).toEqual(['TWIN_THROW']);
    expect(weaponsOf(s, 'a')).toHaveLength(2);
    expect(weaponsOf(s, 'a').every((w) => w.state === 'HELD')).toBe(true);
    expect(weaponsOf(s, 'b')).toHaveLength(1); // nobody else gained one
  });

  it('losing TWIN_THROW (FIFO eviction) takes the second boomerang away', () => {
    let s = twinned();
    s = give(give(give(s, 'a', 'GUARD'), 'a', 'PHASE_DASH'), 'a', 'OVERDRIVE'); // the 4th power pushes TWIN_THROW out
    expect(player(s, 'a').inventory).toEqual(['GUARD', 'PHASE_DASH', 'OVERDRIVE']);
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

describe('TWIN_THROW and BLAST_BOOMERANG', () => {
  it('owning both: every boomerang thrown, of either of the pair, is armed', () => {
    let s = give(twinned(), 'a', 'BLAST_BOOMERANG');
    s = stepFu(s, THROW, DT).state;
    s = stepFu(s, THROW, DT).state;
    const [own, twin] = weaponsOf(s, 'a');
    expect(own?.blast).toBe(true);
    expect(twin?.blast).toBe(true);
    expect(player(s, 'a').inventory).toEqual(['TWIN_THROW', 'BLAST_BOOMERANG']);
  });
});
