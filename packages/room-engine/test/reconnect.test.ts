import { describe, expect, it } from 'vitest';
import { disconnectPlayer, reconcile, reconnectPlayer } from '../src/lifecycle';
import { identifyPlayer, joinRoom, occupiedSeats, type Player } from '../src/room';
import { DEFAULT_ROOM_TIMINGS } from '../src/timing';
import { createFakeEnvironment } from './support/fakeEnvironment';
import { newRoom, playerNamed, roomIn, unwrap, withPlayers } from './support/rooms';

const T0 = 100_000;

function setup(names = ['Alice', 'Bob', 'Cara']) {
  const env = createFakeEnvironment();
  env.time = T0;
  const room = withPlayers(env, newRoom(env), names);
  return { env, room };
}

/** Alice's transport drops at T0; the room is reconciled `elapsed` ms later. */
function aliceDroppedFor(elapsed: number) {
  const { env, room } = setup();
  const alice = playerNamed(room, 'Alice');
  const dropped = unwrap(disconnectPlayer(room, alice.playerId, T0));
  return {
    env,
    original: room,
    alice,
    room: reconcile(dropped, T0 + elapsed, DEFAULT_ROOM_TIMINGS),
  };
}

const token = (player: Player) => player.reconnectToken.reveal();

describe('RECONNECT while RECONNECTING', () => {
  it('restores the SAME player: identity, name, seat position and join time are untouched', () => {
    const { env, original, alice, room } = aliceDroppedFor(5_000);
    expect(playerNamed(room, 'Alice').connection.status).toBe('RECONNECTING');

    const {
      room: after,
      player,
      replacedActiveConnection,
    } = unwrap(reconnectPlayer(room, token(alice), env));
    expect(player.playerId).toBe(alice.playerId); // never a new PlayerId
    expect(player.displayName).toBe('Alice');
    expect(player.joinedAt).toBe(alice.joinedAt);
    expect(player.connection).toEqual({ status: 'CONNECTED' }); // disconnectedAt cleared
    expect(player.membership).toEqual({ status: 'HELD' });
    expect(replacedActiveConnection).toBe(false);

    // Same place in the room, nobody else touched, same number of participants and seats.
    expect(after.players.map((p) => p.playerId)).toEqual(original.players.map((p) => p.playerId));
    expect(after.players).toHaveLength(3);
    expect(occupiedSeats(after)).toBe(3);
    expect(playerNamed(after, 'Bob')).toBe(playerNamed(room, 'Bob'));
    expect(playerNamed(after, 'Cara')).toBe(playerNamed(room, 'Cara'));
    expect(after.host).toBe(room.host);
    expect(after.state).toBe(room.state);
  });

  it('keeps the same PlayerId through repeated drop/reconnect cycles', () => {
    const { env, room: initial } = setup(['Alice', 'Bob']);
    let room = initial;
    const id = playerNamed(room, 'Alice').playerId;
    let now = T0;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      now += 1_000;
      room = unwrap(disconnectPlayer(room, id, now));
      const current = playerNamed(room, 'Alice');
      room = unwrap(reconnectPlayer(room, token(current), env)).room;
      expect(playerNamed(room, 'Alice').playerId).toBe(id);
    }
    expect(room.players).toHaveLength(2);
  });
});

describe('RECONNECT while DISCONNECTED but the seat is still reserved', () => {
  it.each([10_000, 30_000, 59_999])('succeeds %i ms after the drop', (elapsed) => {
    const { env, alice, room } = aliceDroppedFor(elapsed);
    const state = playerNamed(room, 'Alice');
    expect(state.connection.status).toBe('DISCONNECTED');
    expect(state.membership.status).toBe('HELD');

    const { player } = unwrap(reconnectPlayer(room, token(alice), env));
    expect(player.playerId).toBe(alice.playerId);
    expect(player.connection).toEqual({ status: 'CONNECTED' });
  });
});

