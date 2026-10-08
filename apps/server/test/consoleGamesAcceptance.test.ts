import type { ControllerViewMessage } from '@foomerang/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeEnvironment } from '../src/environment';
import { createFoomerangServer, type FoomerangServer } from '../src/server';
import { ManualScheduler } from './support/manualScheduler';
import { msg } from './support/rig';
import { RealClient } from './support/SocketIOTransportClient';

// C4 ACCEPTANCE over the REAL transport (Socket.IO over WebSocket, production CSPRNG ids and
// credentials, simulated time): games inside a console session, proven at server/protocol level.

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
  return { server, clock, connect };
}

/** Waits for this phone's next view (the console flow's CONTROLLER_CONTEXT). */
const nextView = async (phone: RealClient) =>
  (await phone.take('CONTROLLER_CONTEXT')).payload as ControllerViewMessage['payload'];

/** A round-trip through the server: everything sent before it has been processed. */
async function settle(client: RealClient) {
  client.send(msg.heartbeat(Math.floor(Math.random() * 1e6)));
  await client.take('HEARTBEAT_ACK');
}

describe('C4 acceptance: a game inside a console session, over real Socket.IO', () => {
  it('8 controllers → Fu → 6 seated, 2 WAITING → input, pause, reconnect → end → exit → relaunch → old launch is dead', async () => {
    const { server, clock, connect } = await start();

    // open the console, join 8 controllers
    const tv = await connect('console');
    tv.send(msg.consoleOpen());
    const { joinCode } = (await tv.take('CONSOLE_OPENED')).payload;
    await tv.take('CONSOLE_UPDATED');
    const phones = [];
    for (let i = 1; i <= 8; i += 1) {
      const phone = await connect('controller');
      phone.send(msg.controllerJoin(joinCode, `P${i}`));
      const joined = (await phone.take('CONTROLLER_JOINED')).payload;
      await nextView(phone);
      await phone.take('CONSOLE_STATUS');
      await tv.take('CONSOLE_UPDATED');
      phones.push({ phone, ...joined });
    }

    // launch Fu: a new launch, nobody seated
    tv.send(msg.gameLaunch());
    const launched = (await tv.take('CONSOLE_UPDATED')).payload.game;
    const game = launched?.gameSessionId ?? '';
    expect(launched?.participants).toEqual([]);
    for (const p of phones) expect((await nextView(p.phone)).participation?.status).toBe('WAITING');

    // the TV seats 6; 2 stay WAITING
    const seated = phones.slice(0, 6);
    const spare = phones.slice(6);
    tv.send(
      msg.gameParticipants(
        1,
        game,
        seated.map((p, i) => ({ controllerId: p.controllerId, seat: i + 1 })),
      ),
    );
    await tv.take('CONSOLE_UPDATED');
    for (const [i, p] of seated.entries()) {
      expect((await p.phone.take('CONTROLLER_MANIFEST')).payload.gameId).toBe('foomerang-fu');
      expect((await nextView(p.phone)).participation).toEqual({
        gameSessionId: game,
        status: 'PARTICIPANT',
        seat: i + 1,
      });
    }
    for (const p of spare) expect((await nextView(p.phone)).participation?.status).toBe('WAITING');

    // the match starts: participants GAMEPLAY, spectators WAITING
    tv.send(msg.gameMatchStart(game));
    await tv.take('CONSOLE_UPDATED');
    for (const p of seated) expect((await nextView(p.phone)).context).toBe('GAMEPLAY');
    for (const p of spare) expect((await nextView(p.phone)).context).toBe('WAITING');

    // a WAITING controller presses everything: nothing reaches the TV
    const waiting = spare[0] as (typeof spare)[number];
    waiting.phone.send(msg.move(1, 1, 0));
    waiting.phone.send(msg.action('waiting-press-1', 'PRIMARY'));
    waiting.phone.send(msg.action('waiting-menu-1', 'MENU'));
    await settle(waiting.phone);

    // a participant's input does reach the TV, as THAT controller, in THIS launch
    const alice = seated[0] as (typeof seated)[number];
    alice.phone.send(msg.move(1, 0.5, 0));
    const routed = (await tv.take('CONTROLLER_INPUT')).payload;
    expect(routed).toEqual({
      controllerId: alice.controllerId,
      gameSessionId: game,
      input: { kind: 'MOVE', seq: 1, x: 0.5, y: 0 },
    });

    // a participant pauses: one MENU reaches the TV, which pauses
    alice.phone.send(msg.action('alice-menu-1', 'MENU'));
    const menu = (await tv.take('CONTROLLER_INPUT')).payload;
    expect(menu.input).toMatchObject({ kind: 'ACTION', action: 'MENU', phase: 'pressed' });
    tv.send(msg.tvContext(1, 'PAUSED', game));
    for (const p of seated) expect((await nextView(p.phone)).context).toBe('PAUSED');
    for (const p of spare) expect((await nextView(p.phone)).context).toBe('WAITING');

    // a participant reconnects: same controller, same seat, the game's controls again
    const bob = seated[1] as (typeof seated)[number];
    const bob2 = await connect('controller');
    bob2.send(msg.controllerReconnect(joinCode, bob.reconnectToken));
    expect((await bob2.take('CONTROLLER_RECONNECTED')).payload.controllerId).toBe(bob.controllerId);
    expect((await bob2.take('CONTROLLER_MANIFEST')).payload.gameId).toBe('foomerang-fu');
    expect((await nextView(bob2)).participation).toEqual({
      gameSessionId: game,
      status: 'PARTICIPANT',
      seat: 2,
    });
    await bob.phone.waitClosed();

    // resume and end the match
    tv.send(msg.tvContext(2, 'GAMEPLAY', game));
    tv.send(msg.gameMatchEnd(game));
    await settle(tv);
    expect(tv.all('CONSOLE_UPDATED').at(-1)?.payload.game?.state).toBe('LOBBY');

    // exit: the launch and its seats are gone; all 8 remain members
    tv.send(msg.gameExit(game));
    await settle(tv);
    const home = tv.all('CONSOLE_UPDATED').at(-1)?.payload;
    expect(home?.game).toBeNull();
    expect(home?.controllers).toHaveLength(8);
    expect(home?.controllers.every((c) => c.membership === 'HELD')).toBe(true);

    // another launch is another epoch; everything aimed at the old one is dead
    clock.time += 5_000;
    tv.send(msg.gameLaunch());
    await settle(tv);
    const next = tv.all('CONSOLE_UPDATED').at(-1)?.payload.game?.gameSessionId ?? '';
    expect(next).not.toBe(game);
    const before = JSON.stringify(tv.all('CONSOLE_UPDATED').at(-1)?.payload);
    tv.send(msg.gameParticipants(2, game, [{ controllerId: alice.controllerId, seat: 1 }]));
    tv.send(msg.gameMatchStart(game));
    tv.send(msg.tvContext(3, 'PAUSED', game));
    tv.send(msg.gameExit(game));
    await settle(tv);
    expect(JSON.stringify(tv.all('CONSOLE_UPDATED').at(-1)?.payload)).toBe(before);
    expect(server.diagnostics().staleGameDiscarded).toBe(4);

    // the WAITING controller's presses never reached the TV, at any point
    const fromWaiting = tv
      .all('CONTROLLER_INPUT')
      .filter((m) => m.payload.controllerId === waiting.controllerId);
    expect(fromWaiting).toEqual([]);
    expect(server.diagnostics().internalErrors).toBe(0);
  });
});
