import { describe, expect, it } from 'vitest';
import { FREE_FOR_ALL, SYSTEMS_ARENA, rematchOf, type FuEvent } from '../src';
import { playMatch, type Participant } from './support/cpuMatch';
import { place, player } from './support/fixtures';

// CPUs play the kill race by exactly the rules humans do: their kills fill their holes, their self-kills empty one,
// they can win at 14, and difficulty has no part in the scoring.

const table: Participant[] = [
  { id: 'e', cpu: 'EASY' },
  { id: 'm', cpu: 'MEDIUM' },
  { id: 'h1', cpu: 'HARD' },
  { id: 'h2', cpu: 'HARD' },
];
const full = (seed: number) =>
  playMatch({
    participants: table,
    arena: SYSTEMS_ARENA,
    seed,
    steps: 60 * 1500,
    powerups: true,
    config: { ...FREE_FOR_ALL },
  });

describe('CPUs in the kill race', () => {
  it('a complete CPU-only match ends the moment somebody fills 14 holes; the winner is a CPU; the scores are exactly what the SCORE events add up to', () => {
    const r = full(4);
    expect(r.state.phase).toBe('MATCH_OVER');
    const winner = r.state.matchOver?.winnerId ?? '';
    expect(table.map((p) => p.id)).toContain(winner);
    expect(r.state.scores[winner]).toBeGreaterThanOrEqual(14);
    // replay the score events: they reproduce the final meters, so nothing changed a score outside the rules' events
    const rebuilt: Record<string, number> = Object.fromEntries(table.map((p) => [p.id, 0]));
    for (const e of r.events) if (e.type === 'SCORE') rebuilt[e.playerId] = e.kills;
    expect(rebuilt).toEqual(r.state.scores);
    // the match was won by the step that filled the last hole: MATCH_WON is the last gameplay event of the match
    const wonAt = r.events.findIndex((e) => e.type === 'MATCH_WON');
    expect(wonAt).toBeGreaterThan(0);
    expect(r.events.slice(wonAt + 1)).toEqual([]);
    expect(r.events.filter((e) => e.type === 'MATCH_WON')).toHaveLength(1);
  });

  it('difficulty does not change the rules of scoring: every kill by any CPU is +1 for that CPU', () => {
    const r = full(7);
    const hits = r.events.filter((e): e is Extract<FuEvent, { type: 'HIT' }> => e.type === 'HIT');
    const kills = r.events.filter((e) => e.type === 'SCORE' && e.reason === 'KILL');
    expect(kills.length).toBe(hits.filter((h) => h.creditedTo !== undefined).length);
    for (const e of kills) expect(e.type === 'SCORE' && e.delta).toBe(1);
  });

  it('a CPU that dies on the floor loses one hole (self-kill/environment) and nobody gains', () => {
    // Easy ignores the schedule until the floor is ACTIVE, and it dies on that very step
    const r = playMatch({
      participants: [
        { id: 'e', cpu: 'EASY' },
        { id: 'x', human: () => ({}) },
        { id: 'y', human: () => ({}) },
      ],
      arena: SYSTEMS_ARENA,
      seed: 3,
      steps: 5,
      config: { ...FREE_FOR_ALL },
      start: (s) => ({
        ...place(place(place(s, 'e', 930, 300), 'x', 100, 100), 'y', 1500, 800),
        scores: { e: 4, x: 2, y: 0 },
        roundTime: 7.5,
      }),
    });
    expect(r.state.scores).toEqual({ e: 3, x: 2, y: 0 });
    expect(r.events.filter((e) => e.type === 'SCORE')).toEqual([
      expect.objectContaining({ playerId: 'e', delta: -1, reason: 'ENVIRONMENT' }),
    ]);
  });

  it('a whole match replays to the identical result from the same seed (events, scores and winner)', () => {
    expect(JSON.stringify(full(11))).toBe(JSON.stringify(full(11)));
    expect(JSON.stringify(full(11).state)).not.toBe(JSON.stringify(full(12).state));
  }, 30_000); // four whole matches, played at the reference video's pace (2026-10-20: rounds ≈ 20 s, not ≈ 5)

  it('after the match is won the CPUs do nothing and nothing changes; a rematch starts clean with the same participants', () => {
    const r = full(4);
    const frozen = JSON.stringify(r.state);
    expect(r.state.phase).toBe('MATCH_OVER');
    const fresh = rematchOf(r.state);
    expect(fresh.scores).toEqual({ e: 0, m: 0, h1: 0, h2: 0 });
    expect(fresh.players.map((p) => p.id)).toEqual(['e', 'm', 'h1', 'h2']);
    expect(fresh.players.every((p) => p.alive && p.inventory.length === 0)).toBe(true);
    expect(JSON.stringify(r.state)).toBe(frozen);
    expect(player(fresh, 'e').slot).toBe(player(r.state, 'e').slot);
  });

  it('six CPUs play a full match to a winner too (the largest table)', () => {
    const r = playMatch({
      participants: [
        { id: 'a', cpu: 'EASY' },
        { id: 'b', cpu: 'EASY' },
        { id: 'c', cpu: 'MEDIUM' },
        { id: 'd', cpu: 'MEDIUM' },
        { id: 'e', cpu: 'HARD' },
        { id: 'f', cpu: 'HARD' },
      ],
      arena: SYSTEMS_ARENA,
      seed: 5,
      steps: 60 * 1500,
      powerups: true,
      config: { ...FREE_FOR_ALL },
    });
    expect(r.state.phase).toBe('MATCH_OVER');
  });
});
