import { describe, expect, it, vi } from 'vitest';
import { HostSession } from '../src/host';
import { FakeHostNetwork, MemoryHostStore, createClock, roster, settle } from './support/hostFakes';

function setup(options: { store?: MemoryHostStore; backoffMs?: number[] } = {}) {
  const clock = createClock();
  const network = new FakeHostNetwork();
  const store = options.store ?? new MemoryHostStore();
  const session = new HostSession({
    transportFactory: network.factory,
    environment: clock.environment,
    store,
    ...(options.backoffMs ? { reconnect: { backoffMs: options.backoffMs } } : {}),
  });
  return { clock, network, store, session };
}

async function created() {
  const ctx = setup();
  ctx.session.createRoom('primitive-arena');
  await settle();
  return ctx;
}

describe('HostSession: create a room', () => {
  it('connects, handshakes AS A CONSOLE, creates the room, and shows the join code', async () => {
    const { network, session } = await created();
    expect(network.last.of('HANDSHAKE')[0]?.payload).toMatchObject({ clientType: 'console' });
    expect(network.last.of('ROOM_CREATE')[0]?.payload).toEqual({ gameId: 'primitive-arena' });
    expect(session.getState()).toMatchObject({
      phase: 'ACTIVE',
      joinCode: 'K7M4PX',
      roomState: 'LOBBY',
      roster: [],
    });
  });

  it('does not create the room before the handshake is accepted', () => {
    const { network, session } = setup();
    session.createRoom('primitive-arena');
    expect(session.getState().phase).toBe('CONNECTING');
    expect(network.last.of('ROOM_CREATE')).toEqual([]);
  });

  it('reports a refused connection as CONNECTION_FAILED', async () => {
    const { network, session } = setup();
    network.refuseConnections = true;
    session.createRoom('primitive-arena');
    await settle();
    expect(session.getState()).toMatchObject({
      phase: 'IDLE',
      failure: { kind: 'CONNECTION_FAILED' },
    });
  });

  it('reports a server refusal with its code', async () => {
    const { network, session } = setup();
    network.createError = 'UNKNOWN_GAME';
    session.createRoom('nope');
    await settle();
    expect(session.getState()).toMatchObject({
      phase: 'IDLE',
      failure: { kind: 'SERVER', code: 'UNKNOWN_GAME' },
    });
  });

  it('keeps the host credential out of the UI state', async () => {
    const { session } = await created();
    expect(JSON.stringify(session.getState())).not.toContain('host-token');
  });

  it('stores the room and credential so a reload can reclaim the room', async () => {
    const { store } = await created();
    expect(store.value).toEqual({ joinCode: 'K7M4PX', hostToken: 'host-token-1' });
  });
});

describe('HostSession: roster', () => {
  it('publishes each roster snapshot, replacing the previous one', async () => {
    const { network, session } = await created();
    network.roomUpdated(network.last, 'LOBBY', roster({ playerId: 'p1', displayName: 'Alvin' }));
    await settle();
    expect(session.getState().roster.map((r) => r.displayName)).toEqual(['Alvin']);
    network.roomUpdated(
      network.last,
      'LOBBY',
      roster({ playerId: 'p1', displayName: 'Alvin' }, { playerId: 'p2', displayName: 'David' }),
    );
    await settle();
    expect(session.getState().roster.map((r) => r.displayName)).toEqual(['Alvin', 'David']);
  });

  it('notifies subscribers only when something changed', async () => {
    const { network, session } = await created();
    const listener = vi.fn();
    session.subscribe(listener);
    const same = roster({ playerId: 'p1', displayName: 'Alvin' });
    network.roomUpdated(network.last, 'LOBBY', same);
    await settle();
    const calls = listener.mock.calls.length;
    network.roomUpdated(network.last, 'LOBBY', same);
    await settle();
    expect(listener.mock.calls.length).toBe(calls);
  });

  it('ignores a malformed snapshot rather than trusting it, and counts it', async () => {
    const { network, session } = await created();
    network.last.deliver({ type: 'ROOM_UPDATED', payload: { nonsense: true } });
    network.last.deliver('garbage');
    await settle();
    expect(session.getState().roster).toEqual([]);
    expect(session.diagnostics().ignoredInbound).toBe(2);
  });
});

