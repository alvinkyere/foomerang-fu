import { describe, expect, it } from 'vitest';
import type { RoomConfig } from '../src/config';
import { parseJoinCode } from '../src/ids';
import {
  beginStart,
  closeRoom,
  completeClose,
  createRoom,
  finishGame,
  identifyPlayer,
  isHost,
  joinRoom,
  returnToLobby,
  startPlaying,
  type Room,
} from '../src/room';
import { ROOM_STATES, canTransition, type RoomState } from '../src/state';
import { createFakeEnvironment, type FakeEnvironment } from './support/fakeEnvironment';

const FOOMERANG_FU: RoomConfig = { gameId: 'foomerang-fu', minPlayers: 2, maxPlayers: 6 };

function newRoom(env: FakeEnvironment, config: RoomConfig = FOOMERANG_FU): Room {
  const joinCode = parseJoinCode('K7M4PX');
  if (!joinCode) throw new Error('test setup: bad join code');
  return createRoom({
    roomId: env.newRoomId(),
    joinCode,
    config,
    host: { hostId: env.newHostId(), hostToken: env.newHostToken() },
    now: env.now(),
  });
}

function withPlayers(env: FakeEnvironment, room: Room, names: string[]): Room {
  return names.reduce((current, name) => {
    const joined = joinRoom(current, name, env);
    if (!joined.ok) throw new Error(`test setup: ${name} could not join: ${joined.reason}`);
    return joined.value.room;
  }, room);
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`test setup: unexpected failure ${result.reason}`);
  return result.value;
}

/** A room (with 2 players, the minimum) driven into the requested state via real operations. */
function roomIn(state: RoomState, env = createFakeEnvironment()): Room {
  let room = withPlayers(env, newRoom(env), ['Alice', 'Bob']);
  const steps: Record<RoomState, ((r: Room) => Room)[]> = {
    LOBBY: [],
    STARTING: [(r) => unwrap(beginStart(r))],
    PLAYING: [(r) => unwrap(beginStart(r)), (r) => unwrap(startPlaying(r))],
    RESULTS: [
      (r) => unwrap(beginStart(r)),
      (r) => unwrap(startPlaying(r)),
      (r) => unwrap(finishGame(r)),
    ],
    CLOSING: [(r) => unwrap(closeRoom(r))],
    CLOSED: [(r) => unwrap(closeRoom(r)), (r) => unwrap(completeClose(r))],
  };
  for (const step of steps[state]) room = step(room);
  expect(room.state).toBe(state);
  return room;
}

describe('CREATE', () => {
  it('begins in LOBBY with identity, config, host and no players retained', () => {
    const env = createFakeEnvironment();
    env.time = 5_000;
    const room = newRoom(env);
    expect(room.state).toBe('LOBBY');
    expect(room.roomId).toBe('room-1');
    expect(room.joinCode).toBe('K7M4PX');
    expect(room.config).toEqual(FOOMERANG_FU);
    expect(room.players).toEqual([]);
    expect(room.createdAt).toBe(5_000);
    expect(room.host.hostId).toBe('host-1');
  });

  it('keeps roomId and joinCode distinct (machine identity vs human discovery)', () => {
    const room = newRoom(createFakeEnvironment());
    expect(room.roomId).not.toBe(room.joinCode);
  });

  it('is immutable at runtime, not just in types', () => {
    const room = newRoom(createFakeEnvironment());
    expect(Object.isFrozen(room)).toBe(true);
    expect(Object.isFrozen(room.players)).toBe(true);
    expect(Object.isFrozen(room.host)).toBe(true);
    expect(() => {
      (room as { state: string }).state = 'PLAYING';
    }).toThrow(TypeError);
    expect(() => {
      (room.players as unknown[]).push({});
    }).toThrow(TypeError);
    expect(room.state).toBe('LOBBY');
  });
});

