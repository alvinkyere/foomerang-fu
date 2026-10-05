import type { RoomConfig } from '../../src/config';
import { parseJoinCode } from '../../src/ids';
import {
  beginStart,
  closeRoom,
  completeClose,
  createRoom,
  finishGame,
  joinRoom,
  startPlaying,
  type Player,
  type Room,
} from '../../src/room';
import type { RoomState } from '../../src/state';
import type { FakeEnvironment } from './fakeEnvironment';
import { createFakeEnvironment } from './fakeEnvironment';

export const FOOMERANG_FU: RoomConfig = { gameId: 'foomerang-fu', minPlayers: 2, maxPlayers: 6 };

export function newRoom(env: FakeEnvironment, config: RoomConfig = FOOMERANG_FU): Room {
  const joinCode = parseJoinCode('K7M4PX');
  if (!joinCode) throw new Error('test setup: bad join code');
  return createRoom({
    roomId: env.newRoomId(),
    joinCode,
    config,
    host: { hostId: env.newHostId(), hostToken: env.newHostToken() },
    now: env.time,
  });
}

export function unwrap<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`test setup: unexpected failure ${result.reason}`);
  return result.value;
}

/** Joins each name at the environment's current time. */
export function withPlayers(env: FakeEnvironment, room: Room, names: string[]): Room {
  return names.reduce((current, name) => {
    const joined = joinRoom(current, name, env.time, env);
    if (!joined.ok) throw new Error(`test setup: ${name} could not join: ${joined.reason}`);
    return joined.value.room;
  }, room);
}

export function playerNamed(room: Room, name: string): Player {
  const player = room.players.find((p) => p.displayName === name);
  if (!player) throw new Error(`test setup: no player named ${name}`);
  return player;
}

/** A room (with 2 connected players, the minimum) driven into `state` via real operations. */
export function roomIn(state: RoomState, env = createFakeEnvironment()): Room {
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
  return room;
}
