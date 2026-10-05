import { describe, expect, it } from 'vitest';
import { toPlayerId, toRoomId } from '../src/ids';
import { RoomRegistry } from '../src/registry';
import type { Room } from '../src/room';
import { createFakeEnvironment } from './support/fakeEnvironment';
import { FOOMERANG_FU } from './support/rooms';

const T0 = 100_000;

function setup(timings?: { reconnectingWindowMs?: number; seatReservationMs?: number }) {
  const env = createFakeEnvironment();
  env.time = T0;
  const registry = new RoomRegistry(env, timings ? { timings } : {});
  const created = registry.createRoom(FOOMERANG_FU);
  if (!created.ok) throw new Error('setup');
  return { env, registry, roomId: created.value.roomId };
}

function joinAll(registry: RoomRegistry, roomId: Room['roomId'], names: string[]) {
  return names.map((name) => {
    const result = registry.joinRoom(roomId, name);
    if (!result.ok) throw new Error(`setup: ${name}: ${result.reason}`);
    return result.value.player;
  });
}

const player = (registry: RoomRegistry, roomId: Room['roomId'], name: string) => {
  const found = registry.getRoom(roomId)?.players.find((p) => p.displayName === name);
  if (!found) throw new Error(`no player ${name}`);
  return found;
};

describe('the phone-lock scenario: a player briefly vanishes and comes back', () => {
  it('keeps their identity, seat and place through drop → reconnecting → disconnected → return', () => {
    const { env, registry, roomId } = setup();
    const [alice] = joinAll(registry, roomId, ['Alice', 'Bob']);
    if (!alice) throw new Error('setup');
    const originalToken = alice.reconnectToken.reveal();

    env.time = T0 + 1_000;
    expect(registry.disconnectPlayer(roomId, alice.playerId).ok).toBe(true);
    expect(player(registry, roomId, 'Alice').connection.status).toBe('RECONNECTING');

    // The server sweeps after the window has passed.
    env.time = T0 + 12_000;
    const changed = registry.reconcile();
    expect(changed.map((r) => r.roomId)).toEqual([roomId]);
    expect(player(registry, roomId, 'Alice').connection.status).toBe('DISCONNECTED');
    expect(player(registry, roomId, 'Alice').membership.status).toBe('HELD');

    env.time = T0 + 20_000;
    const back = registry.reconnectPlayer(roomId, originalToken);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.player.playerId).toBe(alice.playerId);
    expect(back.value.player.reconnectToken.reveal()).not.toBe(originalToken);
    expect(player(registry, roomId, 'Alice').connection).toEqual({ status: 'CONNECTED' });
    expect(registry.reconnectPlayer(roomId, originalToken)).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIAL',
    });
  });
});