describe('RECONNECT after the seat was released', () => {
  it.each([60_000, 60_001, 3_600_000])(
    'fails with SEAT_RELEASED %i ms after the drop, and changes nothing',
    (elapsed) => {
      const { env, alice, room } = aliceDroppedFor(elapsed);
      const snapshot = JSON.stringify(room);
      const callsBefore = { ...env.calls };

      expect(reconnectPlayer(room, token(alice), env)).toEqual({
        ok: false,
        reason: 'SEAT_RELEASED',
      });
      expect(JSON.stringify(room)).toBe(snapshot);
      expect(env.calls).toEqual(callsBefore); // no credential was issued
    },
  );

  it('the old reconnect path cannot evict the newcomer who took the seat', () => {
    const { env, room: original } = setup(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    const p6 = playerNamed(original, 'p6');
    const dropped = unwrap(disconnectPlayer(original, p6.playerId, T0));
    const expired = reconcile(dropped, T0 + 60_000, DEFAULT_ROOM_TIMINGS);
    const { room: refilled } = unwrap(joinRoom(expired, 'Newcomer', T0 + 60_000, env));

    expect(occupiedSeats(refilled)).toBe(6);
    expect(reconnectPlayer(refilled, token(p6), env)).toEqual({
      ok: false,
      reason: 'SEAT_RELEASED',
    });
    expect(occupiedSeats(refilled)).toBe(6);
  });
});

describe('WRONG credentials', () => {
  it.each([
    ['empty', () => ''],
    ['garbage', () => 'wrong'],
    ['right value, wrong case', (p: Player) => token(p).toUpperCase()],
    ['a prefix of the real one', (p: Player) => token(p).slice(0, -1)],
    ['the real one plus extra', (p: Player) => token(p) + 'x'],
  ])('%s → INVALID_CREDENTIAL, room unchanged, nothing rotated', (_label, candidate) => {
    const { env, alice, room } = aliceDroppedFor(5_000);
    const snapshot = JSON.stringify(room);
    const callsBefore = { ...env.calls };

    expect(reconnectPlayer(room, candidate(alice), env)).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIAL',
    });
    expect(JSON.stringify(room)).toBe(snapshot);
    expect(env.calls).toEqual(callsBefore);
    // The genuine credential still works: a failed attempt did not burn it.
    expect(reconnectPlayer(room, token(alice), env).ok).toBe(true);
  });

  it('the host’s credential does not reconnect a player', () => {
    const { env, room } = aliceDroppedFor(5_000);
    expect(reconnectPlayer(room, room.host.hostToken.reveal(), env)).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIAL',
    });
  });

  it('another player’s credential reconnects THAT player, not Alice', () => {
    const { env, room } = aliceDroppedFor(5_000);
    const bob = playerNamed(room, 'Bob');
    const { player, room: after } = unwrap(reconnectPlayer(room, token(bob), env));
    expect(player.playerId).toBe(bob.playerId);
    expect(playerNamed(after, 'Alice').connection.status).toBe('RECONNECTING'); // still waiting
  });
});

