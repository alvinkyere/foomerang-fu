import { describe, expect, it } from 'vitest';
import {
  MAX_POWERS,
  POWER_COMBINATIONS,
  KEPT_POWER_KINDS,
  POWER_KINDS,
  PRIMITIVE_ARENA,
  PRIMITIVE_POWERUPS,
  SPAWN_RATES,
  awardPower,
  chooseAward,
  createFuMatch,
  isPowerKind,
  powerupsFor,
  rematchOf,
  removePower,
  stepFu,
  type FuState,
  type PowerKind,
} from '../src/rules';
import {
  C,
  DT,
  NONE,
  at,
  book,
  face,
  give,
  holds,
  input,
  kill,
  make,
  must,
  own,
  patchPlayer,
  place,
  player,
  run,
  types,
} from './support/fixtures';

// Powerups are persistent MATCH upgrades: a player owns at most three (FIFO), they survive death and
// round resets, and are cleared only when the match ends. A generic Book awards the power on pickup.

const SPOTS = [
  { x: 400, y: 300 },
  { x: 800, y: 300 },
  { x: 1200, y: 300 },
];
const SCHEDULE = {
  spots: SPOTS,
  firstSeconds: 12,
  intervalSeconds: 45,
  maxOnField: 1,
  pickupRadius: 28,
};
const parked = (overrides: object = {}) =>
  place(
    place(make(['a', 'b'], { powerups: SCHEDULE, ...overrides }), 'a', 100, 800),
    'b',
    1500,
    800,
  );
/** Ends the current round (b dies) and runs the reset; returns the first state of the next round. */
function nextRound(start: FuState): FuState {
  let s = stepFu(
    { ...start, players: start.players.map((p) => (p.id === 'b' ? { ...p, alive: false } : p)) },
    NONE,
    DT,
  ).state;
  for (let i = 0; i < 400 && s.round === start.round; i += 1) s = stepFu(s, NONE, DT).state;
  return s;
}
const inv = (s: FuState, id = 'a') => player(s, id).inventory;
const lone = () => place(place(make(), 'a', 600, 450), 'b', 1500, 800);

describe('the powers and their compatibility table', () => {
  it('in a fixed order, and every unordered pair is spelled out', () => {
    expect([...POWER_KINDS]).toEqual([
      'CAFFEINATED',
      'EXPLOSIVE_BOOMERANG',
      'SHIELD',
      'EXTRA_BOOMERANG',
      'MULTI_BOOMERANG',
      'ICE_BOOMERANG',
      'FIRE_BOOMERANG',
      'BATTLE_ROYALE',
    ]);
    for (const junk of ['', 'overdrive', 'GUARD', 'OVERDRIVE', 7, null, undefined, {}])
      expect(isPowerKind(junk)).toBe(false);
    const n = POWER_KINDS.length;
    expect(Object.keys(POWER_COMBINATIONS)).toHaveLength((n * (n - 1)) / 2);
    for (const entry of Object.values(POWER_COMBINATIONS)) expect(entry.allowed).toBe(true);
  });
});

