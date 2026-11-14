import { describe, expect, it } from 'vitest';
import {
  CharacterSelect,
  SELECT_GRID,
  isPlayable,
  type SelectParticipant,
} from '../src/runtime/characterSelect';

const human = (id: string, slot: number): SelectParticipant => ({ id, slot, cpu: false });
const cpu = (id: string, slot: number): SelectParticipant => ({ id, slot, cpu: true });

describe('the character grid (game-setting.mp4)', () => {
  it('is the video’s two rows of six, in its order', () => {
    expect(SELECT_GRID).toEqual([
      ['eggplant', 'avocado', 'banana', 'milk', 'watermelon', 'donut'],
      ['coffee', 'icecream', 'bread', 'bacon', 'carrot', 'sushi'],
    ]);
  });

  it('the eggplant and the sushi are coming soon (no model yet); every other character is playable', () => {
    expect(SELECT_GRID.flat().filter((c) => !isPlayable(c))).toEqual(['eggplant', 'sushi']);
  });
});

describe('CharacterSelect', () => {
  it('starts a new player’s cursor on the character their seat always had, not ready', () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0), human('b', 2)]);
    expect(s.pick('a')).toEqual({ character: 'bread', ready: false });
    expect(s.pick('b')).toEqual({ character: 'watermelon', ready: false });
  });

  it('moves a cursor one tile at a time and stops at the grid’s edge', () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0)]); // bread: row 1, column 2
    s.move('a', 'right');
    expect(s.pick('a')?.character).toBe('bacon');
    s.move('a', 'up');
    expect(s.pick('a')?.character).toBe('milk');
    s.move('a', 'up');
    expect(s.pick('a')?.character).toBe('milk');
    s.move('a', 'right');
    s.move('a', 'right');
    expect(s.pick('a')?.character).toBe('donut');
    s.move('a', 'right');
    expect(s.pick('a')?.character).toBe('donut');
  });

  it('a cursor may visit a coming-soon character, but nobody can be READY on it', () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0)]);
    s.move('a', 'right');
    s.move('a', 'right');
    s.move('a', 'right'); // bread → bacon → carrot → sushi
    expect(s.pick('a')?.character).toBe('sushi');
    expect(s.select('a')).toBe('COMING_SOON');
    expect(s.pick('a')?.ready).toBe(false);
  });

  it('a CPU never takes a coming-soon character', () => {
    const s = new CharacterSelect();
    s.sync(Array.from({ length: 6 }, (_, i) => cpu(`cpu:${i}`, i)));
    for (const [, pick] of s.picks()) expect(isPlayable(pick.character)).toBe(true);
  });

  it('SELECT readies the player on the character under their cursor, and a ready cursor does not move', () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0)]);
    expect(s.select('a')).toBe('READY');
    s.move('a', 'left');
    expect(s.pick('a')).toEqual({ character: 'bread', ready: true });
  });

  it('BACK un-readies; BACK when not ready does nothing', () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0)]);
    s.select('a');
    s.back('a');
    expect(s.pick('a')?.ready).toBe(false);
    s.back('a');
    expect(s.pick('a')).toEqual({ character: 'bread', ready: false });
  });

  it('a character someone is ready on cannot be readied by anyone else (one colour per player)', () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0), human('b', 1)]); // bread, coffee
    s.select('a');
    s.move('b', 'right');
    s.move('b', 'right'); // coffee → icecream → bread
    expect(s.pick('b')?.character).toBe('bread');
    expect(s.select('b')).toBe('TAKEN');
    expect(s.pick('b')?.ready).toBe(false);
    expect(s.isTaken('bread')).toBe(true);
    expect(s.isTaken('coffee')).toBe(false);
  });

  it('SELECT by a ready player when everyone is ready asks to begin', () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0), human('b', 1)]);
    s.select('a');
    expect(s.allReady).toBe(false);
    expect(s.select('a')).toBe('NONE');
    s.select('b');
    expect(s.allReady).toBe(true);
    expect(s.select('a')).toBe('BEGIN');
  });

  it('nobody in the room is not "everyone ready"', () => {
    expect(new CharacterSelect().allReady).toBe(false);
  });

  it('a CPU is always ready, on a free character (never one a person is ready on)', () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0)]);
    s.move('a', 'left'); // icecream
    s.select('a');
    s.sync([human('a', 0), cpu('cpu:1', 3)]); // seat 4 would be icecream: taken
    const bot = s.pick('cpu:1');
    expect(bot?.ready).toBe(true);
    expect(bot?.character).not.toBe('icecream');
    expect(s.allReady).toBe(true);
  });

  it('forgets players who left, so their character is free again', () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0)]);
    s.select('a');
    s.sync([]);
    expect(s.pick('a')).toBeUndefined();
    expect(s.isTaken('bread')).toBe(false);
  });

  it('keeps a returning snapshot stable: a sync with the same people changes nothing', () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0)]);
    s.move('a', 'up');
    s.sync([human('a', 0)]);
    expect(s.pick('a')?.character).toBe('banana');
  });

  it('unready() puts every person back to choosing (a new lobby), keeping what they hovered', () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0), cpu('cpu:1', 1)]);
    s.select('a');
    s.unready();
    expect(s.pick('a')).toEqual({ character: 'bread', ready: false });
    expect(s.pick('cpu:1')?.ready).toBe(true);
  });

  it('tells its listeners about every change, and only about changes', () => {
    const s = new CharacterSelect();
    let calls = 0;
    s.subscribe(() => (calls += 1));
    s.sync([human('a', 0)]);
    expect(calls).toBe(1);
    s.sync([human('a', 0)]);
    s.move('a', 'down'); // already on the bottom row
    s.back('a');
    expect(calls).toBe(1);
    s.select('a');
    expect(calls).toBe(2);
  });
});

