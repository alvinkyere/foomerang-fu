import { describe, expect, it } from 'vitest';
import type { RoomConfig } from '../src/config';
import { toRoomId } from '../src/ids';
import { DEFAULT_MAX_JOIN_CODE_ATTEMPTS, RoomRegistry } from '../src/registry';
import type { Room } from '../src/room';
import { codeFor, createFakeEnvironment, type FakeOptions } from './support/fakeEnvironment';

const FOOMERANG_FU: RoomConfig = { gameId: 'foomerang-fu', minPlayers: 2, maxPlayers: 6 };

function setup(options: FakeOptions = {}, maxJoinCodeAttempts?: number) {
  const env = createFakeEnvironment(options);
  const registry = new RoomRegistry(
    env,
    maxJoinCodeAttempts === undefined ? undefined : { maxJoinCodeAttempts },
  );
  return { env, registry };
}

function create(registry: RoomRegistry, config: RoomConfig = FOOMERANG_FU): Room {
  const result = registry.createRoom(config);
  if (!result.ok) throw new Error(`test setup: createRoom failed: ${result.reason}`);
  return result.value;
}

function join(registry: RoomRegistry, room: Room, name: string) {
  return registry.joinRoom(room.roomId, name);
}

describe('CREATE', () => {
  it('creates a LOBBY room with a unique RoomId and an available JoinCode', () => {
    const { registry } = setup({ joinCodes: ['K7M4PX'] });
    const room = create(registry);
    expect(room.state).toBe('LOBBY');
    expect(room.joinCode).toBe('K7M4PX');
    expect(room.config).toEqual(FOOMERANG_FU);
    expect(registry.getRoom(room.roomId)).toBe(room);
    expect(registry.size).toBe(1);
  });

  it('gives different rooms different RoomIds and JoinCodes', () => {
    const { registry } = setup();
    const a = create(registry);
    const b = create(registry);
    expect(a.roomId).not.toBe(b.roomId);
    expect(a.joinCode).not.toBe(b.joinCode);
    expect(registry.size).toBe(2);
  });

  it('finds a room by join code, case-insensitively', () => {
    const { registry } = setup({ joinCodes: ['K7M4PX'] });
    const room = create(registry);
    expect(registry.findByJoinCode('K7M4PX')).toBe(room);
    expect(registry.findByJoinCode('k7m4px')).toBe(room);
    expect(registry.findByJoinCode('ABCDEF')).toBeUndefined();
    expect(registry.findByJoinCode('not a code')).toBeUndefined();
  });

  it('rejects an invalid configuration without drawing anything from the environment', () => {
    const { registry, env } = setup();
    const result = registry.createRoom({ gameId: 'foomerang-fu', minPlayers: 7, maxPlayers: 6 });
    expect(result).toEqual({ ok: false, reason: 'INVALID_CONFIG' });
    expect(registry.size).toBe(0);
    expect(env.calls.joinCode).toBe(0);
    expect(env.calls.roomId).toBe(0);
  });

  it('hands the host its credential only through an explicit reveal', () => {
    const { registry } = setup();
    const room = create(registry);
    expect(room.host.hostToken.reveal()).toBe('host-secret-1');
    expect(JSON.stringify(room)).not.toContain('host-secret-1');
  });
});