describe('correctness does not depend on how often the server sweeps', () => {
  it('a join exactly at seat expiry succeeds with NO sweep; one millisecond earlier does not', () => {
    const { env, registry, roomId } = setup();
    const players = joinAll(registry, roomId, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    env.time = T0;
    registry.disconnectPlayer(roomId, players[5]?.playerId ?? toPlayerId('x'));

    env.time = T0 + 59_999;
    expect(registry.joinRoom(roomId, 'Newcomer')).toEqual({ ok: false, reason: 'ROOM_FULL' });

    env.time = T0 + 60_000;
    expect(registry.joinRoom(roomId, 'Newcomer').ok).toBe(true);
    expect(player(registry, roomId, 'p6').membership).toEqual({
      status: 'RELEASED',
      releasedAt: T0 + 60_000,
    });
  });

  it('a reconnect at 59,999 ms succeeds with no sweep; at 60,000 ms it is SEAT_RELEASED', () => {
    for (const [elapsed, expected] of [
      [59_999, true],
      [60_000, false],
    ] as const) {
      const { env, registry, roomId } = setup();
      const [alice] = joinAll(registry, roomId, ['Alice', 'Bob']);
      if (!alice) throw new Error('setup');
      registry.disconnectPlayer(roomId, alice.playerId);
      env.time = T0 + elapsed;
      const result = registry.reconnectPlayer(roomId, alice.reconnectToken.reveal());
      expect(result.ok, `${elapsed} ms`).toBe(expected);
      if (!result.ok) expect(result.reason).toBe('SEAT_RELEASED');
    }
  });

  it('a match cannot start with a player who has been reconnecting past the point of use', () => {
    const { env, registry, roomId } = setup();
    const [alice] = joinAll(registry, roomId, ['Alice', 'Bob']);
    if (!alice) throw new Error('setup');
    registry.disconnectPlayer(roomId, alice.playerId);
    env.time = T0 + 1_000;
    expect(registry.beginStart(roomId)).toEqual({ ok: false, reason: 'NOT_ENOUGH_PLAYERS' });
  });
});

describe('exact status boundaries through the registry (default timings)', () => {
  it.each([
    [9_999, 'RECONNECTING', 'HELD'],
    [10_000, 'DISCONNECTED', 'HELD'],
    [10_001, 'DISCONNECTED', 'HELD'],
    [59_999, 'DISCONNECTED', 'HELD'],
    [60_000, 'DISCONNECTED', 'RELEASED'],
    [60_001, 'DISCONNECTED', 'RELEASED'],
  ])('%i ms after the drop → %s / %s', (elapsed, status, seat) => {
    const { env, registry, roomId } = setup();
    const [alice] = joinAll(registry, roomId, ['Alice', 'Bob']);
    if (!alice) throw new Error('setup');
    registry.disconnectPlayer(roomId, alice.playerId);
    env.time = T0 + elapsed;
    registry.reconcile();
    expect(player(registry, roomId, 'Alice').connection.status).toBe(status);
    expect(player(registry, roomId, 'Alice').membership.status).toBe(seat);
  });

  it('honors configured durations: 2 s window, 5 s reservation', () => {
    const { env, registry, roomId } = setup({
      reconnectingWindowMs: 2_000,
      seatReservationMs: 5_000,
    });
    const [alice] = joinAll(registry, roomId, ['Alice']);
    if (!alice) throw new Error('setup');
    registry.disconnectPlayer(roomId, alice.playerId);
    const at = (elapsed: number) => {
      env.time = T0 + elapsed;
      registry.reconcile();
      const p = player(registry, roomId, 'Alice');
      return `${p.connection.status}/${p.membership.status}`;
    };
    expect(at(1_999)).toBe('RECONNECTING/HELD');
    expect(at(2_000)).toBe('DISCONNECTED/HELD');
    expect(at(4_999)).toBe('DISCONNECTED/HELD');
    expect(at(5_000)).toBe('DISCONNECTED/RELEASED');
  });

  it('refuses to be constructed with invalid timings', () => {
    const env = createFakeEnvironment();
    expect(() => new RoomRegistry(env, { timings: { reconnectingWindowMs: 0 } })).toThrow();
    expect(
      () =>
        new RoomRegistry(env, {
          timings: { reconnectingWindowMs: 10_000, seatReservationMs: 5_000 },
        }),
    ).toThrow();
  });
});

describe('reconcile() — the sweep the server will run', () => {
  it('returns exactly the rooms that changed, and nothing the second time', () => {
    const { env, registry, roomId } = setup();
    const other = registry.createRoom(FOOMERANG_FU);
    if (!other.ok) throw new Error('setup');
    const [alice] = joinAll(registry, roomId, ['Alice']);
    if (!alice) throw new Error('setup');
    registry.disconnectPlayer(roomId, alice.playerId);

    env.time = T0 + 5_000;
    expect(registry.reconcile()).toEqual([]); // nothing crossed a boundary yet
    env.time = T0 + 10_000;
    const first = registry.reconcile();
    expect(first.map((r) => r.roomId)).toEqual([roomId]); // the untouched room is not reported
    expect(registry.reconcile()).toEqual([]); // idempotent
  });

  it('getRoom is a plain read: it reflects the last commit, not the present moment', () => {
    const { env, registry, roomId } = setup();
    const [alice] = joinAll(registry, roomId, ['Alice']);
    if (!alice) throw new Error('setup');
    registry.disconnectPlayer(roomId, alice.playerId);
    env.time = T0 + 30_000;
    expect(player(registry, roomId, 'Alice').connection.status).toBe('RECONNECTING'); // stale until swept
    registry.reconcile();
    expect(player(registry, roomId, 'Alice').connection.status).toBe('DISCONNECTED');
  });
});

describe('failed operations commit NOTHING — not even the passage of time', () => {
  it('a failed reconnect leaves the stored room reference untouched', () => {
    const { env, registry, roomId } = setup();
    const [alice] = joinAll(registry, roomId, ['Alice', 'Bob']);
    if (!alice) throw new Error('setup');
    registry.disconnectPlayer(roomId, alice.playerId);
    const stored = registry.getRoom(roomId);
    env.time = T0 + 30_000; // time has moved on; stored state is stale

    expect(registry.reconnectPlayer(roomId, 'wrong').ok).toBe(false);
    expect(registry.getRoom(roomId)).toBe(stored);
    // ...and the genuine credential still works afterwards.
    expect(registry.reconnectPlayer(roomId, alice.reconnectToken.reveal()).ok).toBe(true);
  });

  it('a failed join (room full) leaves the stored room untouched', () => {
    const { env, registry, roomId } = setup();
    const players = joinAll(registry, roomId, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    registry.disconnectPlayer(roomId, players[0]?.playerId ?? toPlayerId('x'));
    const stored = registry.getRoom(roomId);
    env.time = T0 + 30_000;
    expect(registry.joinRoom(roomId, 'Late')).toEqual({ ok: false, reason: 'ROOM_FULL' });
    expect(registry.getRoom(roomId)).toBe(stored);
  });

  it('a failed token does not rotate anything', () => {
    const { env, registry, roomId } = setup();
    const [alice] = joinAll(registry, roomId, ['Alice']);
    if (!alice) throw new Error('setup');
    registry.disconnectPlayer(roomId, alice.playerId);
    const before = env.calls.reconnectToken;
    registry.reconnectPlayer(roomId, 'wrong');
    expect(env.calls.reconnectToken).toBe(before);
  });
});

describe('a clock that goes backwards is a violated contract: rejected, nothing corrupted', () => {
  it('every time-dependent operation throws and the stored room is unchanged', () => {
    const { env, registry, roomId } = setup();
    const [alice] = joinAll(registry, roomId, ['Alice', 'Bob']);
    if (!alice) throw new Error('setup');
    env.time = T0 + 5_000;
    registry.disconnectPlayer(roomId, alice.playerId);
    const stored = registry.getRoom(roomId);

    env.time = T0 + 1_000; // backwards
    expect(() => registry.reconcile()).toThrow(/backwards/i);
    expect(() => registry.joinRoom(roomId, 'X')).toThrow(/backwards/i);
    expect(() => registry.reconnectPlayer(roomId, alice.reconnectToken.reveal())).toThrow(
      /backwards/i,
    );
    expect(() => registry.disconnectHost(roomId)).toThrow(/backwards/i);
    expect(() => registry.createRoom(FOOMERANG_FU)).toThrow(/backwards/i);
    expect(registry.getRoom(roomId)).toBe(stored);
    expect(registry.size).toBe(1);

    // Once the clock honors its contract again, everything resumes.
    env.time = T0 + 5_000;
    expect(registry.reconnectPlayer(roomId, alice.reconnectToken.reveal()).ok).toBe(true);
  });

  it('a non-numeric reading is rejected too', () => {
    const { env, registry, roomId } = setup();
    env.time = Number.NaN;
    expect(() => registry.joinRoom(roomId, 'X')).toThrow();
  });
});

describe('the host through the registry', () => {
  it('losing the host keeps the room, players and seats — indefinitely', () => {
    const { env, registry, roomId } = setup();
    joinAll(registry, roomId, ['Alice', 'Bob']);
    expect(registry.disconnectHost(roomId).ok).toBe(true);
    env.time = T0 + 3_600_000;
    registry.reconcile();

    const room = registry.getRoom(roomId);
    expect(room?.state).toBe('LOBBY');
    expect(room?.host.connection.status).toBe('DISCONNECTED');
    expect(room?.players.every((p) => p.membership.status === 'HELD')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('reconnects the same host, rotating the credential', () => {
    const { registry, roomId } = setup();
    const before = registry.getRoom(roomId);
    if (!before) throw new Error('setup');
    const oldToken = before.host.hostToken.reveal();
    registry.disconnectHost(roomId);

    const result = registry.reconnectHost(roomId, oldToken);
    expect(result.ok).toBe(true);
    const after = registry.getRoom(roomId);
    expect(after?.host.hostId).toBe(before.host.hostId);
    expect(after?.host.connection).toEqual({ status: 'CONNECTED' });
    expect(registry.isHost(roomId, oldToken)).toBe(false);
    expect(registry.isHost(roomId, after?.host.hostToken.reveal() ?? '')).toBe(true);
    expect(registry.reconnectHost(roomId, oldToken)).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIAL',
    });
  });

  it('a host refresh while still "connected" is a takeover', () => {
    const { registry, roomId } = setup();
    const token = registry.getRoom(roomId)?.host.hostToken.reveal() ?? '';
    const result = registry.reconnectHost(roomId, token);
    expect(result.ok && result.value.replacedActiveConnection).toBe(true);
  });
});

describe('unknown rooms', () => {
  it.each(['disconnectHost', 'reconnectHost', 'reconnectPlayer', 'disconnectPlayer'] as const)(
    '%s → ROOM_NOT_FOUND',
    (op) => {
      const { registry } = setup();
      const result =
        op === 'disconnectHost'
          ? registry.disconnectHost(toRoomId('nope'))
          : op === 'reconnectHost'
            ? registry.reconnectHost(toRoomId('nope'), 'x')
            : op === 'reconnectPlayer'
              ? registry.reconnectPlayer(toRoomId('nope'), 'x')
              : registry.disconnectPlayer(toRoomId('nope'), toPlayerId('p'));
      expect(result).toEqual({ ok: false, reason: 'ROOM_NOT_FOUND' });
    },
  );
});
