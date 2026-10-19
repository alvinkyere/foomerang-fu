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

// TWIN_THROW — PERSISTENT (until death or round reset). The player owns two boomerangs, each with
// its own state. One THROW press throws ONE: the player's own boomerang first, then the twin; a press
// with both away does nothing. Each flies, hits walls, is deflected, returns and is caught on its own.
// SLASH needs at least one in hand. Both are the owner's: they never hurt the owner. A dead owner's
// boomerangs keep flying. Round reset takes the twin away.

const THROW = input({ a: { throw: true } });
const hits = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'HIT');

/** Alice at (600,450) facing right with TWIN_THROW; Bob far away. */
function twinned(): FuState {
  const s = place(place(make(['a', 'b'], STRAIGHT), 'a', 600, 450), 'b', 1500, 850);
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

describe('THROW with two: one press, two boomerangs, same step, symmetric spread', () => {
  const SPREAD = C.twinSpreadRadians;

  it('the spread is 13° per side (inside the approved 12–15° experiment)', () => {
    expect((SPREAD * 180) / Math.PI).toBeCloseTo(13, 9);
  });

  it('ONE press launches exactly TWO boomerangs on the same step: the own one left (−θ), the twin right (+θ), both THROWN events', () => {
    const r = stepFu(twinned(), THROW, DT); // she faces (1, 0)
    expect(r.events.filter((e) => e.type === 'THROWN')).toHaveLength(2);
    const [own, twin] = weaponsOf(r.state, 'a');
    expect(own?.state).toBe('THROWN');
    expect(twin?.state).toBe('THROWN');
    expect(own?.direction.x).toBeCloseTo(Math.cos(-SPREAD), 9);
    expect(own?.direction.y).toBeCloseTo(Math.sin(-SPREAD), 9);
    expect(twin?.direction.x).toBeCloseTo(Math.cos(SPREAD), 9);
    expect(twin?.direction.y).toBeCloseTo(Math.sin(SPREAD), 9);
    expect(own?.ownerId).toBe('a');
    expect(twin?.ownerId).toBe('a');
  });

  it('the spread is symmetric about the facing for ANY facing, and the pair share one owner and one launch step', () => {
    for (const [fx, fy] of [
      [0, 1],
      [-1, 0],
      [0.6, -0.8],
      [Math.SQRT1_2, Math.SQRT1_2],
    ] as const) {
      const r = stepFu(face(twinned(), 'a', fx, fy), THROW, DT);
      const [own, twin] = weaponsOf(r.state, 'a');
      const dot = (own?.direction.x ?? 0) * fx + (own?.direction.y ?? 0) * fy;
      const dot2 = (twin?.direction.x ?? 0) * fx + (twin?.direction.y ?? 0) * fy;
      expect(dot).toBeCloseTo(Math.cos(SPREAD), 9);
      expect(dot2).toBeCloseTo(Math.cos(SPREAD), 9);
      expect(Math.hypot(own?.direction.x ?? 0, own?.direction.y ?? 0)).toBeCloseTo(1, 9);
      // they are on opposite sides of the facing line
      const cross = (v?: { x: number; y: number }) => (v?.x ?? 0) * fy - (v?.y ?? 0) * fx;
      expect(Math.sign(cross(own?.direction))).toBe(-Math.sign(cross(twin?.direction)));
    }
  });

  it('they diverge: one goes up-and-away, one down-and-away, so they are never the same boomerang twice', () => {
    const s = run(stepFu(twinned(), THROW, DT).state, 20).state;
    const [own, twin] = weaponsOf(s, 'a');
    expect(own?.position.y).toBeLessThan(450);
    expect(twin?.position.y).toBeGreaterThan(450);
    expect((own?.position.y ?? 0) - 450).toBeCloseTo(-((twin?.position.y ?? 0) - 450), 6);
  });

  it('readiness: both must be home. With one still away THROW does nothing; once both are home it throws the pair again', () => {
    let s = stepFu(twinned(), THROW, DT).state;
    const again = stepFu(s, THROW, DT);
    expect(types(again.events)).not.toContain('THROWN'); // both are away
    // one comes home, the other is still out: still refused
    s = patchBoomerang(
      s,
      'a',
      { state: 'HELD', position: at(s, 'a'), direction: { x: 0, y: 0 }, travelled: 0 },
      0,
    );
    expect(types(stepFu(s, THROW, DT).events)).not.toContain('THROWN');
    // both home: the pair goes out again
    s = patchBoomerang(
      s,
      'a',
      { state: 'HELD', position: at(s, 'a'), direction: { x: 0, y: 0 }, travelled: 0 },
      1,
    );
    expect(stepFu(s, THROW, DT).events.filter((e) => e.type === 'THROWN')).toHaveLength(2);
  });

  it('a normal (non-twin) THROW is unchanged: one boomerang straight ahead', () => {
    const plain = place(place(make(['a', 'b'], STRAIGHT), 'a', 600, 450), 'b', 1500, 850);
    const r = stepFu(face(plain, 'a', 1, 0), THROW, DT);
    expect(r.events.filter((e) => e.type === 'THROWN')).toHaveLength(1);
    expect(boom(r.state, 'a').direction).toEqual({ x: 1, y: 0 });
  });

  it('both come home on their own and are caught — including on the very same step', () => {
    let s = stepFu(twinned(), THROW, DT).state;
    s = run(s, 90).state;
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

  it('a Twin throw against a wall starts each boomerang as close as the wall allows and turns both back (each independent)', () => {
    let s = make(['a', 'b'], {
      ...STRAIGHT,
      arena: { width: 1600, height: 900, walls: [{ x: 660, y: 0, width: 60, height: 900 }] },
    });
    s = own(place(place(s, 'a', 600, 450), 'b', 1500, 850), 'a', 'TWIN_THROW');
    s = face(s, 'a', 1, 0);
    const r = run(stepFu(s, THROW, DT).state, 12);
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
    const away = stepFu(twinned(), THROW, DT).state;
    const refused = stepFu(away, input({ a: { slash: true } }), DT).state;
    expect(player(refused, 'a').slash.phase).toBe('READY');
  });

  it('a THROW during an ACTIVE swing is still refused (the weapon is mid-swing)', () => {
    let s = twinned();
    s = stepFu(s, input({ a: { slash: true } }), DT).state;
    expect(types(stepFu(s, THROW, DT).events)).not.toContain('THROWN');
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
    let s = make(['a', 'b'], STRAIGHT);
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
      ...STRAIGHT,
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
  it('owning both: both boomerangs of the one throw are armed', () => {
    let s = give(twinned(), 'a', 'BLAST_BOOMERANG');
    s = stepFu(s, THROW, DT).state;
    const [own, twin] = weaponsOf(s, 'a');
    expect(own?.blast).toBe(true);
    expect(twin?.blast).toBe(true);
    expect(player(s, 'a').inventory).toEqual(['TWIN_THROW', 'BLAST_BOOMERANG']);
  });
});