describe('CREDENTIAL ROTATION (single-use reconnect credentials)', () => {
  it('issues a new credential and kills the old one', () => {
    const { env, alice, room } = aliceDroppedFor(5_000);
    const oldToken = token(alice);

    const { room: after, player } = unwrap(reconnectPlayer(room, oldToken, env));
    const newToken = token(player);
    expect(newToken).not.toBe(oldToken);

    // Token A is dead; token B is alive.
    expect(identifyPlayer(after, oldToken)).toBeUndefined();
    expect(identifyPlayer(after, newToken)?.playerId).toBe(alice.playerId);
    const dropAgain = unwrap(disconnectPlayer(after, alice.playerId, T0 + 6_000));
    expect(reconnectPlayer(dropAgain, oldToken, env)).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIAL',
    });
    expect(reconnectPlayer(dropAgain, newToken, env).ok).toBe(true);
  });

  it('rotates on EVERY successful reconnect', () => {
    const { env, alice, room: initial } = aliceDroppedFor(1_000);
    const seen = new Set([token(alice)]);
    let room = initial;
    for (let i = 0; i < 4; i += 1) {
      const result = unwrap(reconnectPlayer(room, token(playerNamed(room, 'Alice')), env));
      expect(seen.has(token(result.player))).toBe(false);
      seen.add(token(result.player));
      room = unwrap(disconnectPlayer(result.room, alice.playerId, T0 + 2_000 + i));
    }
    expect(seen.size).toBe(5);
  });

  it('does not rotate other players’ credentials', () => {
    const { env, alice, room } = aliceDroppedFor(5_000);
    const { room: after } = unwrap(reconnectPlayer(room, token(alice), env));
    expect(playerNamed(after, 'Bob').reconnectToken).toBe(playerNamed(room, 'Bob').reconnectToken);
  });

  it('never leaks either credential through serialization', () => {
    const { env, alice, room } = aliceDroppedFor(5_000);
    const result = unwrap(reconnectPlayer(room, token(alice), env));
    const json = JSON.stringify(result);
    expect(json).not.toContain(token(alice));
    expect(json).not.toContain(token(result.player));
  });

  it('treats a generator that re-issues the old (or someone else’s) credential as a system fault', () => {
    const { env, alice, room } = aliceDroppedFor(5_000);
    const snapshot = JSON.stringify(room);
    const bob = playerNamed(room, 'Bob');
    for (const duplicate of [alice, bob]) {
      const reissuing = { ...env, newReconnectToken: () => duplicate.reconnectToken };
      expect(() => reconnectPlayer(room, token(alice), reissuing)).toThrow();
    }
    expect(JSON.stringify(room)).toBe(snapshot);
  });
});

describe('TAKEOVER (one logical controller per player)', () => {
  it('a valid credential presented while the player is still CONNECTED replaces the active connection', () => {
    const { env, room } = setup();
    const alice = playerNamed(room, 'Alice');
    const result = unwrap(reconnectPlayer(room, token(alice), env));

    expect(result.replacedActiveConnection).toBe(true); // tells the server to drop the stale transport
    expect(result.player.playerId).toBe(alice.playerId);
    expect(result.player.connection).toEqual({ status: 'CONNECTED' });
    expect(result.room.players).toHaveLength(3); // still exactly one Alice
  });

  it('the displaced controller’s credential is dead, so it cannot take the seat back', () => {
    const { env, room } = setup();
    const alice = playerNamed(room, 'Alice');
    const { room: after } = unwrap(reconnectPlayer(room, token(alice), env));
    expect(reconnectPlayer(after, token(alice), env)).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIAL',
    });
  });
});

describe('ROOM STATE', () => {
  it.each(['LOBBY', 'STARTING', 'PLAYING', 'RESULTS'] as const)(
    'reconnect works in %s, without changing the room state',
    (state) => {
      const env = createFakeEnvironment();
      const room = roomIn(state, env);
      const alice = playerNamed(room, 'Alice');
      const dropped = unwrap(disconnectPlayer(room, alice.playerId, env.time));
      const result = unwrap(reconnectPlayer(dropped, token(alice), env));
      expect(result.room.state).toBe(state);
      expect(result.player.connection).toEqual({ status: 'CONNECTED' });
    },
  );

  it('a closing room cannot be reconnected to, and nothing rotates', () => {
    const env = createFakeEnvironment();
    const room = roomIn('CLOSING', env);
    const alice = playerNamed(room, 'Alice');
    const callsBefore = { ...env.calls };
    expect(reconnectPlayer(room, token(alice), env)).toEqual({ ok: false, reason: 'ROOM_CLOSING' });
    expect(env.calls).toEqual(callsBefore);
  });

  it('checks the credential before revealing anything about the room', () => {
    const env = createFakeEnvironment();
    const room = roomIn('CLOSING', env);
    expect(reconnectPlayer(room, 'not-a-token', env)).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIAL',
    });
  });
});
