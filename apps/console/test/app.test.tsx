import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createConsoleRuntime } from '../src/consoleRuntime';
import type { GameId } from '../src/config';
import type { ArenaRenderer } from '../src/render/renderer';
import type { ArenaView } from '../src/render/viewModel';
import { FrameLoop } from '../src/runtime/frameLoop';
import { App } from '../src/ui/App';
import { FakeHostNetwork, MemoryHostStore, createClock, roster, settle } from './support/hostFakes';

const CONTROLLER = 'http://192.168.1.20:5173';

function manualRaf() {
  let next = 1;
  const callbacks = new Map<number, (t: number) => void>();
  return {
    createLoop: () =>
      new FrameLoop(
        (cb) => {
          const id = next++;
          callbacks.set(id, cb);
          return id;
        },
        (id) => void callbacks.delete(id),
      ),
    get pending() {
      return callbacks.size;
    },
    fire(t: number) {
      const entry = [...callbacks.entries()][0];
      if (!entry) throw new Error('no frame pending');
      callbacks.delete(entry[0]);
      entry[1](t);
    },
  };
}

class FakeRenderer implements ArenaRenderer {
  views: ArenaView[] = [];
  destroyed = false;
  render(view: ArenaView) {
    this.views.push(view);
  }
  drawn() {
    return (this.views.at(-1)?.circles ?? []).map(({ id, x, y }) => ({ id, x, y }));
  }
  drawnBoomerangs() {
    return (this.views.at(-1)?.boomerangs ?? []).map(({ ownerId, x, y }) => ({
      id: ownerId,
      x,
      y,
    }));
  }
  drawnWalls() {
    return this.views.at(-1)?.walls ?? [];
  }
  destroy() {
    this.destroyed = true;
  }
}

function setup(
  options: { warnings?: string[]; debug?: boolean; gameId?: GameId; store?: MemoryHostStore } = {},
) {
  const clock = createClock();
  const network = new FakeHostNetwork();
  const store = options.store ?? new MemoryHostStore();
  let hostNow = 0;
  const runtime = createConsoleRuntime({
    transportFactory: network.factory,
    environment: clock.environment,
    store,
    now: () => hostNow,
  });
  const raf = manualRaf();
  const renderer = new FakeRenderer();
  const loadRenderer = vi.fn(() => Promise.resolve(renderer));
  const view = render(
    <App
      runtime={runtime}
      controllerBaseUrl={CONTROLLER}
      warnings={options.warnings ?? []}
      gameId={options.gameId ?? 'primitive-arena'}
      loadRenderer={loadRenderer}
      createLoop={raf.createLoop}
      now={() => hostNow}
      {...(options.debug ? { debugInitiallyOpen: true } : {})}
    />,
  );
  return {
    clock,
    network,
    runtime,
    raf,
    renderer,
    loadRenderer,
    view,
    store,
    setNow: (t: number) => (hostNow = t),
  };
}

const flush = () => act(async () => void (await settle()));
const press = (key: string) => fireEvent.keyDown(window, { key });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const isDisabled = (el: HTMLElement) => el.getAttribute('aria-disabled') === 'true';
const START = /START GAME/;

/** Home → select the game → PLAY. Returns once the room exists and the Join screen is up. */
async function inLobby(options?: Parameters<typeof setup>[0]) {
  const ctx = setup(options);
  fireEvent.click(button(/Foomerang Fu|Foomerang$|Primitive/));
  fireEvent.click(button('PLAY'));
  await flush();
  return ctx;
}
const seat = (n: number) => screen.getByRole('button', { name: new RegExp(`^Player ${n}:`) });
const seatGroup = (n: number) => screen.getByRole('group', { name: new RegExp(`^Player ${n}`) });

const twoPlayers = roster(
  { playerId: 'a', displayName: 'Alvin' },
  { playerId: 'b', displayName: 'David' },
);
const code = () => screen.getByTestId('room-code').textContent;

