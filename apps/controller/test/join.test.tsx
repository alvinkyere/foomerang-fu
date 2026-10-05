import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JoinScreen } from '../src/screens/JoinScreen';

function setup(props: Partial<Parameters<typeof JoinScreen>[0]> = {}) {
  const onJoin = vi.fn();
  render(<JoinScreen busy={false} onJoin={onJoin} {...props} />);
  const room = screen.getByLabelText(/room code/i) as HTMLInputElement;
  const name = screen.getByLabelText(/your name/i) as HTMLInputElement;
  const submit = () => fireEvent.click(screen.getByRole('button', { name: /join|joining/i }));
  const type = (input: HTMLInputElement, value: string) =>
    fireEvent.change(input, { target: { value } });
  return { onJoin, room, name, submit, type };
}

describe('Join: zero accounts, scan → name → play', () => {
  it('asks for exactly a room code and a display name — no email, password, sign-up or social anything', () => {
    setup();
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(document.querySelector('input[type="email"], input[type="password"]')).toBeNull();
    expect(screen.queryByText(/sign ?up|log ?in|account|create/i)).toBeNull();
  });

  it('prefills the room code from the QR link and puts the cursor on the NAME', () => {
    const { room, name } = setup({ initialRoom: 'K7M4PX' });
    expect(room.value).toBe('K7M4PX');
    expect(document.activeElement).toBe(name);
  });

  it('without a link, starts on the room code for manual entry', () => {
    const { room, name } = setup();
    expect(room.value).toBe('');
    expect(document.activeElement).toBe(room);
    expect(name.value).toBe('');
  });

  it('joins with the code and the name', () => {
    const { onJoin, type, name, submit } = setup({ initialRoom: 'K7M4PX' });
    type(name, 'Alice');
    submit();
    expect(onJoin).toHaveBeenCalledWith('K7M4PX', 'Alice');
  });

  it('manual entry: typed codes are shown in upper case and can be pasted with spaces', () => {
    const { onJoin, room, name, type, submit } = setup();
    type(room, ' k7m 4px ');
    expect(room.value).toBe('K7M4PX');
    type(name, '  Alice  ');
    submit();
    expect(onJoin).toHaveBeenCalledWith('K7M4PX', 'Alice');
  });

  it('is a real form: Enter submits', () => {
    const { onJoin, type, name } = setup({ initialRoom: 'K7M4PX' });
    type(name, 'Alice');
    fireEvent.submit(name.closest('form') as HTMLFormElement);
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  describe('validation (kind, specific, and it never sends a doomed request)', () => {
    it('a missing name', () => {
      const { onJoin, submit } = setup({ initialRoom: 'K7M4PX' });
      submit();
      expect(onJoin).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toMatch(/name/i);
    });

    it.each(['', 'K7M4P', 'K7M4P0', 'HELLO!', 'ABCDEFG'])('a bad room code (%j)', (code) => {
      const { onJoin, room, name, type, submit } = setup();
      type(room, code);
      type(name, 'Alice');
      submit();
      expect(onJoin).not.toHaveBeenCalled();
      expect(screen.getByRole('alert').textContent).toMatch(/room code/i);
      expect(room.getAttribute('aria-invalid')).toBe('true');
    });

    it('errors clear as soon as the player fixes the field', () => {
      const { room, type, submit } = setup();
      submit();
      expect(screen.getByRole('alert')).toBeTruthy();
      type(room, 'K7M4PX');
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('limits input length and turns off autocorrect/autocapitalize meddling', () => {
    const { room, name } = setup();
    expect(room.maxLength).toBeGreaterThanOrEqual(6); // must not truncate a pasted code that carries spaces
    expect(name.maxLength).toBe(16);
    expect(room.getAttribute('autocomplete')).toBe('off');
    expect(room.getAttribute('autocapitalize')).toBe('characters');
    expect(room.getAttribute('spellcheck')).toBe('false');
    expect(name.getAttribute('autocomplete')).toBe('nickname');
  });

  describe('while joining', () => {
    it('disables the form and says so, so it cannot be double-submitted', () => {
      const { onJoin, submit } = setup({ initialRoom: 'K7M4PX', busy: true });
      expect((screen.getByRole('button', { name: /joining/i }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect((screen.getByLabelText(/your name/i) as HTMLInputElement).disabled).toBe(true);
      submit();
      // Even a submit that bypasses the disabled button (Enter in a field, assistive tech) is ignored.
      fireEvent.submit(
        (screen.getByLabelText(/your name/i) as HTMLInputElement).closest(
          'form',
        ) as HTMLFormElement,
      );
      expect(onJoin).not.toHaveBeenCalled();
      expect(screen.getByRole('status').textContent).toMatch(/joining/i);
    });
  });

  describe('a join already in flight', () => {
    it('cannot be submitted a second time, even with a perfectly valid form', () => {
      const onJoin = vi.fn();
      const view = render(<JoinScreen busy={false} initialRoom="K7M4PX" onJoin={onJoin} />);
      fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Alice' } });
      view.rerender(<JoinScreen busy initialRoom="K7M4PX" onJoin={onJoin} />); // same form, now joining
      fireEvent.submit(screen.getByLabelText(/your name/i).closest('form') as HTMLFormElement);
      expect(onJoin).not.toHaveBeenCalled();
    });
  });

  describe('when the server says no', () => {
    it.each([
      ['ROOM_NOT_FOUND', /couldn.t find that room/i],
      ['ROOM_FULL', /full/i],
      ['ROOM_NOT_JOINABLE', /already started/i],
      ['INVALID_DISPLAY_NAME', /name/i],
      ['RATE_LIMITED', /too many/i],
    ] as const)('%s becomes human words, not a code', (code, expected) => {
      setup({ initialRoom: 'K7M4PX', failure: { kind: 'SERVER', code } });
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toMatch(expected);
      expect(alert.textContent).not.toContain(code);
    });

    it('being unable to reach the server explains the likely cause', () => {
      setup({ failure: { kind: 'CONNECTION_FAILED' } });
      expect(screen.getByRole('alert').textContent).toMatch(/wi-?fi/i);
    });
  });

  it('shows no raw network internals', () => {
    setup({ initialRoom: 'K7M4PX' });
    expect(document.body.textContent).not.toMatch(/\bms\b|ping|latency|socket|websocket|seq\b/i);
  });
});
