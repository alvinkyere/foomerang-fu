import { describe, expect, it } from 'vitest';
import {
  BLINK_CHANCE,
  SELECT_SHEET,
  arrivalSide,
  cellOf,
  frameAt,
} from '../src/characters/selectAnimation';

// game-setting.mp4 (owner, 2026-10-20): while a cursor is on a character, its circle plays an arrival (it turns in from the way
// the cursor moved, 5 frames), then a 40-frame idle loop at 30 fps in which it now and then blinks (eyes shut 3 frames); when its
// player readies, it cheers (28 frames, the happy face) and goes back to the idle loop. One sheet per character, 8 columns.

const ms = (frames: number) => (frames * 1000) / 30 + 1;
const { idle, arriveLeft, arriveRight, cheer, blink } = SELECT_SHEET.sequences;
const never = () => false;
const always = () => true;

describe('the character-select animation', () => {
  it('plays at the video’s 30 frames a second and loops the 40-frame idle', () => {
    expect(SELECT_SHEET.fps).toBe(30);
    expect(frameAt(0, { blink: never })).toBe(idle.start);
    expect(frameAt(ms(1), { blink: never })).toBe(1);
    expect(frameAt(ms(39), { blink: never })).toBe(39);
    expect(frameAt(ms(85), { blink: never })).toBe(5);
  });

  it('turns in from the side the cursor moved to, then runs into the idle loop at that side’s hand', () => {
    expect(frameAt(0, { arrival: 'left', blink: never })).toBe(arriveLeft.start);
    expect(frameAt(ms(4), { arrival: 'left', blink: never })).toBe(arriveLeft.start + 4);
    expect(frameAt(ms(5), { arrival: 'left', blink: never })).toBe(0);
    expect(frameAt(ms(2), { arrival: 'right', blink: never })).toBe(arriveRight.start + 2);
    expect(frameAt(ms(5), { arrival: 'right', blink: never })).toBe(20);
  });

  it('blinks only where a blink was rendered (eyes shut 3 frames), when chance says so', () => {
    expect(SELECT_SHEET.blinkAt).toEqual([0, 10, 20, 30]);
    // at idle frame 10 the second blink starts: its three frames, then the idle again
    expect(frameAt(ms(10), { blink: always })).toBe(blink.start + 3);
    expect(frameAt(ms(12), { blink: always })).toBe(blink.start + 5);
    expect(frameAt(ms(13), { blink: always })).toBe(13);
    expect(frameAt(ms(10), { blink: never })).toBe(10);
    // one decision per chance: the same chance gives the same answer on every frame of it
    const asked: string[] = [];
    const record = (chance: string) => (asked.push(chance), false);
    frameAt(ms(20), { blink: record });
    frameAt(ms(21), { blink: record });
    expect(new Set(asked).size).toBe(1);
    // about one blink every 2.3 s, as the video's (gaps of 27-124 frames)
    expect(10 / BLINK_CHANCE / 30).toBeCloseTo(2.33, 1);
  });

  it('cheers when its player readies, then goes back to the idle loop', () => {
    const readyAt = ms(50);
    expect(frameAt(readyAt, { cheerFrom: readyAt, blink: never })).toBe(cheer.start);
    expect(frameAt(readyAt + ms(27) - 1, { cheerFrom: readyAt, blink: never })).toBe(
      cheer.start + 27,
    );
    expect(frameAt(readyAt + ms(28) - 1, { cheerFrom: readyAt, blink: never })).toBe(0);
    expect(frameAt(readyAt + ms(30) - 1, { cheerFrom: readyAt, blink: never })).toBe(2);
  });

  it('finds every frame in the sheet’s 8-column grid', () => {
    expect(SELECT_SHEET.frames).toBe(90);
    expect(cellOf(0)).toEqual({ col: 0, row: 0 });
    expect(cellOf(9)).toEqual({ col: 1, row: 1 });
    expect(cellOf(89)).toEqual({ col: 1, row: 11 });
  });

  it('knows which way the cursor moved along the grid', () => {
    const order = ['eggplant', 'avocado', 'banana', 'milk', 'watermelon', 'donut', 'coffee'];
    expect(arrivalSide(order, 'milk', 'banana', 6)).toBe('left');
    expect(arrivalSide(order, 'avocado', 'banana', 6)).toBe('right');
    expect(arrivalSide(order, 'eggplant', 'coffee', 6)).toBeUndefined();
    expect(arrivalSide(order, undefined, 'milk', 6)).toBeUndefined();
  });
});
