import { afterEach, describe, expect, it } from 'vitest';
import { createControllerSession, type ControllerSession } from '../src/session';
import { createClock, FakeNetwork, MemoryStore, settle, type TestClock } from './support/fakes';

let session: ControllerSession | undefined;
afterEach(() => {
  session?.dispose();
  session = undefined;
});

interface Rig {
  net: FakeNetwork;
  clock: TestClock;
  store: MemoryStore;
  session: ControllerSession;
  phases: string[];
}

function rig(options: { store?: MemoryStore } = {}): Rig {
  const net = new FakeNetwork();
  const clock = createClock();
  const store = options.store ?? new MemoryStore();
  session = createControllerSession({
    transportFactory: net.factory,
    environment: clock.environment,
    store,
  });
  const phases: string[] = [];
  session.subscribe(() => {
    const phase = session?.getState().phase ?? '';
    if (phases.at(-1) !== phase) phases.push(phase);
  });
  return { net, clock, store, session, phases };
}

async function ready(r: Rig = rig()): Promise<Rig> {
  r.session.join(' k7m4px ', ' Alice ');
  await settle();
  expect(r.session.getState().phase).toBe('READY');
  return r;
}

const moves = (net: FakeNetwork) =>
  net.allSent('INPUT_MOVE').map((m) => ({
    seq: m.seq,
    x: m.payload?.['x'] as number,
    y: m.payload?.['y'] as number,
  }));

describe('joining', () => {
  it('connects, handshakes, joins, receives the manifest, and only then is READY', async () => {
    const r = rig();
    r.session.join(' k7m4px ', ' Alice ');
    expect(r.session.getState().phase).toBe('CONNECTING');
    await settle();

    expect(r.phases).toEqual(['CONNECTING', 'JOINING', 'READY']);
    expect(r.net.last.sent).toEqual([
      {
        type: 'HANDSHAKE',
        payload: { protocolVersion: 1, clientType: 'controller', clientVersion: '0.1.0' },
      },
      { type: 'ROOM_JOIN', payload: { joinCode: 'K7M4PX', displayName: 'Alice' } },
    ]);
    const state = r.session.getState();
    expect(state).toMatchObject({
      phase: 'READY',
      joinCode: 'K7M4PX',
      displayName: 'Alice',
      playerId: 'player-1',
    });
    expect(state.manifest?.controls).toEqual([{ id: 'MOVE', type: 'joystick' }]);
  });

  it('a join failure returns to IDLE with the server’s reason, closes the connection, and can be retried', async () => {
    const r = rig();
    r.net.joinError = 'ROOM_FULL';
    r.session.join('K7M4PX', 'Alice');
    await settle();
    expect(r.session.getState()).toMatchObject({
      phase: 'IDLE',
      failure: { kind: 'SERVER', code: 'ROOM_FULL' },
    });
    expect(r.net.last.closed).toBe(true);
    expect(r.store.value).toBeUndefined();

    r.net.joinError = undefined;
    r.session.join('K7M4PX', 'Alice');
    await settle();
    expect(r.session.getState()).toMatchObject({ phase: 'READY' });
    expect(r.session.getState().failure).toBeUndefined();
  });

  it.each(['ROOM_NOT_FOUND', 'INVALID_DISPLAY_NAME', 'ROOM_NOT_JOINABLE', 'RATE_LIMITED'] as const)(
    'reports %s',
    async (code) => {
      const r = rig();
      r.net.joinError = code;
      r.session.join('K7M4PX', 'Alice');
      await settle();
      expect(r.session.getState().failure).toEqual({ kind: 'SERVER', code });
    },
  );

  it('being unable to connect at all is CONNECTION_FAILED', async () => {
    const r = rig();
    r.net.refuseConnections = true;
    r.session.join('K7M4PX', 'Alice');
    await settle();
    expect(r.session.getState()).toMatchObject({
      phase: 'IDLE',
      failure: { kind: 'CONNECTION_FAILED' },
    });
  });

  it('ignores a second join while one is in progress or active', async () => {
    const r = rig();
    r.session.join('K7M4PX', 'Alice');
    r.session.join('ZZZZZZ', 'Mallory');
    await settle();
    r.session.join('ZZZZZZ', 'Mallory');
    expect(r.net.transports).toHaveLength(1);
    expect(r.session.getState().joinCode).toBe('K7M4PX');
  });

  it('saves the credential so a reload can resume', async () => {
    const r = await ready();
    expect(r.store.value).toEqual({
      joinCode: 'K7M4PX',
      displayName: 'Alice',
      playerId: 'player-1',
      reconnectToken: 'token-1',
    });
  });
});

