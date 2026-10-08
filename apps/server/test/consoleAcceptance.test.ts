import { afterEach, describe, expect, it } from 'vitest';
import { createNodeEnvironment } from '../src/environment';
import { createFoomerangServer, type FoomerangServer } from '../src/server';
import { ManualScheduler } from './support/manualScheduler';
import { msg } from './support/rig';
import { RealClient } from './support/SocketIOTransportClient';

// C3 ACCEPTANCE over the REAL transport: an actual Socket.IO server on an ephemeral port, actual
// Socket.IO clients over WebSocket, production CSPRNG identifiers and credentials. Only time is
// simulated. It proves Foomerang-level membership, not game operation.

const servers: FoomerangServer[] = [];
const clients: RealClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const server of servers.splice(0)) await server.stop();
});

async function start() {
  const scheduler = new ManualScheduler();
  const clock = { time: 1_000 };
  const server = createFoomerangServer({
    host: '127.0.0.1',
    port: 0,
    scheduler,
    environment: { ...createNodeEnvironment(), now: () => clock.time },
  });
  servers.push(server);
  const { port } = await server.start();
  const connect = async (clientType: 'console' | 'controller') => {
    const client = await RealClient.connect(port);
    clients.push(client);
    client.send(msg.handshake(clientType));
    await client.take('HANDSHAKE_ACCEPTED');
    return client;
  };
  return { server, connect };
}

/** Polls a condition the server reaches asynchronously (a socket close travelling back). */
async function eventually(check: () => boolean, what: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('C3 acceptance: Foomerang-level membership over real Socket.IO', () => {
  it('open → join → transport replaced → TV drop and reclaim → removal → old credential refused → close', async () => {
    const { server, connect } = await start();

    // 1. The TV opens Foomerang and obtains a join code.
    const tv = await connect('console');
    tv.send(msg.consoleOpen());
    const opened = await tv.take('CONSOLE_OPENED');
    const { joinCode } = opened.payload;
    expect((await tv.take('CONSOLE_UPDATED')).payload.controllers).toEqual([]);

    // 2. A phone joins Foomerang: a controller, told its identity, its meaning and the TV's state.
    const phone = await connect('controller');
    phone.send(msg.controllerJoin(joinCode, 'Alice'));
    const joined = await phone.take('CONTROLLER_JOINED');
    const { controllerId } = joined.payload;
    expect((await phone.take('CONTROLLER_CONTEXT')).payload).toMatchObject({
      context: 'CONSOLE',
      participation: null,
    });
    expect((await phone.take('CONSOLE_STATUS')).payload.hostConnection).toBe('CONNECTED');
    const afterJoin = await tv.take('CONSOLE_UPDATED');
    expect(afterJoin.payload.controllers).toEqual([
      { controllerId, displayName: 'Alice', connection: 'CONNECTED', membership: 'HELD' },
    ]);

    // 3. Membership survives transport replacement: a new socket presents the credential.
    const phone2 = await connect('controller');
    phone2.send(msg.controllerReconnect(joinCode, joined.payload.reconnectToken));
    const back = await phone2.take('CONTROLLER_RECONNECTED');
    expect(back.payload.controllerId).toBe(controllerId);
    expect(back.payload.reconnectToken).not.toBe(joined.payload.reconnectToken);
    await phone.waitClosed(); // the displaced socket is closed by the server
    await eventually(() => server.diagnostics().staleClosesIgnored === 1, 'the stale close');
    const afterTakeover = await tv.take('CONSOLE_UPDATED');
    expect(afterTakeover.payload.controllers[0]?.connection).toBe('CONNECTED');

    // 4. The TV disconnects: the phone hears "TV reconnecting".
    tv.close();
    await phone2.take('CONTROLLER_CONTEXT');
    expect((await phone2.take('CONSOLE_STATUS')).payload.hostConnection).toBe('CONNECTED');
    expect((await phone2.take('CONSOLE_STATUS')).payload.hostConnection).toBe('RECONNECTING');

    // 5. The TV reclaims the console: the same controller is still there.
    const tv2 = await connect('console');
    tv2.send(msg.hostReconnect(joinCode, opened.payload.hostToken));
    const reclaimed = await tv2.take('HOST_RECONNECTED');
    expect(reclaimed.payload.joinCode).toBe(joinCode);
    const snapshot = await tv2.take('CONSOLE_UPDATED');
    expect(snapshot.payload.controllers.map((c) => [c.controllerId, c.connection])).toEqual([
      [controllerId, 'CONNECTED'],
    ]);
    expect((await phone2.take('CONSOLE_STATUS')).payload.hostConnection).toBe('CONNECTED');

    // 6. The TV removes the controller: the phone is told why and closed.
    tv2.send(msg.controllerRemove(controllerId));
    expect((await phone2.take('CONSOLE_ENDED')).payload.reason).toBe('REMOVED');
    await phone2.waitClosed();
    expect((await tv2.take('CONSOLE_UPDATED')).payload.controllers).toEqual([]);

    // 7. Its old credential cannot return.
    const phone3 = await connect('controller');
    phone3.send(msg.controllerReconnect(joinCode, back.payload.reconnectToken));
    expect((await phone3.take('ERROR')).payload.code).toBe('SEAT_RELEASED');

    // 8. The console closes cleanly: the code is freed.
    tv2.send(msg.consoleClose());
    expect((await tv2.take('CONSOLE_UPDATED')).payload.state).toBe('CLOSED');
    const late = await connect('controller');
    late.send(msg.controllerJoin(joinCode, 'Late'));
    expect((await late.take('ERROR')).payload.code).toBe('ROOM_NOT_FOUND');

    // Throughout: the TV never saw a phone's credential.
    const tvSaw = JSON.stringify([...tv.history, ...tv2.history]);
    expect(tvSaw).not.toContain(joined.payload.reconnectToken);
    expect(tvSaw).not.toContain(back.payload.reconnectToken);
    expect(server.diagnostics().internalErrors).toBe(0);
  });
});
