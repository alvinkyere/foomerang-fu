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
  boom,
  face,
  flying,
  give,
  holds,
  input,
  make,
  patchPlayer,
  patchPowers,
  place,
  player,
  run,
  weaponsOf,
  type FuEvent,
  type FuState,
} from './support/fixtures';

// Combinations are explicit: the matrix lists every pair, `exclusivePairs` can forbid one, and each
// pair's rule is pinned here. Powers never combine by accident.

const WALLS = wallsOf(PRIMITIVE_ARENA);
const valid = (p: { x: number; y: number }) => !circleHitsWalls(p, R, WALLS);
const RIGHT = { x: 1, y: 0 };
const hits = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'HIT');

const pairs: [PowerKind, PowerKind][] = [];
for (const a of POWER_KINDS) for (const b of POWER_KINDS) if (a < b) pairs.push([a, b]);

describe('every pair can be held together, and an exclusive pair cannot', () => {
  it.each(pairs)(
    '%s + %s: allowed by the table, held together in play, and forbiddable by config',
    (a, b) => {
      expect(POWER_COMBINATIONS[`${a}+${b}`]?.allowed).toBe(true);
      let s = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
      s = give(give(s, 'a', a), 'a', b);
      expect(holds(s, 'a', a) && holds(s, 'a', b)).toBe(true);
      // the same pair, forbidden: the second pickup stays on the ground
      let t = place(
        place(make(['a', 'b'], { exclusivePairs: [[b, a]] }), 'a', 600, 450),
        'b',
        1500,
        800,
      );
      t = give(t, 'a', a);
      t = { ...t, pickups: [{ id: 1, kind: b, position: at(t, 'a') }] };
      t = stepFu(t, NONE, DT).state;
      expect(t.pickups).toHaveLength(1);
      expect(holds(t, 'a', b)).toBe(false);
    },
  );

  it('all five at once, in any pickup order, give the same player', () => {
    const orders: PowerKind[][] = [[...POWER_KINDS], [...POWER_KINDS].reverse()];
    const results = orders.map((order) => {
      let s = place(place(make(), 'a', 600, 450), 'b', 1500, 800);
      for (const kind of order) s = give(s, 'a', kind);
      const pw = player(s, 'a').powers;
      return JSON.stringify([
        pw.overdrive > 0,
        pw.blast,
        pw.guard,
        pw.twin,
        pw.phase,
        s.extraBoomerangs.length,
      ]);
    });
    expect(results[0]).toBe(results[1]);
  });
});

describe('PHASE_DASH + OVERDRIVE', () => {
  it('an overdriven dash is long enough to cross cover that a fatigued phase dash is not (and fatigue still counts)', () => {
    const fatigued = (extra: object = {}) => {
      let s = make(['a', 'b'], { arena: PRIMITIVE_ARENA });
      s = place(place(s, 'a', 520 - R, 350), 'b', 1500, 850); // flush against the 80-wide cover block
      s = patchPowers(s, 'a', { phase: 2, ...extra });
      return patchPlayer(s, 'a', { fatigue: { dashes: 9, recoverIn: 4 } });
    };
    const go = (s: FuState) => {
      let r = stepFu(s, input({ a: { dash: true, move: RIGHT } }), DT);
      for (let i = 0; i < 30 && player(r.state, 'a').dash.phase === 'DASHING'; i += 1)
        r = stepFu(r.state, NONE, DT);
      return r.state;
    };
    const plain = go(fatigued());
    expect(at(plain, 'a').x).toBeCloseTo(520 - R, 6); // 123 is not enough to get out the far side: stays flush
    const boosted = go(fatigued({ overdrive: 100 }));
    expect(at(boosted, 'a').x).toBeCloseTo(
      520 - R + C.dashSpeed * C.dashSeconds * C.fatiguedDashFactor * C.overdriveDashFactor,
      6,
    );
    expect(valid(at(boosted, 'a'))).toBe(true);
    expect(player(boosted, 'a').fatigue.dashes).toBe(10);
  });
});

describe('GUARD + PHASE_DASH', () => {
  it('a guard is spent by a hit while phasing; phasing itself shelters nobody; then the next hit kills', () => {
    let s = make(['a', 'b'], { arena: PRIMITIVE_ARENA });
    s = place(place(s, 'a', 130, 450), 'b', 100, 850);
    s = patchPowers(s, 'a', { phase: 2, guard: true });
    s = flying(s, 'b', { x: 186, y: 380 }, { x: 0, y: 1 });
    const first = run(s, 12, input({ a: { dash: true, move: RIGHT } }));
    expect(player(first.state, 'a').alive).toBe(true);
    expect(player(first.state, 'a').powers.guard).toBe(false);
    let t = place(first.state, 'a', 130, 450);
    t = patchPlayer(t, 'a', { dash: { phase: 'READY' } });
    t = patchPowers(t, 'a', { phase: 2 });
    t = flying(t, 'b', { x: 186, y: 380 }, { x: 0, y: 1 }, { absorbed: [] });
    const second = run(t, 12, input({ a: { dash: true, move: RIGHT } }));
    expect(player(second.state, 'a').alive).toBe(false);
  });
});