describe('the SDK owns the protocol: sequence numbers, sampling and heartbeat', () => {
  it('announces neutral on the first tick, then sends real changes on the next tick', async () => {
    const r = await ready();
    r.clock.advance(17);
    r.session.setControlValue('MOVE', { x: 1, y: 0 });
    r.clock.advance(17);
    r.session.setControlValue('MOVE', { x: 0.5, y: -0.5 });
    r.clock.advance(17);
    expect(moves(r.net)).toEqual([
      { seq: 0, x: 0, y: 0 },
      { seq: 1, x: 1, y: 0 },
      { seq: 2, x: 0.5, y: -0.5 },
    ]);
  });

  it('holding a direction is refreshed ~4 times a second, not 60: 10 s sends about 41 movements', async () => {
    const r = await ready();
    r.session.setControlValue('MOVE', { x: 1, y: 0 });
    r.clock.advance(10_000);
    const sent = moves(r.net);
    expect(sent.length).toBeGreaterThanOrEqual(36);
    expect(sent.length).toBeLessThanOrEqual(44);
    expect(sent.every((m) => m.x === 1 && m.y === 0)).toBe(true);
    expect(sent.map((m) => m.seq)).toEqual(sent.map((_, i) => i)); // strictly 0, 1, 2, ...
  });

  it('RELEASE transmits promptly: neutral goes out on the very next tick', async () => {
    const r = await ready();
    r.session.setControlValue('MOVE', { x: 1, y: 0 });
    r.clock.advance(100);
    const before = moves(r.net).length;
    r.session.setControlValue('MOVE', { x: 0, y: 0 });
    r.clock.advance(17);
    const after = moves(r.net);
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)).toMatchObject({ x: 0, y: 0 });
  });

  it('neutralize() sends neutral IMMEDIATELY (timers may be throttled when the page is hidden) and never twice', async () => {
    const r = await ready();
    r.session.setControlValue('MOVE', { x: 1, y: 0 });
    r.clock.advance(40);
    const before = moves(r.net).length;
    r.session.neutralize();
    expect(moves(r.net)).toHaveLength(before + 1); // no tick needed
    expect(moves(r.net).at(-1)).toMatchObject({ x: 0, y: 0 });
    r.session.neutralize();
    expect(moves(r.net)).toHaveLength(before + 1);
  });

  it('movement set while reconnecting is announced the moment the controller is READY again', async () => {
    const r = await ready();
    r.net.refuseConnections = true;
    r.net.last.serverDrops();
    await settle();
    r.session.setControlValue('MOVE', { x: 0, y: 1 }); // the thumb keeps moving during the outage
    r.net.refuseConnections = false;
    r.clock.advance(250);
    await settle();
    expect(r.session.getState().phase).toBe('READY');
    r.clock.advance(17);
    expect(r.net.last.of('INPUT_MOVE')[0]).toMatchObject({ seq: 0, payload: { x: 0, y: 1 } });
  });

  it('the first joystick in the manifest drives movement, whatever the game calls it; others are ignored for now', async () => {
    const r = rig();
    r.net.manifest = {
      gameId: 'racing',
      orientation: 'portrait',
      controls: [
        { id: 'STEER', type: 'joystick' },
        { id: 'AIM', type: 'joystick' },
      ],
    };
    await ready(r);
    r.session.setControlValue('AIM', { x: -1, y: 0 }); // no INPUT_AIM exists yet
    r.session.setControlValue('NOT_IN_MANIFEST', { x: -1, y: 0 });
    r.clock.advance(17);
    expect(moves(r.net).every((m) => m.x === 0)).toBe(true);
    r.session.setControlValue('STEER', { x: 1, y: 0 });
    r.clock.advance(17);
    expect(moves(r.net).at(-1)).toMatchObject({ x: 1 });
  });

  it('sends a heartbeat every 2 seconds on its own sequence, and measures round trip separately', async () => {
    const r = await ready();
    r.clock.advance(1_999);
    expect(r.net.allSent('HEARTBEAT')).toHaveLength(0);
    r.clock.advance(1);
    await settle();
    r.clock.advance(2_000);
    await settle();
    expect(r.net.allSent('HEARTBEAT').map((h) => h.seq)).toEqual([0, 1]);
    expect(r.session.diagnostics().rttMs).toBeGreaterThanOrEqual(0);
  });

  it('remembers only a bounded number of unacknowledged heartbeats: a very late ack is ignored, a recent one is not', async () => {
    const r = await ready();
    r.net.ackHeartbeats = false;
    r.clock.advance(2_000 * 40); // 40 heartbeats, none acknowledged
    expect(r.net.allSent('HEARTBEAT')).toHaveLength(40);
    r.net.last.deliver({ type: 'HEARTBEAT_ACK', seq: 0 }); // long forgotten
    await settle();
    expect(r.session.diagnostics().rttMs).toBeUndefined();
    r.net.last.deliver({ type: 'HEARTBEAT_ACK', seq: 39 }); // recent: still measured
    await settle();
    expect(r.session.diagnostics().rttMs).toBeGreaterThanOrEqual(0);
  });

  it('sends nothing before READY', async () => {
    const r = rig();
    r.session.join('K7M4PX', 'Alice');
    r.clock.advance(5_000);
    expect(r.net.allSent('HEARTBEAT')).toHaveLength(0);
    expect(r.net.allSent('INPUT_MOVE')).toHaveLength(0);
  });

  it('hostile axes never reach the wire out of range', async () => {
    const r = await ready();
    r.session.setControlValue('MOVE', { x: 99, y: Number.NaN });
    r.clock.advance(17);
    r.session.setControlValue('MOVE', { x: -99, y: 99 });
    r.clock.advance(17);
    for (const m of moves(r.net)) {
      expect(Math.abs(m.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.y)).toBeLessThanOrEqual(1);
    }
  });
});

