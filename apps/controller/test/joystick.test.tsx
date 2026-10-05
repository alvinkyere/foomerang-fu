import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Joystick } from '../src/components/Joystick';

// Foomerang convention: +X right, +Y DOWN. A thumb moved down is a positive Y.

function setup(size = { width: 400, height: 300 }) {
  const onChange = vi.fn();
  render(<Joystick controlId="MOVE" onChange={onChange} />);
  const zone = screen.getByRole('group', { name: /move/i });
  zone.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: size.width,
      bottom: size.height,
      x: 0,
      y: 0,
      ...size,
      toJSON: () => ({}),
    }) as DOMRect;
  const down = (x: number, y: number, pointerId = 1) =>
    fireEvent.pointerDown(zone, { pointerId, clientX: x, clientY: y });
  const move = (x: number, y: number, pointerId = 1) =>
    fireEvent.pointerMove(zone, { pointerId, clientX: x, clientY: y });
  const up = (pointerId = 1) => fireEvent.pointerUp(zone, { pointerId });
  const last = () => onChange.mock.lastCall?.[0] as { x: number; y: number } | undefined;
  return { zone, onChange, down, move, up, last };
}

describe('Joystick: pointer geometry through the real DOM events', () => {
  // A 400 × 300 area gives a 90 px radius (30% of the short side); the thumb lands at (200, 150).
  it('engaging starts neutral — the base appears where the thumb landed', () => {
    const { zone, down, last } = setup();
    down(200, 150);
    expect(last()).toEqual({ x: 0, y: 0 });
    expect(zone.dataset['active']).toBe('true');
  });

  it.each([
    ['right', 290, 150, { x: 1, y: 0 }],
    ['left', 110, 150, { x: -1, y: 0 }],
    ['DOWN is positive Y', 200, 240, { x: 0, y: 1 }],
    ['UP is negative Y', 200, 60, { x: 0, y: -1 }],
    ['halfway right', 245, 150, { x: 0.5, y: 0 }],
  ])('thumb %s', (_name, x, y, expected) => {
    const { down, move, last } = setup();
    down(200, 150);
    move(x, y);
    expect(last()).toEqual(expected);
  });

  it('past the edge the magnitude stays at most 1 and the direction is kept', () => {
    const { down, move, last } = setup();
    down(200, 150);
    move(2_000, 150);
    expect(last()).toEqual({ x: 1, y: 0 });
    move(200 + 2_000, 150 + 2_000); // exactly 45° from where the thumb landed
    const v = last() ?? { x: 99, y: 99 };
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 12);
    expect(v.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(v.y).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it('a touch near an edge gets its base pulled inside so every direction stays available', () => {
    const { down, move, last } = setup();
    down(5, 150); // base is clamped to x = 90
    move(90 + 45, 150);
    expect(last()).toEqual({ x: 0.5, y: 0 });
  });

  it.each([
    [320, 180],
    [390, 844],
    [844, 390],
    [1024, 768],
  ])('works on a %i × %i control area (nothing is tied to one phone)', (width, height) => {
    const radius = Math.min(
      Math.max(0.3 * Math.min(width, height), 40),
      110,
      Math.min(width, height) / 2,
    );
    const { down, move, last } = setup({ width, height });
    down(width / 2, height / 2);
    move(width / 2 + radius, height / 2);
    expect(last()).toEqual({ x: 1, y: 0 });
    move(width / 2, height / 2 - radius / 2);
    expect(last()).toEqual({ x: 0, y: -0.5 });
  });

  it('captures the pointer so the thumb can leave the control without losing it', () => {
    const { down } = setup();
    down(200, 150, 7);
    expect(Element.prototype.setPointerCapture).toHaveBeenCalledWith(7);
  });

  it('ignores movement when nothing is touching', () => {
    const { move, onChange } = setup();
    move(250, 150);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Joystick: it can never be left stuck', () => {
  it('lifting the finger sends neutral and deactivates', () => {
    const { zone, down, move, up, last } = setup();
    down(200, 150);
    move(290, 150);
    up();
    expect(last()).toEqual({ x: 0, y: 0 });
    expect(zone.dataset['active']).toBe('false');
  });

  it('pointercancel (the OS took the gesture) sends neutral', () => {
    const { zone, down, move, last } = setup();
    down(200, 150);
    move(290, 150);
    fireEvent.pointerCancel(zone, { pointerId: 1 });
    expect(last()).toEqual({ x: 0, y: 0 });
    expect(zone.dataset['active']).toBe('false');
  });

  it('losing pointer capture sends neutral', () => {
    const { zone, down, move, last } = setup();
    down(200, 150);
    move(290, 150);
    fireEvent.lostPointerCapture(zone, { pointerId: 1 });
    expect(last()).toEqual({ x: 0, y: 0 });
  });

  it.each([
    ['the window loses focus', () => fireEvent.blur(window)],
    [
      'the page is hidden',
      () => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      },
    ],
    [
      'the page is being unloaded or frozen (pagehide)',
      () => window.dispatchEvent(new Event('pagehide')),
    ],
  ])('%s while held → neutral', (_name, interrupt) => {
    const { zone, down, move, last } = setup();
    down(200, 150);
    move(290, 150);
    act(() => interrupt());
    expect(last()).toEqual({ x: 0, y: 0 });
    expect(zone.dataset['active']).toBe('false');
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  it('a second finger is ignored while the first is down, and lifting it does not release the first', () => {
    const { down, move, up, last, onChange } = setup();
    down(200, 150, 1);
    move(290, 150, 1);
    down(50, 50, 2);
    move(10, 10, 2);
    expect(last()).toEqual({ x: 1, y: 0 });
    up(2);
    expect(last()).toEqual({ x: 1, y: 0 });
    up(1);
    expect(last()).toEqual({ x: 0, y: 0 });
    expect(onChange).toHaveBeenCalled();
  });

  it('can be used again after a release', () => {
    const { down, move, up, last } = setup();
    down(200, 150);
    move(290, 150);
    up();
    down(100, 100);
    move(100, 190);
    expect(last()).toEqual({ x: 0, y: 1 });
  });

  it('unmounting while held sends neutral and removes its listeners', () => {
    const onChange = vi.fn();
    const { unmount } = render(<Joystick controlId="MOVE" onChange={onChange} />);
    const zone = screen.getByRole('group', { name: /move/i });
    zone.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 400,
        height: 300,
        right: 400,
        bottom: 300,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(zone, { pointerId: 1, clientX: 290, clientY: 150 });
    unmount();
    expect(onChange.mock.lastCall?.[0]).toEqual({ x: 0, y: 0 });
    const calls = onChange.mock.calls.length;
    fireEvent.blur(window);
    expect(onChange.mock.calls.length).toBe(calls);
  });
});

describe('Joystick: keyboard (accessibility, and the desktop way to test)', () => {
  const key = (zone: HTMLElement, name: string, type: 'keyDown' | 'keyUp' = 'keyDown') =>
    fireEvent[type](zone, { key: name });

  it('is focusable and has an accessible name and instructions', () => {
    const { zone } = setup();
    expect(zone.tabIndex).toBe(0);
    expect(zone.getAttribute('aria-label')).toMatch(/move/i);
    expect(zone.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('arrow keys steer, with DOWN positive', () => {
    const { zone, last } = setup();
    key(zone, 'ArrowRight');
    expect(last()).toEqual({ x: 1, y: 0 });
    key(zone, 'ArrowRight', 'keyUp');
    key(zone, 'ArrowDown');
    expect(last()).toEqual({ x: 0, y: 1 });
    key(zone, 'ArrowDown', 'keyUp');
    expect(last()).toEqual({ x: 0, y: 0 });
  });

  it('WASD works too', () => {
    const { zone, last } = setup();
    key(zone, 'a');
    expect(last()).toEqual({ x: -1, y: 0 });
    key(zone, 'a', 'keyUp');
    key(zone, 'w');
    expect(last()).toEqual({ x: 0, y: -1 });
  });

  it('diagonals are normalized to magnitude 1', () => {
    const { zone, last } = setup();
    key(zone, 'ArrowRight');
    key(zone, 'ArrowDown');
    const v = last() ?? { x: 9, y: 9 };
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 12);
  });

  it('opposite keys cancel', () => {
    const { zone, last } = setup();
    key(zone, 'ArrowLeft');
    key(zone, 'ArrowRight');
    expect(last()).toEqual({ x: 0, y: 0 });
  });

  it('losing focus releases every key', () => {
    const { zone, last } = setup();
    key(zone, 'ArrowRight');
    fireEvent.blur(zone);
    expect(last()).toEqual({ x: 0, y: 0 });
  });

  it('other keys do nothing', () => {
    const { zone, onChange } = setup();
    key(zone, 'Enter');
    key(zone, 'q');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Joystick: gestures and haptics', () => {
  it('opts out of browser gestures inline, so scrolling/zooming cannot steal the touch even if CSS fails to load', () => {
    const { zone } = setup();
    expect(zone.style.touchAction).toBe('none');
    expect(zone.style.userSelect).toBe('none');
  });

  it('uses a light haptic tick when the platform has one', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const { down } = setup();
    down(200, 150);
    expect(vibrate).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(navigator, 'vibrate');
  });

  it('works perfectly without haptics (iPhone Safari has none)', () => {
    Reflect.deleteProperty(navigator, 'vibrate');
    const { down, move, last } = setup();
    expect(() => down(200, 150)).not.toThrow();
    move(290, 150);
    expect(last()).toEqual({ x: 1, y: 0 });
  });

  it('survives a vibrate() that throws', () => {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: () => {
        throw new Error('blocked');
      },
    });
    const { down } = setup();
    expect(() => down(200, 150)).not.toThrow();
    Reflect.deleteProperty(navigator, 'vibrate');
  });
});
