import { describe, expect, it } from 'vitest';
import {
  FREE_FOR_ALL,
  SYSTEMS_ARENA,
  createFuMatch,
  rematchOf,
  roundLabel,
  stepFu,
  type FuEvent,
  type FuState,
} from '../src/rules';
import {
  C,
  DT,
  NONE,
  R,
  face,
  input,
  make,
  own,
  patchBoomerang,
  patchPlayer,
  place,
  player,
  run,
  types,
  weaponsOf,
} from './support/fixtures';

// Slice 8 — the kill race. The score is the rules' own fact: every lethal event is attributed here, in the rules, and
// the UI only draws it. These tests read the rules, never a renderer.

const FFA = { ...FREE_FOR_ALL };
const withScores = (s: FuState, scores: Record<string, number>): FuState => ({
  ...s,
  scores: { ...s.scores, ...scores },
});
const scoreEvents = (events: readonly FuEvent[]) =>
  events.flatMap((e) => (e.type === 'SCORE' ? [e] : []));
const hitEvents = (events: readonly FuEvent[]) =>
  events.flatMap((e) => (e.type === 'HIT' ? [e] : []));
const SLASH_A = input({ a: { slash: true } });

/** Four players in the open arena, far apart, boomerangs in hand. */
const four = (overrides = FFA) =>
  place(
    place(
      place(place(make(['a', 'b', 'c', 'd'], overrides), 'a', 200, 200), 'b', 1400, 200),
      'c',
      200,
      700,
    ),
    'd',
    1400,
    700,
  );
/** a is next to b, facing it: a SLASH kills b this step. */
const nextTo = (s: FuState, killer: string, victim: string): FuState => {
  const near = place(place(s, killer, 800, 450), victim, 800 + R * 2, 450);
  return face(near, killer, 1, 0);
};
const slashKills = (s: FuState, killer: string, victim: string) =>
  stepFu(nextTo(s, killer, victim), input({ [killer]: { slash: true } }), DT);

