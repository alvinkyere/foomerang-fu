import type { ControllerContext, SecondaryAction } from '@foomerang/protocol';
import {
  DEFAULT_MAX_CONTROLLERS,
  beginClose,
  beginMatch,
  completeClose,
  createConsole,
  disconnectController,
  disconnectHost,
  exitGame,
  finishMatch,
  identifyController,
  isConsoleHost,
  joinConsole,
  launchGame,
  reconcileConsole,
  reconnectController,
  reconnectHost,
  releaseController,
  returnGameToLobby,
  setContext,
  setParticipants,
  startPlaying,
  type CloseFailure,
  type ConsoleJoinFailure,
  type ConsoleSession,
  type Controller,
  type ControllerFailure,
  type ControllerReconnectFailure,
  type GameConfig,
  type GameFailure,
  type GameSession,
  type HostFailure,
} from './console';
import { validateRoomConfig } from './config';
import type { ConsoleEnvironment } from './environment';
import {
  parseJoinCode,
  type ConsoleId,
  type ControllerId,
  type GameSessionId,
  type JoinCode,
} from './ids';
import { JoinCodeSpace } from './joinCodes';
import { DEFAULT_MAX_JOIN_CODE_ATTEMPTS } from './registry';
import { fail, ok, type Result } from './result';
import { resolveConsoleTimings, type ConsoleTimings } from './timing';

export interface ConsoleRegistryOptions {
  readonly maxJoinCodeAttempts?: number;
  readonly timings?: Partial<ConsoleTimings>;
  /** Shared with the legacy room registry while both exist (ADR-004 §10). Default: its own. */
  readonly joinCodes?: JoinCodeSpace;
  /** Controllers per console (V1: 8). A console limit, never a game's capacity. */
  readonly maxControllers?: number;
}

type NotFound = 'CONSOLE_NOT_FOUND';

/**
 * Owns the live console sessions of one process. Exactly the legacy registry's discipline: every
 * read-modify-write happens here, synchronously (atomic within the process); each operation reads
 * the injected monotonic clock ONCE, reconciles the session to that instant, applies the operation,
 * and commits ONLY on success (a failure commits nothing, not even the passage of time). Sessions
 * are evicted when CLOSED and their join code goes back to the shared space.
 */
export class ConsoleRegistry {
  readonly #env: ConsoleEnvironment;
  readonly #timings: ConsoleTimings;
  readonly #codes: JoinCodeSpace;
  readonly #maxJoinCodeAttempts: number;
  readonly #maxControllers: number;
  readonly #sessions = new Map<ConsoleId, ConsoleSession>();
  readonly #byJoinCode = new Map<JoinCode, ConsoleId>();
  #lastNow = Number.NEGATIVE_INFINITY;

  constructor(env: ConsoleEnvironment, options: ConsoleRegistryOptions = {}) {
    const attempts = options.maxJoinCodeAttempts ?? DEFAULT_MAX_JOIN_CODE_ATTEMPTS;
    if (!Number.isSafeInteger(attempts) || attempts < 1) {
      throw new Error('maxJoinCodeAttempts must be a positive integer');
    }
    const maxControllers = options.maxControllers ?? DEFAULT_MAX_CONTROLLERS;
    if (!Number.isSafeInteger(maxControllers) || maxControllers < 1) {
      throw new Error('maxControllers must be a positive integer');
    }
    this.#env = env;
    this.#timings = resolveConsoleTimings(options.timings);
    this.#codes = options.joinCodes ?? new JoinCodeSpace();
    this.#maxJoinCodeAttempts = attempts;
    this.#maxControllers = maxControllers;
  }

  get size(): number {
    return this.#sessions.size;
  }

  /** A plain read of the last committed state; it does not advance time. */
  get(consoleId: ConsoleId): ConsoleSession | undefined {
    return this.#sessions.get(consoleId);
  }

  /** Accepts raw user input (any case). Malformed or unknown codes find nothing. */
  findByJoinCode(input: string): ConsoleSession | undefined {
    const code = parseJoinCode(input);
    const id = code === undefined ? undefined : this.#byJoinCode.get(code);
    return id === undefined ? undefined : this.#sessions.get(id);
  }

