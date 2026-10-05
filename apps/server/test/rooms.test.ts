import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRig, msg, type Rig } from './support/rig';

let rig: Rig;
beforeEach(async () => {
  const controller = {
    orientation: 'landscape',
    controls: [{ id: 'MOVE', type: 'joystick' }],
  } as const;
  rig = createRig({
    games: {
      'foomerang-fu': { minPlayers: 2, maxPlayers: 6, controller },
      duo: { minPlayers: 2, maxPlayers: 2, controller },
    },
  });
  await rig.start();
});
afterEach(async () => {
  await rig.stop();
});

const roster = (host: ReturnType<Rig['host']>['client']) =>
  host.last('ROOM_UPDATED')?.payload.players ?? [];

describe('creating a room', () => {
  it('gives the console a join code and a host credential, then a first roster', () => {
    const { client, joinCode, hostToken } = rig.host();
    expect(joinCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
    expect(hostToken.length).toBeGreaterThan(0);
    expect(client.last('ROOM_UPDATED')?.payload).toEqual({
      joinCode,
      state: 'LOBBY',
      hostConnection: 'CONNECTED',
      players: [],
    });
  });

  it('an unknown game is UNKNOWN_GAME and creates nothing', () => {
    const console = rig.connect('console');
    console.send(msg.create('no-such-game'));
    expect(console.errors()).toEqual(['UNKNOWN_GAME']);
    expect(console.last('ROOM_CREATED')).toBeUndefined();
  });

  it('applies the game’s own capacity, not a platform constant', () => {
    const { joinCode } = rig.host('duo');
    rig.player(joinCode, 'A');
    rig.player(joinCode, 'B');
    const third = rig.connect('controller');
    third.send(msg.join(joinCode, 'C'));
    expect(third.errors()).toEqual(['ROOM_FULL']);
  });

  it('two rooms get different codes and are isolated from each other', () => {
    const one = rig.host();
    const two = rig.host();
    expect(one.joinCode).not.toBe(two.joinCode);
    rig.player(one.joinCode, 'A');
    expect(roster(one.client)).toHaveLength(1);
    expect(roster(two.client)).toHaveLength(0);
  });
});

describe('joining a room', () => {
  it('seats the player, hands them their own credential, and shows the host', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    expect(alice.client.last('ROOM_JOINED')?.payload.playerId).toBe(alice.playerId);
    expect(roster(host)).toEqual([
      { playerId: alice.playerId, displayName: 'Alice', connection: 'CONNECTED', seat: 'HELD' },
    ]);
  });

  it('accepts the join code in any case', () => {
    const { joinCode } = rig.host();
    const client = rig.connect('controller');
    client.send(msg.join(joinCode.toLowerCase(), 'Lower'));
    expect(client.last('ROOM_JOINED')).toBeDefined();
  });

  it('gives each player a distinct identity and credential', () => {
    const { joinCode } = rig.host();
    const a = rig.player(joinCode, 'A');
    const b = rig.player(joinCode, 'B');
    expect(a.playerId).not.toBe(b.playerId);
    expect(a.reconnectToken).not.toBe(b.reconnectToken);
  });

  it.each([
    ['an unknown join code', 'ZZZZZZ', 'Alvin', 'ROOM_NOT_FOUND'],
    ['a blank display name', 'LIVE', '   ', 'INVALID_DISPLAY_NAME'],
    ['an over-long display name', 'LIVE', 'x'.repeat(17), 'INVALID_DISPLAY_NAME'],
    ['a display name with control characters', 'LIVE', 'bad\u0000', 'INVALID_DISPLAY_NAME'],
  ])('%s → %s, leaving the room untouched', (_label, code, name, expected) => {
    const { client: host, joinCode } = rig.host();
    const updatesBefore = host.all('ROOM_UPDATED').length;
    const client = rig.connect('controller');
    client.send(msg.join(code === 'LIVE' ? joinCode : code, name));
    expect(client.errors()).toEqual([expected]);
    expect(host.all('ROOM_UPDATED')).toHaveLength(updatesBefore); // nothing changed, nothing broadcast
  });

  it('the seventh player of a 2–6 game is ROOM_FULL; the failed attempt consumes no seat', () => {
    const { client: host, joinCode } = rig.host();
    for (let i = 1; i <= 6; i += 1) rig.player(joinCode, `P${i}`);
    const late = rig.connect('controller');
    late.send(msg.join(joinCode, 'P7'));
    expect(late.errors()).toEqual(['ROOM_FULL']);
    expect(roster(host)).toHaveLength(6);
  });
});