describe('scoring: holes', () => {
  it('every player starts with an empty meter', () => {
    expect(four().scores).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });

  it('one enemy kill fills exactly one hole, credited to the attacker, and says so', () => {
    const r = slashKills(four(), 'a', 'b');
    expect(r.state.scores).toEqual({ a: 1, b: 0, c: 0, d: 0 });
    expect(hitEvents(r.events)).toEqual([
      expect.objectContaining({ byId: 'a', victimId: 'b', source: 'SLASH', creditedTo: 'a' }),
    ]);
    expect(scoreEvents(r.events)).toEqual([
      { type: 'SCORE', playerId: 'a', victimId: 'b', delta: 1, reason: 'KILL', kills: 1 },
    ]);
  });

  it('three kills in one round fill three holes (the round goes on until one is left)', () => {
    let s = four();
    s = slashKills(s, 'a', 'b').state;
    expect(s.phase).toBe('PLAYING');
    // a (still at the middle) slashes c, then d, who each stand next to them in turn
    s = { ...s, players: s.players.map((p) => ({ ...p, slash: { phase: 'READY' as const } })) };
    s = stepFu(face(place(s, 'c', 800 + R * 2, 450), 'a', 1, 0), SLASH_A, DT).state;
    expect(s.scores['a']).toBe(2);
    s = { ...s, players: s.players.map((p) => ({ ...p, slash: { phase: 'READY' as const } })) };
    const last = stepFu(face(place(s, 'd', 800 + R * 2, 450), 'a', 1, 0), SLASH_A, DT);
    expect(last.state.scores['a']).toBe(3);
    expect(types(last.events)).toContain('ROUND_OVER'); // only a is left: the round ends
  });

  it('surviving a round gives no bonus kill', () => {
    const s = stepFu(patchPlayer(four(), 'b', { alive: false }), NONE, DT).state; // b is already dead; c, d dead too
    const r = run(
      patchPlayer(
        patchPlayer(patchPlayer(four(), 'b', { alive: false }), 'c', { alive: false }),
        'd',
        { alive: false },
      ),
      3,
    );
    expect(r.state.phase).toBe('ROUND_OVER');
    expect(r.state.scores).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(s.scores['a']).toBe(0);
  });

  it('kills persist between rounds; the round reset restores combat state, not the match', () => {
    let s = slashKills(four(), 'a', 'b').state;
    s = patchPlayer(patchPlayer(s, 'c', { alive: false }), 'd', { alive: false });
    for (let i = 0; i < 600 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect(s.round).toBe(2);
    expect(s.scores).toEqual({ a: 1, b: 0, c: 0, d: 0 });
    expect(s.players.every((p) => p.alive)).toBe(true);
    expect(s.phase).toBe('PLAYING');
  });

  it('powerups persist across the round reset exactly as in Slice 5 (and kills with them)', () => {
    let s = own(slashKills(four(), 'a', 'b').state, 'a', 'GUARD', 'OVERDRIVE');
    s = patchPlayer(patchPlayer(s, 'c', { alive: false }), 'd', { alive: false });
    for (let i = 0; i < 600 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    expect([...player(s, 'a').inventory]).toEqual(['GUARD', 'OVERDRIVE']);
    expect(s.scores['a']).toBe(1);
  });

  it('a shield that absorbs the blow means no death and no score', () => {
    const s = own(nextTo(four(), 'a', 'b'), 'b', 'GUARD');
    const r = stepFu(s, SLASH_A, DT);
    expect(player(r.state, 'b').alive).toBe(true);
    expect(r.state.scores).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(scoreEvents(r.events)).toEqual([]);
    expect(types(r.events)).toContain('GUARD_BLOCKED');
  });

  it('simultaneous kills: two players slashing each other on the same step both score', () => {
    const s = face(
      face(place(place(four(), 'a', 800, 450), 'b', 800 + R * 2, 450), 'a', 1, 0),
      'b',
      -1,
      0,
    );
    const r = stepFu(s, input({ a: { slash: true }, b: { slash: true } }), DT);
    expect(r.state.scores).toEqual({ a: 1, b: 1, c: 0, d: 0 });
    expect(player(r.state, 'a').alive).toBe(false);
    expect(player(r.state, 'b').alive).toBe(false);
  });
});

describe('attribution: who is credited (the complete table is in docs/FOOMERANG_FU.md)', () => {
  const aimedAt = (
    s: FuState,
    owner: string,
    victim: string,
    patch: object = {},
    which = 0,
  ): FuState => {
    const v = s.world.bodies.find((b) => b.id === victim)?.position as { x: number; y: number };
    return patchBoomerang(
      s,
      owner,
      {
        state: 'THROWN',
        position: { x: v.x - 30, y: v.y },
        direction: { x: 1, y: 0 },
        travelled: 0,
        ...patch,
      },
      which,
    );
  };

  it('SLASH: the swinger', () => {
    const r = slashKills(four(), 'a', 'b');
    expect(hitEvents(r.events)[0]).toMatchObject({ source: 'SLASH', creditedTo: 'a' });
  });

  it('THROWN: the thrower', () => {
    const s = aimedAt(four(), 'a', 'b');
    const r = stepFu(s, NONE, DT);
    expect(hitEvents(r.events)[0]).toMatchObject({
      byId: 'a',
      victimId: 'b',
      source: 'BOOMERANG',
      creditedTo: 'a',
    });
    expect(r.state.scores['a']).toBe(1);
  });

  it('RETURNING: still its owner (a boomerang on its way home kills like any other)', () => {
    // a is at the far left; b stands right in the way of a's boomerang coming home from the right
    const s = patchBoomerang(four(), 'a', {
      state: 'RETURNING',
      position: { x: 1440, y: 200 },
      direction: { x: 0, y: 0 },
      travelled: 0,
    });
    const r = run(s, 6);
    const hit = hitEvents(r.events).find((e) => e.victimId === 'b');
    expect(hit).toMatchObject({ byId: 'a', source: 'BOOMERANG', creditedTo: 'a' });
    expect(r.state.scores['a']).toBe(1);
  });

  it('DEFLECTED: the DEFLECTOR is credited, never the original thrower; the owner scores nothing', () => {
    // a threw it, b deflected it, it now flies into c
    const s = aimedAt(four(), 'a', 'c', { state: 'DEFLECTED', deflectedBy: 'b', deflections: 1 });
    const r = stepFu(s, NONE, DT);
    expect(hitEvents(r.events)).toEqual([
      expect.objectContaining({ byId: 'a', victimId: 'c', source: 'BOOMERANG', creditedTo: 'b' }),
    ]);
    expect(r.state.scores).toEqual({ a: 0, b: 1, c: 0, d: 0 });
  });

  it('TWIN_THROW: both boomerangs are the owner’s; two victims score two, one victim hit by both scores one', () => {
    let s = own(four(), 'a', 'TWIN_THROW');
    s = aimedAt(s, 'a', 'b', {}, 0);
    s = aimedAt(s, 'a', 'c', {}, 1);
    const two = stepFu(s, NONE, DT);
    expect(two.state.scores['a']).toBe(2);
    expect(hitEvents(two.events).map((e) => e.creditedTo)).toEqual(['a', 'a']);
    let both = own(four(), 'a', 'TWIN_THROW');
    both = aimedAt(both, 'a', 'b', {}, 0);
    both = aimedAt(both, 'a', 'b', {}, 1);
    const one = stepFu(both, NONE, DT);
    expect(one.state.scores['a']).toBe(1); // a victim dies once
    expect(weaponsOf(one.state, 'a')).toHaveLength(2);
  });

  it('BLAST: the blast’s owner is credited for everyone it kills', () => {
    let s = own(four(), 'a', 'BLAST_BOOMERANG');
    s = patchBoomerang(s, 'a', { blast: true });
    s = place(place(s, 'c', 1400 + R * 2, 200), 'b', 1400, 200); // b and c close together
    s = aimedAt(s, 'a', 'b', { blast: true });
    const r = stepFu(s, NONE, DT);
    const blastHits = hitEvents(r.events).filter((e) => e.source === 'BLAST');
    expect(blastHits.length).toBeGreaterThanOrEqual(1);
    for (const h of blastHits) expect(h.creditedTo).toBe('a');
    expect(r.state.scores['a']).toBe(blastHits.length);
    expect(r.state.scores['b'] ?? 0).toBe(0);
  });

  it('a blast boomerang that was deflected credits the deflector (the same rule as any deflected boomerang)', () => {
    let s = patchBoomerang(four(), 'a', { blast: true });
    s = aimedAt(s, 'a', 'c', { blast: true, state: 'DEFLECTED', deflectedBy: 'b', deflections: 1 });
    const r = stepFu(s, NONE, DT);
    const h = hitEvents(r.events).filter((e) => e.victimId === 'c');
    expect(h[0]).toMatchObject({ source: 'BLAST', creditedTo: 'b' });
  });

  it('a boomerang never kills its owner and neither does a slash: there is no self-kill by weapon', () => {
    const s = aimedAt(four(), 'a', 'a');
    const r = run(s, 30);
    expect(player(r.state, 'a').alive).toBe(true);
    expect(hitEvents(r.events).filter((e) => e.victimId === 'a')).toEqual([]);
  });
});

describe('the lethal floor: environmental death (nobody is credited)', () => {
  const onFloor = (scores: Record<string, number>) => {
    const s = make(['a', 'b', 'c'], { ...FFA, arena: SYSTEMS_ARENA });
    const placed = place(place(place(s, 'a', 930, 300), 'b', 100, 100), 'c', 1500, 800);
    return { ...withScores(placed, scores), roundTime: 7.5 }; // ACTIVE
  };

  it('credits nobody, and costs the victim one hole', () => {
    const r = stepFu(onFloor({ a: 3, b: 5 }), NONE, DT);
    expect(player(r.state, 'a').alive).toBe(false);
    expect(hitEvents(r.events)).toEqual([
      expect.objectContaining({
        byId: 'HAZARD',
        victimId: 'a',
        source: 'HAZARD',
        creditedTo: undefined,
      }),
    ]);
    expect(r.state.scores).toEqual({ a: 2, b: 5, c: 0 });
    expect(scoreEvents(r.events)).toEqual([
      { type: 'SCORE', playerId: 'a', victimId: 'a', delta: -1, reason: 'ENVIRONMENT', kills: 2 },
    ]);
  });

  it('at zero the penalty stays at zero (and nobody else is credited)', () => {
    const r = stepFu(onFloor({ a: 0, b: 5 }), NONE, DT);
    expect(r.state.scores).toEqual({ a: 0, b: 5, c: 0 });
    expect(scoreEvents(r.events)[0]).toMatchObject({
      playerId: 'a',
      delta: 0,
      reason: 'ENVIRONMENT',
    });
  });

  it('a hit on a player who is standing on the floor is credited to the attacker, not the arena', () => {
    // b slashes a on the same step the floor would kill a: the first lethal contact in the fixed order is the attacker's
    const s = face(place(onFloor({}), 'b', 930 + R * 2, 300), 'b', -1, 0);
    const r = stepFu(s, input({ b: { slash: true } }), DT);
    expect(hitEvents(r.events).find((e) => e.victimId === 'a')).toMatchObject({
      creditedTo: 'b',
      source: 'SLASH',
    });
    expect(r.state.scores['b']).toBe(1);
  });
});

describe('immediate victory', () => {
  const race = (scores: Record<string, number>) => withScores(four(), scores);

  it('13 → kill → 14 wins the match on that very step, with the round still on', () => {
    const r = slashKills(race({ a: 13 }), 'a', 'b');
    expect(r.state.scores['a']).toBe(14);
    expect(r.state.phase).toBe('MATCH_OVER');
    expect(r.state.matchOver).toEqual({ winnerId: 'a' });
    expect(types(r.events)).toContain('MATCH_WON');
    expect(types(r.events)).not.toContain('ROUND_OVER'); // c and d are alive: nobody waited for the round
    expect(player(r.state, 'c').alive).toBe(true);
    expect(r.events.find((e) => e.type === 'MATCH_WON')).toEqual({
      type: 'MATCH_WON',
      winnerId: 'a',
      kills: 14,
    });
  });

  it('when the winning kill also leaves nobody else alive there is no round end: the match is simply won', () => {
    const two = withScores(
      place(place(make(['a', 'b'], FFA), 'a', 800, 450), 'b', 800 + R * 2, 450),
      { a: 13 },
    );
    const r = stepFu(face(two, 'a', 1, 0), SLASH_A, DT);
    expect(r.state.phase).toBe('MATCH_OVER');
    expect(r.state.roundOver).toBeUndefined();
    expect(types(r.events)).not.toContain('ROUND_OVER');
    expect(types(r.events)).toContain('MATCH_WON');
  });

  it('nothing after the winning step is processed: no kill, no score, no change at all', () => {
    const won = slashKills(race({ a: 13, b: 13 }), 'a', 'c').state;
    expect(won.phase).toBe('MATCH_OVER');
    const after = run(won, 120, input({ b: { slash: true, throw: true, move: { x: 1, y: 0 } } }), {
      repeat: true,
    });
    expect(after.events).toEqual([]);
    expect(after.state.scores).toEqual(won.scores);
    expect(after.state).toEqual(won);
  });

  it('two players at 13: the one who scores on the earlier step wins, and the other can no longer score', () => {
    let s = race({ a: 13, b: 13 });
    // b is far from everyone; a kills c first
    s = place(s, 'b', 1400, 200);
    const first = slashKills(s, 'a', 'c');
    expect(first.state.matchOver).toEqual({ winnerId: 'a' });
    const later = stepFu(
      face(place(first.state, 'd', 1400 - R * 2, 200), 'b', -1, 0),
      input({ b: { slash: true } }),
      DT,
    );
    expect(later.state.scores['b']).toBe(13);
  });

  it('the match does not end without a target (Slices 1–7 rounds go on forever)', () => {
    const r = slashKills(withScores(four({} as typeof FFA), { a: 99 }), 'a', 'b');
    expect(r.state.phase).toBe('PLAYING');
    expect(types(r.events)).not.toContain('MATCH_WON');
  });
});

describe('same-step victory: a tie is a tiebreak, never array order', () => {
  const tie = () => {
    let s = withScores(four(), { a: 13, b: 13 });
    s = place(
      place(place(place(s, 'a', 300, 200), 'c', 300 + R * 2, 200), 'b', 1300, 700),
      'd',
      1300 - R * 2,
      700,
    );
    s = face(face(s, 'a', 1, 0), 'b', -1, 0);
    return stepFu(s, input({ a: { slash: true }, b: { slash: true } }), DT);
  };

  it('both fill the last hole on the same step: no winner is named, the round ends, a tiebreak is next', () => {
    const r = tie();
    expect(r.state.scores).toMatchObject({ a: 14, b: 14 });
    expect(r.state.phase).toBe('ROUND_OVER');
    expect(r.state.matchOver).toBeUndefined();
    expect(types(r.events)).not.toContain('MATCH_WON');
    expect(types(r.events)).toContain('ROUND_OVER');
  });

  it('the tiebreak round involves only the tied players; everyone else sits it out; kills and inventories carry over', () => {
    let s = own(tie().state, 'c', 'GUARD');
    const events: FuEvent[] = [];
    for (let i = 0; i < 600 && s.round === 1; i += 1) {
      const r = stepFu(s, NONE, DT);
      s = r.state;
      events.push(...r.events);
    }
    expect(s.round).toBe(2);
    expect(events).toContainEqual({ type: 'TIEBREAK_START', playerIds: ['a', 'b'] });
    expect(roundLabel(s)).toEqual({ kind: 'TIEBREAK', round: 2 });
    expect(s.players.filter((p) => p.alive).map((p) => p.id)).toEqual(['a', 'b']);
    expect(s.scores).toMatchObject({ a: 14, b: 14 });
    expect([...player(s, 'c').inventory]).toEqual(['GUARD']);
  });

  it('in the tiebreak the first credited kill wins at once; if both land on the same step it is a tiebreak again', () => {
    let s = tie().state;
    for (let i = 0; i < 600 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    const near = face(
      face(place(place(s, 'a', 800, 450), 'b', 800 + R * 2, 450), 'a', 1, 0),
      'b',
      -1,
      0,
    );
    const single = stepFu(near, input({ a: { slash: true } }), DT);
    expect(single.state.matchOver).toEqual({ winnerId: 'a' });
    expect(single.state.scores['a']).toBe(15);
    const mutual = stepFu(near, input({ a: { slash: true }, b: { slash: true } }), DT);
    expect(mutual.state.matchOver).toBeUndefined();
    expect(mutual.state.phase).toBe('ROUND_OVER');
    let again = mutual.state;
    const events: FuEvent[] = [];
    for (let i = 0; i < 600 && again.round === 2; i += 1) {
      const r = stepFu(again, NONE, DT);
      again = r.state;
      events.push(...r.events);
    }
    expect(events).toContainEqual({ type: 'TIEBREAK_START', playerIds: ['a', 'b'] });
  });

  it('if a tiebreak ends with one meter still full and the other emptied by the floor, the full meter wins', () => {
    let s = tie().state;
    for (let i = 0; i < 600 && s.round === 1; i += 1) s = stepFu(s, NONE, DT).state;
    const arena = { ...s, config: { ...s.config, arena: SYSTEMS_ARENA } };
    const onFloor = { ...place(place(arena, 'a', 930, 300), 'b', 100, 100), roundTime: 7.5 };
    const r = stepFu(onFloor, NONE, DT);
    expect(r.state.scores).toMatchObject({ a: 13, b: 14 });
    let end = r.state;
    const events: FuEvent[] = [];
    for (let i = 0; i < 600 && end.phase !== 'MATCH_OVER'; i += 1) {
      const rr = stepFu(end, NONE, DT);
      end = rr.state;
      events.push(...rr.events);
    }
    expect(end.matchOver).toEqual({ winnerId: 'b' });
  });
});

describe('regulation, overtime and the match lifecycle', () => {
  const nextRound = (s: FuState): FuState => {
    let t = stepFu(
      patchPlayer(patchPlayer(patchPlayer(s, 'b', { alive: false }), 'c', { alive: false }), 'd', {
        alive: false,
      }),
      NONE,
      DT,
    ).state;
    for (let i = 0; i < 600 && t.round === s.round; i += 1) t = stepFu(t, NONE, DT).state;
    return t;
  };

  it('rounds are labelled ROUND n / 9, then OVERTIME ROUND k; nobody reaching 14 simply goes on', () => {
    let s = four();
    const labels: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const l = roundLabel(s);
      labels.push(
        l.kind === 'REGULATION'
          ? `R${l.round}/${l.of}`
          : l.kind === 'OVERTIME'
            ? `OT${l.round}`
            : 'TB',
      );
      s = nextRound(s);
    }
    expect(labels).toEqual([
      'R1/9',
      'R2/9',
      'R3/9',
      'R4/9',
      'R5/9',
      'R6/9',
      'R7/9',
      'R8/9',
      'R9/9',
      'OT1',
      'OT2',
      'OT3',
    ]);
    expect(s.phase).toBe('PLAYING'); // round 13 is on: nothing ended the match
    expect(s.matchOver).toBeUndefined();
  });

  it('there is no award for leading after round nine: a leader at 13 stays at 13', () => {
    let s = withScores(four(), { a: 13 });
    for (let i = 0; i < 10; i += 1) s = nextRound(s);
    expect(s.matchOver).toBeUndefined();
    expect(s.scores['a']).toBe(13);
  });

  it('a rematch is a brand new match: round 1, empty meters, empty inventories, everything reset, same participants and settings', () => {
    let s = slashKills(withScores(four(), { a: 13 }), 'a', 'b').state;
    s = own(s, 'c', 'GUARD', 'TWIN_THROW');
    const m = rematchOf(s);
    expect(m.phase).toBe('PLAYING');
    expect(m.matchOver).toBeUndefined();
    expect(m.round).toBe(1);
    expect(m.scores).toEqual({ a: 0, b: 0, c: 0, d: 0 });
    expect(m.players.map((p) => [p.id, p.slot, p.alive, p.inventory.length])).toEqual(
      s.players.map((p) => [p.id, p.slot, true, 0]),
    );
    expect(m.config).toBe(s.config);
    expect(m.awards).toBe(0);
    expect(m.extraBoomerangs).toEqual([]);
  });

  it('the standard Free For All is 14 kills and nine regulation rounds', () => {
    expect(FREE_FOR_ALL).toEqual({ targetKills: 14, regulationRounds: 9 });
    expect(createFuMatch([{ id: 'a', slot: 0 }], FFA).config.targetKills).toBe(14);
    expect(C.targetKills).toBeUndefined(); // the bare rules have no victory condition; the mode brings it
  });
});
