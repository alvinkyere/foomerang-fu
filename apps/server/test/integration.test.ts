import { afterEach, describe, expect, it } from 'vitest';
import { createNodeEnvironment } from '../src/environment';
import { createFoomerangServer, type FoomerangServer, type ServerOptions } from '../src/server';
import { msg } from './support/rig';
import { ManualScheduler } from './support/manualScheduler';
import { RealClient } from './support/SocketIOTransportClient';

// REAL TRANSPORT: an actual Socket.IO server bound to an ephemeral port and actual Socket.IO
// clients talking WebSocket to it. Only time is simulated (so no test waits out a real timeout);
// identifiers and credentials come from the production CSPRNG environment.

interface Harness {
  server: FoomerangServer;
  port: number;
  scheduler: ManualScheduler;
  clock: { time: number };
}

const harnesses: Harness[] = [];
const clients: RealClient[] = [];

async function startServer(options: Partial<ServerOptions> = {}): Promise<Harness> {
  const scheduler = new ManualScheduler();
  const clock = { time: 1_000 };
  const server = createFoomerangServer({
    host: '127.0.0.1',
    port: 0,
    scheduler,
    environment: { ...createNodeEnvironment(), now: () => clock.time },
    ...options,
  });
  const { port } = await server.start();
  const harness = { server, port, scheduler, clock };
  harnesses.push(harness);
  return harness;
}

async function connect(h: Harness, clientType: 'console' | 'controller' | null = 'controller') {
  const client = await RealClient.connect(h.port);
  clients.push(client);
  if (clientType !== null) {
    client.send(msg.handshake(clientType));
    await client.take('HANDSHAKE_ACCEPTED');
  }
  return client;
}

async function createRoom(h: Harness) {
  const host = await connect(h, 'console');
  host.send(msg.create());
  const created = await host.take('ROOM_CREATED');
  await host.take('ROOM_UPDATED');
  return { host, joinCode: created.payload.joinCode, hostToken: created.payload.hostToken };
}

async function joinPlayer(h: Harness, host: RealClient, joinCode: string, name: string) {
  const client = await connect(h, 'controller');
  client.send(msg.join(joinCode, name));
  const joined = await client.take('ROOM_JOINED');
  await host.take('ROOM_UPDATED');
  return {
    client,
    playerId: joined.payload.playerId,
    reconnectToken: joined.payload.reconnectToken,
  };
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const harness of harnesses.splice(0)) await harness.server.stop();
});

describe('server lifecycle on a real socket', () => {
  it('binds an ephemeral port, serves, and then releases the port and every handle', async () => {
    const baseline = (process.getActiveResourcesInfo() as string[]).filter(
      (r) => r === 'TCPServerWrap',
    ).length;
    const h = await startServer();
    expect(h.port).toBeGreaterThan(0);
    const client = await connect(h, 'controller');
    expect(client.all('HANDSHAKE_ACCEPTED')).toHaveLength(1);

    await h.server.stop();

    await client.waitClosed(); // the server closed our connection
    await expect(RealClient.connect(h.port)).rejects.toBeDefined(); // nothing is listening any more
    expect(h.scheduler.pending).toBe(0); // no dangling interval or timeout
    const after = (process.getActiveResourcesInfo() as string[]).filter(
      (r) => r === 'TCPServerWrap',
    ).length;
    expect(after).toBe(baseline); // no leaked listening socket
  });

  it('stopping is idempotent and safe with clients still connected', async () => {
    const h = await startServer();
    await connect(h, 'controller');
    await connect(h, null);
    await h.server.stop();
    await expect(h.server.stop()).resolves.toBeUndefined();
  });
});

describe('transport: WebSocket only', () => {
  it('does not fall back to long-polling', async () => {
    const h = await startServer();
    await expect(RealClient.connect(h.port, { transports: ['polling'] })).rejects.toBeDefined();
    await expect(RealClient.connect(h.port, { transports: ['websocket'] })).resolves.toBeDefined();
  });
});

describe('handshake over a real socket', () => {
  it('a valid handshake is acknowledged', async () => {
    const h = await startServer();
    const client = await connect(h, 'controller');
    expect(client.all('HANDSHAKE_ACCEPTED')[0]?.payload).toEqual({ protocolVersion: 1 });
  });

  it('input before the handshake is refused with HANDSHAKE_REQUIRED and the server closes the connection', async () => {
    const h = await startServer();
    const client = await connect(h, null);
    client.send(msg.move(1));
    await expect(client.take('ERROR')).resolves.toMatchObject({
      payload: { code: 'HANDSHAKE_REQUIRED' },
    });
    await client.waitClosed();
  });

  it('an unsupported protocol version is refused and closed', async () => {
    const h = await startServer();
    const client = await connect(h, null);
    client.send(msg.handshake('controller', 2));
    await expect(client.take('ERROR')).resolves.toMatchObject({
      payload: { code: 'UNSUPPORTED_PROTOCOL' },
    });
    await client.waitClosed();
  });

  it('a connection that never handshakes is closed when the 5 s deadline passes (simulated time)', async () => {
    const h = await startServer();
    const client = await connect(h, null);
    h.scheduler.advance(4_999);
    expect(client.closed).toBe(false);
    h.scheduler.advance(1);
    await expect(client.take('ERROR')).resolves.toMatchObject({
      payload: { code: 'HANDSHAKE_REQUIRED' },
    });
    await client.waitClosed();
  });
});

