import { createStorageSessionStore } from '@foomerang/controller-sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  HostClient,
  memoryStorage,
  newController,
  sleep,
  startStack,
  type Controller,
  type Stack,
} from './support/harness';

// The REAL controller-sdk session, over REAL WebSockets, against the REAL server (production
// CSPRNG credentials, real clocks). No mocks anywhere on the path.

let stack: Stack;
let host: HostClient;
const controllers: Controller[] = [];

beforeEach(async () => {
  stack = await startStack();
  host = await HostClient.create(stack.url);
  await host.next('ROOM_UPDATED'); // the initial, empty roster
});

afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.session.dispose();
  host.close();
  await stack.server.stop();
});

async function joined(name = 'Alice'): Promise<Controller> {
  const controller = newController(stack.url);
  controllers.push(controller);
  controller.session.join(host.joinCode, name);
  await controller.waitForPhase('READY');
  return controller;
}

describe('joining', () => {
  it('connects, handshakes, joins and receives the manifest; the host sees the player', async () => {
    const controller = await joined('Alice');
    const state = controller.session.getState();
    expect(state).toMatchObject({ phase: 'READY', displayName: 'Alice', joinCode: host.joinCode });
    expect(state.manifest).toEqual({
      gameId: 'foomerang-fu',
      orientation: 'landscape',
      controls: [{ id: 'MOVE', type: 'joystick' }],
    });
    const roster = await host.next('ROOM_UPDATED', (m) => m.payload.players.length === 1);
    expect(roster.payload.players[0]).toMatchObject({
      playerId: state.playerId,
      displayName: 'Alice',
      connection: 'CONNECTED',
      seat: 'HELD',
    });
  });

  it('an unknown room is ROOM_NOT_FOUND, and the controller can try again', async () => {
    const controller = newController(stack.url);
    controllers.push(controller);
    controller.session.join('ZZZZZZ', 'Alice');
    await controller.waitForPhase('IDLE');
    expect(controller.session.getState().failure).toEqual({
      kind: 'SERVER',
      code: 'ROOM_NOT_FOUND',
    });
    controller.session.join(host.joinCode, 'Alice');
    await controller.waitForPhase('READY');
  });

  it('a join code typed in lower case, with spaces, still works', async () => {
    const controller = newController(stack.url);
    controllers.push(controller);
    controller.session.join(`  ${host.joinCode.toLowerCase()} `, '  Alice  ');
    await controller.waitForPhase('READY');
    expect(controller.session.getState().displayName).toBe('Alice');
  });
});

describe('input', () => {
  it('everything the SDK sends is accepted by the server: ordered, in range, nothing stale or invalid', async () => {
    const controller = await joined();
    const { playerId } = controller.session.getState();
    for (const [x, y] of [
      [1, 0],
      [0.5, -0.5],
      [0, 1],
      [-1, 0],
      [0, 0],
    ] as const) {
      controller.session.setControlValue('MOVE', { x, y });
      await sleep(40);
    }
    await sleep(300);

    const moves = host.inputs(playerId).flatMap((p) => (p.input.kind === 'MOVE' ? [p.input] : []));
    expect(moves.length).toBeGreaterThanOrEqual(5);
    expect(moves.map((m) => m.seq)).toEqual(moves.map((_, i) => i)); // 0, 1, 2, ... no gaps, no repeats
    const diagnostics = stack.server.diagnostics();
    expect(diagnostics.invalidMessages).toBe(0);
    expect(diagnostics.unauthorizedMessages).toBe(0);
    expect(diagnostics.staleMovementDiscarded).toBe(0);
    expect(diagnostics.rateLimitedMessages).toBe(0);
    expect(diagnostics.internalErrors).toBe(0);
  });

  it('holding a direction is refreshed, not flooded: about 4 per second, not 60', async () => {
    const controller = await joined();
    controller.session.setControlValue('MOVE', { x: 1, y: 0 });
    await sleep(1_100);
    const count = host.inputs(controller.session.getState().playerId).length;
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(8);
  });

  it('RELEASE is the very next thing the host hears, well before the next refresh would be due', async () => {
    const controller = await joined();
    controller.session.setControlValue('MOVE', { x: 1, y: 0 });
    await host.next(
      'PLAYER_INPUT',
      (m) => m.payload.input.kind === 'MOVE' && m.payload.input.x === 1,
    );
    controller.session.setControlValue('MOVE', { x: 0, y: 0 });
    const next = await host.next('PLAYER_INPUT');
    expect(next.payload.input).toMatchObject({ kind: 'MOVE', x: 0, y: 0 });
  });

  it('neutralize() (a lifted finger, a hidden page) reaches the host straight away', async () => {
    const controller = await joined();
    controller.session.setControlValue('MOVE', { x: 1, y: 0 });
    await host.next(
      'PLAYER_INPUT',
      (m) => m.payload.input.kind === 'MOVE' && m.payload.input.x === 1,
    );
    controller.session.neutralize();
    const next = await host.next('PLAYER_INPUT');
    expect(next.payload.input).toMatchObject({ kind: 'MOVE', x: 0, y: 0 });
  });

  it('two controllers move independently', async () => {
    const alice = await joined('Alice');
    const bob = await joined('Bob');
    alice.session.setControlValue('MOVE', { x: 1, y: 0 });
    bob.session.setControlValue('MOVE', { x: -1, y: 0 });
    await sleep(120);
    const a = host
      .inputs(alice.session.getState().playerId)
      .flatMap((p) => (p.input.kind === 'MOVE' ? [p.input.x] : []));
    const b = host
      .inputs(bob.session.getState().playerId)
      .flatMap((p) => (p.input.kind === 'MOVE' ? [p.input.x] : []));
    expect(a).toContain(1);
    expect(a).not.toContain(-1);
    expect(b).toContain(-1);
    expect(b).not.toContain(1);
  });
});

