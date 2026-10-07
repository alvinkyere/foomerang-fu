import { describe, expect, it } from 'vitest';
import { pickNext, type FocusRect } from '../../src/shell/focus/navigation';

const box = (id: string, x: number, y: number, w = 100, h = 100): FocusRect => ({ id, x, y, w, h });

describe('pickNext (spatial navigation)', () => {
  const row = [box('a', 0, 0), box('b', 200, 0), box('c', 400, 0)];

  it('moves to the nearest item in the direction pressed', () => {
    expect(pickNext(row, 'a', 'right')).toBe('b');
    expect(pickNext(row, 'c', 'left')).toBe('b');
  });

  it('stays put at an edge instead of wrapping or jumping', () => {
    expect(pickNext(row, 'a', 'left')).toBe('a');
    expect(pickNext(row, 'c', 'right')).toBe('c');
    expect(pickNext(row, 'b', 'up')).toBe('b');
  });

  it('prefers the item that is aligned over a nearer item that is off-axis', () => {
    const items = [box('from', 0, 0), box('aligned', 400, 0), box('diagonal', 150, 140)];
    expect(pickNext(items, 'from', 'right')).toBe('aligned');
  });

  it('goes down from a wide card to the system bar item nearest its centre', () => {
    const items = [
      box('card', 0, 0, 600, 300),
      box('s1', 0, 400, 80, 80),
      box('s2', 250, 400, 80, 80),
      box('s3', 520, 400, 80, 80),
    ];
    expect(pickNext(items, 'card', 'down')).toBe('s2');
  });

  it('returns the current id when it is the only item, and undefined for an unknown current', () => {
    expect(pickNext([box('only', 0, 0)], 'only', 'down')).toBe('only');
    expect(pickNext(row, 'missing', 'right')).toBeUndefined();
  });

  it('is deterministic when two candidates tie (lowest id order wins)', () => {
    const items = [box('from', 0, 100), box('up2', 200, 0), box('up1', -200, 0)];
    expect(pickNext(items, 'from', 'up')).toBe('up1');
  });
});