  /** Foomerang starts on a TV: a console session with a join code and the TV as its host. */
  open(): Result<ConsoleSession, 'JOIN_CODE_EXHAUSTED'> {
    const joinCode = this.#allocateJoinCode();
    if (joinCode === undefined) return fail('JOIN_CODE_EXHAUSTED');
    const consoleId = this.#env.newConsoleId();
    if (this.#sessions.has(consoleId)) {
      throw new Error('ConsoleEnvironment produced a ConsoleId already in use');
    }
    const session = createConsole({
      consoleId,
      joinCode,
      maxControllers: this.#maxControllers,
      host: { hostId: this.#env.newHostId(), hostToken: this.#env.newHostToken() },
      now: this.#now(),
    });
    this.#sessions.set(consoleId, session);
    this.#byJoinCode.set(joinCode, consoleId);
    return ok(session);
  }

  join(
    joinCode: string,
    displayName: string,
  ): Result<{ session: ConsoleSession; controller: Controller }, ConsoleJoinFailure | NotFound> {
    const found = this.findByJoinCode(joinCode);
    if (found === undefined) return fail('CONSOLE_NOT_FOUND');
    return this.#apply(
      found.consoleId,
      (s, now) => joinConsole(s, displayName, now, this.#env),
      (v) => v.session,
    );
  }

  identifyController(consoleId: ConsoleId, candidate: string): Controller | undefined {
    const session = this.#sessions.get(consoleId);
    return session === undefined ? undefined : identifyController(session, candidate);
  }

  isHost(consoleId: ConsoleId, candidate: string): boolean {
    const session = this.#sessions.get(consoleId);
    return session !== undefined && isConsoleHost(session, candidate);
  }

  // --- controllers -----------------------------------------------------------------------------

  disconnectController = (consoleId: ConsoleId, controllerId: ControllerId) =>
    this.#apply<ConsoleSession, ControllerFailure>(
      consoleId,
      (s, now) => disconnectController(s, controllerId, now),
      (s) => s,
    );

  /** Same controller, new transport, rotated credential (see `replacedActiveConnection`). */
  reconnectController = (consoleId: ConsoleId, candidate: string) =>
    this.#apply<
      { session: ConsoleSession; controller: Controller; replacedActiveConnection: boolean },
      ControllerReconnectFailure
    >(
      consoleId,
      (s) => reconnectController(s, candidate, this.#env),
      (v) => v.session,
    );

  /** The phone left, or the TV removed it: membership ends now and for good. */
  releaseController = (
    consoleId: ConsoleId,
    controllerId: ControllerId,
    reason: 'LEFT' | 'REMOVED',
  ) =>
    this.#apply<ConsoleSession, ControllerFailure>(
      consoleId,
      (s, now) => releaseController(s, controllerId, reason, now),
      (s) => s,
    );

  // --- the TV ---------------------------------------------------------------------------------