describe('connection loss', () => {
  it('drops, shows RECONNECTING, reclaims the SAME player with a rotated credential, and restarts its sequence', async () => {
    const controller = await joined();
    const { playerId } = controller.session.getState();
    const tokenBefore = controller.store.load()?.reconnectToken;
    controller.session.setControlValue('MOVE', { x: 1, y: 0 });
    await sleep(100);

    controller.transports[0]?.close(); // the network vanishes
    await controller.waitForPhase('RECONNECTING');
    const dropped = await host.next(
      'ROOM_UPDATED',
      (m) => m.payload.players[0]?.connection === 'RECONNECTING',
    );
    expect(dropped.payload.players[0]?.playerId).toBe(playerId);

    await controller.waitForPhase('READY');
    await host.next(
      'ROOM_UPDATED',
      (m) => m.payload.players[0]?.connection === 'CONNECTED' && m.payload.players.length === 1,
    );
    expect(controller.session.getState().playerId).toBe(playerId); // never a new player
    expect(controller.store.load()?.reconnectToken).not.toBe(tokenBefore); // rotated and saved
    expect(controller.transports).toHaveLength(2); // a reconnect is a new connection

    await sleep(100);
    const moves = host.inputs(playerId).flatMap((p) => (p.input.kind === 'MOVE' ? [p.input] : []));
    const restart = moves.findIndex((m, i) => i > 0 && m.seq === 0); // the new epoch begins again at 0...
    expect(restart).toBeGreaterThan(0);
    expect(moves[restart]).toMatchObject({ x: 1, y: 0 }); // ...and re-announces that the thumb is still down
    expect(stack.server.diagnostics().staleMovementDiscarded).toBe(0);
  });

  it('survives several drops in a row', async () => {
    const controller = await joined();
    for (let i = 0; i < 3; i += 1) {
      controller.transports.at(-1)?.close();
      await controller.waitForPhase('RECONNECTING');
      await controller.waitForPhase('READY');
    }
    expect(controller.transports).toHaveLength(4);
    expect(controller.session.diagnostics().reconnects).toBe(3);
    expect(
      (await host.next('ROOM_UPDATED', (m) => m.payload.players.length === 1)).payload.players,
    ).toHaveLength(1);
  });

  it('a page reload resumes the same player from the stored credential', async () => {
    const storage = memoryStorage();
    const first = newController(stack.url, createStorageSessionStore(storage));
    controllers.push(first);
    first.session.join(host.joinCode, 'Alice');
    await first.waitForPhase('READY');
    const { playerId } = first.session.getState();

    first.session.dispose(); // the tab is gone; the credential stays in storage

    const reloaded = newController(stack.url, createStorageSessionStore(storage));
    controllers.push(reloaded);
    expect(reloaded.session.resume(host.joinCode)).toBe(true);
    await reloaded.waitForPhase('READY');
    expect(reloaded.session.getState().playerId).toBe(playerId);
    const roster = await host.next(
      'ROOM_UPDATED',
      (m) => m.payload.players[0]?.connection === 'CONNECTED' && m.payload.players.length === 1,
    );
    expect(roster.payload.players).toHaveLength(1);
  });

  it('a second device taking over ends the first cleanly and never disturbs the second', async () => {
    const first = await joined('Alice');
    const { playerId } = first.session.getState();
    const stored = first.store.load();
    expect(stored).toBeDefined();

    // “Another tab”: its own storage, seeded with the same credential.
    const secondStorage = memoryStorage();
    const secondStore = createStorageSessionStore(secondStorage);
    if (stored) secondStore.save(stored);
    const second = newController(stack.url, secondStore);
    controllers.push(second);
    expect(second.session.resume()).toBe(true);
    await second.waitForPhase('READY');

    // The displaced controller finds its credential dead and stops, with a reason.
    await first.waitForPhase('ENDED');
    expect(first.session.getState().failure).toEqual({
      kind: 'SERVER',
      code: 'INVALID_RECONNECT_TOKEN',
    });

    // The player stayed CONNECTED throughout (the stale close was ignored) and input follows the second device.
    second.session.setControlValue('MOVE', { x: 0, y: 1 });
    await host.next(
      'PLAYER_INPUT',
      (m) =>
        m.payload.playerId === playerId &&
        m.payload.input.kind === 'MOVE' &&
        m.payload.input.y === 1,
    );
    const statuses = host.history.flatMap((m) =>
      m.type === 'ROOM_UPDATED' ? m.payload.players.map((p) => p.connection) : [],
    );
    expect(statuses.at(-1)).toBe('CONNECTED');
    expect(stack.server.diagnostics().staleClosesIgnored).toBeGreaterThanOrEqual(1);
  });
});

describe('leaving', () => {
  it('leave() forgets the credential and the player ends up reconnecting on the host’s roster, not as a new player', async () => {
    const controller = await joined();
    controller.session.leave();
    expect(controller.session.getState().phase).toBe('IDLE');
    expect(controller.store.load()).toBeUndefined();
    const roster = await host.next(
      'ROOM_UPDATED',
      (m) => m.payload.players[0]?.connection === 'RECONNECTING',
    );
    expect(roster.payload.players).toHaveLength(1);
  });
});
