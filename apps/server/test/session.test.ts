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

describe('connection lifecycle: UNNEGOTIATED → ACTIVE', () => {
  it('a valid handshake activates the connection and is acknowledged', () => {
    const client = rig.raw();
    client.send(msg.handshake('controller'));
    expect(client.last('HANDSHAKE_ACCEPTED')?.payload).toEqual({ protocolVersion: 1 });
    expect(client.closed).toBe(false);
    // Now ACTIVE: ordinary messages are served.
    client.send(msg.heartbeat(7));
    expect(client.last('HEARTBEAT_ACK')).toEqual({ type: 'HEARTBEAT_ACK', seq: 7 });
  });

  it('accepts every client type', () => {
    for (const clientType of ['console', 'controller', 'native-controller'] as const) {
      const client = rig.raw();
      client.send(msg.handshake(clientType));
      expect(client.last('HANDSHAKE_ACCEPTED'), clientType).toBeDefined();
    }
  });

  it('a client cannot negotiate twice: the second handshake is an invalid message, not a re-negotiation', () => {
    const client = rig.connect('controller');
    client.send(msg.handshake('console'));
    expect(client.errors()).toEqual(['INVALID_MESSAGE']);
    expect(client.closed).toBe(false);
    client.send(msg.heartbeat(1));
    expect(client.last('HEARTBEAT_ACK')).toBeDefined();
  });
});

describe('nothing but a handshake is accepted before ACTIVE', () => {
  const messages: [string, unknown][] = [
    ['INPUT_MOVE', msg.move(1)],
    ['INPUT_EVENT', msg.press('press-000001')],
    ['HEARTBEAT', msg.heartbeat(1)],
    ['ROOM_CREATE', msg.create()],
    ['ROOM_JOIN', msg.join('K7M4PX')],
    ['PLAYER_RECONNECT', msg.reconnect('K7M4PX', 'token')],
    ['HOST_RECONNECT', msg.hostReconnect('K7M4PX', 'token')],
  ];

  it.each(messages)('%s → HANDSHAKE_REQUIRED, and the connection is closed', (_type, message) => {
    const client = rig.raw();
    client.send(message);
    expect(client.errors()).toEqual(['HANDSHAKE_REQUIRED']);
    expect(client.closed).toBe(true);
  });

  it.each([null, undefined, 'HANDSHAKE', 42, [], {}, { type: 'HANDSHAKE' }, { type: 'NOPE' }])(
    'garbage %j → INVALID_MESSAGE, and the connection is closed',
    (garbage) => {
      const client = rig.raw();
      client.send(garbage);
      expect(client.errors()).toEqual(['INVALID_MESSAGE']);
      expect(client.closed).toBe(true);
    },
  );

  it('an unsupported protocol version → UNSUPPORTED_PROTOCOL, and the connection is closed', () => {
    const client = rig.raw();
    client.send(msg.handshake('controller', 2));
    expect(client.errors()).toEqual(['UNSUPPORTED_PROTOCOL']);
    expect(client.closed).toBe(true);
    expect(client.last('HANDSHAKE_ACCEPTED')).toBeUndefined();
  });

  it('an unknown client type → INVALID_MESSAGE, and the connection is closed', () => {
    const client = rig.raw();
    client.send({
      type: 'HANDSHAKE',
      payload: { protocolVersion: 1, clientType: 'toaster', clientVersion: '0.1.0' },
    });
    expect(client.errors()).toEqual(['INVALID_MESSAGE']);
    expect(client.closed).toBe(true);
  });

  it('INPUT_MOVE then HANDSHAKE: the movement is NOT accepted and the late handshake does not rescue the connection', () => {
    const { client: host, joinCode } = rig.host();
    rig.player(joinCode);
    const before = host.all('PLAYER_INPUT').length;

    const sneaky = rig.raw();
    sneaky.send(msg.move(1));
    sneaky.send(msg.handshake('controller'));

    expect(sneaky.closed).toBe(true);
    expect(sneaky.last('HANDSHAKE_ACCEPTED')).toBeUndefined();
    expect(host.all('PLAYER_INPUT')).toHaveLength(before);
  });
});

describe('handshake timeout (5 s default, configurable, never slept for real)', () => {
  it('closes a connection that never handshakes — exactly at the deadline', () => {
    const client = rig.raw();
    rig.scheduler.advance(4_999);
    expect(client.closed).toBe(false);
    rig.scheduler.advance(1);
    expect(client.closed).toBe(true);
    expect(client.errors()).toEqual(['HANDSHAKE_REQUIRED']);
  });

  it('a connection that handshakes in time is left alone indefinitely', () => {
    const client = rig.raw();
    rig.scheduler.advance(3_000);
    client.send(msg.handshake());
    rig.scheduler.advance(60_000);
    expect(client.closed).toBe(false);
  });

  it('is cancelled when the connection closes early (no timer leaks)', () => {
    const baseline = rig.scheduler.pending; // the reconcile interval
    const client = rig.raw();
    expect(rig.scheduler.pending).toBe(baseline + 1);
    client.drop();
    expect(rig.scheduler.pending).toBe(baseline);
  });

  it('is cancelled by a successful handshake', () => {
    const baseline = rig.scheduler.pending;
    rig.connect();
    expect(rig.scheduler.pending).toBe(baseline);
  });

  it('counts timeouts', () => {
    rig.raw();
    rig.scheduler.advance(5_000);
    expect(rig.server.diagnostics().handshakeTimeouts).toBe(1);
  });

  it('is configurable', async () => {
    const custom = createRig({ handshakeTimeoutMs: 1_000 });
    await custom.start();
    const client = custom.raw();
    custom.scheduler.advance(999);
    expect(client.closed).toBe(false);
    custom.scheduler.advance(1);
    expect(client.closed).toBe(true);
    await custom.stop();
  });
});

describe('a reconnect is a NEW transport and must negotiate again', () => {
  it('a fresh connection cannot reclaim anything before its handshake', () => {
    const { joinCode } = rig.host();
    const { client, reconnectToken } = rig.player(joinCode);
    client.drop();

    const fresh = rig.raw();
    fresh.send(msg.reconnect(joinCode, reconnectToken));
    expect(fresh.errors()).toEqual(['HANDSHAKE_REQUIRED']);
    expect(fresh.closed).toBe(true);
  });
});

describe('messages after the connection has ended', () => {
  it('are ignored', () => {
    const { client: host, joinCode } = rig.host();
    const { client } = rig.player(joinCode);
    client.drop();
    const routedBefore = host.all('PLAYER_INPUT').length;
    client.send(msg.move(1)); // the fake ignores sends on a closed connection, as a real socket would
    expect(host.all('PLAYER_INPUT')).toHaveLength(routedBefore);
  });
});

describe('connection ceiling', () => {
  it('refuses connections beyond maxConnections', async () => {
    const small = createRig({ maxConnections: 2 });
    await small.start();
    const a = small.raw();
    const b = small.raw();
    const c = small.raw();
    expect(a.closed || b.closed).toBe(false);
    expect(c.closed).toBe(true);
    expect(small.server.diagnostics().connectionsRefused).toBe(1);
    await small.stop();
  });

  it('frees a slot when a connection ends', async () => {
    const small = createRig({ maxConnections: 1 });
    await small.start();
    small.raw().drop();
    expect(small.raw().closed).toBe(false);
    await small.stop();
  });
});