describe('HostSession: starting the match', () => {
  it('sends MATCH_START and then shows the room as PLAYING', async () => {
    const { network, session } = await created();
    session.startMatch();
    expect(network.last.of('MATCH_START')).toHaveLength(1);
    network.roomUpdated(network.last, 'PLAYING', roster({ playerId: 'p1', displayName: 'Alvin' }));
    await settle();
    expect(session.getState().roomState).toBe('PLAYING');
  });

  it('surfaces a refusal as a notice without leaving the room, and clears it on the next attempt', async () => {
    const { network, session } = await created();
    network.startError = 'NOT_ENOUGH_PLAYERS';
    session.startMatch();
    await settle();
    expect(session.getState()).toMatchObject({ phase: 'ACTIVE', notice: 'NOT_ENOUGH_PLAYERS' });
    network.startError = undefined;
    session.startMatch();
    expect(session.getState().notice).toBeUndefined();
  });

  it('a refusal is forgotten once the room moves on to another state', async () => {
    const { network, session } = await created();
    network.startError = 'NOT_ENOUGH_PLAYERS';
    session.startMatch();
    await settle();
    expect(session.getState().notice).toBe('NOT_ENOUGH_PLAYERS');
    network.roomUpdated(network.last, 'PLAYING', roster({ playerId: 'p1', displayName: 'Alvin' }));
    await settle();
    expect(session.getState().notice).toBeUndefined();
  });

  it('does not send MATCH_START before the room exists, even mid-connection', async () => {
    const { network, session } = setup();
    session.createRoom('primitive-arena'); // CONNECTING
    session.startMatch();
    await settle();
    expect(network.allSent('MATCH_START')).toEqual([]);
  });

  it('does nothing before the room exists', () => {
    const { network, session } = setup();
    session.startMatch();
    expect(network.transports).toHaveLength(0);
  });
});

describe('HostSession: player input', () => {
  it('forwards authenticated movement as (playerId, x, y)', async () => {
    const { network, session } = await created();
    const seen: unknown[] = [];
    session.onMovement((playerId, x, y) => seen.push([playerId, x, y]));
    network.last.deliver({
      type: 'PLAYER_INPUT',
      payload: { playerId: 'p1', input: { kind: 'MOVE', seq: 0, x: 0.5, y: -1 } },
    });
    await settle();
    expect(seen).toEqual([['p1', 0.5, -1]]);
    expect(session.diagnostics().movementReceived).toBe(1);
  });

  it('does not treat actions as movement (the primitive arena has none)', async () => {
    const { network, session } = await created();
    const handler = vi.fn();
    session.onMovement(handler);
    network.last.deliver({
      type: 'PLAYER_INPUT',
      payload: {
        playerId: 'p1',
        input: { kind: 'ACTION', eventId: 'event-0001', action: 'PRIMARY', phase: 'pressed' },
      },
    });
    await settle();
    expect(handler).not.toHaveBeenCalled();
  });

  it('a throwing movement handler cannot break the session', async () => {
    const { network, session } = await created();
    session.onMovement(() => {
      throw new Error('boom');
    });
    network.last.deliver({
      type: 'PLAYER_INPUT',
      payload: { playerId: 'p1', input: { kind: 'MOVE', seq: 0, x: 1, y: 0 } },
    });
    await settle();
    expect(session.getState().phase).toBe('ACTIVE');
  });
});

describe('HostSession: heartbeat (same-clock round trip only)', () => {
  it('measures RTT from its own request and the server’s ack', async () => {
    const { clock, session } = await created();
    expect(session.diagnostics().rttMs).toBeUndefined();
    clock.advance(2000); // the heartbeat goes out at t = 2000
    clock.advance(37); // ...and its ack is delivered 37 ms of this device's own clock later
    await settle();
    expect(session.diagnostics().rttMs).toBe(37);
  });

  it('reports no RTT when the server never acknowledges', async () => {
    const { clock, network, session } = await created();
    network.ackHeartbeats = false;
    clock.advance(10_000);
    await settle();
    expect(session.diagnostics().rttMs).toBeUndefined();
  });
});

