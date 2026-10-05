import { describe, expect, it } from 'vitest';
import { disconnectPlayer, reconcile } from '../src/lifecycle';
import { beginStart, joinRoom, occupiedSeats, seatedPlayers, type Room } from '../src/room';
import { DEFAULT_ROOM_TIMINGS, type RoomTimings } from '../src/timing';
import { toPlayerId } from '../src/ids';
import { createFakeEnvironment } from './support/fakeEnvironment';
import { newRoom, playerNamed, roomIn, unwrap, withPlayers } from './support/rooms';

const T0 = 100_000;

function lobby(names: string[], timings?: RoomTimings) {
  const env = createFakeEnvironment();
  env.time = T0;
  const room = withPlayers(env, newRoom(env), names);
  return { env, room, timings: timings ?? DEFAULT_ROOM_TIMINGS };
}

/** Disconnects `name` at T0 and reconciles at T0 + elapsed. */
function afterDisconnect(room: Room, name: string, elapsedMs: number, timings: RoomTimings) {
  const player = playerNamed(room, name);
  const disconnected = unwrap(disconnectPlayer(room, player.playerId, T0));
  return reconcile(disconnected, T0 + elapsedMs, timings);
}

describe('DISCONNECT', () => {
  it('moves a connected player to RECONNECTING, keeping identity and seat', () => {
    const { room, timings } = lobby(['Alice', 'Bob']);
    const alice = playerNamed(room, 'Alice');
    const next = unwrap(disconnectPlayer(room, alice.playerId, T0));
    const after = playerNamed(next, 'Alice');

    expect(after.connection).toEqual({ status: 'RECONNECTING', disconnectedAt: T0 });
    expect(after.membership).toEqual({ status: 'HELD' });
    expect(after.playerId).toBe(alice.playerId);
    expect(after.reconnectToken).toBe(alice.reconnectToken); // credential untouched by a drop
    expect(occupiedSeats(next)).toBe(occupiedSeats(room)); // still occupies its seat
    expect(playerNamed(next, 'Bob')).toBe(playerNamed(room, 'Bob')); // others untouched
    expect(reconcile(next, T0, timings)).toBe(next);
  });

  it('never mutates the room it was given', () => {
    const { room } = lobby(['Alice']);
    const snapshot = JSON.stringify(room);
    unwrap(disconnectPlayer(room, playerNamed(room, 'Alice').playerId, T0));
    expect(JSON.stringify(room)).toBe(snapshot);
    expect(playerNamed(room, 'Alice').connection).toEqual({ status: 'CONNECTED' });
  });

  it('is rejected for an unknown player without changing anything', () => {
    const { room } = lobby(['Alice']);
    expect(disconnectPlayer(room, toPlayerId('player-999'), T0)).toEqual({
      ok: false,
      reason: 'PLAYER_NOT_FOUND',
    });
  });

  it('a repeated drop does NOT restart the clock (that would extend the seat hold)', () => {
    const { room } = lobby(['Alice']);
    const alice = playerNamed(room, 'Alice');
    const first = unwrap(disconnectPlayer(room, alice.playerId, T0));
    expect(disconnectPlayer(first, alice.playerId, T0 + 5_000)).toEqual({
      ok: false,
      reason: 'ALREADY_DISCONNECTED',
    });
    const later = reconcile(first, T0 + 20_000, DEFAULT_ROOM_TIMINGS);
    expect(disconnectPlayer(later, alice.playerId, T0 + 20_000)).toEqual({
      ok: false,
      reason: 'ALREADY_DISCONNECTED',
    });
    expect(playerNamed(first, 'Alice').connection).toEqual({
      status: 'RECONNECTING',
      disconnectedAt: T0,
    });
  });

  it('works in any room state, e.g. mid-match', () => {
    const env = createFakeEnvironment();
    const playing = roomIn('PLAYING', env);
    const alice = playerNamed(playing, 'Alice');
    const next = unwrap(disconnectPlayer(playing, alice.playerId, env.time));
    expect(next.state).toBe('PLAYING');
    expect(playerNamed(next, 'Alice').connection.status).toBe('RECONNECTING');
  });
});

