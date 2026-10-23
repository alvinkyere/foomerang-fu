import { describe, expect, it } from 'vitest';
import {
  FREE_FOR_ALL,
  GONG_ISLANDS_ARENA,
  MARKET_PLAZA_ARENA,
  continueRound,
  createFuMatch,
  stepFu,
  type FuState,
} from '../src/rules';
import { onGround } from '../src/rules/arena';
import { C, DT, NONE, make, patchPlayer, run, types } from './support/fixtures';

// The scoreboard between rounds (owner, 2026-10-19, "ff scoreboard.jpg"): after a round's end beat the match waits on the
// scoreboard until somebody presses CONTINUE. The rules own that wait as a fact (the round is over and awaiting a
// continue); `continueRound` is the pure transition a CONTINUE press makes. AUTO (the old behaviour) stays the default.

const WAIT = { ...FREE_FOR_ALL, roundAdvance: 'ON_CONTINUE' as const };
/** A two-player match whose round has just ended: b is dead, a survived. */
const ended = (overrides = {}): FuState => {
  const s = stepFu(patchPlayer(make(['a', 'b'], overrides), 'b', { alive: false }), NONE, DT).state;
  expect(s.phase).toBe('ROUND_OVER');
  return s;
};
const pastTheBeat = Math.ceil(C.roundEndSeconds / DT) + 2;

describe('the round advances by itself unless the match waits for CONTINUE', () => {
  it('AUTO (the default): the next round starts once the end beat is over', () => {
    const r = run(ended(), pastTheBeat);
    expect(r.state.phase).toBe('PLAYING');
    expect(r.state.round).toBe(2);
    expect(types(r.events)).toContain('ROUND_START');
  });

  it('ON_CONTINUE: after the beat the round waits on the scoreboard, for as long as it takes', () => {
    const waiting = run(ended(WAIT), pastTheBeat);
    expect(waiting.state.phase).toBe('ROUND_OVER');
    expect(waiting.state.roundOver?.awaitingContinue).toBe(true);
    expect(types(waiting.events)).toEqual(['SCOREBOARD']);
    const later = run(waiting.state, 600); // ten seconds more: still waiting, nothing new happens
    expect(later.state.phase).toBe('ROUND_OVER');
    expect(later.state.round).toBe(1);
    expect(later.events).toEqual([]);
  });

  it('during the beat, the round is over but not yet waiting', () => {
    const s = run(ended(WAIT), 3).state;
    expect(s.roundOver?.awaitingContinue).toBe(false);
  });

  it('CONTINUE starts the next round: round 2, everyone alive, kills carried', () => {
    const waiting = run(ended(WAIT), pastTheBeat).state;
    const scored = { ...waiting, scores: { a: 3, b: 1 } };
    const next = continueRound(scored);
    expect(next.state.phase).toBe('PLAYING');
    expect(next.state.round).toBe(2);
    expect(next.state.players.every((p) => p.alive)).toBe(true);
    expect(next.state.scores).toEqual({ a: 3, b: 1 });
    expect(types(next.events)).toEqual(['ROUND_START']);
  });

  it('CONTINUE before the scoreboard is up, or during play, changes nothing', () => {
    const beat = run(ended(WAIT), 3).state;
    expect(continueRound(beat)).toEqual({ state: beat, events: [] });
    const playing = make(['a', 'b'], WAIT);
    expect(continueRound(playing)).toEqual({ state: playing, events: [] });
  });

  it('two full meters at once: CONTINUE starts the tiebreak between only them', () => {
    const target = FREE_FOR_ALL.targetKills;
    const waiting = run(ended(WAIT), 1).state;
    const tied = { ...waiting, scores: { a: target, b: target } };
    const atScoreboard = run(tied, pastTheBeat).state;
    expect(atScoreboard.roundOver?.awaitingContinue).toBe(true);
    const next = continueRound(atScoreboard);
    expect(types(next.events)).toEqual(['TIEBREAK_START', 'ROUND_START']);
  });

  it('a decided match never waits: one full meter at the end of the beat is the match, at once', () => {
    const target = FREE_FOR_ALL.targetKills;
    const won = { ...run(ended(WAIT), 1).state, scores: { a: target, b: 0 } };
    const r = run(won, pastTheBeat);
    expect(r.state.phase).toBe('MATCH_OVER');
    expect(types(r.events)).toContain('MATCH_WON');
  });

  it('roundAdvance must be AUTO or ON_CONTINUE', () => {
    expect(() =>
      createFuMatch([{ id: 'a', slot: 0 }], { roundAdvance: 'LATER' as unknown as 'AUTO' }),
    ).toThrow(/roundAdvance/);
  });
});

// Every round on another map (owner, 2026-10-22; the HQ videos change the map at every CONTINUE: pond cross, maze, gong
// islands): CONTINUE may name the next round's arena, and its Book spots.
describe('CONTINUE onto another map', () => {
  const onPlaza = (): FuState =>
    run(ended({ ...WAIT, arena: MARKET_PLAZA_ARENA }), pastTheBeat).state;

  it('the next round is played on the arena CONTINUE names: its walls, its ground, everyone starting on it', () => {
    const next = continueRound(onPlaza(), { arena: GONG_ISLANDS_ARENA }).state;
    expect(next.phase).toBe('PLAYING');
    expect(next.round).toBe(2);
    expect(next.config.arena).toBe(GONG_ISLANDS_ARENA);
    // everyone starts on the islands' ground (on the plaza's spots some would be over the mist)
    for (const body of next.world.bodies)
      expect(onGround(body.position, GONG_ISLANDS_ARENA)).toBe(true);
    expect(next.config.arena.walls).toBe(GONG_ISLANDS_ARENA.walls);
  });

  it('kills and the match’s settings carry over; only the arena (and where Books appear) changes', () => {
    const waiting = { ...onPlaza(), scores: { a: 3, b: 1 } };
    const next = continueRound(waiting, { arena: GONG_ISLANDS_ARENA }).state;
    expect(next.scores).toEqual({ a: 3, b: 1 });
    expect({ ...next.config, arena: undefined }).toEqual({ ...waiting.config, arena: undefined });
  });

  it('without a next arena the round stays where it was', () => {
    expect(continueRound(onPlaza()).state.config.arena).toBe(MARKET_PLAZA_ARENA);
  });

  it('an arena the rules cannot play is refused', () => {
    expect(() =>
      continueRound(onPlaza(), { arena: { ...GONG_ISLANDS_ARENA, spawns: [{ x: 5, y: 5 }] } }),
    ).toThrow();
  });
});