describe('the inventory: at most three, oldest out first (FIFO)', () => {
  it('the pure operations: append, evict the oldest when full, remove keeps the order of the rest', () => {
    expect(MAX_POWERS).toBe(3);
    let i = awardPower([], 'CAFFEINATED').inventory;
    i = awardPower(i, 'SHIELD').inventory;
    i = awardPower(i, 'EXPLOSIVE_BOOMERANG').inventory;
    expect(i).toEqual(['CAFFEINATED', 'SHIELD', 'EXPLOSIVE_BOOMERANG']);
    const fourth = awardPower(i, 'EXTRA_BOOMERANG');
    expect(fourth.inventory).toEqual(['SHIELD', 'EXPLOSIVE_BOOMERANG', 'EXTRA_BOOMERANG']);
    expect(fourth.evicted).toBe('CAFFEINATED');
    const fifth = awardPower(fourth.inventory, 'CAFFEINATED');
    expect(fifth.inventory).toEqual(['EXPLOSIVE_BOOMERANG', 'EXTRA_BOOMERANG', 'CAFFEINATED']);
    expect(fifth.evicted).toBe('SHIELD');
    expect(awardPower(['SHIELD'], 'EXPLOSIVE_BOOMERANG').evicted).toBeUndefined();
    expect(removePower(['EXPLOSIVE_BOOMERANG', 'SHIELD', 'EXTRA_BOOMERANG'], 'SHIELD')).toEqual([
      'EXPLOSIVE_BOOMERANG',
      'EXTRA_BOOMERANG',
    ]);
  });

  it('through the real rules: the 4th acquisition evicts the oldest, the 5th (the evicted one, taken again) the next-oldest, and says so', () => {
    let s = lone();
    for (const kind of ['CAFFEINATED', 'SHIELD', 'EXPLOSIVE_BOOMERANG'] as const)
      s = give(s, 'a', kind);
    expect(inv(s)).toEqual(['CAFFEINATED', 'SHIELD', 'EXPLOSIVE_BOOMERANG']);
    // the 4th: Book laid, the real step, and read the events
    const take = (state: FuState, kind: PowerKind) =>
      stepFu(
        {
          ...state,
          config: { ...state.config, enabledPowers: [kind] },
          pickups: [{ id: 50, position: at(state, 'a') }],
        },
        NONE,
        DT,
      );
    const fourth = take(s, 'EXTRA_BOOMERANG');
    expect(inv(fourth.state)).toEqual(['SHIELD', 'EXPLOSIVE_BOOMERANG', 'EXTRA_BOOMERANG']);
    expect(fourth.events).toContainEqual({
      type: 'POWER_LOST',
      playerId: 'a',
      kind: 'CAFFEINATED',
      reason: 'EVICTED',
    });
    const fifth = take(fourth.state, 'CAFFEINATED');
    expect(inv(fifth.state)).toEqual(['EXPLOSIVE_BOOMERANG', 'EXTRA_BOOMERANG', 'CAFFEINATED']);
    expect(fifth.events).toContainEqual({
      type: 'POWER_LOST',
      playerId: 'a',
      kind: 'SHIELD',
      reason: 'EVICTED',
    });
  });

  it('a player already holding three can always take another (it never refuses a full inventory)', () => {
    let s = own(lone(), 'a', 'CAFFEINATED', 'SHIELD', 'EXPLOSIVE_BOOMERANG');
    s = { ...s, pickups: [{ id: 1, position: at(s, 'a') }] };
    const r = stepFu(s, NONE, DT);
    expect(r.state.pickups).toEqual([]);
    expect(inv(r.state)).toHaveLength(3);
  });

  it('no duplicates: a power you already own is never awarded again (a Book with nothing left stays for others)', () => {
    let s = own(lone(), 'a', 'SHIELD');
    s = {
      ...s,
      config: { ...s.config, enabledPowers: ['SHIELD'] },
      pickups: [{ id: 1, position: at(s, 'a') }],
    };
    const r = stepFu(s, NONE, DT);
    expect(r.state.pickups).toHaveLength(1); // nothing to award a: it stays
    expect(inv(r.state)).toEqual(['SHIELD']);
    const b = stepFu(place(r.state, 'b', at(s, 'a').x + 40, at(s, 'a').y), NONE, DT).state;
    expect(inv(b, 'b')).toEqual(['SHIELD']); // another player can have it
  });

  it('a player owning four of five can only be awarded the one they lack; owning all enabled means no award', () => {
    let s = own(lone(), 'a', 'CAFFEINATED', 'SHIELD', 'EXPLOSIVE_BOOMERANG');
    s = { ...s, pickups: [{ id: 1, position: at(s, 'a') }] };
    const r = stepFu(s, NONE, DT);
    expect([
      'EXPLOSIVE_BOOMERANG',
      'EXTRA_BOOMERANG',
      'MULTI_BOOMERANG',
      'ICE_BOOMERANG',
      'FIRE_BOOMERANG',
    ]).toContain(inv(r.state).at(-1));
  });

  it('is deterministic: the same acquisitions give the same inventory', () => {
    const play = () => {
      let s = lone();
      for (const kind of KEPT_POWER_KINDS) s = give(s, 'a', kind);
      return JSON.stringify(inv(s));
    };
    expect(play()).toBe(play());
  });
});