describe('couch flow: home → game → PLAY → real room → join', () => {
  it('opens on the console home: the games, the system bar, and nothing to do with a lobby', () => {
    setup({ gameId: 'foomerang-fu' });
    expect(button('Foomerang Fu')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /coming soon/i })).toHaveLength(2);
    for (const name of ['Players', 'Controllers', 'Settings', 'Help', 'About']) {
      expect(button(name)).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Create room' })).toBeNull();
    expect(document.documentElement.dataset['view']).toBe('shell');
  });

  it('home focuses the first game; Enter opens its page and PLAY is focused', () => {
    setup({ gameId: 'foomerang-fu' });
    expect(document.activeElement).toBe(button('Foomerang Fu'));
    press('Enter');
    expect(document.activeElement).toBe(button('PLAY'));
  });

  it('PLAY asks for a real room; its loading state is the real wait, then Join appears', async () => {
    const { network } = setup({ gameId: 'foomerang-fu' });
    fireEvent.click(button('Foomerang Fu'));
    fireEvent.click(button('PLAY'));
    expect(button(/Getting ready/).getAttribute('aria-busy')).toBe('true'); // not a timer: the session is CONNECTING
    await flush();
    expect(network.last.of('ROOM_CREATE')[0]?.payload).toEqual({ gameId: 'foomerang-fu' });
    expect(code()).toBe('K7M4PX');
    expect(screen.getByRole('img', { name: /QR code to join room K7M4PX/ })).toBeTruthy();
  });

  it('PLAY creates the game the console was opened for', async () => {
    const { network } = await inLobby({ gameId: 'primitive-arena' });
    expect(network.last.of('ROOM_CREATE')[0]?.payload).toEqual({ gameId: 'primitive-arena' });
  });

  it('shows the short address for people who cannot scan', async () => {
    await inLobby();
    expect(screen.getByTestId('join-address').textContent).toBe('192.168.1.20:5173');
    expect(document.body.textContent).not.toMatch(/host-token/);
  });

  it('warns when the QR could not work from a phone', async () => {
    await inLobby({ warnings: ['The controller URL points at this computer'] });
    expect(screen.getByRole('alert').textContent).toMatch(/Phones can’t reach this screen yet/);
    expect(document.body.textContent).not.toMatch(/FOOMERANG_|controller URL|http:\/\/192/);
  });

  it('never shows technical words to a person', async () => {
    const { network } = await inLobby({ gameId: 'foomerang-fu' });
    network.roomUpdated(network.last, 'LOBBY', twoPlayers);
    await flush();
    expect(document.body.textContent).not.toMatch(
      /socket|wss|rtt|transport|reconnectToken|protocol/i,
    );
  });
});

describe('room creation failure → Try again', () => {
  it('says so in plain words, offers Back and Try again, and Try again really retries', async () => {
    const { network } = setup({ gameId: 'foomerang-fu' });
    network.refuseConnections = true;
    fireEvent.click(button('Foomerang Fu'));
    fireEvent.click(button('PLAY'));
    await flush();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/couldn’t reach the game/);
    expect(alert.textContent).not.toMatch(/192\.168|3001|http/); // no addresses
    expect(button('Back')).toBeTruthy();
    network.refuseConnections = false;
    fireEvent.click(button('Try again'));
    await flush();
    expect(code()).toBe('K7M4PX');
    await act(async () => void (await new Promise((r) => setTimeout(r, 250))));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Back dismisses the failure and leaves you on the game page', async () => {
    const { network } = setup({ gameId: 'foomerang-fu' });
    network.refuseConnections = true;
    fireEvent.click(button('Foomerang Fu'));
    fireEvent.click(button('PLAY'));
    await flush();
    fireEvent.click(button('Back'));
    await act(async () => void (await settle()));
    expect(button('PLAY')).toBeTruthy();
    expect(isDisabled(button('PLAY'))).toBe(false);
  });

  it('a refusal from the server is explained too', async () => {
    const { network } = setup({ gameId: 'foomerang-fu' });
    network.createError = 'UNKNOWN_GAME';
    fireEvent.click(button('Foomerang Fu'));
    fireEvent.click(button('PLAY'));
    await flush();
    expect(screen.getByRole('alert').textContent).toMatch(/does not know this game/);
  });
});

describe('Join shows the real roster, live', () => {
  it('has six seats, empty at first', async () => {
    await inLobby();
    expect(screen.getAllByRole('group', { name: /^Player \d, empty/ })).toHaveLength(6);
  });

  it('players appear as they join, each with a number, a marker and their name — not colour alone', async () => {
    const { network } = await inLobby();
    network.roomUpdated(network.last, 'LOBBY', twoPlayers);
    await flush();
    const first = seatGroup(1);
    expect(first.textContent).toContain('1');
    expect(first.textContent).toContain('●');
    expect(first.textContent).toContain('Alvin');
    expect(seatGroup(2).textContent).toMatch(/■.*David|2.*■/s);
    expect(first.textContent).toContain('Connected'); // honest: there is no READY mechanic
    expect(first.textContent).not.toMatch(/\bready\b/i);
  });

  it('a reconnecting player is shown as such and keeps their seat', async () => {
    const { network } = await inLobby();
    network.roomUpdated(
      network.last,
      'LOBBY',
      roster({ playerId: 'a', displayName: 'Alvin', connection: 'RECONNECTING' }),
    );
    await flush();
    expect(seatGroup(1).textContent).toContain('Rejoining');
  });

  it('a released seat is freed', async () => {
    const { network } = await inLobby();
    network.roomUpdated(
      network.last,
      'LOBBY',
      roster({ playerId: 'a', displayName: 'Alvin', connection: 'DISCONNECTED', seat: 'RELEASED' }),
    );
    await flush();
    expect(screen.getAllByRole('group', { name: /empty/ })).toHaveLength(6);
  });
});