describe('RECONCILE — exact timing boundaries (elapsed >= duration)', () => {
  const defaults = DEFAULT_ROOM_TIMINGS;
  const custom: RoomTimings = { reconnectingWindowMs: 2_000, seatReservationMs: 5_000 };
  const coincident: RoomTimings = { reconnectingWindowMs: 3_000, seatReservationMs: 3_000 };

  const cases: [string, RoomTimings, number, string, string][] = [
    ['default', defaults, 0, 'RECONNECTING', 'HELD'],
    ['default', defaults, 9_999, 'RECONNECTING', 'HELD'],
    ['default', defaults, 10_000, 'DISCONNECTED', 'HELD'],
    ['default', defaults, 10_001, 'DISCONNECTED', 'HELD'],
    ['default', defaults, 59_999, 'DISCONNECTED', 'HELD'],
    ['default', defaults, 60_000, 'DISCONNECTED', 'RELEASED'],
    ['default', defaults, 60_001, 'DISCONNECTED', 'RELEASED'],
    ['custom 2s/5s', custom, 1_999, 'RECONNECTING', 'HELD'],
    ['custom 2s/5s', custom, 2_000, 'DISCONNECTED', 'HELD'],
    ['custom 2s/5s', custom, 2_001, 'DISCONNECTED', 'HELD'],
    ['custom 2s/5s', custom, 4_999, 'DISCONNECTED', 'HELD'],
    ['custom 2s/5s', custom, 5_000, 'DISCONNECTED', 'RELEASED'],
    ['custom 2s/5s', custom, 5_001, 'DISCONNECTED', 'RELEASED'],
    ['coincident 3s/3s', coincident, 2_999, 'RECONNECTING', 'HELD'],
    ['coincident 3s/3s', coincident, 3_000, 'DISCONNECTED', 'RELEASED'],
  ];

  it.each(cases)(
    '%s timings, %i ms after the drop → %s / %s',
    (_name, timings, elapsed, status, seat) => {
      const { room } = lobby(['Alice', 'Bob']);
      const alice = playerNamed(afterDisconnect(room, 'Alice', elapsed, timings), 'Alice');
      expect(alice.connection.status).toBe(status);
      expect(alice.membership.status).toBe(seat);
    },
  );

  it('keeps disconnectedAt, and records the LOGICAL release time (not when it was noticed)', () => {
    const { room } = lobby(['Alice']);
    const late = playerNamed(afterDisconnect(room, 'Alice', 90_000, defaults), 'Alice');
    expect(late.connection).toEqual({ status: 'DISCONNECTED', disconnectedAt: T0 });
    expect(late.membership).toEqual({ status: 'RELEASED', releasedAt: T0 + 60_000 });
  });

  it('a single late reconcile lands in the same state as reconciling at every step', () => {
    const { room } = lobby(['Alice']);
    const disconnected = unwrap(disconnectPlayer(room, playerNamed(room, 'Alice').playerId, T0));
    const stepwise = [5_000, 10_000, 30_000, 59_999, 60_000, 75_000].reduce(
      (current, t) => reconcile(current, T0 + t, defaults),
      disconnected,
    );
    expect(JSON.stringify(stepwise)).toBe(
      JSON.stringify(reconcile(disconnected, T0 + 75_000, defaults)),
    );
  });

  it('returns the SAME reference when nothing changes (cheap change detection)', () => {
    const { room } = lobby(['Alice', 'Bob']);
    expect(reconcile(room, T0 + 3_600_000, defaults)).toBe(room); // connected players never expire
    const dropped = unwrap(disconnectPlayer(room, playerNamed(room, 'Alice').playerId, T0));
    expect(reconcile(dropped, T0 + 9_999, defaults)).toBe(dropped);
    const settled = reconcile(dropped, T0 + 10_000, defaults);
    expect(settled).not.toBe(dropped);
    expect(reconcile(settled, T0 + 59_999, defaults)).toBe(settled);
  });

  it('only touches the players whose clocks ran out', () => {
    const { room } = lobby(['Alice', 'Bob', 'Cara']);
    const dropped = unwrap(disconnectPlayer(room, playerNamed(room, 'Alice').playerId, T0));
    const settled = reconcile(dropped, T0 + 70_000, defaults);
    expect(playerNamed(settled, 'Bob')).toBe(playerNamed(room, 'Bob'));
    expect(playerNamed(settled, 'Cara')).toBe(playerNamed(room, 'Cara'));
  });

  it('never mutates its input', () => {
    const { room } = lobby(['Alice']);
    const dropped = unwrap(disconnectPlayer(room, playerNamed(room, 'Alice').playerId, T0));
    const snapshot = JSON.stringify(dropped);
    reconcile(dropped, T0 + 70_000, defaults);
    expect(JSON.stringify(dropped)).toBe(snapshot);
  });

  describe('clock going backwards (violated monotonic contract)', () => {
    it('is rejected loudly and corrupts nothing', () => {
      const { room } = lobby(['Alice']);
      const dropped = unwrap(disconnectPlayer(room, playerNamed(room, 'Alice').playerId, T0));
      const snapshot = JSON.stringify(dropped);
      expect(() => reconcile(dropped, T0 - 1, defaults)).toThrow(/backwards/i);
      expect(JSON.stringify(dropped)).toBe(snapshot);
      expect(playerNamed(dropped, 'Alice').membership).toEqual({ status: 'HELD' });
    });

    it('an equal reading is fine (non-decreasing, not strictly increasing)', () => {
      const { room } = lobby(['Alice']);
      const dropped = unwrap(disconnectPlayer(room, playerNamed(room, 'Alice').playerId, T0));
      expect(() => reconcile(dropped, T0, defaults)).not.toThrow();
    });

    it('disconnecting with a clock earlier than the player’s join is rejected', () => {
      const { room } = lobby(['Alice']);
      expect(() => disconnectPlayer(room, playerNamed(room, 'Alice').playerId, T0 - 1)).toThrow(
        /backwards/i,
      );
    });
  });
});

