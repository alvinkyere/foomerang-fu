import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ActionButton } from '../src/components/ActionButton';

function setup() {
  const onChange = vi.fn();
  render(<ActionButton controlId="THROW" onChange={onChange} />);
  const button = screen.getByRole('button', { name: /throw/i });
  return { button, onChange };
}

describe('ActionButton: a press and a release, through the real pointer events', () => {
  it('is labelled by the manifest’s control id', () => {
    expect(setup().button.textContent).toBe('THROW');
  });

  it('pressing reports pressed; lifting reports released', () => {
    const { button, onChange } = setup();
    fireEvent.pointerDown(button, { pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(button.dataset['pressed']).toBe('true');
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(button.dataset['pressed']).toBe('false');
  });

  it('a second finger on a held button does nothing', () => {
    const { button, onChange } = setup();
    fireEvent.pointerDown(button, { pointerId: 1 });
    fireEvent.pointerDown(button, { pointerId: 2 });
    fireEvent.pointerUp(button, { pointerId: 2 });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['pointercancel', (b: HTMLElement) => fireEvent.pointerCancel(b, { pointerId: 1 })],
    ['lost pointer capture', (b: HTMLElement) => fireEvent.lostPointerCapture(b, { pointerId: 1 })],
  ])('%s releases (a held button must never stay stuck)', (_name, end) => {
    const { button, onChange } = setup();
    fireEvent.pointerDown(button, { pointerId: 1 });
    end(button);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ['window blur', () => fireEvent.blur(window)],
    ['pagehide', () => window.dispatchEvent(new Event('pagehide'))],
    [
      'the page becoming hidden',
      () => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          get: () => 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      },
    ],
  ])('%s while held releases it', (_name, interrupt) => {
    const { button, onChange } = setup();
    fireEvent.pointerDown(button, { pointerId: 1 });
    act(() => interrupt());
    expect(onChange).toHaveBeenLastCalledWith(false);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  it('unmounting while held releases it', () => {
    const onChange = vi.fn();
    const view = render(<ActionButton controlId="THROW" onChange={onChange} />);
    fireEvent.pointerDown(screen.getByRole('button'), { pointerId: 1 });
    view.unmount();
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('a release with nothing held says nothing', () => {
    const { button, onChange } = setup();
    fireEvent.pointerUp(button, { pointerId: 1 });
    fireEvent.pointerCancel(button, { pointerId: 1 });
    fireEvent.blur(window);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a right mouse button does not press it', () => {
    const { button, onChange } = setup();
    fireEvent.pointerDown(button, { pointerId: 1, pointerType: 'mouse', button: 2 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('works from the keyboard (Space / Enter) without auto-repeat', () => {
    const { button, onChange } = setup();
    fireEvent.keyDown(button, { key: ' ' });
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    fireEvent.keyDown(button, { key: ' ', repeat: true });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyUp(button, { key: ' ' });
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not open the long-press context menu', () => {
    const { button } = setup();
    expect(fireEvent.contextMenu(button)).toBe(false); // preventDefault was called
  });

  it('keeps pressing after a parent re-render with a new callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<ActionButton controlId="THROW" onChange={first} />);
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button, { pointerId: 1 });
    view.rerender(<ActionButton controlId="THROW" onChange={second} />);
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(second).toHaveBeenLastCalledWith(false); // the release goes to the CURRENT callback
  });
});

describe('the button’s stylesheet', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
  const block = /\.action-button\s*{([^}]*)}/s.exec(css)?.[1] ?? '';

  it('is a big, gesture-free touch target', () => {
    expect(block).toMatch(/touch-action:\s*none/);
    expect(block).toMatch(/user-select:\s*none/);
    expect(block).toMatch(/-webkit-touch-callout:\s*none/);
    expect(block).toMatch(/min-height:\s*var\(--tap-target\)/);
  });
});
