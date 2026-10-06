import { describe, expect, it } from 'vitest';
import {
  POWER_COMBINATIONS,
  POWER_KINDS,
  PRIMITIVE_ARENA,
  stepFu,
  type PowerKind,
} from '../src/rules';
import { circleHitsWalls, wallsOf } from '../src/rules/arena';
import {
  C,
  DT,
  NONE,
  R,
  at,
  face,
  flying,
  give,
  holds,
  input,
  make,
  own,
  patchPlayer,
  place,
  player,
  run,
  weaponsOf,
  type FuEvent,
  type FuState,
} from './support/fixtures';

// Combinations are explicit: the matrix lists every pair, `exclusivePairs` can forbid one, and each
// pair's rule is pinned here. Powers never combine by accident. A player owns at most three.

const WALLS = wallsOf(PRIMITIVE_ARENA);
const valid = (p: { x: number; y: number }) => !circleHitsWalls(p, R, WALLS);
const RIGHT = { x: 1, y: 0 };
const hits = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'HIT');

const pairs: [PowerKind, PowerKind][] = [];
for (const a of POWER_KINDS) for (const b of POWER_KINDS) if (a < b) pairs.push([a, b]);

describe('every pair can be owned together, and an exclusive pair cannot', () => {
  it.each(pairs)(
    '%s + %s: allowed by the table, owned together in play, forbiddable by config',
    (a, b) => {
      expect(POWER_COMBINATIONS[`${a}+${b}`]?.allowed).toBe(true);
      let s = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
      s = give(give(s, 'a', a), 'a', b);
      expect(holds(s, 'a', a) && holds(s, 'a', b)).toBe(true);
      // the same pair, forbidden: the Book stays on the ground (this player's pool is empty)
      let t = place(
        place(make(['a', 'b'], { exclusivePairs: [[b, a]] }), 'a', 600, 450),
        'b',
        1500,
        800,
      );
      t = give(t, 'a', a);
      t = {
        ...t,
        config: { ...t.config, enabledPowers: [b] },
        pickups: [{ id: 1, position: at(t, 'a') }],
      };
      t = stepFu(t, NONE, DT).state;
      expect(t.pickups).toHaveLength(1);
      expect(holds(t, 'a', b)).toBe(false);
    },
  );

  it('five gifts leave the LAST three, in order (FIFO)', () => {
    let s = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
    for (const kind of POWER_KINDS) s = give(s, 'a', kind);
    expect(player(s, 'a').inventory).toEqual(['GUARD', 'TWIN_THROW', 'PHASE_DASH']);
  });
});

describe('PHASE_DASH + OVERDRIVE', () => {
  it('an overdriven dash is long enough to cross cover that a fatigued phase dash is not (and fatigue still counts)', () => {
    const fatigued = (kinds: PowerKind[]) => {
      let s = make(['a', 'b'], { arena: PRIMITIVE_ARENA });
      s = place(place(s, 'a', 520 - R, 350), 'b', 1500, 850); // flush against the 80-wide cover block
      s = own(s, 'a', ...kinds);
      return patchPlayer(s, 'a', { fatigue: { dashes: 9, recoverIn: 4 } });
    };
    const go = (s: FuState) => {
      let r = stepFu(s, input({ a: { dash: true, move: RIGHT } }), DT);
      for (let i = 0; i < 30 && player(r.state, 'a').dash.phase === 'DASHING'; i += 1)
        r = stepFu(r.state, NONE, DT);
      return r.state;
    };
    const plain = go(fatigued(['PHASE_DASH']));
    expect(at(plain, 'a').x).toBeCloseTo(520 - R, 6); // 123 is not enough to get out the far side
    const boosted = go(fatigued(['PHASE_DASH', 'OVERDRIVE']));
    expect(at(boosted, 'a').x).toBeCloseTo(
      520 - R + C.dashSpeed * C.dashSeconds * C.fatiguedDashFactor * C.overdriveDashFactor,
      6,
    );
    expect(valid(at(boosted, 'a'))).toBe(true);
    expect(player(boosted, 'a').fatigue.dashes).toBe(10);
  });
});

