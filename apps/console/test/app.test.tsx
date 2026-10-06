import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createConsoleRuntime } from '../src/consoleRuntime';
import type { GameId } from '../src/config';
import type { ArenaRenderer } from '../src/render/renderer';
import type { ArenaView } from '../src/render/viewModel';
import { FrameLoop } from '../src/runtime/frameLoop';
import { App } from '../src/ui/App';
import { Lobby } from '../src/ui/Lobby';
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

function setup(options: { warnings?: string[]; debug?: boolean; gameId?: GameId } = {}) {
  const clock = createClock();
  const network = new FakeHostNetwork();
  const store = new MemoryHostStore();
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
      serverUrl="http://192.168.1.20:3001"
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
    setNow: (t: number) => (hostNow = t),
  };
}

const flush = () => act(async () => void (await settle()));

async function inLobby(options?: Parameters<typeof setup>[0]) {
  const ctx = setup(options);
  fireEvent.click(screen.getByRole('button', { name: 'Create room' }));
  await flush();
  return ctx;
}

const twoPlayers = roster(
  { playerId: 'a', displayName: 'Alvin' },
  { playerId: 'b', displayName: 'David' },
);

describe('console flow: home → lobby', () => {
  it('offers exactly one thing to do: create a room (no pretend catalogue)', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Create room' })).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('shows progress, then the room code and a QR code', async () => {
    const { network } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }));
    expect(screen.getByRole('status').textContent).toMatch(/Creating a room/);
    await flush();
    expect(network.last.of('ROOM_CREATE')[0]?.payload).toEqual({ gameId: 'primitive-arena' });
    expect(screen.getByLabelText(/Room code K 7 M 4 P X/).textContent).toBe('K7M4PX');
    expect(screen.getByRole('img', { name: /QR code to join room K7M4PX/ })).toBeTruthy();
  });

  it('shows the manual code and link beside the QR; the link carries the room and nothing else', async () => {
    await inLobby();
    const url = screen.getByText(/^http:\/\/192\.168\.1\.20:5173\/\?room=K7M4PX$/);
    expect(new URL(url.textContent ?? '').searchParams.size).toBe(1);
    expect(document.body.textContent).not.toMatch(/host-token/);
  });

  it('shows a clear message, and a way to retry, when the server cannot be reached', async () => {
    const { network } = setup();
    network.refuseConnections = true;
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }));
    await flush();
    expect(screen.getByRole('alert').textContent).toMatch(/Cannot reach the game server/);
    // It says WHICH address it tried, so a wrong --host is obvious at a glance.
    expect(screen.getByRole('alert').textContent).toContain('http://192.168.1.20:3001');
    expect(screen.getByRole('button', { name: 'Create room' })).toBeTruthy();
  });

  it('warns when the QR could not work from a phone', async () => {
    await inLobby({ warnings: ['The controller URL points at this computer'] });
    expect(screen.getByRole('alert').textContent).toMatch(/points at this computer/);
  });
});

describe('which game the Create button makes', () => {
  it('creates the game the console was opened for', async () => {
    const { network } = setup({ gameId: 'foomerang-fu' });
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }));
    await flush();
    expect(network.last.of('ROOM_CREATE')[0]?.payload).toEqual({ gameId: 'foomerang-fu' });
  });

  it('presents Foomerang Fu as the game, and the arena as a platform test', async () => {
    const fu = setup({ gameId: 'foomerang-fu' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Foomerang Fu');
    fu.view.unmount();
    setup({ gameId: 'primitive-arena' });
    expect(document.body.textContent).toMatch(/Primitive arena/);
    expect(document.body.textContent).toMatch(/platform test/i);
  });

  it('the lobby names the game the room is', async () => {
    const { network } = setup({ gameId: 'foomerang-fu' });
    fireEvent.click(screen.getByRole('button', { name: 'Create room' }));
    await flush();
    network.roomUpdated(network.last, 'LOBBY', []);
    await flush();
    expect(screen.getAllByRole('heading', { level: 1 })[0]?.textContent).toBe('Foomerang Fu');
  });
});

describe('lobby roster', () => {
  it('lists players as they join, each with a number, a marker and their name — not colour alone', async () => {
    const { network } = await inLobby();
    expect(screen.getByText('Waiting for players to join…')).toBeTruthy();
    network.roomUpdated(network.last, 'LOBBY', twoPlayers);
    await flush();
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['●1AlvinConnected', '■2DavidConnected']);
  });

  it('shows a reconnecting player as such, and keeps their number', async () => {
    const { network } = await inLobby();
    network.roomUpdated(
      network.last,
      'LOBBY',
      roster({ playerId: 'a', displayName: 'Alvin', connection: 'RECONNECTING' }),
    );
    await flush();
    expect(screen.getByRole('listitem').textContent).toBe('●1AlvinReconnecting…');
  });

  it('a released seat is shown as left', async () => {
    const { network } = await inLobby();
    network.roomUpdated(
      network.last,
      'LOBBY',
      roster({ playerId: 'a', displayName: 'Alvin', connection: 'DISCONNECTED', seat: 'RELEASED' }),
    );
    await flush();
    expect(screen.getByRole('listitem').textContent).toContain('Left');
  });
});

