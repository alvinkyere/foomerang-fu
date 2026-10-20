import { describe, expect, it } from 'vitest';
import { createConsoleRuntime } from '../src/consoleRuntime';
import { deriveContext } from '../src/runtime/controllerContext';
import { FakeHostNetwork, MemoryHostStore, createClock, roster, settle } from './support/hostFakes';

describe('deriveContext: the host decides what the phones’ controls mean', () => {
  const base = { roomState: 'PLAYING', manualPaused: false, matchPhase: 'PLAYING' as const };
  it('is CONSOLE whenever no match is being played', () => {
    for (const roomState of [undefined, 'LOBBY', 'STARTING', 'RESULTS', 'CLOSING']) {
      expect(deriveContext({ ...base, roomState })).toBe('CONSOLE');
    }
  });
  it('is GAMEPLAY while a match is on (including between rounds)', () => {
    expect(deriveContext(base)).toBe('GAMEPLAY');
    expect(deriveContext({ ...base, matchPhase: 'ROUND_OVER' })).toBe('GAMEPLAY');
    expect(deriveContext({ ...base, matchPhase: undefined })).toBe('GAMEPLAY');
  });
  it('is PAUSED when the host opened the pause menu', () => {
    expect(deriveContext({ ...base, manualPaused: true })).toBe('PAUSED');
  });
  it('is RESULTS once the match is over', () => {
    expect(deriveContext({ ...base, matchPhase: 'MATCH_OVER' })).toBe('RESULTS');
  });
  it('pause outranks results only while the match is still on', () => {
    expect(deriveContext({ ...base, manualPaused: true, matchPhase: 'MATCH_OVER' })).toBe('PAUSED');
  });
});

async function room(gameId = 'primitive-arena') {
  const clock = createClock();
  const network = new FakeHostNetwork();
  let now = 0;
  const runtime = createConsoleRuntime({
    transportFactory: network.factory,
    environment: clock.environment,
    store: new MemoryHostStore(),
    now: () => now,
    inputPump: false,
  });
  runtime.session.createRoom(gameId);
  await settle();
  const menu: [string, string][] = [];
  runtime.menu.subscribe((action, playerId) => menu.push([action, playerId]));
  const players = roster({ playerId: 'a', displayName: 'A' }, { playerId: 'b', displayName: 'B' });
  let seq = 0;
  let ev = 0;
  const api = {
    clock,
    network,
    runtime,
    menu,
    setNow: (t: number) => (now = t),
    contexts: () => network.last.of('CONTROLLER_CONTEXT').map((m) => m.payload?.['context']),
    async enter(state: string) {
      network.roomUpdated(network.last, state, players);
      await settle();
    },
    async move(id: string, x: number, y: number) {
      network.last.deliver({
        type: 'PLAYER_INPUT',
        payload: { playerId: id, input: { kind: 'MOVE', seq: (seq += 1), x, y } },
      });
      await settle();
    },
    async press(
      id: string,
      action: 'PRIMARY' | 'SECONDARY' | 'TERTIARY' | 'MENU',
      phase: 'pressed' | 'released' = 'pressed',
    ) {
      network.last.deliver({
        type: 'PLAYER_INPUT',
        payload: {
          playerId: id,
          input: { kind: 'ACTION', eventId: `event-${(ev += 1)}-xx`, action, phase },
        },
      });
      await settle();
    },
  };
  return api;
}

