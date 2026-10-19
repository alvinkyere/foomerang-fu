import { describe, expect, it } from 'vitest';
import {
  POWER_COMBINATIONS,
  POWER_KINDS,
  PRIMITIVE_ARENA,
  stepFu,
  type PowerKind,
} from '../src/rules';
import {
  DT,
  NONE,
  at,
  face,
  give,
  holds,
  input,
  make,
  own,
  place,
  player,
  run,
  weaponsOf,
  type FuEvent,
  STRAIGHT,
} from './support/fixtures';

// Combinations are explicit: the matrix lists every pair, `exclusivePairs` can forbid one, and each
// pair's rule is pinned here. Powers never combine by accident. A player owns at most three.

const hits = (events: readonly FuEvent[]) => events.filter((e) => e.type === 'HIT');

const pairs: [PowerKind, PowerKind][] = [];
for (const a of POWER_KINDS) for (const b of POWER_KINDS) if (a < b) pairs.push([a, b]);

describe('every pair can be owned together, and an exclusive pair cannot', () => {
  it.each(pairs)(
    '%s + %s: allowed by the table, owned together in play, forbiddable by config',
    (a, b) => {
      expect(POWER_COMBINATIONS[`${a}+${b}`]?.allowed).toBe(true);
      let s = place(place(make(undefined, STRAIGHT), 'a', 600, 450), 'b', 1500, 800);
      s = give(give(s, 'a', a), 'a', b);
      expect(holds(s, 'a', a) && holds(s, 'a', b)).toBe(true);
      // the same pair, forbidden: the Book stays on the ground (this player's pool is empty)
      let t = place(
        place(make(['a', 'b'], { ...STRAIGHT, exclusivePairs: [[b, a]] }), 'a', 600, 450),
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

  it('every power given in turn leaves the LAST three, in order (FIFO)', () => {
    let s = place(place(make(undefined, STRAIGHT), 'a', 600, 450), 'b', 1500, 800);
    for (const kind of POWER_KINDS) s = give(s, 'a', kind);
    expect(player(s, 'a').inventory).toEqual(POWER_KINDS.slice(-3));
  });
});

describe('TWIN_THROW + EXPLOSIVE_BOOMERANG', () => {
  it('both boomerangs are armed; each detonates once on its own contact', () => {
    let s = make(['a', 'b', 'c'], STRAIGHT);
    s = place(place(place(s, 'a', 100, 450), 'b', 550, 450), 'c', 550, 580);
    s = face(own(s, 'a', 'TWIN_THROW', 'EXPLOSIVE_BOOMERANG'), 'a', 1, 0);
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
  it('TWIN + BLAST + SHIELD: two boomerangs, armed, with a shield against the retaliation', () => {
    let s = make(['a', 'b'], { ...STRAIGHT, arena: { width: 1600, height: 900 } });
    s = own(
      place(place(s, 'a', 100, 450), 'b', 260, 450),
      'a',
      'TWIN_THROW',
      'EXPLOSIVE_BOOMERANG',
      'SHIELD',
    );
    s = face(face(s, 'a', 1, 0), 'b', -1, 0);
    expect(weaponsOf(s, 'a')).toHaveLength(2);
    const r = run(s, 90, input({ a: { throw: true } }));
    expect(player(r.state, 'b').alive).toBe(false);
    expect(player(r.state, 'a').alive).toBe(true);
    expect(player(r.state, 'a').inventory).toContain('SHIELD');
  });

  it('a replay of a three-power scene is identical', () => {
    const play = () => {
      let s = make(['a', 'b', 'c'], { ...STRAIGHT, arena: PRIMITIVE_ARENA });
      s = own(s, 'a', 'CAFFEINATED', 'TWIN_THROW', 'EXPLOSIVE_BOOMERANG');
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