describe('CAPACITY — one canonical definition of occupancy', () => {
  const names = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

  function joinAt(
    room: Room,
    env: ReturnType<typeof createFakeEnvironment>,
    now: number,
    name = 'Newcomer',
  ) {
    return joinRoom(room, name, now, env);
  }

  it('a seat is occupied while the player is CONNECTED, RECONNECTING, or DISCONNECTED-but-reserved', () => {
    const { room, env } = lobby(names);
    expect(occupiedSeats(room)).toBe(6);
    for (const elapsed of [0, 9_999, 10_000, 30_000, 59_999]) {
      const state = afterDisconnect(room, 'p6', elapsed, DEFAULT_ROOM_TIMINGS);
      expect(occupiedSeats(state), `${elapsed} ms`).toBe(6);
      expect(joinAt(state, env, T0 + elapsed), `${elapsed} ms`).toEqual({
        ok: false,
        reason: 'ROOM_FULL',
      });
    }
  });

  it('5 connected + 1 expired → exactly one seat available; the newcomer takes it', () => {
    const { room, env } = lobby(names);
    const expired = afterDisconnect(room, 'p6', 60_000, DEFAULT_ROOM_TIMINGS);
    expect(occupiedSeats(expired)).toBe(5);

    const joined = unwrap(joinAt(expired, env, T0 + 60_000));
    expect(occupiedSeats(joined.room)).toBe(6);
    expect(joinAt(joined.room, env, T0 + 60_000)).toEqual({ ok: false, reason: 'ROOM_FULL' });
  });

  it('releasing a seat does not erase the participant: the record remains, marked RELEASED', () => {
    const { room, env } = lobby(names);
    const expired = afterDisconnect(room, 'p6', 60_000, DEFAULT_ROOM_TIMINGS);
    const { room: after, player } = unwrap(joinAt(expired, env, T0 + 60_000));

    expect(after.players).toHaveLength(7); // history retained
    expect(seatedPlayers(after)).toHaveLength(6); // but only six hold seats
    expect(playerNamed(after, 'p6').membership.status).toBe('RELEASED');
    expect(player.playerId).not.toBe(playerNamed(room, 'p6').playerId); // a NEW identity, not the old one
  });

  it('seatedPlayers and occupiedSeats agree and exclude released members', () => {
    const { room } = lobby(['a', 'b', 'c']);
    const state = afterDisconnect(room, 'b', 61_000, DEFAULT_ROOM_TIMINGS);
    expect(seatedPlayers(state).map((p) => p.displayName)).toEqual(['a', 'c']);
    expect(occupiedSeats(state)).toBe(seatedPlayers(state).length);
  });

  it('if everyone drops and every seat expires, all seats are free again', () => {
    const { room, env } = lobby(['a', 'b', 'c']);
    let state = room;
    for (const p of room.players) state = unwrap(disconnectPlayer(state, p.playerId, T0));
    state = reconcile(state, T0 + 60_000, DEFAULT_ROOM_TIMINGS);
    expect(occupiedSeats(state)).toBe(0);
    for (let i = 0; i < 6; i += 1) state = unwrap(joinAt(state, env, T0 + 60_000, `new${i}`)).room;
    expect(occupiedSeats(state)).toBe(6);
  });
});

describe('STARTING a match counts players who can actually play', () => {
  it('a seat-holder who is currently reconnecting does not count toward minPlayers', () => {
    const { room } = lobby(['Alice', 'Bob']);
    const dropped = unwrap(disconnectPlayer(room, playerNamed(room, 'Bob').playerId, T0));
    expect(occupiedSeats(dropped)).toBe(2);
    expect(beginStart(dropped)).toEqual({ ok: false, reason: 'NOT_ENOUGH_PLAYERS' });
    expect(dropped.state).toBe('LOBBY');
  });
});