describe('losing and regaining the connection', () => {
  it('drop → RECONNECTING → same player reclaimed with the stored credential → READY, with a rotated credential and a fresh sequence', async () => {
    const r = await ready();
    r.session.setControlValue('MOVE', { x: 1, y: 0 });
    r.clock.advance(300); // the change, then one 250 ms refresh
    const oldCount = r.net.transports[0]?.of('INPUT_MOVE').length ?? 0;
    expect(oldCount).toBeGreaterThanOrEqual(2);

    r.net.last.serverDrops();
    expect(r.session.getState().phase).toBe('RECONNECTING');
    await settle();

    expect(r.session.getState().phase).toBe('READY');
    expect(r.net.transports).toHaveLength(2);
    const second = r.net.last;
    expect(second.sent[0]).toMatchObject({ type: 'HANDSHAKE' }); // a new transport negotiates again
    expect(second.sent[1]).toEqual({
      type: 'PLAYER_RECONNECT',
      payload: { joinCode: 'K7M4PX', reconnectToken: 'token-1' },
    });
    expect(r.store.value?.reconnectToken).toBe('token-2'); // rotated and saved

    r.clock.advance(17);
    expect(second.of('INPUT_MOVE')[0]).toMatchObject({ seq: 0, payload: { x: 1, y: 0 } }); // fresh epoch, state re-announced
    expect(r.session.getState().playerId).toBe('player-1');
  });

  it('sends no input while reconnecting', async () => {
    const r = await ready();
    r.net.refuseConnections = true;
    r.net.last.serverDrops();
    const sentBefore = r.net.allSent('INPUT_MOVE').length;
    r.session.setControlValue('MOVE', { x: 1, y: 0 });
    r.clock.advance(1_000);
    expect(r.net.allSent('INPUT_MOVE')).toHaveLength(sentBefore);
    expect(r.net.allSent('HEARTBEAT')).toHaveLength(0);
  });

  it('retries with backoff 250 → 500 → 1000 → 2000 ms while the network is down, then recovers', async () => {
    const r = await ready();
    r.net.refuseConnections = true;
    r.net.last.serverDrops();
    await settle();
    expect(r.net.transports).toHaveLength(2); // the immediate first attempt, refused
    for (const [wait, total] of [
      [250, 3],
      [500, 4],
      [1_000, 5],
      [2_000, 6],
      [2_000, 7],
    ] as const) {
      r.clock.advance(wait - 1);
      await settle();
      expect(r.net.transports, `before ${wait}`).toHaveLength(total - 1);
      r.clock.advance(1);
      await settle();
      expect(r.net.transports, `at ${wait}`).toHaveLength(total);
    }
    r.net.refuseConnections = false;
    r.clock.advance(2_000);
    await settle();
    expect(r.session.getState().phase).toBe('READY');
  });

  it('gives up after the reconnect budget and says the connection was lost', async () => {
    const r = await ready();
    r.net.refuseConnections = true;
    r.net.last.serverDrops();
    for (let i = 0; i < 80; i += 1) {
      r.clock.advance(1_000);
      await settle();
    }
    expect(r.session.getState()).toMatchObject({
      phase: 'ENDED',
      failure: { kind: 'CONNECTION_LOST' },
    });
    const attempts = r.net.transports.length;
    r.clock.advance(60_000);
    await settle();
    expect(r.net.transports).toHaveLength(attempts); // no more attempts
    expect(r.store.value).toBeUndefined();
  });

  it.each(['SEAT_RELEASED', 'INVALID_RECONNECT_TOKEN', 'ROOM_NOT_FOUND', 'ROOM_CLOSING'] as const)(
    '%s is final: ENDED with that reason, credential discarded, no retry storm',
    async (code) => {
      const r = await ready();
      r.net.reconnectError = code;
      r.net.last.serverDrops();
      await settle();
      expect(r.session.getState()).toMatchObject({
        phase: 'ENDED',
        failure: { kind: 'SERVER', code },
      });
      expect(r.store.value).toBeUndefined();
      const attempts = r.net.transports.length;
      r.clock.advance(10_000);
      await settle();
      expect(r.net.transports).toHaveLength(attempts);
    },
  );

  it('another device taking the seat over (our credential rotated elsewhere) ends this controller', async () => {
    const r = await ready();
    r.net.validToken = 'rotated-by-another-phone';
    r.net.last.serverDrops();
    await settle();
    expect(r.session.getState()).toMatchObject({
      phase: 'ENDED',
      failure: { kind: 'SERVER', code: 'INVALID_RECONNECT_TOKEN' },
    });
  });

  it.each(['RATE_LIMITED', 'INTERNAL_ERROR', 'HANDSHAKE_REQUIRED'] as const)(
    'a transient %s while reconnecting is retried, not final',
    async (code) => {
      const r = await ready();
      r.net.reconnectError = code;
      r.net.last.serverDrops();
      await settle();
      expect(r.session.getState().phase).toBe('RECONNECTING');
      r.net.reconnectError = undefined;
      r.clock.advance(250);
      await settle();
      expect(r.session.getState().phase).toBe('READY');
    },
  );

  it('a late or repeated close event from a superseded transport never disturbs the live one', async () => {
    const r = await ready();
    const first = r.net.last;
    first.serverDrops();
    await settle();
    expect(r.session.getState().phase).toBe('READY'); // reconnected on a new transport
    first.replayCloseEvent();
    first.replayCloseEvent();
    await settle();
    expect(r.session.getState().phase).toBe('READY');
    expect(r.net.transports).toHaveLength(2); // and it did not trigger another reconnect
  });

  it('counts reconnects for diagnostics', async () => {
    const r = await ready();
    r.net.last.serverDrops();
    await settle();
    r.net.last.serverDrops();
    await settle();
    expect(r.session.diagnostics().reconnects).toBe(2);
  });
});