describe('starting', () => {
  it('START is unavailable and says why until the table can play', async () => {
    const { network } = await inLobby({ gameId: 'foomerang-fu' });
    expect(isDisabled(button(START))).toBe(true);
    expect(document.body.textContent).toMatch(/At least 2 players are needed/);
    network.roomUpdated(network.last, 'LOBBY', twoPlayers);
    await flush();
    expect(isDisabled(button(START))).toBe(false);
  });

  it('START asks the server; a refusal is explained and the room stays', async () => {
    const { network } = await inLobby({ gameId: 'foomerang-fu' });
    network.roomUpdated(network.last, 'LOBBY', twoPlayers);
    await flush();
    network.startError = 'INVALID_STATE';
    fireEvent.click(button(START));
    await flush();
    expect(network.last.of('MATCH_START')).toHaveLength(1);
    expect(document.body.textContent).toMatch(/cannot start right now/);
    expect(button(START)).toBeTruthy();
  });

  it('the arena renderer is NOT loaded while people are in the room', async () => {
    const { network, loadRenderer } = await inLobby();
    network.roomUpdated(network.last, 'LOBBY', twoPlayers);
    await flush();
    expect(loadRenderer).not.toHaveBeenCalled();
  });

  it('Home → Fu → PLAY → room → players connect → START → the real arena replaces the shell', async () => {
    const { network, loadRenderer } = await inLobby({ gameId: 'foomerang-fu' });
    network.roomUpdated(network.last, 'LOBBY', twoPlayers);
    await flush();
    fireEvent.click(button(START));
    expect(network.last.of('MATCH_START')).toHaveLength(1);
    network.roomUpdated(network.last, 'PLAYING', twoPlayers);
    await flush();
    expect(screen.getByTestId('arena')).toBeTruthy();
    expect(screen.queryByRole('button', { name: START })).toBeNull();
    expect(document.documentElement.dataset['view']).toBeUndefined(); // the arena keeps its own sizes
    expect(loadRenderer).toHaveBeenCalledTimes(1);
  });

  it('when the match ends and the room returns to its lobby, the shell is back on Join with the same players', async () => {
    const { network, runtime } = await inLobby({ gameId: 'foomerang-fu' });
    network.roomUpdated(network.last, 'PLAYING', twoPlayers);
    await flush();
    act(() => runtime.returnToLobby());
    network.roomUpdated(network.last, 'LOBBY', twoPlayers);
    await flush();
    expect(code()).toBe('K7M4PX');
    expect(seatGroup(1).textContent).toContain('Alvin');
    expect(isDisabled(button(START))).toBe(false);
  });
});

describe('Join → close → Home', () => {
  it('Back asks first; cancelling keeps the room; confirming gives the room up and goes Home', async () => {
    const { runtime, store } = await inLobby({ gameId: 'foomerang-fu' });
    press('Escape');
    expect(screen.getByRole('dialog', { name: 'Close this room?' })).toBeTruthy();
    expect(document.activeElement).toBe(button('Cancel')); // a stray press never closes a room
    press('Escape');
    await act(async () => void (await new Promise((r) => setTimeout(r, 250))));
    expect(code()).toBe('K7M4PX');
    press('Escape');
    fireEvent.click(button('Close Room'));
    await flush();
    expect(runtime.session.getState().phase).toBe('IDLE');
    expect(store.value).toBeUndefined();
    expect(button('Foomerang Fu')).toBeTruthy();
    expect(screen.queryByTestId('room-code')).toBeNull();
  });
});

