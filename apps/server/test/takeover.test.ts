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

const entry = (rigHost: ReturnType<Rig['host']>['client'], playerId: string) =>
  rigHost.last('ROOM_UPDATED')?.payload.players.find((p) => p.playerId === playerId);

// One PlayerId has at most ONE active controller binding. The binding that is current is the only
// one whose loss means “the player disconnected”.
describe('takeover: a valid credential supersedes the previous connection', () => {
  function takeover(options: { holdOldCloseEvent: boolean }) {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.connection.deferCloseEvent = options.holdOldCloseEvent;
    const newPhone = rig.connect('controller');
    newPhone.send(msg.reconnect(joinCode, alice.reconnectToken));
    return { host, joinCode, alice, newPhone };
  }

  it('the new connection becomes the player and the old one is closed by the server', () => {
    const { alice, newPhone } = takeover({ holdOldCloseEvent: false });
    expect(newPhone.last('PLAYER_RECONNECTED')?.payload.playerId).toBe(alice.playerId);
    expect(alice.client.closed).toBe(true);
    expect(rig.server.diagnostics().takeovers).toBe(1);
  });

  it('THE RACE: the displaced connection’s late close event must not disconnect the player', () => {
    const { host, alice, newPhone } = takeover({ holdOldCloseEvent: true });
    expect(entry(host, alice.playerId)?.connection).toBe('CONNECTED');

    // The old socket’s close event arrives only now, AFTER the new binding is established.
    alice.client.connection.flushClose();

    expect(entry(host, alice.playerId)?.connection).toBe('CONNECTED'); // NOT reconnecting
    expect(rig.server.diagnostics().staleClosesIgnored).toBe(1);
    newPhone.send(msg.move(1));
    expect(host.all('PLAYER_INPUT')).toHaveLength(1); // the new controller is fully live
  });

  it('the same outcome when the close event arrives immediately', () => {
    const { host, alice, newPhone } = takeover({ holdOldCloseEvent: false });
    expect(entry(host, alice.playerId)?.connection).toBe('CONNECTED');
    newPhone.send(msg.move(1));
    expect(host.all('PLAYER_INPUT')).toHaveLength(1);
    expect(rig.server.diagnostics().staleClosesIgnored).toBe(1);
  });

  it('the CURRENT connection closing does disconnect the player', () => {
    const { host, alice, newPhone } = takeover({ holdOldCloseEvent: true });
    alice.client.connection.flushClose();
    newPhone.drop();
    expect(entry(host, alice.playerId)?.connection).toBe('RECONNECTING');
  });

  it('a close event delivered twice is harmless', () => {
    const { host, alice } = takeover({ holdOldCloseEvent: true });
    alice.client.connection.flushClose();
    alice.client.connection.flushClose();
    expect(entry(host, alice.playerId)?.connection).toBe('CONNECTED');
    expect(rig.server.diagnostics().staleClosesIgnored).toBe(1);
  });

  it('the displaced connection can no longer act as the player', () => {
    const { host, alice } = takeover({ holdOldCloseEvent: true });
    alice.client.send(msg.move(1));
    alice.client.send(msg.press('press-000001'));
    expect(host.all('PLAYER_INPUT')).toHaveLength(0);
  });

  it('the displaced controller’s credential is dead: it cannot take the seat back', () => {
    const { joinCode, alice } = takeover({ holdOldCloseEvent: false });
    const again = rig.connect('controller');
    again.send(msg.reconnect(joinCode, alice.reconnectToken));
    expect(again.errors()).toEqual(['INVALID_RECONNECT_TOKEN']);
  });

  it('a chain of takeovers with every close event delayed still ends with exactly one live controller', () => {
    const { client: host, joinCode } = rig.host();
    const first = rig.player(joinCode, 'Alice');
    first.client.connection.deferCloseEvent = true;

    const second = rig.connect('controller');
    second.connection.deferCloseEvent = true;
    second.send(msg.reconnect(joinCode, first.reconnectToken));
    const secondToken = second.last('PLAYER_RECONNECTED')?.payload.reconnectToken ?? '';

    const third = rig.connect('controller');
    third.send(msg.reconnect(joinCode, secondToken));

    first.client.connection.flushClose();
    second.connection.flushClose();

    expect(entry(host, first.playerId)?.connection).toBe('CONNECTED');
    expect(rig.server.diagnostics().staleClosesIgnored).toBe(2);
    third.send(msg.move(1));
    second.send(msg.move(2));
    first.client.send(msg.move(3));
    expect(host.all('PLAYER_INPUT')).toHaveLength(1);

    third.drop();
    expect(entry(host, first.playerId)?.connection).toBe('RECONNECTING');
  });

  it('after an ordinary drop and reconnect, the late duplicate close of the OLD connection is ignored too', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.connection.deferCloseEvent = true;
    alice.client.drop(); // close event held back
    const phone = rig.connect('controller');
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    expect(entry(host, alice.playerId)?.connection).toBe('CONNECTED');
    alice.client.connection.flushClose(); // arrives late, after the new binding exists
    expect(entry(host, alice.playerId)?.connection).toBe('CONNECTED');
  });
});

describe('host takeover has the same protection', () => {
  it('a displaced host’s late close does not mark the host disconnected, and input follows the new host', () => {
    const { client: oldHost, joinCode, hostToken } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    oldHost.connection.deferCloseEvent = true;

    const newHost = rig.connect('console');
    newHost.send(msg.hostReconnect(joinCode, hostToken));
    expect(newHost.last('HOST_RECONNECTED')).toBeDefined();
    expect(oldHost.closed).toBe(true);

    oldHost.connection.flushClose();
    expect(newHost.last('ROOM_UPDATED')?.payload.hostConnection).toBe('CONNECTED');
    expect(rig.server.diagnostics().staleClosesIgnored).toBe(1);

    alice.client.send(msg.move(1));
    expect(newHost.all('PLAYER_INPUT')).toHaveLength(1);
    expect(oldHost.all('PLAYER_INPUT')).toHaveLength(0);
  });

  it('the current host closing does mark it disconnected, and players keep their seats', () => {
    const { client: host, joinCode, hostToken } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    host.drop();
    const next = rig.connect('console');
    next.send(msg.hostReconnect(joinCode, hostToken));
    expect(next.last('ROOM_UPDATED')?.payload.players[0]?.connection).toBe('CONNECTED');
    expect(next.last('ROOM_UPDATED')?.payload.players[0]?.playerId).toBe(alice.playerId);
  });
});

describe('identity never comes from the transport', () => {
  it('a player is whoever holds the credential, regardless of connection ids', () => {
    const { joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    const phone = rig.connect('controller');
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    expect(phone.connection.id).not.toBe(alice.client.connection.id);
    expect(phone.last('PLAYER_RECONNECTED')?.payload.playerId).toBe(alice.playerId);
  });
});