describe('resuming after a page reload', () => {
  const stored = {
    joinCode: 'K7M4PX',
    displayName: 'Alice',
    playerId: 'player-1',
    reconnectToken: 'token-0',
  };

  it('uses the stored credential to reclaim the same player without asking again', async () => {
    const r = rig({ store: new MemoryStore(stored) });
    expect(r.session.resume()).toBe(true);
    expect(r.session.getState().phase).toBe('RECONNECTING');
    await settle();
    expect(r.session.getState()).toMatchObject({
      phase: 'READY',
      playerId: 'player-1',
      displayName: 'Alice',
    });
    expect(r.net.last.sent[1]).toEqual({
      type: 'PLAYER_RECONNECT',
      payload: { joinCode: 'K7M4PX', reconnectToken: 'token-0' },
    });
    expect(r.store.value?.reconnectToken).not.toBe('token-0');
  });

  it('declines when nothing is stored, or when the stored session is for a different room', () => {
    expect(rig().session.resume()).toBe(false);
    const other = rig({ store: new MemoryStore(stored) });
    expect(other.session.resume('ZZZZZZ')).toBe(false);
    expect(other.session.getState().phase).toBe('IDLE');
    expect(other.net.transports).toHaveLength(0);
    expect(rig({ store: new MemoryStore(stored) }).session.resume('k7m4px')).toBe(true);
  });

  it('a stale stored credential ends in a clear failure and is discarded', async () => {
    const r = rig({ store: new MemoryStore({ ...stored, reconnectToken: 'stale' }) });
    r.session.resume();
    await settle();
    expect(r.session.getState()).toMatchObject({
      phase: 'ENDED',
      failure: { kind: 'SERVER', code: 'INVALID_RECONNECT_TOKEN' },
    });
    expect(r.store.value).toBeUndefined();
  });

  it('only resumes from IDLE', async () => {
    const r = await ready(rig({ store: new MemoryStore(stored) }));
    expect(r.session.resume()).toBe(false);
  });
});