describe('TWIN_THROW + BLAST_BOOMERANG', () => {
  it('only the armed one explodes; the plain twin passing the same place later kills only by touch', () => {
    let s = make(['a', 'b', 'c'], { arena: { width: 1600, height: 900 } });
    s = place(place(place(s, 'a', 100, 450), 'b', 550, 450), 'c', 550, 580);
    s = face(give(give(s, 'a', 'TWIN_THROW'), 'a', 'BLAST_BOOMERANG'), 'a', 1, 0);
    s = place(s, 'a', 100, 450);
    const throws = input({ a: { throw: true } });
    let r = stepFu(s, throws, DT);
    const events: FuEvent[] = [...r.events];
    r = stepFu(r.state, throws, DT);
    events.push(...r.events);
    const [own, twin] = weaponsOf(r.state, 'a');
    expect(own?.blast).toBe(true);
    expect(twin?.blast).toBe(false);
    const rest = run(r.state, 80);
    const all = [...events, ...rest.events];
    expect(all.filter((e) => e.type === 'BLASTED')).toHaveLength(1);
    // the blast takes both b (contact) and c (130 away, in the clear)
    expect(
      hits(all)
        .map((e) => (e.type === 'HIT' ? e.victimId : ''))
        .sort(),
    ).toEqual(['b', 'c']);
  });
});

describe('three and five powers at once', () => {
  it('PHASE + OVERDRIVE + GUARD: crosses the thick central block, is hit mid-way, survives once', () => {
    let s = make(['a', 'b'], { arena: PRIMITIVE_ARENA });
    s = place(place(s, 'a', 800, 330), 'b', 1500, 850);
    s = patchPowers(s, 'a', { phase: 2, overdrive: 100, guard: true });
    let r = stepFu(s, input({ a: { dash: true, move: { x: 0, y: 1 } } }), DT);
    for (let i = 0; i < 40 && player(r.state, 'a').dash.phase === 'DASHING'; i += 1)
      r = stepFu(r.state, NONE, DT);
    expect(at(r.state, 'a').y).toBeCloseTo(
      330 + C.dashSpeed * C.dashSeconds * C.overdriveDashFactor,
      6,
    );
    expect(valid(at(r.state, 'a'))).toBe(true);
    expect(player(r.state, 'a').alive).toBe(true);
  });

  it('TWIN + BLAST + GUARD: two boomerangs, one armed, and a guard against the retaliation', () => {
    let s = make(['a', 'b'], { arena: { width: 1600, height: 900 } });
    s = place(place(s, 'a', 100, 450), 'b', 700, 450);
    s = give(give(give(s, 'a', 'TWIN_THROW'), 'a', 'BLAST_BOOMERANG'), 'a', 'GUARD');
    s = place(s, 'a', 100, 450);
    s = face(face(s, 'a', 1, 0), 'b', -1, 0);
    expect(weaponsOf(s, 'a')).toHaveLength(2);
    const r = run(s, 90, input({ a: { throw: true } }));
    expect(player(r.state, 'b').alive).toBe(false);
    expect(player(r.state, 'a').alive).toBe(true);
    expect(player(r.state, 'a').powers.guard).toBe(true);
  });

  it('ALL FIVE together behave and replay identically (dash, throw, slash, collect, expire)', () => {
    const play = () => {
      let s = make(['a', 'b', 'c'], { arena: PRIMITIVE_ARENA });
      for (const kind of POWER_KINDS) {
        s = place(s, 'a', 800, 300);
        s = give(s, 'a', kind);
      }
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

  it('a boomerang in a three-power scene is still index-stable: own first, twin second, never swapped', () => {
    let s = make(['a', 'b']);
    s = place(place(s, 'a', 600, 450), 'b', 1500, 800);
    s = give(give(s, 'a', 'TWIN_THROW'), 'a', 'BLAST_BOOMERANG');
    expect(weaponsOf(s, 'a')[0]).toBe(boom(s, 'a'));
    expect(weaponsOf(s, 'a')[1]).toBe(s.extraBoomerangs[0]);
  });
});
