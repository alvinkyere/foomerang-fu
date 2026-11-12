import { describe, expect, it } from 'vitest';
import {
  FREE_FOR_ALL,
  GONG_ISLANDS_ARENA,
  continueRound,
  stepFu,
  type FuState,
} from '../src/rules';
import { C, DT, NONE, R, face, input, make, place, run } from './support/fixtures';

// The warm-up round (the HQ, foomerang-fu physics hq.mp4 0:00-0:31): every match opens with a practice round whose kills count for
// nothing (its results screen: "WARM UP ROUND", every meter empty); the match proper starts when it continues to its first map.

const PRACTICE = { ...FREE_FOR_ALL, roundAdvance: 'ON_CONTINUE' as const, practice: true };
const slashKills = (s: FuState) => {
  const near = face(place(place(s, 'a', 800, 450), 'b', 800 + R * 2, 450), 'a', 1, 0);
  return stepFu(near, input({ a: { slash: true } }), DT);
};

describe('the practice round', () => {
  it('a kill in it scores nothing', () => {
    const r = slashKills(make(['a', 'b', 'c'], PRACTICE));
    expect(r.state.players.find((p) => p.id === 'b')?.alive).toBe(false);
    expect(r.state.scores).toEqual({ a: 0, b: 0, c: 0 });
    expect(r.events.filter((e) => e.type === 'SCORE')).toEqual([]);
  });

  it('continuing to the first map ends it: the match proper counts from there', () => {
    const done = stepFu(make(['a', 'b'], PRACTICE), NONE, DT);
    const ended = {
      ...done.state,
      players: done.state.players.map((p) => (p.id === 'b' ? { ...p, alive: false } : p)),
    };
    const waiting = run(stepFu(ended, NONE, DT).state, Math.ceil(C.roundEndSeconds / DT) + 2).state;
    expect(waiting.roundOver?.awaitingContinue).toBe(true);
    const next = continueRound(waiting, { arena: GONG_ISLANDS_ARENA });
    expect(next.state.config.practice).toBeUndefined();
    const r = slashKills(next.state);
    expect(r.state.scores['a']).toBe(1);
  });
});