describe('JOIN', () => {
  it('adds a player with a stable PlayerId, credential, CONNECTED status and join time', () => {
    const env = createFakeEnvironment();
    const room = newRoom(env);
    env.time = 2_000;
    const { room: after, player } = unwrap(joinRoom(room, '  Alvin ', env));
    expect(player.playerId).toBe('player-1');
    expect(player.displayName).toBe('Alvin'); // trimmed
    expect(player.connectionStatus).toBe('CONNECTED');
    expect(player.joinedAt).toBe(2_000);
    expect(player.reconnectToken.reveal()).toBe('reconnect-secret-1');
    expect(after.players).toEqual([player]);
    expect(Object.isFrozen(player)).toBe(true);
  });

  it('never mutates the room it was given', () => {
    const env = createFakeEnvironment();
    const room = newRoom(env);
    unwrap(joinRoom(room, 'Alvin', env));
    expect(room.players).toHaveLength(0);
  });

  it('gives two players different PlayerIds and different credentials', () => {
    const env = createFakeEnvironment();
    const room = withPlayers(env, newRoom(env), ['Alice', 'Bob']);
    const [a, b] = room.players;
    expect(a?.playerId).not.toBe(b?.playerId);
    expect(a?.reconnectToken.reveal()).not.toBe(b?.reconnectToken.reveal());
  });

  it('allows duplicate display names', () => {
    const env = createFakeEnvironment();
    const room = withPlayers(env, newRoom(env), ['Sam', 'Sam']);
    expect(room.players).toHaveLength(2);
  });

  it('treats a generator that repeats a PlayerId as a system fault: throws and changes nothing', () => {
    const env = createFakeEnvironment({ playerIds: ['dup', 'dup'] });
    const room = withPlayers(env, newRoom(env), ['Alice']);
    expect(() => joinRoom(room, 'Bob', env)).toThrow();
    expect(room.players).toHaveLength(1);
  });

  describe('capacity is enforced from configuration', () => {
    it('rejects the seventh player of a 2–6 game with ROOM_FULL', () => {
      const env = createFakeEnvironment();
      const room = withPlayers(env, newRoom(env), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
      expect(room.players).toHaveLength(6);
      expect(joinRoom(room, 'p7', env)).toEqual({ ok: false, reason: 'ROOM_FULL' });
    });

    it('enforces a different game’s capacity (max 3), not a platform constant of six', () => {
      const env = createFakeEnvironment();
      const small = newRoom(env, { gameId: 'trivia', minPlayers: 2, maxPlayers: 3 });
      const full = withPlayers(env, small, ['a', 'b', 'c']);
      expect(joinRoom(full, 'd', env)).toEqual({ ok: false, reason: 'ROOM_FULL' });
      const big = newRoom(env, { gameId: 'party', minPlayers: 2, maxPlayers: 12 });
      expect(
        joinRoom(
          withPlayers(
            env,
            big,
            Array.from({ length: 11 }, (_, i) => `p${i}`),
          ),
          'x',
          env,
        ).ok,
      ).toBe(true);
    });
  });

  describe('only a LOBBY is joinable', () => {
    it.each(ROOM_STATES.filter((s) => s !== 'LOBBY'))('%s → ROOM_NOT_JOINABLE', (state) => {
      const env = createFakeEnvironment();
      const room = roomIn(state, env);
      expect(joinRoom(room, 'Late', env)).toEqual({ ok: false, reason: 'ROOM_NOT_JOINABLE' });
    });
  });

  it.each(['', '   ', 'x'.repeat(17), 'bad\u0000name', '‮evil'])(
    'rejects invalid display name %j with INVALID_DISPLAY_NAME',
    (name) => {
      const env = createFakeEnvironment();
      expect(joinRoom(newRoom(env), name, env)).toEqual({
        ok: false,
        reason: 'INVALID_DISPLAY_NAME',
      });
    },
  );

  describe('failure is atomic', () => {
    it('a failed join leaves the room untouched and draws nothing from the generators', () => {
      const env = createFakeEnvironment();
      const full = withPlayers(env, newRoom(env), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
      const playing = roomIn('PLAYING', env);
      const snapshot = JSON.stringify(full);
      const callsBefore = { ...env.calls };

      expect(joinRoom(full, 'p7', env).ok).toBe(false); // ROOM_FULL
      expect(joinRoom(full, '', env).ok).toBe(false); // INVALID_DISPLAY_NAME
      expect(joinRoom(playing, 'late', env).ok).toBe(false); // ROOM_NOT_JOINABLE

      expect(env.calls).toEqual(callsBefore); // no PlayerId, credential or clock read consumed
      expect(JSON.stringify(full)).toBe(snapshot);
      expect(full.players).toHaveLength(6);
    });

    it('a failed join does not consume capacity: the seat remains available', () => {
      const env = createFakeEnvironment();
      const room = withPlayers(env, newRoom(env), ['p1', 'p2', 'p3', 'p4', 'p5']);
      expect(joinRoom(room, '', env).ok).toBe(false);
      expect(joinRoom(room, '', env).ok).toBe(false);
      expect(joinRoom(room, 'p6', env).ok).toBe(true); // the 6th seat is still there
    });
  });

  it('checks joinable state, then name, then capacity', () => {
    const env = createFakeEnvironment();
    const full = withPlayers(env, newRoom(env), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(joinRoom(full, '', env)).toEqual({ ok: false, reason: 'INVALID_DISPLAY_NAME' });
    expect(joinRoom(roomIn('PLAYING', env), '', env)).toEqual({
      ok: false,
      reason: 'ROOM_NOT_JOINABLE',
    });
  });
});

describe('IDENTITY', () => {
  const env = createFakeEnvironment();
  const room = withPlayers(env, newRoom(env), ['Alice', 'Bob']);
  const [alice, bob] = room.players;
  if (!alice || !bob) throw new Error('test setup');

  it('a ReconnectToken identifies exactly the player it was issued to', () => {
    expect(identifyPlayer(room, alice.reconnectToken.reveal())?.playerId).toBe(alice.playerId);
    expect(identifyPlayer(room, bob.reconnectToken.reveal())?.playerId).toBe(bob.playerId);
  });

  it.each(['', 'wrong', 'reconnect-secret-', 'reconnect-secret-99', 'RECONNECT-SECRET-1'])(
    'a wrong token (%j) cannot claim any player',
    (candidate) => {
      expect(identifyPlayer(room, candidate)).toBeUndefined();
    },
  );

  it('the host is a separate identity: its token claims no player, and player tokens are not the host', () => {
    expect(identifyPlayer(room, room.host.hostToken.reveal())).toBeUndefined();
    expect(isHost(room, room.host.hostToken.reveal())).toBe(true);
    expect(isHost(room, alice.reconnectToken.reveal())).toBe(false);
    expect(isHost(room, '')).toBe(false);
    expect(isHost(room, 'host-secret-')).toBe(false);
    expect(room.players.map((p) => p.playerId as string)).not.toContain(room.host.hostId);
  });

  it('credentials never appear when the room is serialized or stringified', () => {
    const json = JSON.stringify(room);
    for (const secret of [
      alice.reconnectToken.reveal(),
      bob.reconnectToken.reveal(),
      room.host.hostToken.reveal(),
    ]) {
      expect(json).not.toContain(secret);
    }
    expect(json).toContain('[REDACTED]');
    expect(`${JSON.stringify(alice)}${String(alice.reconnectToken)}`).not.toContain(
      alice.reconnectToken.reveal(),
    );
  });
});

describe('STATE MACHINE operations', () => {
  const operations = [
    ['beginStart', beginStart, 'STARTING'],
    ['startPlaying', startPlaying, 'PLAYING'],
    ['finishGame', finishGame, 'RESULTS'],
    ['returnToLobby', returnToLobby, 'LOBBY'],
    ['closeRoom', closeRoom, 'CLOSING'],
    ['completeClose', completeClose, 'CLOSED'],
  ] as const;

  describe.each(operations)('%s', (_name, operation, target) => {
    it.each(ROOM_STATES)('from %s', (from) => {
      const room = roomIn(from);
      const snapshot = JSON.stringify(room);
      const result = operation(room);

      if (canTransition(from, target)) {
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.state).toBe(target);
          expect(Object.isFrozen(result.value)).toBe(true);
          // Only `state` changes.
          expect(result.value).toEqual({ ...room, state: target });
        }
      } else {
        expect(result).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
      }
      // Success or failure, the input room is never mutated.
      expect(JSON.stringify(room)).toBe(snapshot);
      expect(room.state).toBe(from);
    });
  });

  it('runs the full lifecycle LOBBY → STARTING → PLAYING → RESULTS → LOBBY, retaining players', () => {
    const env = createFakeEnvironment();
    const lobby = withPlayers(env, newRoom(env), ['Alice', 'Bob']);
    const again = unwrap(
      returnToLobby(unwrap(finishGame(unwrap(startPlaying(unwrap(beginStart(lobby))))))),
    );
    expect(again.state).toBe('LOBBY');
    expect(again.players).toEqual(lobby.players);
    expect(again.roomId).toBe(lobby.roomId);
  });

  it('a closed room cannot reopen by any operation', () => {
    const closed = roomIn('CLOSED');
    for (const [, operation] of operations) {
      expect(operation(closed)).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
    }
  });

  describe('beginStart requires the configured minimum', () => {
    it('fails with NOT_ENOUGH_PLAYERS below minPlayers, leaving the room unchanged', () => {
      const env = createFakeEnvironment();
      const one = withPlayers(env, newRoom(env), ['Alice']);
      expect(beginStart(one)).toEqual({ ok: false, reason: 'NOT_ENOUGH_PLAYERS' });
      expect(one.state).toBe('LOBBY');
    });

    it('succeeds at exactly minPlayers', () => {
      const env = createFakeEnvironment();
      expect(beginStart(withPlayers(env, newRoom(env), ['Alice', 'Bob'])).ok).toBe(true);
    });

    it('honors a different game’s minimum', () => {
      const env = createFakeEnvironment();
      const room = newRoom(env, { gameId: 'quartet', minPlayers: 4, maxPlayers: 8 });
      expect(beginStart(withPlayers(env, room, ['a', 'b', 'c']))).toEqual({
        ok: false,
        reason: 'NOT_ENOUGH_PLAYERS',
      });
      expect(beginStart(withPlayers(env, room, ['a', 'b', 'c', 'd'])).ok).toBe(true);
    });

    it('reports INVALID_TRANSITION (not NOT_ENOUGH_PLAYERS) when the state is already wrong', () => {
      expect(beginStart(roomIn('PLAYING'))).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
    });
  });
});
