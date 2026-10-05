import { JOIN_CODE_ALPHABET } from '@foomerang/protocol';
import { toHostToken, toReconnectToken } from '../../src/credential';
import type { RoomEnvironment } from '../../src/environment';
import { toHostId, toPlayerId, toRoomId } from '../../src/ids';

export interface FakeOptions {
  /** If given, candidates are served in order and the fake THROWS when they run out. */
  joinCodes?: string[];
  playerIds?: string[];
  roomIds?: string[];
}

export interface FakeEnvironment extends RoomEnvironment {
  time: number;
  readonly calls: Record<
    'now' | 'roomId' | 'playerId' | 'hostId' | 'reconnectToken' | 'hostToken' | 'joinCode',
    number
  >;
}

/** n-th distinct valid join code: AAAAAA, AAAAAB, ... (base-31 over the real alphabet). */
export function codeFor(n: number): string {
  const base = JOIN_CODE_ALPHABET.length;
  let rest = n;
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code = JOIN_CODE_ALPHABET.charAt(rest % base) + code;
    rest = Math.floor(rest / base);
  }
  return code;
}

function scripted(name: string, script: string[] | undefined, fallback: (n: number) => string) {
  let index = 0;
  return (): string => {
    if (!script) return fallback((index += 1));
    const next = script[index];
    index += 1;
    if (next === undefined) throw new Error(`fake ${name} script exhausted`);
    return next;
  };
}

export function createFakeEnvironment(options: FakeOptions = {}): FakeEnvironment {
  const calls: FakeEnvironment['calls'] = {
    now: 0,
    roomId: 0,
    playerId: 0,
    hostId: 0,
    reconnectToken: 0,
    hostToken: 0,
    joinCode: 0,
  };
  const roomId = scripted('roomId', options.roomIds, (n) => `room-${n}`);
  const playerId = scripted('playerId', options.playerIds, (n) => `player-${n}`);
  const joinCode = scripted('joinCode', options.joinCodes, codeFor);

  const env: FakeEnvironment = {
    time: 1_000,
    calls,
    now: () => {
      calls.now += 1;
      return env.time;
    },
    newRoomId: () => {
      calls.roomId += 1;
      return toRoomId(roomId());
    },
    newPlayerId: () => {
      calls.playerId += 1;
      return toPlayerId(playerId());
    },
    newHostId: () => {
      calls.hostId += 1;
      return toHostId(`host-${calls.hostId}`);
    },
    newReconnectToken: () => {
      calls.reconnectToken += 1;
      return toReconnectToken(`reconnect-secret-${calls.reconnectToken}`);
    },
    newHostToken: () => {
      calls.hostToken += 1;
      return toHostToken(`host-secret-${calls.hostToken}`);
    },
    nextJoinCodeCandidate: () => {
      calls.joinCode += 1;
      return joinCode();
    },
  };
  return env;
}
