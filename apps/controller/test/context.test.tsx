import type { ControllerManifest, ControllerContext, SecondaryAction } from '@foomerang/protocol';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ControlRenderer } from '../src/components/ControlRenderer';
import { meaningOf } from '../src/labels';
import { App } from '../src/App';
import { FakeSession, READY } from './support/fakeSession';

const FU: ControllerManifest = {
  gameId: 'foomerang-fu',
  orientation: 'landscape',
  controls: [
    { id: 'MOVE', type: 'joystick' },
    { id: 'SLASH', type: 'button', action: 'PRIMARY' },
    { id: 'THROW', type: 'button', action: 'SECONDARY' },
    { id: 'DASH', type: 'button', action: 'TERTIARY' },
  ],
};

const draw = (context: ControllerContext, secondaryAction: SecondaryAction = null) =>
  render(
    <ControlRenderer
      manifest={FU}
      context={context}
      secondaryAction={secondaryAction}
      onControlChange={vi.fn()}
      onButtonChange={vi.fn()}
    />,
  );
const buttons = () =>
  screen
    .getAllByRole('button')
    .map((b) => [b.getAttribute('data-control'), b.textContent, b.getAttribute('data-unused')]);

describe('what each control is called depends on the context, never on the game', () => {
  it('GAMEPLAY: the manifest’s own names — MOVE, SLASH, THROW, DASH — exactly as before', () => {
    draw('GAMEPLAY');
    expect(buttons()).toEqual([
      ['SLASH', 'SLASH', null],
      ['THROW', 'THROW', null],
      ['DASH', 'DASH', null],
    ]);
    expect(screen.getByRole('group', { name: /move/i })).toBeTruthy();
  });

  it.each(['CONSOLE', 'PAUSED', 'RESULTS'] as const)(
    '%s: joystick NAVIGATE, SLASH SELECT, THROW BACK — and DASH unlabelled when there is no secondary action',
    (context) => {
      draw(context);
      expect(buttons()).toEqual([
        ['SLASH', 'SELECT', null],
        ['THROW', 'BACK', null],
        ['DASH', '', 'true'],
      ]);
      expect(screen.getByRole('group', { name: /navigate/i })).toBeTruthy();
    },
  );

  it('DASH shows the host’s secondary label only when there is one', () => {
    draw('CONSOLE', { label: 'OPTIONS' });
    expect(buttons().at(-1)).toEqual(['DASH', 'OPTIONS', null]);
  });

  it('the physical layout does not move: the same controls, in the same order, in every context', () => {
    const gameplay = draw('GAMEPLAY');
    const order = [...gameplay.container.querySelectorAll('[data-control], .joystick-zone')].map(
      (n) => n.getAttribute('data-control') ?? 'stick',
    );
    gameplay.unmount();
    const menu = draw('CONSOLE');
    const menuOrder = [...menu.container.querySelectorAll('[data-control], .joystick-zone')].map(
      (n) => n.getAttribute('data-control') ?? 'stick',
    );
    expect(menuOrder).toEqual(order);
  });

  it('still reports button presses by their control id: the host decides what they mean', () => {
    const onButtonChange = vi.fn();
    render(
      <ControlRenderer
        manifest={FU}
        context="CONSOLE"
        secondaryAction={null}
        onControlChange={vi.fn()}
        onButtonChange={onButtonChange}
      />,
    );
    fireEvent.pointerDown(screen.getByRole('button', { name: 'SELECT' }), { pointerId: 1 });
    expect(onButtonChange).toHaveBeenCalledWith('SLASH', true);
  });

  it('meaningOf is a pure rule by ACTION, with no game id in it', () => {
    expect(meaningOf({ id: 'WHATEVER', type: 'button', action: 'PRIMARY' }, 'RESULTS', null)).toBe(
      'SELECT',
    );
    expect(meaningOf({ id: 'WHATEVER', type: 'button', action: 'PRIMARY' }, 'GAMEPLAY', null)).toBe(
      'WHATEVER',
    );
    expect(meaningOf({ id: 'STEER', type: 'joystick' }, 'PAUSED', null)).toBe('NAVIGATE');
  });
});

describe('the play screen shows the context it is in', () => {
  const play = (context: ControllerContext) =>
    new FakeSession({
      ...READY,
      manifest: FU,
      context: { context, secondaryAction: null, version: 1 },
    });

  it('relabels live when the host changes context, without re-rendering a different layout', () => {
    const session = play('GAMEPLAY');
    render(<App session={session} initialRoom={undefined} />);
    expect(screen.getByRole('button', { name: 'SLASH' })).toBeTruthy();
    act(() => session.set({ context: { context: 'PAUSED', secondaryAction: null, version: 2 } }));
    expect(screen.getByRole('button', { name: 'SELECT' })).toBeTruthy();
    expect(screen.getByText('PAUSED')).toBeTruthy();
  });

  it('says plainly what mode the phone is in outside gameplay', () => {
    render(<App session={play('CONSOLE')} initialRoom={undefined} />);
    expect(document.querySelector('[data-context="CONSOLE"]')).toBeTruthy();
    expect(document.body.textContent).toMatch(/MENU/);
  });
});