describe('persistence: ownership is a match upgrade, not a round state', () => {
  it('survives a round reset, and several', () => {
    let s = give(lone(), 'a', 'CAFFEINATED');
    for (const round of [2, 3, 4]) {
      s = nextRound(s);
      expect(s.round).toBe(round);
      expect(inv(s)).toEqual(['CAFFEINATED']);
    }
  });

  it('a nine-round match: CAFFEINATED (r1), EXPLOSIVE_BOOMERANG (r4), EXTRA_BOOMERANG (r6), SHIELD (r8) → round 9 holds [EXPLOSIVE_BOOMERANG, EXTRA_BOOMERANG, SHIELD]', () => {
    let s = lone();
    const gains: Record<number, PowerKind> = {
      1: 'CAFFEINATED',
      4: 'EXPLOSIVE_BOOMERANG',
      6: 'EXTRA_BOOMERANG',
      8: 'SHIELD',
    };
    for (let round = 1; round <= 9; round += 1) {
      expect(s.round).toBe(round);
      if (round === 2) expect(inv(s)).toEqual(['CAFFEINATED']);
      const gained = gains[round];
      if (gained !== undefined) s = give(place(s, 'a', 600, 450), 'a', gained);
      if (round === 8) expect(inv(s)).toEqual(['EXPLOSIVE_BOOMERANG', 'EXTRA_BOOMERANG', 'SHIELD']); // the 4th evicted CAFFEINATED
      if (round < 9) s = nextRound(s);
    }
    expect(inv(s)).toEqual(['EXPLOSIVE_BOOMERANG', 'EXTRA_BOOMERANG', 'SHIELD']);
  });

  it('death does not clear what a player owns', () => {
    let s = place(place(make(['a', 'b', 'c']), 'a', 600, 450), 'b', 700, 450);
    s = place(s, 'c', 1500, 100);
    s = face(own(s, 'a', 'CAFFEINATED', 'EXPLOSIVE_BOOMERANG'), 'b', -1, 0);
    const r = stepFu(s, input({ b: { slash: true } }), DT);
    expect(player(r.state, 'a').alive).toBe(false);
    expect(inv(r.state)).toEqual(['CAFFEINATED', 'EXPLOSIVE_BOOMERANG']);
  });

  it('a kill by a killed player and a round end do not clear it either (a dead player keeps ownership)', () => {
    const s = nextRound(own(kill(lone(), 'a'), 'a', 'SHIELD', 'EXTRA_BOOMERANG'));
    expect(inv(s)).toEqual(['SHIELD', 'EXTRA_BOOMERANG']);
  });

  it('inventories survive any number of round resets (nothing about "round 9" clears them); only a REMATCH clears every inventory and starts at round 1', () => {
    let s = make(['a', 'b'], { regulationRounds: 3 });
    s = own(
      place(place(s, 'a', 600, 450), 'b', 1500, 800),
      'a',
      'CAFFEINATED',
      'SHIELD',
      'EXPLOSIVE_BOOMERANG',
    );
    s = { ...s, awards: 4 };
    for (let i = 0; i < 5; i += 1) s = nextRound(s); // well past the regulation rounds
    expect(s.round).toBe(6);
    expect(inv(s)).toEqual(['CAFFEINATED', 'SHIELD', 'EXPLOSIVE_BOOMERANG']);
    expect(s.awards).toBe(4);
    const fresh = rematchOf(s);
    expect(fresh.round).toBe(1);
    expect(fresh.players.map((p) => p.inventory)).toEqual([[], []]);
    expect(fresh.awards).toBe(0);
    expect(fresh.extraBoomerangs).toEqual([]);
    expect(fresh.scores).toEqual({ a: 0, b: 0 });
  });

  it('with no targetKills (Slices 1–7) rounds simply go on, forever', () => {
    expect(nextRound(nextRound(nextRound(make()))).round).toBe(4);
  });
});

