import { describe, expect, it } from 'vitest';
import { MatchSetup } from '../src/runtime/matchSetup';

// Between character select and the first round (ff physics hq 2.mp4 9:38-9:50): GAME MODE, PICK TEAMS, READY?.

const people = (n: number, bots = 0) => [
  ...Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, cpu: false })),
  ...Array.from({ length: bots }, (_, i) => ({ id: `c${i + 1}`, cpu: true })),
];

describe('match setup', () => {
  it('starts on choosing characters, then GAME MODE with Free For All under the cursor', () => {
    const s = new MatchSetup();
    expect(s.stage).toBe('CHARACTERS');
    s.enter('FREE_FOR_ALL');
    expect(s.stage).toBe('MODE');
    expect(s.hover).toBe(0);
  });

  it('Free For All goes straight to READY?; Golden Boomerang is refused (not built); BACK steps back', () => {
    const s = new MatchSetup();
    s.sync(people(2));
    s.enter('FREE_FOR_ALL');
    s.move('p1', 'right');
    s.move('p1', 'right');
    expect(s.select()).toBe('REFUSED'); // Golden Boomerang
    s.move('p1', 'left');
    s.move('p1', 'left');
    expect(s.select()).toBe('ADVANCED');
    expect(s.stage).toBe('READY');
    expect(s.select()).toBe('BEGIN');
    expect(s.back('p1')).toBe(true);
    expect(s.stage).toBe('MODE');
  });

  it('Team Up: each person moves their own tile into a banner; both banners need someone before CONTINUE', () => {
    const s = new MatchSetup();
    s.sync(people(4));
    s.enter('FREE_FOR_ALL');
    s.move('p1', 'right'); // Team Up
    expect(s.select()).toBe('ADVANCED');
    expect(s.stage).toBe('TEAMS');
    expect(s.select()).toBe('REFUSED'); // nobody has chosen
    s.move('p1', 'left');
    s.move('p3', 'left'); // red
    s.move('p2', 'right'); // blue
    expect(s.select()).toBe('REFUSED'); // p4 is still in the middle
    s.move('p4', 'right');
    expect(s.teamsValid).toBe(true);
    expect([...s.sides()]).toEqual([
      ['p1', 0],
      ['p2', 1],
      ['p3', 0],
      ['p4', 1],
    ]);
    expect(s.select()).toBe('ADVANCED');
    expect(s.stage).toBe('READY');
  });

  it('a tile steps back to the middle before it crosses to the other banner', () => {
    const s = new MatchSetup();
    s.sync(people(2));
    s.enter('TEAM_UP');
    s.select();
    s.move('p1', 'right');
    expect(s.sideOf('p1')).toBe('BLUE');
    s.move('p1', 'left'); // blue → the middle
    expect(s.sideOf('p1')).toBeUndefined();
    s.move('p1', 'left'); // → red
    expect(s.sideOf('p1')).toBe('RED');
  });

  it('CPUs never choose: they fill the smaller side', () => {
    const s = new MatchSetup();
    s.sync(people(1, 2));
    s.enter('FREE_FOR_ALL');
    s.move('p1', 'right');
    s.select();
    s.move('p1', 'left');
    expect(s.sideOf('p1')).toBe('RED');
    expect(s.sideOf('c1')).toBe('BLUE');
    expect(s.sideOf('c2')).toBe('RED');
    expect(s.teamsValid).toBe(true);
  });

  it('BACK on PICK TEAMS first takes the person off their banner, then leaves for GAME MODE', () => {
    const s = new MatchSetup();
    s.sync(people(2));
    s.enter('TEAM_UP');
    s.select();
    s.move('p1', 'left');
    s.back('p1');
    expect(s.sideOf('p1')).toBeUndefined();
    s.back('p1');
    expect(s.stage).toBe('MODE');
    s.back('p1');
    expect(s.stage).toBe('CHARACTERS');
    expect(s.back('p1')).toBe(false);
  });
});
