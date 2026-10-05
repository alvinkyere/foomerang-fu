import { describe, expect, it } from 'vitest';
import { disconnectHost, disconnectPlayer, reconcile, reconnectHost } from '../src/lifecycle';
import { isHost, occupiedSeats, seatedPlayers } from '../src/room';
import { DEFAULT_ROOM_TIMINGS } from '../src/timing';
import { createFakeEnvironment } from './support/fakeEnvironment';
import { newRoom, playerNamed, roomIn, unwrap, withPlayers } from './support/rooms';

const T0 = 100_000;

function setup() {
  const env = createFakeEnvironment();
  env.time = T0;
  const room = withPlayers(env, newRoom(env), ['Alice', 'Bob']);
  return { env, room };
}

const hostToken = (room: { host: { hostToken: { reveal(): string } } }) =>
  room.host.hostToken.reveal();

describe('HOST DISCONNECT', () => {
  it('marks the host RECONNECTING and keeps its identity', () => {
    const { room } = setup();
    const next = unwrap(disconnectHost(room, T0));
    expect(next.host.connection).toEqual({ status: 'RECONNECTING', disconnectedAt: T0 });
    expect(next.host.hostId).toBe(room.host.hostId);
    expect(next.host.hostToken).toBe(room.host.hostToken); // a drop does not touch the credential
  });

  it('does NOT close the room, release player seats, or touch players — ever', () => {
    const { room } = setup();
    const lost = unwrap(disconnectHost(room, T0));
    for (const elapsed of [0, 9_999, 10_000, 60_000, 3_600_000]) {
      const later = reconcile(lost, T0 + elapsed, DEFAULT_ROOM_TIMINGS);
      expect(later.state, `${elapsed} ms`).toBe('LOBBY');
      expect(later.players, `${elapsed} ms`).toBe(room.players); // the very same players
      expect(seatedPlayers(later), `${elapsed} ms`).toHaveLength(2);
      expect(later.host.hostId).toBe(room.host.hostId); // no migration, no election
    }
  });

  it('survives host loss mid-match', () => {
    const env = createFakeEnvironment();
    const playing = roomIn('PLAYING', env);
    const lost = reconcile(
      unwrap(disconnectHost(playing, env.time)),
      env.time + 3_600_000,
      DEFAULT_ROOM_TIMINGS,
    );
    expect(lost.state).toBe('PLAYING');
    expect(lost.host.connection.status).toBe('DISCONNECTED');
  });

  describe('status timing (same window as players, exact boundaries)', () => {
    it.each([
      [0, 'RECONNECTING'],
      [9_999, 'RECONNECTING'],
      [10_000, 'DISCONNECTED'],
      [10_001, 'DISCONNECTED'],
      [3_600_000, 'DISCONNECTED'],
    ])('%i ms after the drop → %s', (elapsed, status) => {
      const { room } = setup();
      const lost = unwrap(disconnectHost(room, T0));
      expect(reconcile(lost, T0 + elapsed, DEFAULT_ROOM_TIMINGS).host.connection.status).toBe(
        status,
      );
    });

    it('keeps disconnectedAt while DISCONNECTED', () => {
      const { room } = setup();
      const lost = reconcile(unwrap(disconnectHost(room, T0)), T0 + 30_000, DEFAULT_ROOM_TIMINGS);
      expect(lost.host.connection).toEqual({ status: 'DISCONNECTED', disconnectedAt: T0 });
    });
  });

  it('a repeated drop does not restart the clock', () => {
    const { room } = setup();
    const lost = unwrap(disconnectHost(room, T0));
    expect(disconnectHost(lost, T0 + 5_000)).toEqual({ ok: false, reason: 'ALREADY_DISCONNECTED' });
    expect(lost.host.connection).toEqual({ status: 'RECONNECTING', disconnectedAt: T0 });
  });

  it('the host consumes no seat, connected or not', () => {
    const { room } = setup();
    expect(occupiedSeats(room)).toBe(2);
    expect(occupiedSeats(unwrap(disconnectHost(room, T0)))).toBe(2);
  });

  it('players dropping and the host dropping run on independent clocks', () => {
    const { room } = setup();
    const alice = playerNamed(room, 'Alice');
    const state = unwrap(
      disconnectHost(unwrap(disconnectPlayer(room, alice.playerId, T0)), T0 + 55_000),
    );
    const later = reconcile(state, T0 + 61_000, DEFAULT_ROOM_TIMINGS);
    expect(playerNamed(later, 'Alice').membership.status).toBe('RELEASED'); // her 60 s ran out
    expect(later.host.connection.status).toBe('RECONNECTING'); // dropped 6 s ago: its 10 s has not run out
  });

  it('rejects a clock earlier than the room’s creation', () => {
    const { room } = setup();
    expect(() => disconnectHost(room, room.createdAt - 1)).toThrow(/backwards/i);
  });
});