describe('choosing a bot’s character (one controller, playing with bots)', () => {
  /** a is READY on bread; the CPU just added takes a free character, and a now steers it. */
  const withBot = () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0)]);
    s.select('a');
    s.sync([human('a', 0), cpu('cpu:1', 1)]);
    expect(s.drive('cpu:1', 'a')).toBe(true);
    return s;
  };

  it('the bot waits, not ready, on the free character it was given, and the room is not ready while it does', () => {
    const s = withBot();
    expect(s.pick('cpu:1')).toEqual({ character: 'coffee', ready: false, chosenBy: 'a' });
    expect(s.driving('a')).toBe('cpu:1');
    expect(s.driverOf('cpu:1')).toBe('a');
    expect(s.allReady).toBe(false);
  });

  it('the person’s stick moves the bot’s cursor (theirs stays READY where it was)', () => {
    const s = withBot();
    s.move('a', 'right'); // coffee -> icecream
    expect(s.pick('cpu:1')?.character).toBe('icecream');
    expect(s.pick('a')).toEqual({ character: 'bread', ready: true });
  });

  it('SELECT readies the bot on that character and hands the person their own controls back', () => {
    const s = withBot();
    s.move('a', 'right');
    expect(s.select('a')).toBe('BOT_READY');
    expect(s.pick('cpu:1')).toEqual({ character: 'icecream', ready: true });
    expect(s.driving('a')).toBeUndefined();
    expect(s.allReady).toBe(true);
    s.move('a', 'right'); // nothing moves now: the person is READY and drives nobody
    expect(s.pick('cpu:1')?.character).toBe('icecream');
  });

  it('the bot cannot be readied on a character someone is ready on, nor on a coming-soon one', () => {
    const s = withBot();
    s.move('a', 'right');
    s.move('a', 'right'); // coffee -> icecream -> bread (a's)
    expect(s.select('a')).toBe('TAKEN');
    s.move('a', 'up');
    s.move('a', 'up');
    s.move('a', 'left');
    s.move('a', 'left'); // bread -> banana -> avocado -> eggplant (row 0)
    expect(s.pick('cpu:1')?.character).toBe('eggplant');
    expect(s.select('a')).toBe('COMING_SOON');
    expect(s.pick('cpu:1')?.ready).toBe(false);
  });

  it('only a READY person may drive, only a CPU may be driven, and one bot at a time', () => {
    const s = new CharacterSelect();
    s.sync([human('a', 0), human('b', 1), cpu('cpu:1', 2), cpu('cpu:2', 3)]);
    expect(s.drive('cpu:1', 'a')).toBe(false); // a is still choosing their own
    s.select('a');
    expect(s.drive('b', 'a')).toBe(false); // b is a person
    expect(s.drive('cpu:1', 'a')).toBe(true);
    expect(s.drive('cpu:2', 'a')).toBe(false); // a already chooses for cpu:1
  });

  it('if the person leaves while choosing, the bot readies itself on a free character', () => {
    const s = withBot();
    s.move('a', 'right');
    s.sync([cpu('cpu:1', 1)]);
    expect(s.pick('cpu:1')).toEqual({ character: 'icecream', ready: true });
    expect(s.allReady).toBe(true);
  });

  it('if the bot is removed while chosen for, the person drives nobody', () => {
    const s = withBot();
    s.sync([human('a', 0)]);
    expect(s.driving('a')).toBeUndefined();
    expect(s.allReady).toBe(true);
  });
});
