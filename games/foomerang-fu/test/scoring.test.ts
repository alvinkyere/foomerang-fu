import { describe, expect, it } from 'vitest';
import { applyDeaths, type Death } from '../src/rules/scoring';

// The kill-race score is a pure function of who died and who is credited; the rules decide the credit (see
// attribution.test.ts), this module only turns deaths into hole changes.

const scores = (o: Record<string, number>) => Object.freeze({ ...o });
const kill = (
  victimId: string,
  creditedTo: string,
  cause: Death['cause'] = 'BOOMERANG',
): Death => ({
  victimId,
  creditedTo,
  cause,
});

describe('applyDeaths: filling and emptying holes', () => {
  it('an enemy kill fills exactly one hole for the killer and changes nobody else', () => {
    const r = applyDeaths(scores({ a: 0, b: 0, c: 0 }), [kill('b', 'a')]);
    expect(r.scores).toEqual({ a: 1, b: 0, c: 0 });
    expect(r.changes).toEqual([
      { playerId: 'a', victimId: 'b', delta: 1, reason: 'KILL', kills: 1 },
    ]);
    expect(r.gained).toEqual(['a']);
  });

  it('three kills in one step fill three holes (every kill matters; surviving gives nothing)', () => {
    const r = applyDeaths(scores({ a: 2, b: 0, c: 0, d: 0 }), [
      kill('b', 'a'),
      kill('c', 'a'),
      kill('d', 'a'),
    ]);
    expect(r.scores['a']).toBe(5);
    expect(r.changes.map((c) => c.kills)).toEqual([3, 4, 5]);
    expect(applyDeaths(scores({ a: 2, b: 0 }), []).scores).toEqual({ a: 2, b: 0 }); // nobody died: nothing changes
  });

  it('a self-kill empties exactly one hole and credits nobody else', () => {
    const r = applyDeaths(scores({ a: 4, b: 9 }), [kill('a', 'a')]);
    expect(r.scores).toEqual({ a: 3, b: 9 });
    expect(r.changes).toEqual([
      { playerId: 'a', victimId: 'a', delta: -1, reason: 'SELF_KILL', kills: 3 },
    ]);
    expect(r.gained).toEqual([]);
  });

  it('a self-kill at zero stays at zero (and still says so)', () => {
    const r = applyDeaths(scores({ a: 0, b: 1 }), [kill('a', 'a')]);
    expect(r.scores).toEqual({ a: 0, b: 1 });
    expect(r.changes).toEqual([
      { playerId: 'a', victimId: 'a', delta: 0, reason: 'SELF_KILL', kills: 0 },
    ]);
  });

  it('an environmental death (the floor) credits nobody and costs the victim one hole, never below zero', () => {
    const r = applyDeaths(scores({ a: 3, b: 0, c: 5 }), [
      { victimId: 'a', creditedTo: undefined, cause: 'HAZARD' },
      { victimId: 'b', creditedTo: undefined, cause: 'HAZARD' },
    ]);
    expect(r.scores).toEqual({ a: 2, b: 0, c: 5 });
    expect(r.changes.map((c) => [c.playerId, c.delta, c.reason])).toEqual([
      ['a', -1, 'ENVIRONMENT'],
      ['b', 0, 'ENVIRONMENT'],
    ]);
    expect(r.gained).toEqual([]);
  });

  it('simultaneous deaths are all applied from the same starting scores (mutual kills both score)', () => {
    const r = applyDeaths(scores({ a: 6, b: 6 }), [kill('b', 'a'), kill('a', 'b')]);
    expect(r.scores).toEqual({ a: 7, b: 7 });
    expect([...r.gained].sort()).toEqual(['a', 'b']);
  });

  it('a player who kills and dies to the floor on one step nets the two', () => {
    const r = applyDeaths(scores({ a: 3, b: 0 }), [
      kill('b', 'a'),
      { victimId: 'a', creditedTo: undefined, cause: 'HAZARD' },
    ]);
    expect(r.scores['a']).toBe(3);
  });

  it('never mutates its input', () => {
    const start = scores({ a: 1, b: 1 });
    applyDeaths(start, [kill('b', 'a')]);
    expect(start).toEqual({ a: 1, b: 1 });
  });
});