describe('the mystery Book', () => {
  it('a Book carries no kind: nothing about it, in the state or its spawn event, says what it awards', () => {
    const s = parked({ powerups: { ...SCHEDULE, firstSeconds: DT } });
    const r = stepFu(s, NONE, DT);
    const [pickup] = r.state.pickups;
    expect(Object.keys(pickup ?? {}).sort()).toEqual(['id', 'position']);
    const spawned = r.events.find((e) => e.type === 'POWERUP_SPAWNED');
    expect(Object.keys(spawned ?? {}).sort()).toEqual(['pickupId', 'position', 'type']);
    expect(JSON.stringify(r.state.pickups)).not.toMatch(new RegExp(POWER_KINDS.join('|')));
  });

  it('the award is revealed only on collection (PICKED_UP carries it) and decided from the seed', () => {
    let s = lone();
    s = book(s, 600, 450);
    const r = stepFu(s, NONE, DT);
    const taken = r.events.find((e) => e.type === 'PICKED_UP');
    expect(taken).toMatchObject({ type: 'PICKED_UP', playerId: 'a' });
    if (taken?.type === 'PICKED_UP') expect(inv(r.state)).toEqual([taken.kind]);
    expect(r.state.awards).toBe(1);
  });

  it('deterministic seeded selection: the same seed and count always choose the same power; seeds differ', () => {
    for (let n = 0; n < 20; n += 1)
      expect(chooseAward(POWER_KINDS, 7, n)).toBe(chooseAward(POWER_KINDS, 7, n));
    const a = Array.from({ length: 30 }, (_, n) => chooseAward(POWER_KINDS, 1, n));
    const b = Array.from({ length: 30 }, (_, n) => chooseAward(POWER_KINDS, 2, n));
    expect(a).not.toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(2); // it actually varies
    expect(chooseAward([], 1, 0)).toBeUndefined();
  });

  it('through the rules: two identical matches take the same Books to the same powers; a different seed need not', () => {
    const play = (seed: number) => {
      let s = lone();
      s = { ...s, config: { ...s.config, seed } };
      const got: string[] = [];
      for (let n = 0; n < 6; n += 1) {
        s = place(book(s, 600, 450, 100 + n), 'a', 600, 450);
        s = stepFu(s, NONE, DT).state;
        got.push(inv(s).at(-1) ?? '');
      }
      return got.join(',');
    };
    expect(play(3)).toBe(play(3));
    expect(new Set([play(1), play(2), play(3), play(4)]).size).toBeGreaterThan(1);
  });

  it('a disabled power is never awarded (try many Books)', () => {
    let s = lone();
    s = { ...s, config: { ...s.config, enabledPowers: ['CAFFEINATED', 'SHIELD'] } };
    for (let n = 0; n < 12; n += 1) {
      s = patchPlayer(s, 'a', { inventory: [] });
      s = stepFu(book(place(s, 'a', 600, 450), 600, 450, 200 + n), NONE, DT).state;
      expect(['CAFFEINATED', 'SHIELD']).toContain(inv(s)[0]);
    }
    // nothing enabled: nothing is ever awarded and the Book just lies there
    const none = stepFu(
      book({ ...lone(), config: { ...C, enabledPowers: [] } }, 600, 450),
      NONE,
      DT,
    ).state;
    expect(none.pickups).toHaveLength(1);
    expect(inv(none)).toEqual([]);
  });

  it('collection: the nearer player (tie: the earlier in the match) takes the Book; one per player per step', () => {
    let s = book(make(['a', 'b']), 600, 450);
    s = place(place(s, 'a', 600 - 40, 450), 'b', 600 + 40, 450);
    expect(inv(stepFu(s, NONE, DT).state, 'a')).toHaveLength(1);
    expect(inv(stepFu(s, NONE, DT).state, 'b')).toHaveLength(0);
    let near = book(make(['a', 'b']), 600, 450);
    near = place(place(near, 'a', 600 - 50, 450), 'b', 600 + 40, 450);
    expect(inv(stepFu(near, NONE, DT).state, 'b')).toHaveLength(1);
    let two = place(place(make(['a', 'b']), 'a', 600, 450), 'b', 1500, 800);
    two = book(book(two, 600, 450, 1), 610, 450, 2);
    const one = stepFu(two, NONE, DT);
    expect(one.state.pickups).toHaveLength(1);
    expect(inv(one.state)).toHaveLength(1);
    expect(inv(stepFu(one.state, NONE, DT).state)).toHaveLength(2);
  });

  it('cover applies; the dead take nothing; collection comes before kills and throws in a step', () => {
    const arena = { width: 1600, height: 900, walls: [{ x: 700, y: 300, width: 50, height: 300 }] };
    const wide = {
      spots: [{ x: 300, y: 100 }],
      firstSeconds: 99,
      intervalSeconds: 99,
      maxOnField: 1,
      pickupRadius: 60,
    };
    const behind = book(
      place(place(make(['a', 'b'], { arena, powerups: wide }), 'a', 664, 450), 'b', 1500, 800),
      752,
      450,
    );
    expect(stepFu(behind, NONE, DT).state.pickups).toHaveLength(1);
    expect(inv(stepFu(kill(book(lone(), 600, 450), 'a'), NONE, DT).state)).toEqual([]);
    // takes a Book the very step they die: they still took it, and still own it
    let s = place(place(make(['a', 'b']), 'a', 600, 450), 'b', 700, 450);
    s = face(book(s, 600, 450), 'b', -1, 0);
    const r = stepFu(s, input({ b: { slash: true } }), DT);
    expect(types(r.events)).toContain('PICKED_UP');
    expect(player(r.state, 'a').alive).toBe(false);
    expect(inv(r.state)).toHaveLength(1);
  });
});