describe('starting', () => {
  it('Start asks the server; a refusal is explained and the lobby stays', async () => {
    const { network } = await inLobby();
    network.startError = 'NOT_ENOUGH_PLAYERS';
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    await flush();
    expect(network.last.of('MATCH_START')).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toMatch(/Waiting for more players/);
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  });

  it('Start is unavailable while the console’s own connection is down', async () => {
    const { network } = await inLobby();
    network.refuseConnections = true;
    act(() => network.last.serverDrops());
    await flush();
    expect(screen.getByRole('button', { name: 'Start' }).hasAttribute('disabled')).toBe(true);
  });

  it('the arena renderer is NOT loaded while people are in the lobby', async () => {
    const { network, loadRenderer } = await inLobby();
    network.roomUpdated(network.last, 'LOBBY', twoPlayers);
    await flush();
    expect(loadRenderer).not.toHaveBeenCalled();
  });

  it('when the room starts PLAYING the arena replaces the lobby and the renderer loads once', async () => {
    const { network, loadRenderer } = await inLobby();
    network.roomUpdated(network.last, 'PLAYING', twoPlayers);
    await flush();
    expect(screen.getByTestId('arena')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(loadRenderer).toHaveBeenCalledTimes(1);
  });
});

describe('the arena', () => {
  async function playing() {
    const ctx = await inLobby(ctxOptions);
    ctx.network.roomUpdated(ctx.network.last, 'PLAYING', twoPlayers);
    await flush();
    return ctx;
  }
  const ctxOptions = undefined;

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
    expect(a?.x).toBeGreaterThan(800); // A moved right from the top spawn
    expect(b?.x).toBeCloseTo(800 + 520 * Math.cos(Math.PI / 3 - Math.PI / 2), 6); // B did not
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
    fireEvent.keyDown(window, { key: 'd' }); // close...
    fireEvent.keyDown(window, { key: 'd' }); // ...and reopen, so it renders the current numbers
    const text = screen.getByLabelText('Debug overlay').textContent ?? '';
    expect(text).toMatch(/FPS \(rendered frames\)5\d/);
    expect(text).toMatch(/not network latency and not input-to-photon latency/);
    expect(text).not.toMatch(/photon latency\s*\d/i);
  });
});

describe('losing the room', () => {
  it('a room that cannot be reclaimed ends with an explanation and a way to start over', async () => {
    const { network, clock } = await inLobby();
    network.reconnectError = 'ROOM_NOT_FOUND';
    act(() => network.last.serverDrops());
    await act(async () => {
      clock.advance(250);
      await settle();
    });
    expect(screen.getByRole('alert').textContent).toMatch(/no longer exists/);
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(screen.getByRole('button', { name: 'Create room' })).toBeTruthy();
  });
});

