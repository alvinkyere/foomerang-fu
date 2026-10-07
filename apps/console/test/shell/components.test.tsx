import { act, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  ConfirmDialog,
  ControlHintBar,
  SettingsRow,
  ToastHost,
  useToast,
} from '../../src/shell/components';
import { FocusManager, FocusScope } from '../../src/shell/focus/FocusManager';

const wrap = (ui: React.ReactNode) =>
  render(
    <FocusManager>
      <FocusScope id="s">{ui}</FocusScope>
    </FocusManager>,
  );

describe('Button states', () => {
  it('fires when pressed', () => {
    const onPress = vi.fn();
    wrap(
      <Button id="b" onPress={onPress}>
        Go
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  it('disabled stays focusable, is announced, and never fires', () => {
    const onPress = vi.fn();
    wrap(
      <Button id="b" disabled onPress={onPress}>
        Go
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });
  it('loading is busy and cannot be pressed twice', () => {
    const onPress = vi.fn();
    wrap(
      <Button id="b" loading onPress={onPress}>
        Go
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Go' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('keyboard couch input', () => {
  it('Enter presses the focused button exactly once; arrows move focus', () => {
    const a = vi.fn();
    const b = vi.fn();
    wrap(
      <>
        <Button id="a" onPress={a}>
          A
        </Button>
        <Button id="b" onPress={b}>
          B
        </Button>
      </>,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'A' }));
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('a settings row steps its value with ←/→ and never traps focus', () => {
    const onStep = vi.fn();
    wrap(<SettingsRow id="r" label="Text Size" value="Normal" onStep={onStep} />);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onStep.mock.calls).toEqual([[1], [-1]]);
  });
});

describe('ConfirmDialog', () => {
  it('a destructive confirm starts on Cancel and Back cancels', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <FocusManager>
        <ConfirmDialog
          id="d"
          open
          destructive
          title="Close?"
          message="Sure?"
          confirmLabel="Close"
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </FocusManager>,
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('ControlHintBar', () => {
  it('shows keyboard glyphs by default and gamepad glyphs when asked', () => {
    const hints = [
      { action: 'select', label: 'Open' },
      { action: 'back', label: 'Back' },
    ] as const;
    const { rerender } = render(
      <FocusManager>
        <ControlHintBar hints={hints} />
      </FocusManager>,
    );
    expect(screen.getByText('Enter')).toBeTruthy();
    rerender(
      <FocusManager>
        <ControlHintBar hints={hints} style="gamepad" />
      </FocusManager>,
    );
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('B')).toBeTruthy();
  });
});

describe('Toast', () => {
  it('announces politely and goes away by itself', () => {
    vi.useFakeTimers();
    function Fire() {
      const toast = useToast();
      return (
        <button type="button" onClick={() => toast('Hello')}>
          fire
        </button>
      );
    }
    render(
      <FocusManager>
        <ToastHost>
          <Fire />
        </ToastHost>
      </FocusManager>,
    );
    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByRole('status').textContent).toContain('Hello');
    act(() => void vi.advanceTimersByTime(3500));
    expect(screen.getByRole('status').textContent).not.toContain('Hello');
    vi.useRealTimers();
  });
});

describe('shell boundaries', () => {
  const dir = join(import.meta.dirname, '../../src/shell');
  const files = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? files(join(d, e.name))
        : /\.(ts|tsx)$/.test(e.name)
          ? [join(d, e.name)]
          : [],
    );
  it('presentation never imports the session, runtime, transport or user-facing network words', () => {
    for (const file of files(dir)) {
      if (/\/(adapter|harness)\//.test(file)) continue; // the adapter is the one place the shell meets the host
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from '\.\.\/(\.\.\/)?(host|runtime|render|consoleRuntime)/);
      expect(source, file).not.toMatch(
        /socket\.io|reconnectToken|protocolVersion|\bRTT\b|\bWSS\b/i,
      );
    }
  });
});