describe('GUARD + PHASE_DASH', () => {
  it('the shield breaks on a hit taken mid-wall; phasing shelters nobody; the next hit kills', () => {
    let s = make(['a', 'b'], { arena: PRIMITIVE_ARENA });
    s = place(place(s, 'a', 130, 450), 'b', 100, 850);
    s = own(s, 'a', 'PHASE_DASH', 'GUARD');
    s = flying(s, 'b', { x: 186, y: 380 }, { x: 0, y: 1 });
    const first = run(s, 12, input({ a: { dash: true, move: RIGHT } }));
    expect(player(first.state, 'a').alive).toBe(true);
    expect(player(first.state, 'a').inventory).toEqual(['PHASE_DASH']);
    let t = place(first.state, 'a', 130, 450);
    t = patchPlayer(t, 'a', { dash: { phase: 'READY' } });
    t = flying(t, 'b', { x: 186, y: 380 }, { x: 0, y: 1 }, { absorbed: [] });
    expect(player(run(t, 12, input({ a: { dash: true, move: RIGHT } })).state, 'a').alive).toBe(
      false,
    );
  });
});

describe('TWIN_THROW + BLAST_BOOMERANG', () => {
  it('both boomerangs are armed; each detonates once on its own contact', () => {
    let s = make(['a', 'b', 'c']);
    s = place(place(place(s, 'a', 100, 450), 'b', 550, 450), 'c', 550, 580);
    s = face(own(s, 'a', 'TWIN_THROW', 'BLAST_BOOMERANG'), 'a', 1, 0);
    const throws = input({ a: { throw: true } });
    let r = stepFu(s, throws, DT);
    const events: FuEvent[] = [...r.events];
    r = stepFu(r.state, throws, DT);
    events.push(...r.events);
    expect(weaponsOf(r.state, 'a').map((w) => w.blast)).toEqual([true, true]);
    const rest = run(r.state, 80);
    const all = [...events, ...rest.events];
    expect(all.filter((e) => e.type === 'BLASTED').length).toBeGreaterThanOrEqual(1);
    expect(
      hits(all)
        .map((e) => (e.type === 'HIT' ? e.victimId : ''))
        .sort(),
    ).toEqual(['b', 'c']);
  });
});

describe('three powers at once', () => {
  it('PHASE + OVERDRIVE + GUARD: crosses the thick central block, shield intact', () => {
    let s = make(['a', 'b'], { arena: PRIMITIVE_ARENA });
    s = own(
      place(place(s, 'a', 800, 330), 'b', 1500, 850),
      'a',
      'PHASE_DASH',
      'OVERDRIVE',
      'GUARD',
    );
    let r = stepFu(s, input({ a: { dash: true, move: { x: 0, y: 1 } } }), DT);
    for (let i = 0; i < 40 && player(r.state, 'a').dash.phase === 'DASHING'; i += 1)
      r = stepFu(r.state, NONE, DT);
    expect(at(r.state, 'a').y).toBeCloseTo(
      330 + C.dashSpeed * C.dashSeconds * C.overdriveDashFactor,
      6,
    );
    expect(valid(at(r.state, 'a'))).toBe(true);
    expect(player(r.state, 'a').inventory).toEqual(['PHASE_DASH', 'OVERDRIVE', 'GUARD']);
  });

  it('TWIN + BLAST + GUARD: two boomerangs, armed, with a shield against the retaliation', () => {
    let s = make(['a', 'b'], { arena: { width: 1600, height: 900 } });
    s = own(
      place(place(s, 'a', 100, 450), 'b', 700, 450),
      'a',
      'TWIN_THROW',
      'BLAST_BOOMERANG',
      'GUARD',
    );
    s = face(face(s, 'a', 1, 0), 'b', -1, 0);
    expect(weaponsOf(s, 'a')).toHaveLength(2);
    const r = run(s, 90, input({ a: { throw: true } }));
    expect(player(r.state, 'b').alive).toBe(false);
    expect(player(r.state, 'a').alive).toBe(true);
    expect(player(r.state, 'a').inventory).toContain('GUARD');
  });

  it('a replay of a three-power scene is identical', () => {
    const play = () => {
      let s = make(['a', 'b', 'c'], { arena: PRIMITIVE_ARENA });
      s = own(s, 'a', 'PHASE_DASH', 'TWIN_THROW', 'BLAST_BOOMERANG');
      const log: unknown[] = [];
      for (let i = 0; i < 1500; i += 1) {
        const r = stepFu(
          s,
          input({
            a: {
              move: { x: Math.cos(i / 31), y: Math.sin(i / 27) },
              dash: i % 13 === 0,
              throw: i % 37 === 0,
              slash: i % 61 === 0,
            },
            b: {
              move: { x: Math.sin(i / 21), y: Math.cos(i / 17) },
              dash: i % 19 === 0,
              throw: i % 43 === 0,
            },
            c: { move: { x: -Math.cos(i / 23), y: Math.sin(i / 41) }, slash: i % 53 === 0 },
          }),
          DT,
        );
        s = r.state;
        log.push(r.events);
      }
      return JSON.stringify({ s, log });
    };
    expect(play()).toBe(play());
  });
});
