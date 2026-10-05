import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { FakeSession, IDLE, MOVE_MANIFEST, READY } from './support/fakeSession';

function installMatchMedia(isPortrait: boolean) {
  const listeners = new Set<() => void>();
  let portrait = isPortrait;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('portrait') ? portrait : !portrait,
    media: query,
    addEventListener: (_: string, l: () => void) => void listeners.add(l),
    removeEventListener: (_: string, l: () => void) => void listeners.delete(l),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
  return {
    rotate(toPortrait: boolean) {
      portrait = toPortrait;
      act(() => listeners.forEach((l) => l()));
    },
  };
}

beforeEach(() => {
  installMatchMedia(true);
});
afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
});

const zoneOf = () => {
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
  return zone;
};

describe('the screens a player sees', () => {
  it('IDLE: the join screen, with the room code from the QR link', () => {
    const session = new FakeSession(IDLE);
    render(<App session={session} initialRoom="K7M4PX" />);
    expect((screen.getByLabelText(/room code/i) as HTMLInputElement).value).toBe('K7M4PX');
  });

  it('joining: the form hands the code and name to the session — the UI never touches a socket', () => {
    const session = new FakeSession(IDLE);
    render(<App session={session} initialRoom="K7M4PX" />);
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: /join/i }));
    expect(session.called('join')[0]?.args).toEqual(['K7M4PX', 'Alice']);
  });

  it.each(['CONNECTING', 'JOINING'] as const)('%s: still on the join form, busy', (phase) => {
    render(
      <App
        session={new FakeSession({ ...IDLE, phase, joinCode: 'K7M4PX' })}
        initialRoom="K7M4PX"
      />,
    );
    expect(screen.getByRole('status').textContent).toMatch(/joining/i);
  });

  it('a failed join returns to the form with a human reason', () => {
    render(
      <App
        session={new FakeSession({ ...IDLE, failure: { kind: 'SERVER', code: 'ROOM_FULL' } })}
        initialRoom="K7M4PX"
      />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/full/i);
  });

  it('READY: the controller the manifest describes, the player’s name, and a calm “connected” badge', () => {
    render(<App session={new FakeSession(READY)} initialRoom={undefined} />);
    expect(screen.getByRole('group', { name: /move/i })).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/connected/i);
  });

  it('READY shows no network internals — those are diagnostics, not UX', () => {
    render(<App session={new FakeSession(READY)} initialRoom={undefined} />);
    expect(document.body.textContent).not.toMatch(/\d+\s?ms|ping|latency|rtt|socket|seq/i);
  });

  it('RECONNECTING: says so, keeps the controls on screen, and recovers when READY returns', () => {
    const session = new FakeSession(READY);
    render(<App session={session} initialRoom={undefined} />);
    act(() => session.set({ phase: 'RECONNECTING' }));
    expect(screen.getByRole('status').textContent).toMatch(/reconnecting/i);
    expect(screen.getByRole('group', { name: /move/i })).toBeTruthy();
    act(() => session.set({ phase: 'READY' }));
    expect(screen.getByRole('status').textContent).toMatch(/connected/i);
    expect(screen.getByRole('status').textContent).not.toMatch(/reconnecting/i);
  });

  describe('ENDED', () => {
    it.each([
      [{ kind: 'SERVER', code: 'SEAT_RELEASED' }, /spot/i],
      [{ kind: 'SERVER', code: 'INVALID_RECONNECT_TOKEN' }, /another device/i],
      [{ kind: 'SERVER', code: 'ROOM_CLOSING' }, /ending/i],
      [{ kind: 'CONNECTION_LOST' }, /connection/i],
    ] as const)('%j explains itself', (failure, expected) => {
      render(
        <App
          session={new FakeSession({ ...READY, phase: 'ENDED', failure })}
          initialRoom={undefined}
        />,
      );
      expect(screen.getByRole('alert').textContent).toMatch(expected);
    });

    it('offers a way back: “Join again” leaves the session', () => {
      const session = new FakeSession({
        ...READY,
        phase: 'ENDED',
        failure: { kind: 'CONNECTION_LOST' },
      });
      render(<App session={session} initialRoom={undefined} />);
      fireEvent.click(screen.getByRole('button', { name: /join again/i }));
      expect(session.called('leave')).toHaveLength(1);
    });
  });
});