describe('JOIN-CODE COLLISIONS', () => {
  it('retries when a candidate is already in use', () => {
    const { registry, env } = setup({ joinCodes: ['ABCDEF', 'ABCDEF', 'ABCDEF', 'K7M4PX'] });
    const first = create(registry);
    expect(first.joinCode).toBe('ABCDEF');
    const second = create(registry); // ABCDEF taken twice, then K7M4PX is free
    expect(second.joinCode).toBe('K7M4PX');
    expect(env.calls.joinCode).toBe(4);
    expect(registry.size).toBe(2);
  });

  it('treats an invalid candidate as a failed attempt and asks again', () => {
    const { registry } = setup({ joinCodes: ['bad', 'K7M4P0', 'short', 'K7M4PX'] });
    expect(create(registry).joinCode).toBe('K7M4PX');
  });

  it('canonicalizes case before checking availability', () => {
    const { registry } = setup({ joinCodes: ['abcdef', 'ABCDEF', 'K7M4PX'] });
    expect(create(registry).joinCode).toBe('ABCDEF');
    expect(create(registry).joinCode).toBe('K7M4PX'); // 'ABCDEF' collided with the first
  });

  describe('attempts are bounded; exhaustion fails explicitly', () => {
    it('fails with JOIN_CODE_EXHAUSTED after exactly maxJoinCodeAttempts candidates', () => {
      // The script has exactly 1 + 3 entries: a 4th request for a candidate would THROW,
      // so this test also proves the loop is bounded.
      const { registry, env } = setup({ joinCodes: ['ABCDEF', 'ABCDEF', 'ABCDEF', 'ABCDEF'] }, 3);
      create(registry);
      const callsBefore = env.calls.joinCode;
      expect(registry.createRoom(FOOMERANG_FU)).toEqual({
        ok: false,
        reason: 'JOIN_CODE_EXHAUSTED',
      });
      expect(env.calls.joinCode - callsBefore).toBe(3);
    });

    it('defaults to 10 attempts', () => {
      expect(DEFAULT_MAX_JOIN_CODE_ATTEMPTS).toBe(10);
      const taken = Array.from({ length: 11 }, () => 'ABCDEF');
      const { registry, env } = setup({ joinCodes: taken });
      create(registry);
      expect(registry.createRoom(FOOMERANG_FU).ok).toBe(false);
      expect(env.calls.joinCode).toBe(1 + 10);
    });

    it('is a result, not an exception, and leaves no trace', () => {
      const { registry, env } = setup({ joinCodes: ['ABCDEF', 'ABCDEF', 'ABCDEF'] }, 2);
      create(registry);
      const idsBefore = {
        room: env.calls.roomId,
        host: env.calls.hostId,
        token: env.calls.hostToken,
      };
      expect(() => registry.createRoom(FOOMERANG_FU)).not.toThrow();
      expect(registry.size).toBe(1);
      expect({
        room: env.calls.roomId,
        host: env.calls.hostId,
        token: env.calls.hostToken,
      }).toEqual(idsBefore);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'refuses to be constructed with maxJoinCodeAttempts = %s (programming error)',
      (attempts) => {
        expect(() => setup({}, attempts)).toThrow();
      },
    );
  });

  it('treats a repeated RoomId from the environment as a system fault and stores nothing', () => {
    const { registry } = setup({ roomIds: ['same', 'same'] });
    create(registry);
    expect(() => registry.createRoom(FOOMERANG_FU)).toThrow();
    expect(registry.size).toBe(1);
  });
});

describe('JOIN', () => {
  it('joins by join code and stores the updated room', () => {
    const { registry } = setup({ joinCodes: ['K7M4PX'] });
    const room = create(registry);
    const result = registry.joinByCode('k7m4px', 'Alvin');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.player.displayName).toBe('Alvin');
    expect(registry.getRoom(room.roomId)).toBe(result.value.room);
    expect(registry.getRoom(room.roomId)?.players).toHaveLength(1);
  });

  it.each(['ABCDEF', '', 'bad', 'K7M4P0', ' K7M4PX'])(
    'an invalid or unknown join code (%j) fails cleanly with ROOM_NOT_FOUND',
    (code) => {
      const { registry } = setup({ joinCodes: ['K7M4PX'] });
      const room = create(registry);
      const stored = registry.getRoom(room.roomId);
      expect(registry.joinByCode(code, 'Alvin')).toEqual({ ok: false, reason: 'ROOM_NOT_FOUND' });
      expect(registry.getRoom(room.roomId)).toBe(stored);
      expect(registry.size).toBe(1);
    },
  );

  it('joining by an unknown RoomId fails with ROOM_NOT_FOUND', () => {
    const { registry } = setup();
    expect(registry.joinRoom(toRoomId('nope'), 'Alvin')).toEqual({
      ok: false,
      reason: 'ROOM_NOT_FOUND',
    });
  });

  it('the final seat: with 5/6, one join gets 6/6 and the next is ROOM_FULL — never 7/6', () => {
    const { registry } = setup();
    const room = create(registry);
    for (const name of ['p1', 'p2', 'p3', 'p4', 'p5']) join(registry, room, name);
    expect(registry.getRoom(room.roomId)?.players).toHaveLength(5);

    const a = join(registry, room, 'A');
    const b = join(registry, room, 'B');
    expect(a.ok).toBe(true);
    expect(b).toEqual({ ok: false, reason: 'ROOM_FULL' });
    expect(registry.getRoom(room.roomId)?.players).toHaveLength(6);
  });

  it('a failed join leaves the stored room reference identical', () => {
    const { registry } = setup();
    const room = create(registry);
    for (const name of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']) join(registry, room, name);
    const stored = registry.getRoom(room.roomId);
    expect(join(registry, room, 'p7').ok).toBe(false);
    expect(join(registry, room, '').ok).toBe(false);
    expect(registry.getRoom(room.roomId)).toBe(stored);
  });

  it('joining one room never affects another', () => {
    const { registry } = setup();
    const a = create(registry);
    const b = create(registry);
    join(registry, a, 'Alice');
    expect(registry.getRoom(a.roomId)?.players).toHaveLength(1);
    expect(registry.getRoom(b.roomId)?.players).toHaveLength(0);
  });

  it('snapshots handed out cannot be used to corrupt registry state', () => {
    const { registry } = setup();
    const room = create(registry);
    join(registry, room, 'Alice');
    const snapshot = registry.getRoom(room.roomId);
    expect(() => (snapshot?.players as unknown[]).push({})).toThrow(TypeError);
    expect(() => {
      (snapshot as { state: string }).state = 'CLOSED';
    }).toThrow(TypeError);
    expect(registry.getRoom(room.roomId)?.state).toBe('LOBBY');
    expect(registry.getRoom(room.roomId)?.players).toHaveLength(1);
  });
});

describe('IDENTITY through the registry', () => {
  it('identifies players and host by credential; wrong or unknown never matches', () => {
    const { registry } = setup();
    const room = create(registry);
    const joined = join(registry, room, 'Alice');
    if (!joined.ok) throw new Error('setup');
    const { player } = joined.value;

    expect(registry.identifyPlayer(room.roomId, player.reconnectToken.reveal())?.playerId).toBe(
      player.playerId,
    );
    expect(registry.identifyPlayer(room.roomId, 'wrong')).toBeUndefined();
    expect(
      registry.identifyPlayer(toRoomId('nope'), player.reconnectToken.reveal()),
    ).toBeUndefined();
    expect(registry.identifyPlayer(room.roomId, room.host.hostToken.reveal())).toBeUndefined();

    expect(registry.isHost(room.roomId, room.host.hostToken.reveal())).toBe(true);
    expect(registry.isHost(room.roomId, player.reconnectToken.reveal())).toBe(false);
    expect(registry.isHost(toRoomId('nope'), room.host.hostToken.reveal())).toBe(false);
  });

  it('a credential for one room does not authenticate in another', () => {
    const { registry } = setup();
    const a = create(registry);
    const b = create(registry);
    expect(registry.isHost(b.roomId, a.host.hostToken.reveal())).toBe(false);
  });
});

describe('LIFECYCLE through the registry', () => {
  function lobbyWithTwo() {
    const ctx = setup({ joinCodes: ['K7M4PX', 'K7M4PX', 'ZZZZZZ'] });
    const room = create(ctx.registry);
    join(ctx.registry, room, 'Alice');
    join(ctx.registry, room, 'Bob');
    return { ...ctx, room };
  }

  it('walks LOBBY → STARTING → PLAYING → RESULTS → LOBBY, storing each state', () => {
    const { registry, room } = lobbyWithTwo();
    const states: string[] = [];
    for (const op of ['beginStart', 'startPlaying', 'finishGame', 'returnToLobby'] as const) {
      const result = registry[op](room.roomId);
      expect(result.ok, op).toBe(true);
      states.push(registry.getRoom(room.roomId)?.state ?? 'MISSING');
    }
    expect(states).toEqual(['STARTING', 'PLAYING', 'RESULTS', 'LOBBY']);
  });

  it('a prohibited transition fails and leaves the stored room reference identical', () => {
    const { registry, room } = lobbyWithTwo();
    const stored = registry.getRoom(room.roomId);
    expect(registry.finishGame(room.roomId)).toEqual({ ok: false, reason: 'INVALID_TRANSITION' });
    expect(registry.completeClose(room.roomId)).toEqual({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
    expect(registry.getRoom(room.roomId)).toBe(stored);
  });

  it('beginStart enforces the configured minimum and changes nothing on failure', () => {
    const { registry } = setup();
    const room = create(registry);
    join(registry, room, 'Alice');
    const stored = registry.getRoom(room.roomId);
    expect(registry.beginStart(room.roomId)).toEqual({ ok: false, reason: 'NOT_ENOUGH_PLAYERS' });
    expect(registry.getRoom(room.roomId)).toBe(stored);
  });

  it.each([
    'beginStart',
    'startPlaying',
    'finishGame',
    'returnToLobby',
    'closeRoom',
    'completeClose',
  ] as const)('%s on an unknown room is ROOM_NOT_FOUND', (op) => {
    const { registry } = setup();
    expect(registry[op](toRoomId('nope'))).toEqual({ ok: false, reason: 'ROOM_NOT_FOUND' });
  });

  it('a CLOSING room stays registered, keeps its join code reserved and is not joinable', () => {
    const { registry, room } = lobbyWithTwo();
    expect(registry.closeRoom(room.roomId).ok).toBe(true);
    expect(registry.getRoom(room.roomId)?.state).toBe('CLOSING');
    expect(registry.findByJoinCode('K7M4PX')).toBeDefined();
    expect(registry.joinByCode('K7M4PX', 'Late')).toEqual({
      ok: false,
      reason: 'ROOM_NOT_JOINABLE',
    });
    // Code is still reserved: the next candidate K7M4PX collides and ZZZZZZ is used.
    expect(create(registry).joinCode).toBe('ZZZZZZ');
  });

  it('completing the close evicts the room, frees its join code, and it can never reopen', () => {
    const { registry, room } = lobbyWithTwo();
    registry.closeRoom(room.roomId);
    const closed = registry.completeClose(room.roomId);

    expect(closed.ok && closed.value.state).toBe('CLOSED');
    expect(registry.getRoom(room.roomId)).toBeUndefined();
    expect(registry.findByJoinCode('K7M4PX')).toBeUndefined();
    expect(registry.size).toBe(0);

    // Nothing can resurrect it.
    for (const op of [
      'beginStart',
      'startPlaying',
      'finishGame',
      'returnToLobby',
      'closeRoom',
      'completeClose',
    ] as const) {
      expect(registry[op](room.roomId)).toEqual({ ok: false, reason: 'ROOM_NOT_FOUND' });
    }
    expect(registry.joinByCode('K7M4PX', 'Late')).toEqual({ ok: false, reason: 'ROOM_NOT_FOUND' });

    // Its code is free for a NEW room (which gets a new RoomId).
    const reused = create(registry);
    expect(reused.joinCode).toBe('K7M4PX');
    expect(reused.roomId).not.toBe(room.roomId);
  });

  it('closing one room leaves others untouched', () => {
    const { registry } = setup();
    const a = create(registry);
    const b = create(registry);
    registry.closeRoom(a.roomId);
    registry.completeClose(a.roomId);
    expect(registry.getRoom(b.roomId)?.state).toBe('LOBBY');
    expect(registry.size).toBe(1);
  });
});

describe('scale sanity', () => {
  it('allocates many distinct join codes without collisions escaping the index', () => {
    const { registry } = setup({ joinCodes: Array.from({ length: 200 }, (_, i) => codeFor(i)) });
    const codes = new Set<string>();
    for (let i = 0; i < 200; i += 1) codes.add(create(registry).joinCode);
    expect(codes.size).toBe(200);
    expect(registry.size).toBe(200);
  });
});
