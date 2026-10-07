import { toHostToken, toReconnectToken } from '../../src/credential';
import type { ConsoleEnvironment } from '../../src/environment';
import { toConsoleId, toControllerId, toGameSessionId, toHostId } from '../../src/ids';
import { codeFor } from './fakeEnvironment';

export interface FakeConsoleEnvironment extends ConsoleEnvironment {
  time: number;
  /** If set, served in order (then the fake throws): to provoke collisions. */
  joinCodes?: string[];
}

/** Deterministic ids and credentials, and a clock the test moves by hand. */
export function createFakeConsoleEnvironment(firstCode = 0): FakeConsoleEnvironment {
  let consoles = 0;
  let controllers = 0;
  let games = 0;
  let hosts = 0;
  let tokens = 0;
  let codes = firstCode;
  const env: FakeConsoleEnvironment = {
    time: 1_000,
    now: () => env.time,
    newConsoleId: () => toConsoleId(`console-${(consoles += 1)}`),
    newControllerId: () => toControllerId(`controller-${(controllers += 1)}`),
    newGameSessionId: () => toGameSessionId(`game-${(games += 1)}`),
    newHostId: () => toHostId(`console-host-${(hosts += 1)}`),
    newHostToken: () => toHostToken(`console-host-secret-${(tokens += 1)}`),
    newReconnectToken: () => toReconnectToken(`controller-secret-${(tokens += 1)}`),
    nextJoinCodeCandidate: () => {
      if (env.joinCodes !== undefined) {
        const next = env.joinCodes.shift();
        if (next === undefined) throw new Error('fake join-code script exhausted');
        return next;
      }
      return codeFor((codes += 1));
    },
  };
  return env;
}