describe('two independent controllers and a host', () => {
  it('creates a room, seats two players, and routes each one’s input to the host with the right identity', async () => {
    const h = await startServer();
    const { host, joinCode } = await createRoom(h);
    const alice = await joinPlayer(h, host, joinCode, 'Alice');
    const bob = await joinPlayer(h, host, joinCode, 'Bob');

    // Production credentials: 256-bit base64url, distinct, delivered only to their owners.
    expect(alice.reconnectToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(bob.reconnectToken).not.toBe(alice.reconnectToken);
    expect(alice.playerId).not.toBe(bob.playerId);

    // Simultaneous, interleaved input.
    alice.client.send(msg.move(1, 1, 0));
    bob.client.send(msg.move(1, -1, 0));
    alice.client.send(msg.move(2, 0.5, 0.5));

    const received = [
      await host.take('PLAYER_INPUT'),
      await host.take('PLAYER_INPUT'),
      await host.take('PLAYER_INPUT'),
    ];
    const by = (id: string) =>
      received.filter((m) => m.payload.playerId === id).map((m) => m.payload.input);
    expect(by(alice.playerId)).toEqual([
      { kind: 'MOVE', seq: 1, x: 1, y: 0 },
      { kind: 'MOVE', seq: 2, x: 0.5, y: 0.5 },
    ]);
    expect(by(bob.playerId)).toEqual([{ kind: 'MOVE', seq: 1, x: -1, y: 0 }]);
  });

  it('discards stale movement (1842, 1844, 1843) without disconnecting anyone', async () => {
    const h = await startServer();
    const { host, joinCode } = await createRoom(h);
    const alice = await joinPlayer(h, host, joinCode, 'Alice');
    for (const seq of [1842, 1844, 1843, 1845]) alice.client.send(msg.move(seq));

    const seen: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const input = (await host.take('PLAYER_INPUT')).payload.input;
      if (input.kind === 'MOVE') seen.push(input.seq);
    }
    expect(seen).toEqual([1842, 1844, 1845]);
    expect(h.server.diagnostics().staleMovementDiscarded).toBe(1);
    expect(alice.client.closed).toBe(false);
  });

  it('a malformed message is answered with INVALID_MESSAGE and the connection carries on', async () => {
    const h = await startServer();
    const client = await connect(h, 'controller');
    client.send({ type: 'INPUT_MOVE', seq: 'one', payload: 'nope' });
    await expect(client.take('ERROR')).resolves.toMatchObject({
      payload: { code: 'INVALID_MESSAGE' },
    });
    client.send(msg.heartbeat(5));
    await expect(client.take('HEARTBEAT_ACK')).resolves.toMatchObject({ seq: 5 });
  });

  it('a retried action event is applied once', async () => {
    const h = await startServer();
    const { host, joinCode } = await createRoom(h);
    const alice = await joinPlayer(h, host, joinCode, 'Alice');
    alice.client.send(msg.press('press-000001'));
    alice.client.send(msg.press('press-000001'));
    alice.client.send(msg.press('press-000002'));
    const ids = [await host.take('PLAYER_INPUT'), await host.take('PLAYER_INPUT')].map((m) =>
      m.payload.input.kind === 'ACTION' ? m.payload.input.eventId : 'MOVE',
    );
    expect(ids).toEqual(['press-000001', 'press-000002']);
    expect(h.server.diagnostics().duplicateEventsDiscarded).toBe(1);
  });
});

