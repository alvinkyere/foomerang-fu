import { afterEach, describe, expect, it } from 'vitest';
import { createFoomerangServer } from '../src/server';
import { createRig, msg, type Rig } from './support/rig';

let rig: Rig | undefined;
afterEach(async () => {
  await rig?.stop();
  rig = undefined;
});

async function start(options: Parameters<typeof createRig>[0] = {}): Promise<Rig> {
  rig = createRig(options);
  await rig.start();
  return rig;
}

describe('controller manifest delivery', () => {
  it('a joining controller receives the game’s manifest right after ROOM_JOINED', async () => {
    const r = await start();
    const { joinCode } = r.host();
    const phone = r.player(joinCode, 'Alice').client;
    const types = phone.received.map((m) => m.type);
    expect(types.indexOf('CONTROLLER_MANIFEST')).toBe(types.indexOf('ROOM_JOINED') + 1);
    expect(phone.last('CONTROLLER_MANIFEST')?.payload).toEqual({
      gameId: 'foomerang-fu',
      orientation: 'landscape',
      controls: [
        { id: 'MOVE', type: 'joystick' },
        { id: 'SLASH', type: 'button', action: 'PRIMARY' },
        { id: 'THROW', type: 'button', action: 'SECONDARY' },
      ],
    });
  });

  it('a reconnecting controller receives it again (a new connection knows nothing)', async () => {
    const r = await start();
    const { joinCode } = r.host();
    const alice = r.player(joinCode, 'Alice');
    alice.client.drop();
    const phone = r.connect('controller');
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    const types = phone.received.map((m) => m.type);
    expect(types.indexOf('CONTROLLER_MANIFEST')).toBe(types.indexOf('PLAYER_RECONNECTED') + 1);
  });

  it('comes from the GAME, not from the platform: another game advertises another controller', async () => {
    const r = await start({
      games: {
        'foomerang-fu': {
          minPlayers: 2,
          maxPlayers: 6,
          controller: { orientation: 'landscape', controls: [{ id: 'MOVE', type: 'joystick' }] },
        },
        racing: {
          minPlayers: 1,
          maxPlayers: 4,
          controller: { orientation: 'portrait', controls: [{ id: 'STEER', type: 'joystick' }] },
        },
      },
    });
    const { joinCode } = r.host('racing');
    const phone = r.player(joinCode, 'Racer').client;
    expect(phone.last('CONTROLLER_MANIFEST')?.payload).toEqual({
      gameId: 'racing',
      orientation: 'portrait',
      controls: [{ id: 'STEER', type: 'joystick' }],
    });
  });

  it('is never sent to the host, and never after a failed join', async () => {
    const r = await start();
    const { client: host, joinCode } = r.host();
    r.player(joinCode, 'Alice');
    expect(host.all('CONTROLLER_MANIFEST')).toHaveLength(0);

    const rejected = r.connect('controller');
    rejected.send(msg.join('ZZZZZZ', 'Nobody'));
    rejected.send(msg.join(joinCode, '   '));
    expect(rejected.all('CONTROLLER_MANIFEST')).toHaveLength(0);
  });

  it('a game with an invalid manifest is rejected when the server is created, not discovered by a phone', () => {
    const bad = (controller: unknown) =>
      createFoomerangServer({
        games: { broken: { minPlayers: 1, maxPlayers: 2, controller: controller as never } },
      });
    expect(() => bad({ orientation: 'landscape', controls: [] })).toThrow();
    expect(() =>
      bad({ orientation: 'upside-down', controls: [{ id: 'MOVE', type: 'joystick' }] }),
    ).toThrow();
    expect(() =>
      bad({ orientation: 'any', controls: [{ id: 'THROW', type: 'button' }] }),
    ).toThrow();
  });
});