describe('disconnect → reconnecting → disconnected → released, and the way back', () => {
  it('shows the host each stage, driven by the 1-second sweep', () => {
    const { client: host, joinCode } = rig.host();
    const { client, playerId } = rig.player(joinCode, 'Alice');
    const status = () => {
      const entry = roster(host).find((p) => p.playerId === playerId);
      return `${entry?.connection}/${entry?.seat}`;
    };

    client.drop();
    expect(status()).toBe('RECONNECTING/HELD');

    rig.advance(9_000);
    expect(status()).toBe('RECONNECTING/HELD');
    rig.advance(1_000); // 10,000 ms after the drop
    expect(status()).toBe('DISCONNECTED/HELD');
    rig.advance(49_000);
    expect(status()).toBe('DISCONNECTED/HELD');
    rig.advance(1_000); // 60,000 ms after the drop
    expect(status()).toBe('DISCONNECTED/RELEASED');
  });

  it('a new connection reclaims the SAME player and receives a NEW credential', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.drop();
    rig.advance(5_000);

    const phone = rig.connect('controller'); // a reconnect is a new transport: it handshakes again
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    const back = phone.last('PLAYER_RECONNECTED');
    expect(back?.payload.playerId).toBe(alice.playerId);
    expect(back?.payload.reconnectToken).not.toBe(alice.reconnectToken);
    expect(roster(host)[0]?.connection).toBe('CONNECTED');
    expect(roster(host)).toHaveLength(1);
  });

  it('rotation: the used credential is dead, the new one works (and rotates again)', () => {
    const { joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.drop();

    const second = rig.connect('controller');
    second.send(msg.reconnect(joinCode, alice.reconnectToken));
    const fresh = second.last('PLAYER_RECONNECTED')?.payload.reconnectToken ?? '';
    second.drop();

    const stale = rig.connect('controller');
    stale.send(msg.reconnect(joinCode, alice.reconnectToken));
    expect(stale.errors()).toEqual(['INVALID_RECONNECT_TOKEN']);

    const third = rig.connect('controller');
    third.send(msg.reconnect(joinCode, fresh));
    expect(third.last('PLAYER_RECONNECTED')?.payload.reconnectToken).not.toBe(fresh);
  });

  it('after the seat is released, reconnection is SEAT_RELEASED', () => {
    const { joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.drop();
    rig.advance(60_000);
    const phone = rig.connect('controller');
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    expect(phone.errors()).toEqual(['SEAT_RELEASED']);
  });

  it('a wrong credential or wrong code fails cleanly and does not burn the real credential', () => {
    const { joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.drop();
    const phone = rig.connect('controller');
    phone.send(msg.reconnect(joinCode, 'wrong-token'));
    phone.send(msg.reconnect('ZZZZZZ', alice.reconnectToken));
    expect(phone.errors()).toEqual(['INVALID_RECONNECT_TOKEN', 'ROOM_NOT_FOUND']);
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    expect(phone.last('PLAYER_RECONNECTED')).toBeDefined();
  });

  it('correctness does not depend on the sweep: a seat that expired is free with NO sweep having run', () => {
    const { joinCode } = rig.host('duo');
    rig.player(joinCode, 'A');
    const b = rig.player(joinCode, 'B');
    b.client.drop();

    rig.env.time += 59_999; // the clock moves; the scheduler (and therefore the sweep) does not
    const early = rig.connect('controller');
    early.send(msg.join(joinCode, 'C'));
    expect(early.errors()).toEqual(['ROOM_FULL']);

    rig.env.time += 1; // exactly 60,000 ms, still no sweep
    const late = rig.connect('controller');
    late.send(msg.join(joinCode, 'C'));
    expect(late.last('ROOM_JOINED')).toBeDefined();
  });

  it('the sweep is housekeeping that runs once per second', () => {
    const { client: host, joinCode } = rig.host();
    rig.player(joinCode, 'Alice').client.drop();
    const updates = host.all('ROOM_UPDATED').length;

    rig.env.time += 10_000; // the boundary passes, but nobody has swept yet
    rig.scheduler.advance(999);
    expect(host.all('ROOM_UPDATED')).toHaveLength(updates);
    rig.scheduler.advance(1); // the 1-second tick
    expect(host.all('ROOM_UPDATED')).toHaveLength(updates + 1);
    expect(roster(host)[0]?.connection).toBe('DISCONNECTED');
  });
});

describe('the host', () => {
  it('losing the host keeps the room and every seat; a new connection reclaims it with a new credential', () => {
    const { client: host, joinCode, hostToken } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    host.drop();
    rig.advance(3_600_000); // an hour without a host

    const refreshed = rig.connect('console');
    refreshed.send(msg.hostReconnect(joinCode, hostToken));
    const back = refreshed.last('HOST_RECONNECTED');
    expect(back?.payload.joinCode).toBe(joinCode);
    expect(back?.payload.hostToken).not.toBe(hostToken);
    expect(refreshed.last('ROOM_UPDATED')?.payload.hostConnection).toBe('CONNECTED');
    // The room survived the hour, and so did Alice’s seat (she never dropped).
    expect(refreshed.last('ROOM_UPDATED')?.payload.players[0]?.playerId).toBe(alice.playerId);
    expect(refreshed.last('ROOM_UPDATED')?.payload.players[0]?.seat).toBe('HELD');
  });

  it('the used host credential is dead afterwards, and a wrong one is UNAUTHORIZED', () => {
    const { client: host, joinCode, hostToken } = rig.host();
    host.drop();
    const second = rig.connect('console');
    second.send(msg.hostReconnect(joinCode, hostToken));
    expect(second.last('HOST_RECONNECTED')).toBeDefined();

    const third = rig.connect('console');
    third.send(msg.hostReconnect(joinCode, hostToken));
    third.send(msg.hostReconnect(joinCode, 'nonsense'));
    third.send(msg.hostReconnect('ZZZZZZ', hostToken));
    expect(third.errors()).toEqual(['UNAUTHORIZED', 'UNAUTHORIZED', 'ROOM_NOT_FOUND']);
  });

  it('player input follows the room to its new host connection', () => {
    const { client: host, joinCode, hostToken } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    host.drop();
    const next = rig.connect('console');
    next.send(msg.hostReconnect(joinCode, hostToken));
    alice.client.send(msg.move(1));
    expect(next.all('PLAYER_INPUT')).toHaveLength(1);
  });
});

describe('credential hygiene', () => {
  it('a credential reaches only its owner, and never appears in rosters, errors or diagnostics', () => {
    const { client: host, joinCode, hostToken } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    const bob = rig.player(joinCode, 'Bob');
    alice.client.drop();
    const phone = rig.connect('controller');
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    phone.send(msg.reconnect(joinCode, 'wrong'));
    rig.advance(70_000);
    const everyone = [host, alice.client, bob.client, phone];
    const secrets = rig.env.secrets;
    expect(secrets.length).toBeGreaterThan(0);

    // The host's credential reaches nobody but the host.
    for (const client of [alice.client, bob.client, phone]) {
      for (const message of client.received)
        expect(JSON.stringify(message)).not.toContain(hostToken);
    }
    // Rosters, errors, acks and routed input never carry any secret.
    const harmless = [
      'ROOM_UPDATED',
      'ERROR',
      'HEARTBEAT_ACK',
      'HANDSHAKE_ACCEPTED',
      'PLAYER_INPUT',
    ];
    for (const client of everyone) {
      for (const message of client.received) {
        if (!harmless.includes(message.type)) continue;
        for (const secret of secrets) expect(JSON.stringify(message)).not.toContain(secret);
      }
    }
    for (const secret of secrets) {
      expect(JSON.stringify(rig.server.diagnostics())).not.toContain(secret);
    }
  });
});

describe('internal faults never take the server down', () => {
  it('a throwing domain operation becomes INTERNAL_ERROR, the connection survives, and the server carries on', () => {
    const { client: host, joinCode } = rig.host();
    const client = rig.connect('controller');
    const rosterBefore = roster(host);

    rig.env.failNextPlayerId = true;
    client.send(msg.join(joinCode, 'Alice'));
    expect(client.errors()).toEqual(['INTERNAL_ERROR']);
    expect(client.closed).toBe(false);
    expect(rig.internalErrors).toHaveLength(1);
    expect(rig.server.diagnostics().internalErrors).toBe(1);
    expect(roster(host)).toEqual(rosterBefore);

    client.send(msg.join(joinCode, 'Alice')); // the very next request works
    expect(client.last('ROOM_JOINED')).toBeDefined();
  });

  it('a failing sweep is contained, counted, and does not stop later sweeps', () => {
    const { joinCode } = rig.host();
    rig.player(joinCode, 'Alice');
    rig.env.time -= 5_000; // violates the monotonic-clock contract
    expect(() => rig.scheduler.advance(1_000)).not.toThrow();
    expect(rig.server.diagnostics().internalErrors).toBeGreaterThanOrEqual(1);
    rig.env.time += 10_000; // the clock behaves again
    const before = rig.server.diagnostics().internalErrors;
    rig.scheduler.advance(1_000);
    expect(rig.server.diagnostics().internalErrors).toBe(before);
  });
});