describe('HostSession: losing and regaining the connection', () => {
  it('reclaims the SAME room with the stored credential, which rotates', async () => {
    const { clock, network, session, store } = await created();
    network.last.serverDrops();
    expect(session.getState().phase).toBe('RECONNECTING');
    expect(session.getState().joinCode).toBe('K7M4PX');
    clock.advance(250);
    await settle();
    expect(network.last.of('HOST_RECONNECT')[0]?.payload).toEqual({
      joinCode: 'K7M4PX',
      hostToken: 'host-token-1',
    });
    expect(session.getState().phase).toBe('ACTIVE');
    expect(store.value?.hostToken).toBe('host-token-2');
    expect(session.diagnostics().reconnects).toBe(1);
  });

  it('keeps the last roster visible while reconnecting', async () => {
    const { network, session } = await created();
    network.roomUpdated(network.last, 'LOBBY', roster({ playerId: 'p1', displayName: 'Alvin' }));
    await settle();
    network.last.serverDrops();
    expect(session.getState().roster).toHaveLength(1);
  });

  it('backs off between failed attempts and gives up after the budget with CONNECTION_LOST', async () => {
    const { clock, network, session } = await created();
    network.refuseConnections = true;
    network.last.serverDrops();
    for (let i = 0; i < 200; i += 1) {
      clock.advance(1000);
      await settle();
    }
    expect(session.getState()).toMatchObject({
      phase: 'ENDED',
      failure: { kind: 'CONNECTION_LOST' },
    });
    expect(clock.scheduler.pending).toBe(0);
  });

  it('ends at once when the room is gone or the credential is refused (retrying cannot fix it)', async () => {
    const { clock, network, session, store } = await created();
    network.reconnectError = 'ROOM_NOT_FOUND';
    network.last.serverDrops();
    clock.advance(250);
    await settle();
    expect(session.getState()).toMatchObject({
      phase: 'ENDED',
      failure: { kind: 'SERVER', code: 'ROOM_NOT_FOUND' },
    });
    expect(store.value).toBeUndefined();
  });

  it('retries transient refusals (e.g. rate limiting)', async () => {
    const { clock, network, session } = await created();
    network.reconnectError = 'RATE_LIMITED';
    network.last.serverDrops();
    clock.advance(250);
    await settle();
    expect(session.getState().phase).toBe('RECONNECTING');
    network.reconnectError = undefined;
    clock.advance(500);
    await settle();
    expect(session.getState().phase).toBe('ACTIVE');
  });

  it('ignores a late close event from a connection it already replaced', async () => {
    const { clock, network, session } = await created();
    const first = network.last;
    first.serverDrops();
    clock.advance(250);
    await settle();
    first.serverDrops(); // no effect: already closed, and superseded
    expect(session.getState().phase).toBe('ACTIVE');
  });
});

describe('HostSession: reload', () => {
  it('resume() reclaims a stored room instead of creating a new one', async () => {
    const store = new MemoryHostStore();
    store.value = { joinCode: 'K7M4PX', hostToken: 'host-token-0' };
    const { network, session } = setup({ store });
    expect(session.resume()).toBe(true);
    await settle();
    expect(network.last.of('ROOM_CREATE')).toEqual([]);
    expect(session.getState()).toMatchObject({ phase: 'ACTIVE', joinCode: 'K7M4PX' });
  });

  it('resume() with nothing stored does nothing', () => {
    const { network, session } = setup();
    expect(session.resume()).toBe(false);
    expect(network.transports).toHaveLength(0);
  });

  it('a stale stored credential ends in a clean failure and clears storage', async () => {
    const store = new MemoryHostStore();
    store.value = { joinCode: 'K7M4PX', hostToken: 'old' };
    const { network, session } = setup({ store });
    network.validToken = 'different';
    session.resume();
    await settle();
    expect(session.getState()).toMatchObject({
      phase: 'ENDED',
      failure: { kind: 'SERVER', code: 'UNAUTHORIZED' },
    });
    expect(store.value).toBeUndefined();
  });
});

describe('HostSession: lifecycle', () => {
  it('leave() forgets the room and returns to IDLE', async () => {
    const { session, store, clock } = await created();
    session.leave();
    expect(session.getState().phase).toBe('IDLE');
    expect(store.value).toBeUndefined();
    expect(clock.scheduler.pending).toBe(0);
  });

  it('dispose() leaves nothing scheduled and closes the socket, keeping the credential for a reload', async () => {
    const { session, store, network, clock } = await created();
    session.dispose();
    expect(network.last.closed).toBe(true);
    expect(clock.scheduler.pending).toBe(0);
    expect(store.value).toBeDefined();
    session.startMatch();
    session.createRoom('x');
    expect(network.transports).toHaveLength(1);
  });

  it('a second createRoom() while active is ignored', async () => {
    const { session, network } = await created();
    session.createRoom('primitive-arena');
    expect(network.transports).toHaveLength(1);
  });
});