describe('character select: in a Foomerang Fu lobby every phone drives its own cursor (game-setting.mp4)', () => {
  it('a phone’s stick moves its own cursor and SLASH readies it; the shared focus hears nothing', async () => {
    const r = await room('foomerang-fu');
    await r.enter('LOBBY');
    await r.move('a', 0, -1); // up: bread → banana
    await r.move('b', 1, 0); // right, at the same moment: coffee → icecream
    await r.press('a', 'PRIMARY');
    expect(r.runtime.director.picks.pick('a')).toEqual({ character: 'banana', ready: true });
    expect(r.runtime.director.picks.pick('b')).toEqual({ character: 'icecream', ready: false });
    expect(r.menu).toEqual([]);
  });

  it('THROW un-readies (and never asks to close the room)', async () => {
    const r = await room('foomerang-fu');
    await r.enter('LOBBY');
    await r.press('a', 'PRIMARY');
    await r.press('a', 'PRIMARY', 'released');
    r.setNow(500);
    await r.press('a', 'SECONDARY');
    expect(r.runtime.director.picks.pick('a')?.ready).toBe(false);
    expect(r.menu).toEqual([]);
  });

  it('once everyone is ready, SLASH from a ready player begins the match', async () => {
    const r = await room('foomerang-fu');
    await r.enter('LOBBY');
    await r.press('a', 'PRIMARY');
    await r.press('a', 'PRIMARY', 'released');
    await r.press('b', 'PRIMARY');
    expect(r.network.last.of('MATCH_START')).toHaveLength(0);
    r.setNow(500);
    await r.press('a', 'PRIMARY');
    expect(r.network.last.of('MATCH_START')).toHaveLength(1);
  });

  it('while everyone is ready, a ready player’s ◀ ▶ changes how many bots play', async () => {
    const r = await room('foomerang-fu');
    await r.enter('LOBBY');
    await r.press('a', 'PRIMARY');
    await r.press('b', 'PRIMARY');
    await r.move('a', 1, 0);
    await r.move('a', 0, 0);
    r.setNow(500);
    await r.move('a', 1, 0);
    expect(r.runtime.director.cpus.entries).toHaveLength(2);
    await r.move('a', 0, 0);
    r.setNow(1000);
    await r.move('a', -1, 0);
    expect(r.runtime.director.cpus.entries).toHaveLength(1);
  });

  it('other games keep the one shared focus', async () => {
    const r = await room('primitive-arena');
    await r.enter('LOBBY');
    await r.move('a', 0, 1);
    expect(r.menu).toEqual([['down', 'a']]);
  });
});

