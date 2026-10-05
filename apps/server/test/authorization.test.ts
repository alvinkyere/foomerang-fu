import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRig, msg, type Rig } from './support/rig';

let rig: Rig;
beforeEach(async () => {
  rig = createRig();
  await rig.start();
});
afterEach(async () => {
  await rig.stop();
});

// Identity comes ONLY from credentials: never from the socket id, address, display name or join code.
describe('session authorization', () => {
  it('a controller cannot create a room or reclaim one as host', () => {
    const { joinCode, hostToken } = rig.host();
    const controller = rig.connect('controller');
    controller.send(msg.create());
    controller.send(msg.hostReconnect(joinCode, hostToken));
    expect(controller.errors()).toEqual(['UNAUTHORIZED', 'UNAUTHORIZED']);
    expect(controller.closed).toBe(false); // a rejected request is not a reason to disconnect
  });

  it('a native controller is treated as a controller', () => {
    const native = rig.connect('native-controller');
    native.send(msg.create());
    expect(native.errors()).toEqual(['UNAUTHORIZED']);
    const { joinCode } = rig.host();
    native.send(msg.join(joinCode, 'Nina'));
    expect(native.last('ROOM_JOINED')).toBeDefined();
  });

  it('a console cannot join as a player, reconnect as a player, or send controller input', () => {
    const { client: host, joinCode } = rig.host();
    const { reconnectToken } = rig.player(joinCode);
    host.send(msg.join(joinCode));
    host.send(msg.reconnect(joinCode, reconnectToken));
    host.send(msg.move(1));
    host.send(msg.press('press-000001'));
    expect(host.errors()).toEqual(['UNAUTHORIZED', 'UNAUTHORIZED', 'UNAUTHORIZED', 'UNAUTHORIZED']);
  });

  it('a console that holds NO room still cannot join, or present a player’s credential — and the attempt burns nothing', () => {
    const { joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    const bareConsole = rig.connect('console');
    bareConsole.send(msg.join(joinCode, 'Sneaky'));
    bareConsole.send(msg.reconnect(joinCode, alice.reconnectToken));
    expect(bareConsole.errors()).toEqual(['UNAUTHORIZED', 'UNAUTHORIZED']);
    expect(bareConsole.last('ROOM_JOINED')).toBeUndefined();
    expect(bareConsole.last('PLAYER_RECONNECTED')).toBeUndefined();

    // Alice's credential was neither used nor rotated: she can still reclaim her seat.
    alice.client.drop();
    const phone = rig.connect('controller');
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    expect(phone.last('PLAYER_RECONNECTED')?.payload.playerId).toBe(alice.playerId);
  });

  it('controller input before joining a room is unauthorized and goes nowhere', () => {
    const { client: host } = rig.host();
    const controller = rig.connect('controller');
    controller.send(msg.move(1));
    controller.send(msg.press('press-000001'));
    expect(controller.errors()).toEqual(['UNAUTHORIZED', 'UNAUTHORIZED']);
    expect(host.all('PLAYER_INPUT')).toHaveLength(0);
  });

  it('a connection that already holds an identity cannot take another', () => {
    const { client: host, joinCode } = rig.host();
    const { client: player } = rig.player(joinCode);
    player.send(msg.join(joinCode, 'Again'));
    player.send(msg.create());
    host.send(msg.create());
    expect(player.errors()).toEqual(['UNAUTHORIZED', 'UNAUTHORIZED']);
    expect(host.errors()).toEqual(['UNAUTHORIZED']);
    expect(host.last('ROOM_UPDATED')?.payload.players).toHaveLength(1); // no phantom second player
  });

  it('heartbeats are available to every ACTIVE connection', () => {
    for (const type of ['console', 'controller', 'native-controller'] as const) {
      const client = rig.connect(type);
      client.send(msg.heartbeat(3));
      expect(client.last('HEARTBEAT_ACK')?.seq, type).toBe(3);
    }
  });

  it('knowing a join code or a display name confers no identity', () => {
    const { joinCode } = rig.host();
    const { playerId } = rig.player(joinCode, 'Alice');
    const impostor = rig.connect('controller');
    impostor.send(msg.reconnect(joinCode, 'Alice'));
    impostor.send(msg.reconnect(joinCode, playerId)); // a playerId is not a credential
    expect(impostor.errors()).toEqual(['INVALID_RECONNECT_TOKEN', 'INVALID_RECONNECT_TOKEN']);
    impostor.send(msg.move(1));
    expect(impostor.errors().at(-1)).toBe('UNAUTHORIZED');
  });

  it('every rejection is counted for diagnostics without recording payloads', () => {
    const controller = rig.connect('controller');
    controller.send(msg.create());
    expect(rig.server.diagnostics().unauthorizedMessages).toBe(1);
  });
});