describe('Join → connection interruption → reconnect', () => {
  it('says the room is kept, blocks START with the reason, and recovers by itself', async () => {
    const { network, clock } = await inLobby({ gameId: 'foomerang-fu' });
    network.roomUpdated(network.last, 'LOBBY', twoPlayers);
    await flush();
    network.refuseConnections = true;
    act(() => network.last.serverDrops());
    await flush();
    expect(screen.getByText(/Reconnecting… your room is still here/)).toBeTruthy();
    expect(isDisabled(button(START))).toBe(true);
    expect(document.body.textContent).toMatch(/Reconnecting… START is back/);
    expect(code()).toBe('K7M4PX');
    network.refuseConnections = false;
    await act(async () => {
      clock.advance(250);
      await settle();
    });
    network.roomUpdated(network.last, 'LOBBY', twoPlayers);
    await flush();
    expect(screen.queryByText(/Reconnecting… your room/)).toBeNull();
    expect(isDisabled(button(START))).toBe(false);
  });

  it('a room that cannot be reclaimed ends with an explanation and sends you Home', async () => {
    const { network, clock } = await inLobby();
    network.reconnectError = 'ROOM_NOT_FOUND';
    act(() => network.last.serverDrops());
    await act(async () => {
      clock.advance(250);
      await settle();
    });
    expect(screen.getByRole('alert').textContent).toMatch(/no longer exists/);
    fireEvent.click(button('OK'));
    await flush();
    expect(button('Foomerang Fu')).toBeTruthy();
    expect(screen.queryByTestId('room-code')).toBeNull();
  });

  it('a reloaded console reclaims its room and lands straight on Join', async () => {
    const store = new MemoryHostStore();
    store.value = { joinCode: 'K7M4PX', hostToken: 'host-token-0', gameId: 'foomerang-fu' };
    const ctx = setup({ gameId: 'foomerang-fu', store });
    ctx.runtime.session.resume();
    await flush();
    await flush();
    expect(code()).toBe('K7M4PX');
  });

  it('a reloaded console that lost its match says so, in plain words', async () => {
    const store = new MemoryHostStore();
    store.value = { joinCode: 'K7M4PX', hostToken: 'host-token-0', gameId: 'foomerang-fu' };
    const ctx = setup({ gameId: 'foomerang-fu', store });
    ctx.network.roomStateOnReconnect = 'PLAYING';
    ctx.runtime.session.resume();
    await flush();
    await flush();
    expect(document.body.textContent).toMatch(
      /The last match ended because this screen was reloaded/,
    );
    expect(button(START)).toBeTruthy();
  });
});