describe('the thumb reaches the session through the manifest-rendered control', () => {
  it('dragging the joystick calls setControlValue with the control id and the normalized vector', () => {
    const session = new FakeSession(READY);
    render(<App session={session} initialRoom={undefined} />);
    const zone = zoneOf();
    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 200, clientY: 150 });
    fireEvent.pointerMove(zone, { pointerId: 1, clientX: 200, clientY: 240 });
    expect(session.called('setControlValue').at(-1)?.args).toEqual(['MOVE', { x: 0, y: 1 }]);
    fireEvent.pointerUp(zone, { pointerId: 1 });
    expect(session.called('setControlValue').at(-1)?.args).toEqual(['MOVE', { x: 0, y: 0 }]);
  });
});

describe('interruptions can never leave the character running', () => {
  const hidden = () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it.each([
    ['the page becomes hidden (app switch, screen lock)', hidden],
    ['pagehide (navigation, bfcache)', () => window.dispatchEvent(new Event('pagehide'))],
    ['the window loses focus', () => fireEvent.blur(window)],
  ])('%s → the session is neutralized', (_name, interrupt) => {
    const session = new FakeSession(READY);
    render(<App session={session} initialRoom={undefined} />);
    interrupt();
    expect(session.called('neutralize').length).toBeGreaterThanOrEqual(1);
  });

  it('becoming visible again does not neutralize (nothing to undo)', () => {
    const session = new FakeSession(READY);
    render(<App session={session} initialRoom={undefined} />);
    document.dispatchEvent(new Event('visibilitychange')); // visibilityState is "visible"
    expect(session.called('neutralize')).toHaveLength(0);
  });

  it('stops listening when the controller screen goes away', () => {
    const session = new FakeSession(READY);
    const view = render(<App session={session} initialRoom={undefined} />);
    view.unmount();
    window.dispatchEvent(new Event('pagehide'));
    fireEvent.blur(window);
    expect(session.called('neutralize')).toHaveLength(0);
  });

  it('is not armed on the join screen', () => {
    const session = new FakeSession(IDLE);
    render(<App session={session} initialRoom={undefined} />);
    window.dispatchEvent(new Event('pagehide'));
    expect(session.called('neutralize')).toHaveLength(0);
  });
});

describe('orientation: functional in both, with a gentle hint — never a wall', () => {
  it('a landscape game held in portrait works, and suggests rotating', () => {
    render(<App session={new FakeSession(READY)} initialRoom={undefined} />);
    expect(screen.getByRole('group', { name: /move/i })).toBeTruthy(); // still fully usable
    expect(screen.getByRole('note').textContent).toMatch(/rotate/i);
    expect(screen.getByRole('note').textContent).toMatch(/landscape|sideways/i);
  });

  it('no hint once the phone is in the preferred orientation, and it follows rotation live', () => {
    const media = installMatchMedia(true);
    render(<App session={new FakeSession(READY)} initialRoom={undefined} />);
    expect(screen.queryByRole('note')).not.toBeNull();
    media.rotate(false);
    expect(screen.queryByRole('note')).toBeNull();
    media.rotate(true);
    expect(screen.queryByRole('note')).not.toBeNull();
  });

  it('a portrait game held in landscape gets the opposite hint', () => {
    installMatchMedia(false);
    const portraitGame = {
      ...READY,
      manifest: { ...MOVE_MANIFEST, orientation: 'portrait' as const },
    };
    render(<App session={new FakeSession(portraitGame)} initialRoom={undefined} />);
    expect(screen.getByRole('note').textContent).toMatch(/portrait|upright/i);
  });

  it('a game with no preference never nags', () => {
    const anyGame = { ...READY, manifest: { ...MOVE_MANIFEST, orientation: 'any' as const } };
    render(<App session={new FakeSession(anyGame)} initialRoom={undefined} />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
