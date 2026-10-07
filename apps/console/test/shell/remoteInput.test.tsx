import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button, ControlHintBar } from '../../src/shell/components';
import {
  FocusManager,
  FocusScope,
  type RemoteAction,
  type RemoteInput,
} from '../../src/shell/focus/FocusManager';

/** A phone, as the shell sees it: a source of console actions, nothing more. */
class FakeRemote implements RemoteInput {
  readonly #listeners = new Set<(action: RemoteAction) => void>();
  subscribe = (listener: (action: RemoteAction) => void): (() => void) => {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  };
  send(action: RemoteAction): void {
    act(() => {
      for (const l of [...this.#listeners]) l(action);
    });
  }
  get listeners(): number {
    return this.#listeners.size;
  }
}

function menu(remote: FakeRemote, onBack = vi.fn()) {
  const resume = vi.fn();
  const leave = vi.fn();
  const view = render(
    <FocusManager remote={remote}>
      <FocusScope id="pause" initialFocus="resume" onBack={onBack}>
        <Button id="resume" onPress={resume}>
          Resume
        </Button>
        <Button id="leave" onPress={leave}>
          Leave
        </Button>
        <ControlHintBar hints={[{ action: 'select', label: 'Choose' }]} />
      </FocusScope>
    </FocusManager>,
  );
  // jsdom has no layout: place the two buttons one above the other, as a real menu would.
  place(screen.getByRole('button', { name: 'Resume' }), 0);
  place(screen.getByRole('button', { name: 'Leave' }), 120);
  return { resume, leave, onBack, view };
}

function place(node: HTMLElement, y: number): void {
  node.getBoundingClientRect = () => ({
    x: 0,
    y,
    width: 200,
    height: 80,
    left: 0,
    top: y,
    right: 200,
    bottom: y + 80,
    toJSON: () => ({}),
  });
}

describe('a phone drives the ONE console focus system (the TV stays the source of truth)', () => {
  it('stick steps move focus, SELECT presses what is focused', () => {
    const remote = new FakeRemote();
    const { resume, leave } = menu(remote);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Resume' }));
    remote.send('down');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Leave' }));
    remote.send('select');
    expect(leave).toHaveBeenCalledTimes(1);
    expect(resume).not.toHaveBeenCalled();
  });

  it('BACK is the screen’s own back, exactly as Esc / B', () => {
    const remote = new FakeRemote();
    const { onBack } = menu(remote);
    remote.send('back');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('the secondary action does nothing until a screen offers one (no invented use)', () => {
    const remote = new FakeRemote();
    const { resume, leave, onBack } = menu(remote);
    remote.send('secondary');
    expect([resume, leave, onBack].every((f) => f.mock.calls.length === 0)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Resume' }));
  });

  it('hints switch to the phone’s own words once a phone is used', () => {
    const remote = new FakeRemote();
    menu(remote);
    expect(screen.getByText('Enter')).toBeTruthy(); // keyboard by default
    remote.send('down');
    expect(screen.getByText('SELECT')).toBeTruthy();
    expect(document.documentElement.dataset['input']).toBe('phone');
  });

  it('stops listening when it goes away', () => {
    const remote = new FakeRemote();
    const { view } = menu(remote);
    expect(remote.listeners).toBe(1);
    view.unmount();
    expect(remote.listeners).toBe(0);
  });
});