describe('leaving and disposing', () => {
  it('leave() closes the connection, forgets the credential, stops all timers, and returns to IDLE', async () => {
    const r = await ready();
    r.session.leave();
    expect(r.session.getState().phase).toBe('IDLE');
    expect(r.net.last.closed).toBe(true);
    expect(r.store.value).toBeUndefined();
    expect(r.clock.scheduler.pending).toBe(0);
  });

  it('dispose() leaves no timers, closes the transport, and goes silent', async () => {
    const r = await ready();
    const seen: string[] = [];
    r.session.subscribe(() => seen.push(r.session.getState().phase));
    r.session.dispose();
    expect(r.clock.scheduler.pending).toBe(0);
    expect(r.net.last.closed).toBe(true);
    r.session.setControlValue('MOVE', { x: 1, y: 0 });
    r.clock.advance(1_000);
    await settle();
    expect(seen).toEqual([]);
    expect(r.store.value).toBeDefined(); // disposing a view is not leaving the game
  });

  it('while reconnecting, dispose cancels pending retries', async () => {
    const r = await ready();
    r.net.refuseConnections = true;
    r.net.last.serverDrops();
    await settle();
    r.session.dispose();
    expect(r.clock.scheduler.pending).toBe(0);
  });
});

describe('robustness', () => {
  it('ignores garbage from the server and counts it', async () => {
    const r = await ready();
    const before = r.session.getState();
    for (const garbage of [null, 'x', 42, {}, { type: 'NOPE' }, { type: 'ROOM_JOINED' }]) {
      r.net.last.deliver(garbage);
    }
    await settle();
    expect(r.session.getState()).toBe(before);
    expect(r.session.diagnostics().ignoredInbound).toBe(6);
  });

  it('state is immutable and only replaced when it changes (safe for useSyncExternalStore)', async () => {
    const r = await ready();
    const a = r.session.getState();
    r.session.setControlValue('MOVE', { x: 1, y: 0 });
    r.clock.advance(500);
    expect(r.session.getState()).toBe(a); // movement is not UI state
    expect(Object.isFrozen(a)).toBe(true);
  });

  it('a listener that throws cannot break the session', async () => {
    const r = rig();
    r.session.subscribe(() => {
      throw new Error('bad listener');
    });
    r.session.join('K7M4PX', 'Alice');
    await settle();
    expect(r.session.getState().phase).toBe('READY');
  });

  it('unsubscribe works', async () => {
    const r = rig();
    let calls = 0;
    const off = r.session.subscribe(() => (calls += 1));
    off();
    r.session.join('K7M4PX', 'Alice');
    await settle();
    expect(calls).toBe(0);
  });
});