describe('the runtime publishes the context and routes phone input by it', () => {
  it('a lobby is CONSOLE: the phone’s stick and buttons drive the console, not a game', async () => {
    const r = await room();
    await r.enter('LOBBY');
    await r.move('a', 0, 1);
    await r.press('a', 'PRIMARY');
    await r.press('a', 'PRIMARY', 'released');
    r.setNow(500);
    await r.press('b', 'SECONDARY');
    expect(r.menu).toEqual([
      ['down', 'a'],
      ['select', 'a'],
      ['back', 'b'],
    ]);
  });

  it('PLAYING publishes GAMEPLAY once, and gameplay input reaches the game exactly as before', async () => {
    const r = await room();
    await r.enter('PLAYING');
    expect(r.contexts().at(-1)).toBe('GAMEPLAY');
    const sent = r.contexts().length;
    await r.enter('PLAYING'); // nothing changed: nothing is re-sent
    expect(r.contexts().length).toBe(sent);
    await r.move('a', 1, 0);
    let t = 0;
    for (let i = 0; i < 18; i += 1) {
      t += 1000 / 60;
      r.setNow(t);
      r.runtime.frame(t);
    }
    const a = r.runtime.director.runtime.world?.bodies.find((b) => b.id === 'a')?.position;
    expect((a?.x ?? 0) > 850).toBe(true);
    expect(r.menu).toEqual([]);
  });

  it('pause: PAUSED is published, the game freezes, the phones navigate the menu, Resume restores GAMEPLAY', async () => {
    const r = await room();
    await r.enter('PLAYING');
    r.runtime.pause();
    expect(r.runtime.director.manualPaused).toBe(true);
    expect(r.contexts().at(-1)).toBe('PAUSED');
    await r.move('a', 0, 1);
    expect(r.menu).toEqual([['down', 'a']]);
    r.runtime.resume();
    expect(r.contexts().at(-1)).toBe('GAMEPLAY');
    expect(r.runtime.director.manualPaused).toBe(false);
  });

  it('the press that chose Resume is not a slash: gameplay sees nothing until a fresh press', async () => {
    const r = await room();
    await r.enter('PLAYING');
    r.runtime.pause();
    await r.press('a', 'PRIMARY'); // SELECT → the UI resumes
    r.runtime.resume();
    await r.press('a', 'PRIMARY', 'released');
    expect(r.runtime.director.runtime.metrics().players).toBeGreaterThan(0);
    const delivered: string[] = [];
    const real = r.runtime.director.onAction.bind(r.runtime.director);
    r.runtime.director.onAction = (a) => {
      delivered.push(`${a.action}:${a.phase}`);
      real(a);
    };
    await r.press('a', 'PRIMARY'); // a deliberate new press
    expect(delivered).toEqual(['PRIMARY:pressed']);
  });

  it('a phone’s PAUSE button pauses the match, and pressed again resumes it', async () => {
    const r = await room();
    await r.enter('PLAYING');
    await r.press('a', 'MENU');
    await r.press('a', 'MENU', 'released');
    expect(r.runtime.director.manualPaused).toBe(true);
    expect(r.contexts().at(-1)).toBe('PAUSED');
    r.setNow(1_000);
    await r.press('b', 'MENU'); // anyone may: the pause menu is shared
    await r.press('b', 'MENU', 'released');
    expect(r.runtime.director.manualPaused).toBe(false);
    expect(r.contexts().at(-1)).toBe('GAMEPLAY');
    expect(r.menu).toEqual([]); // PAUSE is never a menu press
  });

  it('PAUSE does nothing in the lobby (there is no match to pause)', async () => {
    const r = await room();
    await r.enter('LOBBY');
    await r.press('a', 'MENU');
    expect(r.runtime.director.manualPaused).toBe(false);
    expect(r.contexts().every((c) => c === 'CONSOLE')).toBe(true);
  });

  it('cannot pause outside a running match, and pause is not a way to freeze the lobby', async () => {
    const r = await room();
    await r.enter('LOBBY');
    r.runtime.pause();
    expect(r.runtime.director.manualPaused).toBe(false);
    expect(r.contexts().every((c) => c === 'CONSOLE')).toBe(true);
  });

  it('returning to the lobby ends the pause and says CONSOLE', async () => {
    const r = await room();
    await r.enter('PLAYING');
    r.runtime.pause();
    r.runtime.returnToLobby();
    await r.enter('LOBBY');
    expect(r.runtime.director.manualPaused).toBe(false);
    expect(r.contexts().at(-1)).toBe('CONSOLE');
  });

  it('a player who drops and returns starts a fresh input stream (their sequence may begin again)', async () => {
    const r = await room();
    await r.enter('LOBBY');
    await r.move('a', 0, 0); // seq 1
    r.network.roomUpdated(
      r.network.last,
      'LOBBY',
      roster(
        { playerId: 'a', displayName: 'A', connection: 'RECONNECTING' },
        { playerId: 'b', displayName: 'B' },
      ),
    );
    await settle();
    await r.enter('LOBBY');
    r.network.last.deliver({
      type: 'PLAYER_INPUT',
      payload: { playerId: 'a', input: { kind: 'MOVE', seq: 0, x: 0, y: 1 } },
    });
    await settle();
    expect(r.menu).toEqual([['down', 'a']]);
  });

  it('a secondary action offered by the console is published with the context, and withdrawn with null', async () => {
    const r = await room();
    r.runtime.setSecondaryAction('OPTIONS');
    const last = () => r.network.last.of('CONTROLLER_CONTEXT').at(-1)?.payload;
    expect(last()).toEqual({ context: 'CONSOLE', secondaryAction: { label: 'OPTIONS' } });
    r.runtime.setSecondaryAction(null);
    expect(last()).toEqual({ context: 'CONSOLE', secondaryAction: null });
  });

  it('after the host reconnects its connection, the current context is told to the server again', async () => {
    const r = await room();
    await r.enter('PLAYING');
    r.runtime.pause();
    const before = r.network.allSent('CONTROLLER_CONTEXT').length;
    r.network.refuseConnections = false;
    r.network.last.serverDrops();
    await settle();
    r.clock.advance(300);
    await settle();
    expect(r.network.allSent('CONTROLLER_CONTEXT').length).toBeGreaterThan(before);
    expect(r.network.allSent('CONTROLLER_CONTEXT').at(-1)?.payload?.['context']).toBe('PAUSED');
  });
});