describe('CPU players on Join (Foomerang Fu)', () => {
  const lobbyWith = async (people: ReturnType<typeof roster>) => {
    const ctx = await inLobby({ gameId: 'foomerang-fu' });
    ctx.network.roomUpdated(ctx.network.last, 'LOBBY', people);
    await flush();
    return ctx;
  };
  const addCpu = () =>
    fireEvent.click(screen.getAllByRole('button', { name: /empty seat/ })[0] as HTMLElement);

  it('one person alone cannot start; adding a CPU makes two participants and enables START', async () => {
    await lobbyWith(roster({ playerId: 'a', displayName: 'Alvin' }));
    expect(isDisabled(button(START))).toBe(true);
    addCpu();
    expect(isDisabled(button(START))).toBe(false);
  });

  it('a CPU has a name, a number, a marker and its difficulty — and humans are told apart', async () => {
    const { runtime } = await lobbyWith(roster({ playerId: 'a', displayName: 'Alvin' }));
    addCpu();
    expect(runtime.director.cpus.entries.map((c) => [c.name, c.difficulty])).toEqual([
      ['CPU 1', 'MEDIUM'],
    ]);
    const cpu = seat(2);
    expect(cpu.textContent).toContain('CPU 1');
    expect(cpu.textContent).toContain('■');
    expect(cpu.textContent).toContain('Medium');
    expect(within(cpu).getByText('CPU')).toBeTruthy();
    expect(seatGroup(1).textContent).toContain('Alvin');
  });

  it('each CPU has its own difficulty (←/→ on its seat) and Select removes it, freeing its seat', async () => {
    const { runtime } = await lobbyWith(roster({ playerId: 'a', displayName: 'Alvin' }));
    addCpu();
    addCpu();
    act(() => seat(2).focus());
    press('ArrowLeft');
    act(() => seat(3).focus());
    press('ArrowRight');
    expect(runtime.director.cpus.entries.map((c) => c.difficulty)).toEqual(['EASY', 'HARD']);
    press('ArrowRight'); // Hard is the top: it does not wrap round to Easy
    expect(runtime.director.cpus.entries.map((c) => c.difficulty)).toEqual(['EASY', 'HARD']);
    fireEvent.click(seat(2));
    expect(runtime.director.cpus.entries.map((c) => c.name)).toEqual(['CPU 2']);
    expect(runtime.director.slots.slotOf('cpu:1')).toBeUndefined();
    expect(runtime.director.slots.slotOf('cpu:2')).toBe(2);
  });

  it('a match holds at most six: no empty seat is left to add to, and START still works', async () => {
    const { runtime } = await lobbyWith(
      roster({ playerId: 'a', displayName: 'Alvin' }, { playerId: 'b', displayName: 'David' }),
    );
    for (let i = 0; i < 8; i += 1) {
      const empty = screen.queryAllByRole('button', { name: /empty seat/ })[0];
      if (empty) fireEvent.click(empty);
    }
    expect(runtime.director.cpus.entries).toHaveLength(4);
    expect(screen.queryAllByRole('button', { name: /empty seat/ })).toHaveLength(0);
    expect(isDisabled(button(START))).toBe(false);
  });

  it('a person joining a full table is told to remove a CPU, and START waits', async () => {
    const { network, runtime } = await lobbyWith(roster({ playerId: 'a', displayName: 'Alvin' }));
    for (let i = 0; i < 5; i += 1) addCpu();
    expect(runtime.director.cpus.entries).toHaveLength(5);
    network.roomUpdated(
      network.last,
      'LOBBY',
      roster({ playerId: 'a', displayName: 'Alvin' }, { playerId: 'b', displayName: 'David' }),
    );
    await flush();
    expect(document.body.textContent).toMatch(/No seat for David: remove a CPU/);
    expect(isDisabled(button(START))).toBe(true);
    expect(document.body.textContent).toMatch(/at most 6 players/);
    fireEvent.click(seat(6));
    expect(isDisabled(button(START))).toBe(false);
  });

  it('nothing adds a CPU for the host: an empty seat stays empty', async () => {
    const { runtime } = await lobbyWith(twoPlayers);
    expect(runtime.director.cpus.entries).toEqual([]);
  });

  it('CPU-only: two CPUs can start (the console asks the server, which allows it)', async () => {
    const { network } = await lobbyWith(roster());
    expect(isDisabled(button(START))).toBe(true);
    addCpu();
    addCpu();
    expect(isDisabled(button(START))).toBe(false);
    fireEvent.click(button(START));
    expect(network.last.of('MATCH_START')).toHaveLength(1);
  });

  it('the primitive arena (platform test) has no CPUs', async () => {
    await inLobby();
    expect(screen.queryAllByRole('button', { name: /empty seat/ })).toHaveLength(0);
  });
});