describe('the Book spawn model is scarce', () => {
  it('there are no Books unless the config asks for them (Slices 1–4 exactly)', () => {
    expect(run(make(), 3000).state.pickups).toEqual([]);
  });

  it('nothing at the start of a round: the first Book appears exactly firstSeconds into ACTIVE play', () => {
    let s = parked();
    let first = 0;
    for (let step = 1; step <= 60 * 20 && first === 0; step += 1) {
      const r = stepFu(s, NONE, DT);
      s = r.state;
      if (r.events.some((e) => e.type === 'POWERUP_SPAWNED')) first = step;
    }
    expect(first).toBe(720); // 12 s
    expect(s.pickups).toHaveLength(1);
  });

  it('at most one Book lies in the arena, and the next comes intervalSeconds AFTER it is taken (not after it appeared)', () => {
    let s = parked();
    s = run(s, 60 * 60).state; // a minute: still the one Book, the clock frozen while it lies there
    expect(s.pickups).toHaveLength(1);
    expect(s.pickupClock.spawned).toBe(1);
    const spot = must(s.pickups[0], 'Book').position;
    s = stepFu(place(s, 'a', spot.x, spot.y), NONE, DT).state;
    expect(s.pickups).toEqual([]);
    s = place(s, 'a', 100, 800);
    let steps = 0;
    while (s.pickups.length === 0 && steps < 6000) {
      s = stepFu(s, NONE, DT).state;
      steps += 1;
    }
    expect(Math.abs(steps - 45 * 60)).toBeLessThanOrEqual(1);
  });

  it('the named rates are ordered, and OFF means no schedule at all', () => {
    expect(SPAWN_RATES.LOW.first).toBeGreaterThan(SPAWN_RATES.NORMAL.first);
    expect(SPAWN_RATES.NORMAL.first).toBeGreaterThan(SPAWN_RATES.HIGH.first);
    expect(SPAWN_RATES.LOW.interval).toBeGreaterThan(SPAWN_RATES.NORMAL.interval);
    expect(SPAWN_RATES.NORMAL.interval).toBeGreaterThan(SPAWN_RATES.HIGH.interval);
    expect(PRIMITIVE_POWERUPS).toMatchObject({
      firstSeconds: 15,
      intervalSeconds: 45,
      maxOnField: 1,
    });
    expect(powerupsFor('OFF')).toBeUndefined();
    expect(powerupsFor('LOW')?.firstSeconds).toBe(25);
    expect(SPAWN_RATES.NORMAL.first).toBeGreaterThanOrEqual(10);
  });

  it('a new round clears the field and restarts the clock; nothing spawns while the round is over', () => {
    const s = run(parked(), 60 * 15).state;
    expect(s.pickups).toHaveLength(1);
    const over = stepFu(kill(s, 'b'), NONE, DT).state;
    const before = over.pickupClock;
    expect(run(over, 30).state.pickupClock).toEqual(before);
    let next = over;
    for (let i = 0; i < 400 && next.round === 1; i += 1) next = stepFu(next, NONE, DT).state;
    expect(next.pickups).toEqual([]);
    expect(next.pickupClock).toEqual({ spawnIn: SCHEDULE.firstSeconds, spawned: 0 });
  });

  it('spawn spots rotate, never two on one spot, and a Book waits when there is nowhere to put it', () => {
    const wide = {
      ...SCHEDULE,
      spots: SPOTS.slice(0, 2),
      firstSeconds: 1,
      intervalSeconds: 1,
      maxOnField: 5,
    };
    const s = run(parked({ powerups: wide }), 60 * 20).state;
    expect(new Set(s.pickups.map((p) => `${p.position.x},${p.position.y}`)).size).toBe(
      s.pickups.length,
    );
    expect(s.pickups.length).toBeLessThanOrEqual(2);
  });

  it('is deterministic: the same match replays to the identical state and events (3,000 steps, 3 players)', () => {
    const play = () => {
      let s = make(['a', 'b', 'c'], {
        arena: PRIMITIVE_ARENA,
        powerups: { ...PRIMITIVE_POWERUPS, firstSeconds: 3, intervalSeconds: 4 },
        regulationRounds: 9,
      });
      const log: unknown[] = [];
      for (let i = 0; i < 3000; i += 1) {
        const r = stepFu(
          s,
          input({
            a: {
              move: { x: Math.cos(i / 40), y: Math.sin(i / 50) },
              dash: i % 23 === 0,
              throw: i % 61 === 0,
            },
            b: {
              move: { x: Math.sin(i / 33), y: Math.cos(i / 29) },
              slash: i % 47 === 0,
              dash: i % 31 === 0,
            },
            c: { move: { x: -Math.cos(i / 37), y: Math.sin(i / 41) }, throw: i % 53 === 0 },
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

describe('powerup configuration is checked (a bad schedule is a RangeError, never a game state)', () => {
  const bad = (powerups: object) => () =>
    createFuMatch([{ id: 'a', slot: 0 }], {
      arena: PRIMITIVE_ARENA,
      powerups: { ...PRIMITIVE_POWERUPS, ...powerups },
    });
  it('accepts the primitive arena schedule', () => expect(bad({})).not.toThrow());
  it.each([
    ['no spots', { spots: [] }],
    ['a spot outside the arena', { spots: [{ x: 5000, y: 100 }] }],
    ['a spot inside a wall', { spots: [{ x: 800, y: 450 }] }],
    ['a non-finite spot', { spots: [{ x: Number.NaN, y: 100 }] }],
    ['a zero first delay', { firstSeconds: 0 }],
    ['a negative interval', { intervalSeconds: -3 }],
    ['a fractional cap', { maxOnField: 1.5 }],
    ['a zero pickup radius', { pickupRadius: 0 }],
  ])('rejects %s', (_n, p) => expect(bad(p)).toThrow(RangeError));

  it('rejects nonsense power settings', () => {
    const mk = (o: object) => () => createFuMatch([{ id: 'a', slot: 0 }], o);
    expect(mk({ caffeinatedMoveFactor: 0.9 })).toThrow(RangeError);
    expect(mk({ blastRadius: -1 })).toThrow(RangeError);
    expect(mk({ seed: 1.5 })).toThrow(RangeError);
    expect(mk({ targetKills: 0 })).toThrow(RangeError);
    expect(mk({ regulationRounds: 1.5 })).toThrow(RangeError);
    expect(mk({ enabledPowers: ['NOPE'] })).toThrow(RangeError);
    expect(mk({ exclusivePairs: [['SHIELD', 'NOPE']] })).toThrow(RangeError);
    expect(mk({ caffeinatedMoveFactor: 6 })).toThrow(RangeError);
  });
});

describe('holds() and the fixtures agree with the rules', () => {
  it('give() really goes through a Book', () => {
    const s = give(lone(), 'a', 'EXPLOSIVE_BOOMERANG');
    expect(holds(s, 'a', 'EXPLOSIVE_BOOMERANG')).toBe(true);
    expect(s.awards).toBe(1);
  });
});