describe('disconnect, reconnect, credential rotation', () => {
  it('a dropped controller is shown as reconnecting; a NEW connection reclaims the same player with a rotated credential and a fresh sequence', async () => {
    const h = await startServer();
    const { host, joinCode } = await createRoom(h);
    const alice = await joinPlayer(h, host, joinCode, 'Alice');
    alice.client.send(msg.move(92_847));
    await host.take('PLAYER_INPUT');

    alice.client.close();
    const dropped = await host.take('ROOM_UPDATED');
    expect(dropped.payload.players[0]).toMatchObject({
      playerId: alice.playerId,
      connection: 'RECONNECTING',
      seat: 'HELD',
    });

    // A reconnect is a NEW transport connection, which handshakes again.
    const phone = await connect(h, 'controller');
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    const back = await phone.take('PLAYER_RECONNECTED');
    expect(back.payload.playerId).toBe(alice.playerId);
    expect(back.payload.reconnectToken).not.toBe(alice.reconnectToken);
    expect((await host.take('ROOM_UPDATED')).payload.players[0]?.connection).toBe('CONNECTED');

    phone.send(msg.move(0)); // the new connection restarts its sequence
    const input = (await host.take('PLAYER_INPUT')).payload;
    expect(input).toEqual({
      playerId: alice.playerId,
      input: { kind: 'MOVE', seq: 0, x: 0.5, y: 0 },
    });

    // The credential just used is dead.
    const thief = await connect(h, 'controller');
    thief.send(msg.reconnect(joinCode, alice.reconnectToken));
    await expect(thief.take('ERROR')).resolves.toMatchObject({
      payload: { code: 'INVALID_RECONNECT_TOKEN' },
    });
  });

  it('TAKEOVER: a second phone supersedes the first, the old socket is closed, and its close does NOT disconnect the player', async () => {
    const h = await startServer();
    const { host, joinCode } = await createRoom(h);
    const alice = await joinPlayer(h, host, joinCode, 'Alice');

    const newPhone = await connect(h, 'controller');
    newPhone.send(msg.reconnect(joinCode, alice.reconnectToken));
    await newPhone.take('PLAYER_RECONNECTED');
    await alice.client.waitClosed(); // the server closed the displaced socket...

    newPhone.send(msg.move(1)); // ...and the new one is fully live
    await host.take('PLAYER_INPUT');

    const statuses = host
      .all('ROOM_UPDATED')
      .flatMap((m) => m.payload.players.map((player) => player.connection)); // every roster that lists Alice
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.every((status) => status === 'CONNECTED')).toBe(true); // never RECONNECTING
    expect(h.server.diagnostics().takeovers).toBe(1);
    expect(h.server.diagnostics().staleClosesIgnored).toBe(1);
  });

  it('the host can drop and reclaim the room; players keep their seats and input follows', async () => {
    const h = await startServer();
    const { host, joinCode, hostToken } = await createRoom(h);
    const alice = await joinPlayer(h, host, joinCode, 'Alice');

    host.close();
    h.clock.time += 3_600_000;
    h.scheduler.advance(1_000);

    const newHost = await connect(h, 'console');
    newHost.send(msg.hostReconnect(joinCode, hostToken));
    const back = await newHost.take('HOST_RECONNECTED');
    expect(back.payload.hostToken).not.toBe(hostToken);
    const roster = await newHost.take('ROOM_UPDATED');
    expect(roster.payload.players[0]).toMatchObject({ playerId: alice.playerId, seat: 'HELD' });

    alice.client.send(msg.move(1));
    expect((await newHost.take('PLAYER_INPUT')).payload.playerId).toBe(alice.playerId);
  });

  it('the housekeeping sweep (driven by hand here) walks a dropped player through the stages', async () => {
    const h = await startServer();
    const { host, joinCode } = await createRoom(h);
    const alice = await joinPlayer(h, host, joinCode, 'Alice');
    alice.client.close();
    await host.take('ROOM_UPDATED'); // RECONNECTING

    h.clock.time += 10_000;
    h.scheduler.advance(1_000);
    expect((await host.take('ROOM_UPDATED')).payload.players[0]).toMatchObject({
      connection: 'DISCONNECTED',
      seat: 'HELD',
    });

    h.clock.time += 50_000;
    h.scheduler.advance(1_000);
    expect((await host.take('ROOM_UPDATED')).payload.players[0]).toMatchObject({
      connection: 'DISCONNECTED',
      seat: 'RELEASED',
    });
  });
});

describe('abuse protection on a real socket', () => {
  it('a flooding client is throttled and then cut off, and the server stays healthy for everyone else', async () => {
    const h = await startServer();
    const { host, joinCode } = await createRoom(h);
    const noisy = await joinPlayer(h, host, joinCode, 'Noisy');

    for (let seq = 0; seq < 3_000; seq += 1) noisy.client.send(msg.move(seq)); // the clock never advances: no refill
    await noisy.client.waitClosed(); // dropped > 1000 messages: disconnected
    expect(noisy.client.errors()).toContain('RATE_LIMITED');

    // An honest player can still join and play.
    const honest = await joinPlayer(h, host, joinCode, 'Honest');
    honest.client.send(msg.move(1));
    const inputs = host.all('PLAYER_INPUT');
    expect(inputs.length).toBeLessThanOrEqual(240); // the burst, no more, ever reached the host
    expect(h.server.diagnostics().rateLimitedMessages).toBeGreaterThan(1_000);
    expect(h.server.diagnostics().connectionsClosedForAbuse).toBe(1);
  }, 15_000);

  it('an oversized message ends that connection and nothing else', async () => {
    const h = await startServer({ maxPayloadBytes: 4 * 1024 });
    const { host, joinCode } = await createRoom(h);
    const victim = await joinPlayer(h, host, joinCode, 'Alice');
    const bystander = await joinPlayer(h, host, joinCode, 'Bob');

    victim.client.send({
      type: 'INPUT_MOVE',
      seq: 1,
      payload: { x: 0, y: 0 },
      junk: 'x'.repeat(64 * 1024),
    });
    await victim.client.waitClosed();

    bystander.client.send(msg.move(1));
    expect((await host.take('PLAYER_INPUT')).payload.playerId).toBe(bystander.playerId);
  });
});