describe('the arena', () => {
  async function playing() {
    const ctx = await inLobby();
    ctx.network.roomUpdated(ctx.network.last, 'PLAYING', twoPlayers);
    await flush();
    return ctx;
  }

  it('each frame advances the simulation and hands the renderer a view built from authoritative state', async () => {
    const { network, raf, renderer, setNow } = await playing();
    network.last.deliver({
      type: 'PLAYER_INPUT',
      payload: { playerId: 'a', input: { kind: 'MOVE', seq: 0, x: 1, y: 0 } },
    });
    await flush();
    for (let t = 17; t <= 170; t += 17) {
      setNow(t);
      act(() => raf.fire(t));
    }
    const last = renderer.views.at(-1);
    expect(last?.circles.map((c) => c.label)).toEqual(['Alvin', 'David']);
    const a = last?.circles[0];
    const b = last?.circles[1];
    expect(a?.x).toBeGreaterThan(800);
    expect(b?.x).toBeCloseTo(800 + 520 * Math.cos(Math.PI / 3 - Math.PI / 2), 6);
    expect(renderer.drawn().map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('keeps simulating while the renderer is still loading', async () => {
    const ctx = await inLobby();
    let resolve!: (r: FakeRenderer) => void;
    ctx.loadRenderer.mockImplementation(() => new Promise<FakeRenderer>((r) => (resolve = r)));
    ctx.network.roomUpdated(ctx.network.last, 'PLAYING', twoPlayers);
    await flush();
    ctx.network.last.deliver({
      type: 'PLAYER_INPUT',
      payload: { playerId: 'a', input: { kind: 'MOVE', seq: 0, x: 1, y: 0 } },
    });
    await flush();
    ctx.setNow(100);
    act(() => ctx.raf.fire(100));
    expect(ctx.runtime.director.runtime.metrics().simulationSteps).toBeGreaterThan(0);
    await act(async () => resolve(ctx.renderer));
    expect(ctx.renderer.destroyed).toBe(false);
  });

  it('a renderer that fails to load shows a message and does not stop the simulation', async () => {
    const ctx = await inLobby();
    ctx.loadRenderer.mockImplementation(() => Promise.reject(new Error('no webgl')));
    ctx.network.roomUpdated(ctx.network.last, 'PLAYING', twoPlayers);
    await flush();
    expect(screen.getByRole('alert').textContent).toMatch(/could not be drawn/);
    expect(() => act(() => ctx.raf.fire(17))).not.toThrow();
  });

  it('leaving the arena destroys the renderer and stops the frame loop', async () => {
    const { raf, renderer, view } = await playing();
    expect(raf.pending).toBe(1);
    view.unmount();
    expect(renderer.destroyed).toBe(true);
    expect(raf.pending).toBe(0);
  });

  it('a late-resolving renderer for a screen already left is destroyed, not leaked', async () => {
    const ctx = await inLobby();
    let resolve!: (r: FakeRenderer) => void;
    ctx.loadRenderer.mockImplementation(() => new Promise<FakeRenderer>((r) => (resolve = r)));
    ctx.network.roomUpdated(ctx.network.last, 'PLAYING', twoPlayers);
    await flush();
    ctx.view.unmount();
    await act(async () => resolve(ctx.renderer));
    expect(ctx.renderer.destroyed).toBe(true);
  });

  it('shows a reconnecting banner while the console’s own connection is down', async () => {
    const { network, clock } = await playing();
    network.refuseConnections = true;
    act(() => network.last.serverDrops());
    await flush();
    expect(screen.getByRole('status').textContent).toMatch(/Reconnecting/);
    expect(clock.scheduler.pending).toBeGreaterThan(0);
  });
});

describe('debug overlay (honest numbers only)', () => {
  it('is hidden until asked for with D, and says "—" for what has not been measured', async () => {
    const { network } = await inLobby();
    network.roomUpdated(network.last, 'PLAYING', twoPlayers);
    await flush();
    expect(screen.queryByLabelText('Debug overlay')).toBeNull();
    fireEvent.keyDown(window, { key: 'd' });
    const overlay = screen.getByLabelText('Debug overlay');
    expect(overlay.textContent).toMatch(/FPS \(rendered frames\)—/);
    expect(overlay.textContent).toMatch(/Console ⇄ server round trip—/);
    fireEvent.keyDown(window, { key: 'D' });
    expect(screen.queryByLabelText('Debug overlay')).toBeNull();
  });

  it('shows measured values once frames have run, and never claims network or photon latency', async () => {
    const { network, raf, setNow } = await inLobby({ debug: true });
    network.roomUpdated(network.last, 'PLAYING', twoPlayers);
    await flush();
    for (let t = 17; t <= 340; t += 17) {
      setNow(t);
      act(() => raf.fire(t));
    }
    fireEvent.keyDown(window, { key: 'd' });
    fireEvent.keyDown(window, { key: 'd' });
    const text = screen.getByLabelText('Debug overlay').textContent ?? '';
    expect(text).toMatch(/FPS \(rendered frames\)5\d/);
    expect(text).toMatch(/not network latency and not input-to-photon latency/);
    expect(text).not.toMatch(/photon latency\s*\d/i);
  });
});

describe('settings persist across navigation', () => {
  const openSettings = () => fireEvent.click(button('Settings'));

  it('Settings → change a value → Back → Settings: the value is kept (and remembered across visits)', async () => {
    window.localStorage.clear();
    setup({ gameId: 'foomerang-fu' });
    openSettings();
    expect(screen.getByRole('heading', { name: 'Display' })).toBeTruthy();
    const row = screen.getByRole('button', { name: /Text Size/ });
    expect(row.textContent).toContain('Normal');
    act(() => row.focus());
    press('ArrowRight');
    expect(screen.getByRole('button', { name: /Text Size/ }).textContent).toContain('Large');
    expect(document.documentElement.dataset['textSize']).toBe('large'); // immediate, real effect
    press('Escape'); // row → its category
    press('Escape'); // category → Home
    await flush();
    expect(button('Foomerang Fu')).toBeTruthy();
    openSettings();
    expect(screen.getByRole('button', { name: /Text Size/ }).textContent).toContain('Large');
    expect(window.localStorage.getItem('foomerang.shell.settings')).toContain('"textSize":"large"');
    window.localStorage.clear();
    delete document.documentElement.dataset['textSize'];
  });

  it('offers only settings that work today', async () => {
    window.localStorage.clear();
    setup();
    openSettings();
    for (const forbidden of [
      'Master Volume',
      'Music',
      'Screen Shake',
      'Effects Intensity',
      'SFX',
    ]) {
      expect(document.body.textContent).not.toContain(forbidden);
    }
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(
      expect.arrayContaining(['Display', 'Accessibility', 'Controllers', 'Network', 'About']),
    );
  });
});

describe('Settings › Network speaks plainly', () => {
  it('shows what to do about an unreachable address, with no variable names or URLs', async () => {
    window.localStorage.clear();
    setup({
      warnings: [
        'The controller URL points at this computer (localhost). Set FOOMERANG_CONTROLLER_URL to http://192.168.1.20:5173.',
      ],
    });
    fireEvent.click(button('Settings'));
    act(() => screen.getByRole('button', { name: 'Network' }).focus());
    act(() => screen.getByRole('button', { name: /Phones Join At/ }).focus());
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/open as “localhost”/);
    expect(text).toMatch(/Wi-Fi address/);
    expect(text).not.toMatch(/FOOMERANG_|environment|variable|URL/);
  });
});

describe('system bar: every destination does something real', () => {
  it('Players with no room explains how to start one; Controllers and Help and About open sheets', async () => {
    setup({ gameId: 'foomerang-fu' });
    fireEvent.click(button('Players'));
    expect(screen.getByRole('dialog', { name: 'Players' }).textContent).toMatch(/press PLAY/);
    press('Escape');
    await act(async () => void (await new Promise((r) => setTimeout(r, 250))));
    for (const name of ['Controllers', 'Help', 'About']) {
      fireEvent.click(button(name));
      expect(screen.getByRole('dialog').getAttribute('aria-label')).toMatch(new RegExp(name));
      press('Escape');
      await act(async () => void (await new Promise((r) => setTimeout(r, 250))));
    }
  });
});

describe('the shell never touches the session itself', () => {
  it('sanity: the host session reports the real room code the screen shows', async () => {
    const { runtime } = await inLobby();
    expect(runtime.session.getState().joinCode).toBe(code());
  });
});

// ---------------------------------------------------------------------------------------------
// Checkpoint B: a phone operates the console. Nothing below touches the keyboard or the mouse.
// ---------------------------------------------------------------------------------------------

/** jsdom has no layout: give every button a place in document order (one column), so spatial focus works. */
function layoutInDocumentOrder() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const all = [...document.querySelectorAll('button')];
    const y = Math.max(0, all.indexOf(this as HTMLButtonElement)) * 100;
    return {
      x: 0,
      y,
      width: 200,
      height: 80,
      left: 0,
      top: y,
      right: 200,
      bottom: y + 80,
      toJSON: () => ({}),
    };
  });
}

