import type { ControllerManifest } from '@foomerang/protocol';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ControlRenderer } from '../src/components/ControlRenderer';

const manifest = (overrides: Partial<ControllerManifest> = {}): ControllerManifest => ({
  gameId: 'foomerang-fu',
  orientation: 'landscape',
  controls: [{ id: 'MOVE', type: 'joystick' }],
  ...overrides,
});

describe('ControlRenderer: the controller is rendered FROM the manifest', () => {
  it('renders the joystick the manifest asks for', () => {
    render(
      <ControlRenderer manifest={manifest()} onControlChange={vi.fn()} onButtonChange={vi.fn()} />,
    );
    expect(screen.getAllByRole('group')).toHaveLength(1);
    expect(screen.getByRole('group', { name: /move/i })).toBeTruthy();
  });

  it('renders as many controls as the manifest lists, labelled by their own ids', () => {
    render(
      <ControlRenderer
        manifest={manifest({
          controls: [
            { id: 'STEER', type: 'joystick' },
            { id: 'AIM', type: 'joystick' },
          ],
        })}
        onControlChange={vi.fn()}
        onButtonChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('group', { name: /steer/i })).toBeTruthy();
    expect(screen.getByRole('group', { name: /aim/i })).toBeTruthy();
  });

  it('has no per-game logic: the same controls render the same for any game', () => {
    const a = render(
      <ControlRenderer
        manifest={manifest({ gameId: 'foomerang-fu' })}
        onControlChange={vi.fn()}
        onButtonChange={vi.fn()}
      />,
    );
    const htmlA = a.container.innerHTML;
    a.unmount();
    const b = render(
      <ControlRenderer
        manifest={manifest({ gameId: 'a-totally-different-game' })}
        onControlChange={vi.fn()}
        onButtonChange={vi.fn()}
      />,
    );
    expect(b.container.innerHTML).toBe(htmlA);
  });

  it('renders a different layout when a different game asks for one', () => {
    const view = render(
      <ControlRenderer
        manifest={manifest({ controls: [{ id: 'STEER', type: 'joystick' }] })}
        onControlChange={vi.fn()}
        onButtonChange={vi.fn()}
      />,
    );
    expect(view.queryByRole('group', { name: /move/i })).toBeNull();
    expect(view.getByRole('group', { name: /steer/i })).toBeTruthy();
  });

  it('renders a button when the manifest asks for one, with no knowledge of the game', () => {
    const onButtonChange = vi.fn();
    render(
      <ControlRenderer
        manifest={manifest({
          gameId: 'any-game-at-all',
          controls: [
            { id: 'MOVE', type: 'joystick' },
            { id: 'THROW', type: 'button', action: 'PRIMARY' },
          ],
        })}
        onControlChange={vi.fn()}
        onButtonChange={onButtonChange}
      />,
    );
    expect(screen.getByRole('group', { name: /move/i })).toBeTruthy();
    const button = screen.getByRole('button', { name: /throw/i });
    fireEvent.pointerDown(button, { pointerId: 1 });
    expect(onButtonChange).toHaveBeenLastCalledWith('THROW', true);
    fireEvent.pointerUp(button, { pointerId: 1 });
    expect(onButtonChange).toHaveBeenLastCalledWith('THROW', false);
  });

  it('renders two buttons, each reporting its own id, and both can be held at once (a thumb on each)', () => {
    const onButtonChange = vi.fn();
    render(
      <ControlRenderer
        manifest={manifest({
          gameId: 'any-game-at-all',
          controls: [
            { id: 'MOVE', type: 'joystick' },
            { id: 'SLASH', type: 'button', action: 'PRIMARY' },
            { id: 'THROW', type: 'button', action: 'SECONDARY' },
          ],
        })}
        onControlChange={vi.fn()}
        onButtonChange={onButtonChange}
      />,
    );
    const slash = screen.getByRole('button', { name: /slash/i });
    const throwButton = screen.getByRole('button', { name: /throw/i });
    fireEvent.pointerDown(slash, { pointerId: 1 });
    fireEvent.pointerDown(throwButton, { pointerId: 2 });
    expect(onButtonChange.mock.calls).toEqual([
      ['SLASH', true],
      ['THROW', true],
    ]);
    fireEvent.pointerUp(slash, { pointerId: 1 });
    expect(onButtonChange).toHaveBeenLastCalledWith('SLASH', false);
  });

  it('lays buttons out by the generic action they send, not by game: PRIMARY is the big one', () => {
    render(
      <ControlRenderer
        manifest={manifest({
          gameId: 'any-game-at-all',
          controls: [
            { id: 'MOVE', type: 'joystick' },
            { id: 'ONE', type: 'button', action: 'SECONDARY' },
            { id: 'TWO', type: 'button', action: 'PRIMARY' },
          ],
        })}
        onControlChange={vi.fn()}
        onButtonChange={vi.fn()}
      />,
    );
    const one = screen.getByRole('button', { name: 'ONE' });
    const two = screen.getByRole('button', { name: 'TWO' });
    expect(one.getAttribute('data-action')).toBe('SECONDARY');
    expect(two.getAttribute('data-action')).toBe('PRIMARY');
    expect(one.parentElement).toBe(two.parentElement); // one cluster for the action thumb
    expect(one.parentElement?.classList.contains('button-cluster')).toBe(true);
    expect(screen.getByRole('group', { name: /move/i }).parentElement).not.toBe(one.parentElement);
  });

  it('renders three buttons (SLASH, THROW, DASH) from the manifest alone, each with its own id and action, all holdable at once', () => {
    const onButtonChange = vi.fn();
    render(
      <ControlRenderer
        manifest={manifest({
          gameId: 'any-game-at-all',
          controls: [
            { id: 'MOVE', type: 'joystick' },
            { id: 'SLASH', type: 'button', action: 'PRIMARY' },
            { id: 'THROW', type: 'button', action: 'SECONDARY' },
            { id: 'DASH', type: 'button', action: 'TERTIARY' },
          ],
        })}
        onControlChange={vi.fn()}
        onButtonChange={onButtonChange}
      />,
    );
    const dash = screen.getByRole('button', { name: 'DASH' });
    expect(dash.getAttribute('data-action')).toBe('TERTIARY');
    const cluster = dash.parentElement;
    expect(cluster?.classList.contains('button-cluster')).toBe(true);
    expect(cluster?.querySelectorAll('button')).toHaveLength(3);
    // The cluster says which layout it needs (a generic fact about the actions present, never a game).
    expect(cluster?.getAttribute('data-layout')).toBe('tertiary');
    fireEvent.pointerDown(screen.getByRole('button', { name: 'SLASH' }), { pointerId: 1 });
    fireEvent.pointerDown(dash, { pointerId: 2 });
    expect(onButtonChange.mock.calls).toEqual([
      ['SLASH', true],
      ['DASH', true],
    ]);
    fireEvent.pointerUp(dash, { pointerId: 2 });
    expect(onButtonChange).toHaveBeenLastCalledWith('DASH', false);
  });

  it('keeps the two-button layout when no button sends TERTIARY (nothing changes for other games)', () => {
    render(
      <ControlRenderer
        manifest={manifest({
          gameId: 'any-game-at-all',
          controls: [
            { id: 'MOVE', type: 'joystick' },
            { id: 'SLASH', type: 'button', action: 'PRIMARY' },
            { id: 'THROW', type: 'button', action: 'SECONDARY' },
          ],
        })}
        onControlChange={vi.fn()}
        onButtonChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'SLASH' }).parentElement?.hasAttribute('data-layout'),
    ).toBe(false);
  });

  it('ignores control types this build cannot render instead of breaking (forward compatibility)', () => {
    const future = manifest({
      controls: [
        { id: 'MOVE', type: 'joystick' },
        { id: 'DIAL', type: 'dial' as never },
      ],
    });
    expect(() =>
      render(
        <ControlRenderer manifest={future} onControlChange={vi.fn()} onButtonChange={vi.fn()} />,
      ),
    ).not.toThrow();
    expect(screen.getAllByRole('group')).toHaveLength(1);
  });

  it('reports a control’s value together with the control’s id', () => {
    const onControlChange = vi.fn();
    render(
      <ControlRenderer
        manifest={manifest()}
        onControlChange={onControlChange}
        onButtonChange={vi.fn()}
      />,
    );
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
    expect(onControlChange).toHaveBeenLastCalledWith('MOVE', { x: 1, y: 0 });
  });

  it('re-renders for a new manifest without leaking the old controls', () => {
    const view = render(
      <ControlRenderer manifest={manifest()} onControlChange={vi.fn()} onButtonChange={vi.fn()} />,
    );
    view.rerender(
      <ControlRenderer
        manifest={manifest({ controls: [{ id: 'STEER', type: 'joystick' }] })}
        onControlChange={vi.fn()}
        onButtonChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: /move/i })).toBeNull();
    expect(screen.getByRole('group', { name: /steer/i })).toBeTruthy();
  });
});