describe('HOST RECONNECT', () => {
  it.each([0, 5_000, 10_000, 3_600_000])(
    'restores the same host %i ms after the drop',
    (elapsed) => {
      const { env, room } = setup();
      const lost = reconcile(unwrap(disconnectHost(room, T0)), T0 + elapsed, DEFAULT_ROOM_TIMINGS);
      const result = unwrap(reconnectHost(lost, hostToken(room), env));

      expect(result.room.host.hostId).toBe(room.host.hostId); // never a new HostId
      expect(result.room.host.connection).toEqual({ status: 'CONNECTED' });
      expect(result.replacedActiveConnection).toBe(false);
      expect(result.room.state).toBe(room.state);
      expect(result.room.players).toBe(lost.players); // players untouched
      expect(result.room.roomId).toBe(room.roomId);
      expect(result.room.joinCode).toBe(room.joinCode);
    },
  );

  it('rotates the host credential: old dies, new lives', () => {
    const { env, room } = setup();
    const oldToken = hostToken(room);
    const lost = unwrap(disconnectHost(room, T0));
    const { room: after } = unwrap(reconnectHost(lost, oldToken, env));
    const newToken = hostToken(after);

    expect(newToken).not.toBe(oldToken);
    expect(isHost(after, oldToken)).toBe(false);
    expect(isHost(after, newToken)).toBe(true);

    const lostAgain = unwrap(disconnectHost(after, T0 + 1_000));
    expect(reconnectHost(lostAgain, oldToken, env)).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIAL',
    });
    expect(reconnectHost(lostAgain, newToken, env).ok).toBe(true);
  });

  it.each([
    ['empty', () => ''],
    ['garbage', () => 'wrong'],
    [
      'a player’s credential',
      (room: ReturnType<typeof setup>['room']) =>
        playerNamed(room, 'Alice').reconnectToken.reveal(),
    ],
  ])('%s → INVALID_CREDENTIAL, nothing changes, nothing rotates', (_label, candidate) => {
    const { env, room } = setup();
    const lost = unwrap(disconnectHost(room, T0));
    const snapshot = JSON.stringify(lost);
    const callsBefore = { ...env.calls };
    expect(reconnectHost(lost, candidate(room), env)).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIAL',
    });
    expect(JSON.stringify(lost)).toBe(snapshot);
    expect(env.calls).toEqual(callsBefore);
    expect(reconnectHost(lost, hostToken(room), env).ok).toBe(true); // genuine credential unharmed
  });

  it('takeover: presenting the host credential while still connected replaces the active connection', () => {
    const { env, room } = setup();
    const result = unwrap(reconnectHost(room, hostToken(room), env));
    expect(result.replacedActiveConnection).toBe(true);
    expect(isHost(result.room, hostToken(room))).toBe(false); // the displaced host is locked out
  });

  it('works mid-match', () => {
    const env = createFakeEnvironment();
    const playing = roomIn('PLAYING', env);
    const lost = unwrap(disconnectHost(playing, env.time));
    expect(unwrap(reconnectHost(lost, hostToken(playing), env)).room.state).toBe('PLAYING');
  });

  it('is refused for a closing room, without rotating', () => {
    const env = createFakeEnvironment();
    const closing = roomIn('CLOSING', env);
    const callsBefore = { ...env.calls };
    expect(reconnectHost(closing, hostToken(closing), env)).toEqual({
      ok: false,
      reason: 'ROOM_CLOSING',
    });
    expect(env.calls).toEqual(callsBefore);
  });

  it('treats a generator that re-issues an existing credential as a system fault', () => {
    const { env, room } = setup();
    const reissuing = { ...env, newHostToken: () => room.host.hostToken };
    expect(() => reconnectHost(room, hostToken(room), reissuing)).toThrow();
  });

  it('never leaks either host credential through serialization', () => {
    const { env, room } = setup();
    const result = unwrap(reconnectHost(room, hostToken(room), env));
    const json = JSON.stringify(result);
    expect(json).not.toContain(hostToken(room));
    expect(json).not.toContain(hostToken(result.room));
  });
});