function phone(ctx: Awaited<ReturnType<typeof inLobby>>, playerId = 'a') {
  let t = 0;
  let seq = 0;
  let ev = 0;
  const later = () => ctx.setNow((t += 1_000)); // past every gate: each step is a deliberate act
  const event = async (action: string, phase: 'pressed' | 'released') => {
    ctx.network.last.deliver({
      type: 'PLAYER_INPUT',
      payload: {
        playerId,
        input: { kind: 'ACTION', eventId: `ev-${playerId}-${(ev += 1)}-x`, action, phase },
      },
    });
    await flush();
  };
  return {
    /** A full press: down, then up. */
    async tap(action: 'PRIMARY' | 'SECONDARY' | 'TERTIARY' | 'MENU') {
      later();
      await event(action, 'pressed');
      await event(action, 'released');
    },
    async stick(x: number, y: number) {
      later();
      ctx.network.last.deliver({
        type: 'PLAYER_INPUT',
        payload: { playerId, input: { kind: 'MOVE', seq: (seq += 1), x, y } },
      });
      await flush();
      ctx.network.last.deliver({
        type: 'PLAYER_INPUT',
        payload: { playerId, input: { kind: 'MOVE', seq: (seq += 1), x: 0, y: 0 } },
      });
      await flush();
    },
  };
}
const SELECT = 'PRIMARY';
const BACK = 'SECONDARY';
const waitOutAnimation = () => act(async () => void (await new Promise((r) => setTimeout(r, 250))));