  disconnectHost = (consoleId: ConsoleId) =>
    this.#apply<ConsoleSession, HostFailure>(
      consoleId,
      (s, now) => disconnectHost(s, now),
      (s) => s,
    );

  reconnectHost = (consoleId: ConsoleId, candidate: string) =>
    this.#apply<{ session: ConsoleSession; replacedActiveConnection: boolean }, HostFailure>(
      consoleId,
      (s) => reconnectHost(s, candidate, this.#env),
      (v) => v.session,
    );

  setContext = (consoleId: ConsoleId, value: ControllerContext, secondaryAction: SecondaryAction) =>
    this.#apply<ConsoleSession, 'INVALID_STATE'>(
      consoleId,
      (s) => setContext(s, value, secondaryAction),
      (s) => s,
    );

  // --- games ----------------------------------------------------------------------------------

  launchGame = (consoleId: ConsoleId, config: GameConfig) =>
    this.#apply<{ session: ConsoleSession; game: GameSession }, GameFailure>(
      consoleId,
      (s) => {
        // Every refusal is decided before an id is drawn, so a refused launch leaves no trace.
        if (s.state !== 'OPEN') return fail('INVALID_STATE');
        if (s.activeGame !== null) return fail('GAME_ALREADY_ACTIVE');
        if (validateRoomConfig(config) === undefined) return fail('INVALID_GAME_CONFIG');
        return launchGame(s, this.#env.newGameSessionId(), config);
      },
      (v) => v.session,
    );

  setParticipants = (
    consoleId: ConsoleId,
    gameSessionId: GameSessionId,
    participants: readonly ControllerId[],
  ) => this.#game(consoleId, (s) => setParticipants(s, gameSessionId, participants));
  beginMatch = (consoleId: ConsoleId, id: GameSessionId) =>
    this.#game(consoleId, (s) => beginMatch(s, id));
  startPlaying = (consoleId: ConsoleId, id: GameSessionId) =>
    this.#game(consoleId, (s) => startPlaying(s, id));
  finishMatch = (consoleId: ConsoleId, id: GameSessionId) =>
    this.#game(consoleId, (s) => finishMatch(s, id));
  returnGameToLobby = (consoleId: ConsoleId, id: GameSessionId) =>
    this.#game(consoleId, (s) => returnGameToLobby(s, id));
  exitGame = (consoleId: ConsoleId, id: GameSessionId) =>
    this.#game(consoleId, (s) => exitGame(s, id));

  // --- closing --------------------------------------------------------------------------------

  beginClose = (consoleId: ConsoleId) =>
    this.#apply<ConsoleSession, CloseFailure>(
      consoleId,
      (s, now) => beginClose(s, now),
      (s) => s,
    );

  /** Evicts the session and frees its join code. It can never come back. */
  completeClose = (consoleId: ConsoleId): Result<ConsoleSession, CloseFailure | NotFound> => {
    const result = this.#apply<ConsoleSession, CloseFailure>(
      consoleId,
      (s) => completeClose(s),
      (s) => s,
    );
    if (result.ok) {
      this.#sessions.delete(consoleId);
      this.#byJoinCode.delete(result.value.joinCode);
      this.#codes.release(result.value.joinCode);
    }
    return result;
  };

  /**
   * The sweep: advances every session to now and returns those that changed (including any the
   * TV's absence has just closed), so the server can tell the people involved.
   */
  reconcile(): readonly ConsoleSession[] {
    const now = this.#now();
    const changed: ConsoleSession[] = [];
    for (const [id, session] of this.#sessions) {
      const current = reconcileConsole(session, now, this.#timings);
      if (current !== session) {
        this.#sessions.set(id, current);
        changed.push(current);
      }
    }
    return changed;
  }

  // --- internals ------------------------------------------------------------------------------

  #game(consoleId: ConsoleId, run: (s: ConsoleSession) => Result<ConsoleSession, GameFailure>) {
    return this.#apply<ConsoleSession, GameFailure>(consoleId, run, (s) => s);
  }

  #now(): number {
    const now = this.#env.now();
    if (!(now >= this.#lastNow)) {
      throw new Error(`Clock went backwards or is not a number: ${now} after ${this.#lastNow}`);
    }
    this.#lastNow = now;
    return now;
  }

  #apply<TValue, TFailure extends string>(
    consoleId: ConsoleId,
    run: (session: ConsoleSession, now: number) => Result<TValue, TFailure>,
    sessionOf: (value: TValue) => ConsoleSession,
  ): Result<TValue, TFailure | NotFound> {
    const stored = this.#sessions.get(consoleId);
    if (stored === undefined) return fail('CONSOLE_NOT_FOUND');
    const now = this.#now();
    const result = run(reconcileConsole(stored, now, this.#timings), now);
    if (result.ok) this.#sessions.set(consoleId, sessionOf(result.value));
    return result;
  }

  #allocateJoinCode(): JoinCode | undefined {
    for (let attempt = 0; attempt < this.#maxJoinCodeAttempts; attempt += 1) {
      const code = parseJoinCode(this.#env.nextJoinCodeCandidate());
      if (code !== undefined && this.#codes.claim(code)) return code;
    }
    return undefined;
  }
}
