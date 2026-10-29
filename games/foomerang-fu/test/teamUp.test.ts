import { describe, expect, it } from 'vitest';
import { stepFu } from '../src/rules';
import {
  DT,
  NONE,
  STRAIGHT,
  face,
  input,
  kill,
  make,
  place,
  run,
  type FuState,
} from './support/fixtures';

// TEAM UP (the owner, 2026-10-30; Boomerang Fu's mode): two teams; nothing a player throws, swings or blows up hurts their own
// team; a round ends when only one team has anyone alive; the match is won by the first team whose kills together reach the target.

const THROW = input({ a: { throw: true } });
const SLASH = input({ a: { slash: true } });
const TEAMS = { a: 0, b: 0, c: 1, d: 1 };

/** a (team 0) at (300,450) facing right, a teammate b standing right in its path; the others far off. */
function line(teams: Record<string, number> | undefined): FuState {
  let s = make(['a', 'b', 'c', 'd'], { ...STRAIGHT, ...(teams === undefined ? {} : { teams }) });
  s = place(place(place(place(s, 'a', 300, 450), 'b', 520, 450), 'c', 1700, 850), 'd', 1700, 100);
  return face(s, 'a', 1, 0);
}

describe('Team Up: no friendly fire', () => {
  it('without teams a boomerang kills whoever it meets (the control)', () => {
    const r = run(stepFu(line(undefined), THROW, DT).state, 40);
    expect(r.events.some((e) => e.type === 'HIT' && e.victimId === 'b')).toBe(true);
  });

  it('a boomerang flies through a teammate', () => {
    const r = run(stepFu(line(TEAMS), THROW, DT).state, 40);
    expect(r.events.some((e) => e.type === 'HIT')).toBe(false);
  });

  it('a slash does not cut a teammate', () => {
    let s = place(line(TEAMS), 'b', 360, 450);
    s = run(stepFu(s, SLASH, DT).state, 30).state;
    expect(s.players.find((p) => p.id === 'b')?.alive).toBe(true);
  });

  it('an enemy is still hit', () => {
    const s = place(line({ a: 0, b: 1, c: 1, d: 0 }), 'b', 520, 450);
    const r = run(stepFu(s, THROW, DT).state, 40);
    expect(r.events.some((e) => e.type === 'HIT' && e.victimId === 'b')).toBe(true);
  });
});

describe('Team Up: rounds and the match', () => {
  it('a round goes on while a team has two alive and ends when one team is all that is left', () => {
    let s = kill(line(TEAMS), 'c');
    expect(stepFu(s, NONE, DT).events.some((e) => e.type === 'ROUND_OVER')).toBe(false); // d still stands, so does a team
    s = kill(s, 'd');
    const r = stepFu(s, NONE, DT);
    expect(r.events.find((e) => e.type === 'ROUND_OVER')).toBeDefined(); // only team 0 is left
    expect(['a', 'b']).toContain(
      (r.events.find((e) => e.type === 'ROUND_OVER') as { winnerId?: string }).winnerId,
    );
  });

  it('the match is won by the first TEAM whose kills together reach the target', () => {
    let s = make(['a', 'b', 'c', 'd'], { ...STRAIGHT, teams: TEAMS, targetKills: 2 });
    s = { ...s, scores: { ...s.scores, a: 1, b: 0 } };
    s = place(place(place(place(s, 'b', 300, 450), 'a', 1000, 100), 'c', 520, 450), 'd', 1700, 850);
    s = face(s, 'b', 1, 0);
    const r = run(stepFu(s, input({ b: { throw: true } }), DT).state, 40, NONE);
    const won = r.events.find((e) => e.type === 'MATCH_WON');
    expect(won).toBeDefined(); // a's 1 + b's 1 = 2: the team has won, though neither has 2
    expect(r.state.matchOver?.winnerTeam).toBe(0);
  });
});