describe('a phone operates the console (no keyboard, no mouse)', () => {
  it('lobby: the phone’s BACK asks to close the room on the TV, and its SELECT answers (Cancel first)', async () => {
    const ctx = await inLobby({ gameId: 'foomerang-fu' });
    ctx.network.roomUpdated(ctx.network.last, 'LOBBY', twoPlayers);
    await flush();
    const alvin = phone(ctx);
    await alvin.tap(BACK);
    expect(screen.getByRole('dialog', { name: 'Close this room?' })).toBeTruthy();
    expect(document.activeElement).toBe(button('Cancel'));
    await alvin.tap(SELECT);
    await waitOutAnimation();
    expect(screen.queryByRole('dialog', { name: 'Close this room?' })).toBeNull();
    expect(code()).toBe('K7M4PX');
  });

  it('lobby: the phone’s SELECT presses START when it is focused', async () => {
    const layout = layoutInDocumentOrder();
    try {
      const ctx = await inLobby({ gameId: 'foomerang-fu' });
      ctx.network.roomUpdated(ctx.network.last, 'LOBBY', twoPlayers);
      await flush();
      const alvin = phone(ctx);
      for (let i = 0; i < 12 && document.activeElement !== button(START); i += 1)
        await alvin.stick(0, 1);
      expect(document.activeElement).toBe(button(START));
      await alvin.tap(SELECT);
      expect(ctx.network.last.of('MATCH_START')).toHaveLength(1);
    } finally {
      layout.mockRestore();
    }
  });

  it('match: PAUSE on the phone opens the pause menu on the TV; SELECT on Resume resumes', async () => {
    const ctx = await inLobby({ gameId: 'foomerang-fu' });
    ctx.network.roomUpdated(ctx.network.last, 'PLAYING', twoPlayers);
    await flush();
    const david = phone(ctx, 'b');
    await david.tap('MENU');
    expect(ctx.runtime.context()).toBe('PAUSED');
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeTruthy();
    expect(document.activeElement).toBe(button('Resume'));
    await phone(ctx, 'a').tap(SELECT); // anyone may operate the shared menu
    expect(ctx.runtime.context()).toBe('GAMEPLAY');
    await waitOutAnimation();
    expect(screen.queryByRole('dialog', { name: 'Paused' })).toBeNull();
  });

  it('match: BACK in the pause menu resumes too (there is always a way out)', async () => {
    const ctx = await inLobby({ gameId: 'foomerang-fu' });
    ctx.network.roomUpdated(ctx.network.last, 'PLAYING', twoPlayers);
    await flush();
    const alvin = phone(ctx);
    await alvin.tap('MENU');
    await alvin.tap(BACK);
    expect(ctx.runtime.context()).toBe('GAMEPLAY');
  });

  it('match: leaving from the pause menu is confirmed on the TV, starting on Cancel; only a deliberate confirm ends it', async () => {
    const layout = layoutInDocumentOrder();
    try {
      const ctx = await inLobby({ gameId: 'foomerang-fu' });
      ctx.network.roomUpdated(ctx.network.last, 'PLAYING', twoPlayers);
      await flush();
      const alvin = phone(ctx);
      await alvin.tap('MENU');
      await alvin.stick(0, 1);
      expect(document.activeElement).toBe(button('Return to Lobby'));
      await alvin.tap(SELECT);
      expect(screen.getByRole('dialog', { name: 'Leave this match?' })).toBeTruthy();
      expect(document.activeElement).toBe(button('Cancel'));
      await alvin.tap(SELECT); // a stray press: nothing is lost
      await waitOutAnimation();
      expect(ctx.network.last.of('MATCH_END')).toHaveLength(0);
      expect(ctx.runtime.context()).toBe('PAUSED');

      await alvin.tap(SELECT); // Return to Lobby again (focus came back to it)
      await alvin.stick(0, 1); // Cancel → the confirm button
      expect(document.activeElement).toBe(
        screen.getAllByRole('button', { name: 'Return to Lobby' }).at(-1),
      );
      await alvin.tap(SELECT);
      expect(ctx.network.last.of('MATCH_END')).toHaveLength(1);
      expect(ctx.runtime.director.inMatch).toBe(false);
    } finally {
      layout.mockRestore();
    }
  });

  it('match: the TV’s own Esc opens the same pause menu (one focus system, every device)', async () => {
    const ctx = await inLobby({ gameId: 'foomerang-fu' });
    ctx.network.roomUpdated(ctx.network.last, 'PLAYING', twoPlayers);
    await flush();
    press('Escape');
    expect(ctx.runtime.context()).toBe('PAUSED');
    expect(screen.getByRole('dialog', { name: 'Paused' })).toBeTruthy();
  });
});
