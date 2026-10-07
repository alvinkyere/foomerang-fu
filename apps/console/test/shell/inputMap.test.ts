import { describe, expect, it } from 'vitest';
import { GamepadMapper, keyToAction } from '../../src/shell/focus/inputMap';

describe('keyToAction', () => {
  it('maps arrows / WASD to navigation, Enter/Space to select, Escape/Backspace to back', () => {
    expect(keyToAction('ArrowUp')).toBe('up');
    expect(keyToAction('ArrowDown')).toBe('down');
    expect(keyToAction('ArrowLeft')).toBe('left');
    expect(keyToAction('ArrowRight')).toBe('right');
    expect(keyToAction('w')).toBe('up');
    expect(keyToAction('Enter')).toBe('select');
    expect(keyToAction(' ')).toBe('select');
    expect(keyToAction('Escape')).toBe('back');
    expect(keyToAction('Backspace')).toBe('back');
  });
  it('ignores every other key', () => {
    expect(keyToAction('Tab')).toBeUndefined();
    expect(keyToAction('x')).toBeUndefined();
  });
});

describe('GamepadMapper (standard mapping: D-pad 12-15, A=0, B=1, left stick axes 0/1)', () => {
  const pad = (pressed: number[] = [], axes: [number, number] = [0, 0]) => ({
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })),
    axes,
  });

  it('emits one action per press edge, not one per poll', () => {
    const m = new GamepadMapper();
    expect(m.poll(pad([13]), 0)).toEqual(['down']);
    expect(m.poll(pad([13]), 16)).toEqual([]);
    expect(m.poll(pad([]), 32)).toEqual([]);
    expect(m.poll(pad([13]), 48)).toEqual(['down']);
  });

  it('maps A to select and B to back', () => {
    const m = new GamepadMapper();
    expect(m.poll(pad([0]), 0)).toEqual(['select']);
    expect(m.poll(pad([1]), 16)).toEqual(['back']);
  });

  it('repeats a held direction after a delay, at a steady rate', () => {
    const m = new GamepadMapper({ repeatDelayMs: 400, repeatIntervalMs: 100 });
    expect(m.poll(pad([15]), 0)).toEqual(['right']);
    expect(m.poll(pad([15]), 300)).toEqual([]);
    expect(m.poll(pad([15]), 400)).toEqual(['right']);
    expect(m.poll(pad([15]), 450)).toEqual([]);
    expect(m.poll(pad([15]), 500)).toEqual(['right']);
  });

  it('never repeats select or back while held', () => {
    const m = new GamepadMapper({ repeatDelayMs: 400, repeatIntervalMs: 100 });
    expect(m.poll(pad([0]), 0)).toEqual(['select']);
    expect(m.poll(pad([0]), 1000)).toEqual([]);
  });

  it('treats the left stick as a D-pad beyond a dead zone', () => {
    const m = new GamepadMapper();
    expect(m.poll(pad([], [0.2, 0.1]), 0)).toEqual([]);
    expect(m.poll(pad([], [0.9, 0.1]), 16)).toEqual(['right']);
    expect(m.poll(pad([], [0, -0.9]), 32)).toEqual(['up']);
  });
});