describe('CPU players in the lobby (Foomerang Fu)', () => {
  const lobbyWith = async (people: ReturnType<typeof roster>) => {
    const ctx = await inLobby({ gameId: 'foomerang-fu' });
    ctx.network.roomUpdated(ctx.network.last, 'LOBBY', people);
    await flush();
    return ctx;
  };
  const start = () => screen.getByRole('button', { name: 'Start' });

  it('one person alone cannot start; adding a CPU makes two participants and enables Start', async () => {
    await lobbyWith(roster({ playerId: 'a', displayName: 'Alvin' }));
    expect(start().hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/At least two players are needed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add CPU' }));
    expect(start().hasAttribute('disabled')).toBe(false);
  });

  it('the roster tells humans from CPUs, and a CPU has a name, a marker, a number and its difficulty', async () => {
    await lobbyWith(roster({ playerId: 'a', displayName: 'Alvin' }));
    fireEvent.change(screen.getByLabelText('New CPU difficulty'), { target: { value: 'HARD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add CPU' }));
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]?.textContent).toBe('●1AlvinConnected');
    expect(rows[1]?.textContent).toContain('CPU 1');
    expect(rows[1]?.textContent).toContain('CPU');
    expect((screen.getByLabelText('Difficulty of CPU 1') as HTMLSelectElement).value).toBe('HARD');
    expect(rows[1]?.textContent).toContain('■2');
  });

  it('each CPU has its own difficulty, which can be changed, and it can be removed', async () => {
    const { runtime } = await lobbyWith(roster({ playerId: 'a', displayName: 'Alvin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add CPU' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add CPU' }));
    fireEvent.change(screen.getByLabelText('Difficulty of CPU 1'), { target: { value: 'EASY' } });
    fireEvent.change(screen.getByLabelText('Difficulty of CPU 2'), { target: { value: 'HARD' } });
    expect(runtime.director.cpus.entries.map((c) => c.difficulty)).toEqual(['EASY', 'HARD']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove CPU 1' }));
    expect(runtime.director.cpus.entries.map((c) => c.name)).toEqual(['CPU 2']);
    expect(runtime.director.slots.slotOf('cpu:1')).toBeUndefined(); // its slot is free again
    expect(runtime.director.slots.slotOf('cpu:2')).toBe(2); // and the other keeps its identity
  });

  it('a match holds at most six participants: Add CPU stops at the table size, and an overfull table cannot start', async () => {
    const { runtime } = await lobbyWith(
      roster({ playerId: 'a', displayName: 'Alvin' }, { playerId: 'b', displayName: 'David' }),
    );
    const add = screen.getByRole('button', { name: 'Add CPU' });
    for (let i = 0; i < 8; i += 1) fireEvent.click(add);
    expect(runtime.director.cpus.entries).toHaveLength(4);
    expect(add.hasAttribute('disabled')).toBe(true);
    expect(start().hasAttribute('disabled')).toBe(false);
  });

  it('a person joining a full table (CPUs filled it) is told to remove a CPU and Start waits', async () => {
    const { network, runtime } = await lobbyWith(roster({ playerId: 'a', displayName: 'Alvin' }));
    for (let i = 0; i < 5; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Add CPU' }));
    expect(runtime.director.cpus.entries).toHaveLength(5);
    network.roomUpdated(
      network.last,
      'LOBBY',
      roster({ playerId: 'a', displayName: 'Alvin' }, { playerId: 'b', displayName: 'David' }),
    );
    await flush();
    expect(screen.getByRole('alert').textContent).toMatch(/remove a CPU/);
    expect(start().hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove CPU 5' }));
    expect(start().hasAttribute('disabled')).toBe(false);
  });

  it('the primitive arena (platform test) has no CPUs', async () => {
    await inLobby();
    expect(screen.queryByRole('button', { name: 'Add CPU' })).toBeNull();
  });
});

describe('game modes in the lobby (Foomerang Fu)', () => {
  const lobbyWith = async (people: ReturnType<typeof roster>) => {
    const ctx = await inLobby({ gameId: 'foomerang-fu' });
    ctx.network.roomUpdated(ctx.network.last, 'LOBBY', people);
    await flush();
    return ctx;
  };

  it('FREE FOR ALL is available and chosen; HIDE & SEEK is shown with COMING SOON', async () => {
    await lobbyWith(twoPlayers);
    const group = screen.getByRole('group', { name: 'Game mode' });
    const ffa = within(group).getByRole('radio', { name: /FREE FOR ALL/ }) as HTMLInputElement;
    const hide = within(group).getByRole('radio', { name: /HIDE & SEEK/ }) as HTMLInputElement;
    expect(ffa.checked).toBe(true);
    expect(ffa.disabled).toBe(false);
    expect(group.textContent).toContain('Available');
    expect(group.textContent).toContain('COMING SOON');
    expect(hide.disabled).toBe(true); // a genuine disabled control, not a label over a working one
    expect(hide.checked).toBe(false);
  });

  it('Hide & Seek cannot be chosen: clicking it changes nothing, and Start still starts Free For All', async () => {
    const { runtime, network } = await lobbyWith(twoPlayers);
    fireEvent.click(screen.getByRole('radio', { name: /HIDE & SEEK/ }));
    expect(runtime.director.mode.id).toBe('FREE_FOR_ALL');
    expect((screen.getByRole('radio', { name: /FREE FOR ALL/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(network.last.of('MATCH_START')).toHaveLength(1);
  });

  it('human-only: two people can start with no CPU', async () => {
    await lobbyWith(twoPlayers);
    expect(screen.getByRole('button', { name: 'Start' }).hasAttribute('disabled')).toBe(false);
  });

  it('CPU-only: with nobody on a phone, two CPUs can start (the console asks the server, which allows it)', async () => {
    const { network } = await lobbyWith(roster());
    expect(screen.getByRole('button', { name: 'Start' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Add CPU' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add CPU' }));
    expect(screen.getByRole('button', { name: 'Start' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(network.last.of('MATCH_START')).toHaveLength(1);
  });

  it('nothing adds a CPU for the host: an empty seat stays empty', async () => {
    const { runtime } = await lobbyWith(twoPlayers);
    expect(runtime.director.cpus.entries).toEqual([]);
    expect(screen.queryByText('CPU 1')).toBeNull();
  });

  it('the primitive arena (platform test) has no mode choice', async () => {
    await inLobby();
    expect(screen.queryByRole('group', { name: 'Game mode' })).toBeNull();
  });

  it('a reloaded console that lost its match says so in the lobby, in plain words', async () => {
    const clock = createClock();
    const network = new FakeHostNetwork();
    const store = new MemoryHostStore();
    store.value = { joinCode: 'K7M4PX', hostToken: 'host-token-0', gameId: 'foomerang-fu' };
    network.roomStateOnReconnect = 'PLAYING';
    const runtime = createConsoleRuntime({
      transportFactory: network.factory,
      environment: clock.environment,
      store,
      now: () => 0,
    });
    runtime.session.resume();
    await flush();
    await flush();
    render(<Lobby runtime={runtime} controllerBaseUrl={CONTROLLER} warnings={[]} />);
    expect(screen.getByText(/The match was interrupted/).textContent).toMatch(
      /Kills and\s+powerups were not kept/,
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  });
});
