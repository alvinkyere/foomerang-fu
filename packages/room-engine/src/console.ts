import type { ControllerContext, SecondaryAction } from '@foomerang/protocol';
import { validateRoomConfig } from './config';
import type { HostToken, ReconnectToken } from './credential';
import { validateDisplayName } from './displayName';
import type { ConsoleEnvironment } from './environment';
import type { ConsoleId, ControllerId, GameSessionId, HostId, JoinCode } from './ids';
import {
  dropMember,
  reconcileConnection,
  reconcileMember,
  releaseMember,
  type Member,
} from './member';
import { fail, ok, type Result } from './result';
import { CONNECTED, HELD, type Host } from './room';
import { elapsedSince, type ConsoleTimings } from './timing';

/**
 * The console session (ADR-004): one Foomerang on one TV. It owns host ownership, the controllers
 * (phones) that belong to it, what their controls mean (the context) and the active game.
 *
 *   CONNECTION ≠ CONTROLLER ≠ PARTICIPANT ≠ GAME ≠ MATCH
 *
 * A controller is a phone's membership of the console and survives games and Home. A participant
 * is a controller seated in ONE game launch (GameSession) and dies with it. CPUs, slots, matches
 * and rounds live on the console app, never here. Which screen the TV shows is never state here.
 *
 * Values are immutable; every operation returns a new session or a failure.
 */

export type ConsoleState = 'OPEN' | 'CLOSING' | 'CLOSED';
export type ConsoleCloseReason = 'CLOSED_BY_TV' | 'TV_GONE';
/** Why a controller's membership ended: it is told in plain words. */
export type ReleaseReason = 'LEFT' | 'REMOVED' | 'ABSENT' | 'CONSOLE_CLOSED';

export interface Controller extends Member {
  readonly controllerId: ControllerId;
  readonly displayName: string;
  readonly reconnectToken: ReconnectToken;
  readonly joinedAt: number;
  /** Only once RELEASED. */
  readonly releaseReason?: ReleaseReason;
}

/** One launch of one game. The game's own lifecycle reuses the room cycle; CLOSING belongs to the console. */
export type GameState = 'LOBBY' | 'STARTING' | 'PLAYING' | 'RESULTS';
const GAME_TRANSITIONS: Readonly<Record<GameState, readonly GameState[]>> = {
  LOBBY: ['STARTING'],
  STARTING: ['PLAYING'],
  PLAYING: ['RESULTS'],
  RESULTS: ['LOBBY'],
};

export interface GameConfig {
  readonly gameId: string;
  /** Participant capacity of the GAME (Fu: 2–6 with CPUs; the server bounds the humans). */
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

export interface GameSession {
  readonly gameSessionId: GameSessionId;
  readonly config: GameConfig;
  readonly state: GameState;
  /** Human participants, in seat order. Always a subset of the controllers holding membership. */
  readonly participants: readonly ControllerId[];
}

export interface ConsoleContext {
  readonly value: ControllerContext;
  readonly secondaryAction: SecondaryAction;
  /** Monotonic over the console's whole life; phones ignore anything older. */
  readonly version: number;
}

export interface ConsoleSession {
  readonly consoleId: ConsoleId;
  readonly joinCode: JoinCode;
  readonly state: ConsoleState;
  readonly closeReason?: ConsoleCloseReason;
  /** A console limit (8 in V1), never a game's capacity. */
  readonly maxControllers: number;
  readonly host: Host;
  readonly controllers: readonly Controller[];
  readonly context: ConsoleContext;
  readonly activeGame: GameSession | null;
  readonly createdAt: number;
}

export type ConsoleJoinFailure = 'CONSOLE_NOT_JOINABLE' | 'INVALID_DISPLAY_NAME' | 'CONSOLE_FULL';
export type ControllerReconnectFailure =
  'INVALID_CREDENTIAL' | 'MEMBERSHIP_RELEASED' | 'CONSOLE_CLOSING';
export type ControllerFailure =
  'CONTROLLER_NOT_FOUND' | 'ALREADY_DISCONNECTED' | 'ALREADY_RELEASED';
export type HostFailure = 'ALREADY_DISCONNECTED' | 'INVALID_CREDENTIAL' | 'CONSOLE_CLOSING';
export type GameFailure =
  | 'INVALID_STATE'
  | 'GAME_ALREADY_ACTIVE'
  | 'INVALID_GAME_CONFIG'
  | 'STALE_GAME'
  | 'INVALID_TRANSITION'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_PARTICIPANTS'
  | 'UNKNOWN_CONTROLLER'
  | 'TOO_MANY_PARTICIPANTS';
export type CloseFailure = 'INVALID_TRANSITION';

export const DEFAULT_MAX_CONTROLLERS = 8;

export function createConsole(params: {
  consoleId: ConsoleId;
  joinCode: JoinCode;
  maxControllers: number;
  host: { hostId: HostId; hostToken: HostToken };
  now: number;
}): ConsoleSession {
  return Object.freeze({
    consoleId: params.consoleId,
    joinCode: params.joinCode,
    state: 'OPEN',
    maxControllers: params.maxControllers,
    host: Object.freeze({ ...params.host, connection: CONNECTED }),
    controllers: Object.freeze([]),
    context: Object.freeze({ value: 'CONSOLE', secondaryAction: null, version: 1 }),
    activeGame: null,
    createdAt: params.now,
  });
}

// --- queries ---------------------------------------------------------------------------------

export const heldControllers = (session: ConsoleSession): readonly Controller[] =>
  session.controllers.filter((c) => c.membership.status === 'HELD');

/** Is this controller in the active game? NONE when there is no game (or it is not a member). */
export function participationOf(
  session: ConsoleSession,
  controllerId: ControllerId,
): 'NONE' | 'PARTICIPANT' | 'WAITING' {
  const game = session.activeGame;
  const member = session.controllers.find((c) => c.controllerId === controllerId);
  if (game === null || member === undefined || member.membership.status !== 'HELD') return 'NONE';
  return game.participants.includes(controllerId) ? 'PARTICIPANT' : 'WAITING';
}

const MATCH_CONTEXTS: ReadonlySet<ControllerContext> = new Set(['GAMEPLAY', 'PAUSED', 'RESULTS']);

/**
 * What THIS controller's controls mean now. A controller that is not playing while a match is on
 * is WAITING: no game actions and no pause. Outside a match everybody drives the console.
 */
export function effectiveContext(
  session: ConsoleSession,
  controllerId: ControllerId,
): ControllerContext | 'WAITING' {
  const value = session.context.value;
  if (participationOf(session, controllerId) === 'WAITING' && MATCH_CONTEXTS.has(value)) {
    return 'WAITING';
  }
  return value;
}

/** Only active human participants may pause (or resume) a running match. The TV always may. */
export function mayPause(session: ConsoleSession, controllerId: ControllerId): boolean {
  const { value } = session.context;
  return (
    session.activeGame?.state === 'PLAYING' &&
    (value === 'GAMEPLAY' || value === 'PAUSED') &&
    participationOf(session, controllerId) === 'PARTICIPANT'
  );
}

/** Constant time per comparison, no early exit; wrong or empty credentials identify nobody. */
export function identifyController(
  session: ConsoleSession,
  candidate: string,
): Controller | undefined {
  let match: Controller | undefined;
  for (const controller of session.controllers) {
    if (controller.reconnectToken.equals(candidate)) match = controller;
  }
  return match;
}

export const isConsoleHost = (session: ConsoleSession, candidate: string): boolean =>
  session.host.hostToken.equals(candidate);

function assertFreshCredential(session: ConsoleSession, candidate: string): void {
  if (
    session.host.hostToken.equals(candidate) ||
    session.controllers.some((c) => c.reconnectToken.equals(candidate))
  ) {
    throw new Error('ConsoleEnvironment produced a credential already in use in this console');
  }
}

// --- controllers -----------------------------------------------------------------------------

export function joinConsole(
  session: ConsoleSession,
  displayName: string,
  now: number,
  env: ConsoleEnvironment,
): Result<{ session: ConsoleSession; controller: Controller }, ConsoleJoinFailure> {
  if (session.state !== 'OPEN') return fail('CONSOLE_NOT_JOINABLE');
  const name = validateDisplayName(displayName);
  if (name === undefined) return fail('INVALID_DISPLAY_NAME');
  if (heldControllers(session).length >= session.maxControllers) return fail('CONSOLE_FULL');

  const controllerId = env.newControllerId();
  if (session.controllers.some((c) => c.controllerId === controllerId)) {
    throw new Error('ConsoleEnvironment produced a ControllerId already in use in this console');
  }
  const reconnectToken = env.newReconnectToken();
  assertFreshCredential(session, reconnectToken.reveal());
  const controller: Controller = Object.freeze({
    controllerId,
    displayName: name,
    reconnectToken,
    joinedAt: now,
    connection: CONNECTED,
    membership: HELD,
  });
  // Joining makes a controller, never a participant: seating is the game's (and the host's) business.
  return ok({
    session: Object.freeze({
      ...session,
      controllers: Object.freeze([...session.controllers, controller]),
    }),
    controller,
  });
}

function replaceController(session: ConsoleSession, next: Controller): ConsoleSession {
  return Object.freeze({
    ...session,
    controllers: Object.freeze(
      session.controllers.map((c) => (c.controllerId === next.controllerId ? next : c)),
    ),
  });
}

/** A released controller leaves the active game: its seat stays empty; nobody is promoted. */
function withoutParticipants(
  session: ConsoleSession,
  gone: ReadonlySet<ControllerId>,
): ConsoleSession {
  const game = session.activeGame;
  if (game === null || !game.participants.some((p) => gone.has(p))) return session;
  return Object.freeze({
    ...session,
    activeGame: Object.freeze({
      ...game,
      participants: Object.freeze(game.participants.filter((p) => !gone.has(p))),
    }),
  });
}

export function disconnectController(
  session: ConsoleSession,
  controllerId: ControllerId,
  now: number,
): Result<ConsoleSession, ControllerFailure> {
  const current = session.controllers.find((c) => c.controllerId === controllerId);
  if (current === undefined) return fail('CONTROLLER_NOT_FOUND');
  const dropped = dropMember(current, now);
  if (!dropped.ok) return dropped;
  return ok(replaceController(session, dropped.value));
}

/**
 * The phone presents its credential on a new connection: the SAME controller, a rotated
 * credential. `replacedActiveConnection` tells the server to close the older transport.
 */
export function reconnectController(
  session: ConsoleSession,
  candidate: string,
  env: ConsoleEnvironment,
): Result<
  { session: ConsoleSession; controller: Controller; replacedActiveConnection: boolean },
  ControllerReconnectFailure
> {
  const current = identifyController(session, candidate);
  if (current === undefined) return fail('INVALID_CREDENTIAL');
  if (current.membership.status === 'RELEASED') return fail('MEMBERSHIP_RELEASED');
  if (session.state !== 'OPEN') return fail('CONSOLE_CLOSING');
  const reconnectToken = env.newReconnectToken();
  assertFreshCredential(session, reconnectToken.reveal());
  const controller: Controller = Object.freeze({
    ...current,
    reconnectToken,
    connection: CONNECTED,
  });
  return ok({
    session: replaceController(session, controller),
    controller,
    replacedActiveConnection: current.connection.status === 'CONNECTED',
  });
}

/** Left, or removed by the TV: membership ends now and for good (an old credential cannot reclaim it). */
export function releaseController(
  session: ConsoleSession,
  controllerId: ControllerId,
  reason: 'LEFT' | 'REMOVED',
  now: number,
): Result<ConsoleSession, ControllerFailure> {
  const current = session.controllers.find((c) => c.controllerId === controllerId);
  if (current === undefined) return fail('CONTROLLER_NOT_FOUND');
  if (current.membership.status === 'RELEASED') return fail('ALREADY_RELEASED');
  const released: Controller = Object.freeze({
    ...releaseMember(current, now),
    releaseReason: reason,
  });
  return ok(withoutParticipants(replaceController(session, released), new Set([controllerId])));
}

// --- the TV (host) ---------------------------------------------------------------------------

export function disconnectHost(
  session: ConsoleSession,
  now: number,
): Result<ConsoleSession, HostFailure> {
  elapsedSince(session.createdAt, now);
  if (session.host.connection.status !== 'CONNECTED') return fail('ALREADY_DISCONNECTED');
  return ok(
    Object.freeze({
      ...session,
      host: Object.freeze({
        ...session.host,
        connection: Object.freeze({ status: 'RECONNECTING', disconnectedAt: now }),
      }),
    }),
  );
}

export function reconnectHost(
  session: ConsoleSession,
  candidate: string,
  env: ConsoleEnvironment,
): Result<{ session: ConsoleSession; replacedActiveConnection: boolean }, HostFailure> {
  if (!isConsoleHost(session, candidate)) return fail('INVALID_CREDENTIAL');
  if (session.state !== 'OPEN') return fail('CONSOLE_CLOSING');
  const hostToken = env.newHostToken();
  assertFreshCredential(session, hostToken.reveal());
  return ok({
    session: Object.freeze({
      ...session,
      host: Object.freeze({ ...session.host, hostToken, connection: CONNECTED }),
    }),
    replacedActiveConnection: session.host.connection.status === 'CONNECTED',
  });
}

// --- time ------------------------------------------------------------------------------------

/**
 * Brings every time-driven fact up to date as of `now`; returns the SAME session when nothing
 * changed. Phones first (a release may end the party), then the TV: an absent TV closes the session
 * after `unestablishedHostMs` while no controller holds membership, or after `hostRecoveryMs` once a
 * party exists, both measured from the TV's disconnect.
 */
export function reconcileConsole(
  session: ConsoleSession,
  now: number,
  timings: ConsoleTimings,
): ConsoleSession {
  if (session.state !== 'OPEN') return session;
  const memberTimings = {
    reconnectingWindowMs: timings.reconnectingWindowMs,
    reservationMs: timings.membershipReservationMs,
  };
  const gone = new Set<ControllerId>();
  const controllers = session.controllers.map((controller) => {
    const next = reconcileMember(controller, now, memberTimings);
    if (next.membership.status === 'RELEASED' && controller.membership.status === 'HELD') {
      gone.add(controller.controllerId);
      return Object.freeze({ ...next, releaseReason: 'ABSENT' as const });
    }
    return next;
  });
  const controllersChanged = controllers.some((c, i) => c !== session.controllers[i]);

  const settled = reconcileConnection(session.host.connection, now, timings.reconnectingWindowMs);
  const host =
    settled === undefined || settled.connection === session.host.connection
      ? session.host
      : Object.freeze({ ...session.host, connection: settled.connection });

  if (!controllersChanged && host === session.host) {
    return closeIfAbandoned(session, now, timings);
  }
  const next = withoutParticipants(
    Object.freeze({
      ...session,
      host,
      controllers: controllersChanged ? Object.freeze(controllers) : session.controllers,
    }),
    gone,
  );
  return closeIfAbandoned(next, now, timings);
}

function closeIfAbandoned(
  session: ConsoleSession,
  now: number,
  timings: ConsoleTimings,
): ConsoleSession {
  const connection = session.host.connection;
  if (connection.status === 'CONNECTED') return session;
  const established = heldControllers(session).length > 0;
  const limit = established ? timings.hostRecoveryMs : timings.unestablishedHostMs;
  if (elapsedSince(connection.disconnectedAt, now) < limit) return session;
  return close(session, 'TV_GONE', connection.disconnectedAt + limit);
}

// --- closing ---------------------------------------------------------------------------------

function close(session: ConsoleSession, reason: ConsoleCloseReason, at: number): ConsoleSession {
  const controllers = session.controllers.map((c) =>
    c.membership.status === 'HELD'
      ? Object.freeze({ ...releaseMember(c, at), releaseReason: 'CONSOLE_CLOSED' as const })
      : c,
  );
  return withContext(
    Object.freeze({
      ...session,
      state: 'CLOSING',
      closeReason: reason,
      controllers: Object.freeze(controllers),
      activeGame: null,
    }),
    'CONSOLE',
    null,
  );
}

/** The TV closes Foomerang's session: every phone is released (and told), the game ends. */
export function beginClose(
  session: ConsoleSession,
  now: number,
): Result<ConsoleSession, CloseFailure> {
  if (session.state !== 'OPEN') return fail('INVALID_TRANSITION');
  return ok(close(session, 'CLOSED_BY_TV', now));
}

export function completeClose(session: ConsoleSession): Result<ConsoleSession, CloseFailure> {
  if (session.state !== 'CLOSING') return fail('INVALID_TRANSITION');
  return ok(Object.freeze({ ...session, state: 'CLOSED' }));
}

// --- context ---------------------------------------------------------------------------------

function withContext(
  session: ConsoleSession,
  value: ControllerContext,
  secondaryAction: SecondaryAction,
): ConsoleSession {
  const current = session.context;
  if (current.value === value && current.secondaryAction?.label === secondaryAction?.label) {
    return session;
  }
  return Object.freeze({
    ...session,
    context: Object.freeze({ value, secondaryAction, version: current.version + 1 }),
  });
}

/** The TV says what the controls mean. Anything but CONSOLE needs a running match. */
export function setContext(
  session: ConsoleSession,
  value: ControllerContext,
  secondaryAction: SecondaryAction,
): Result<ConsoleSession, 'INVALID_STATE'> {
  if (session.state !== 'OPEN') return fail('INVALID_STATE');
  if (value !== 'CONSOLE' && session.activeGame?.state !== 'PLAYING') return fail('INVALID_STATE');
  return ok(withContext(session, value, secondaryAction));
}

// --- games -----------------------------------------------------------------------------------

/**
 * Launches a game: a fresh game session whose participants are the controllers connected now (a
 * briefly reconnecting phone counts; one whose connection is lost for good does not), in console
 * join order, up to the game's capacity. Everyone else is WAITING. Seats are never carried over.
 */
export function launchGame(
  session: ConsoleSession,
  gameSessionId: GameSessionId,
  config: GameConfig,
): Result<{ session: ConsoleSession; game: GameSession }, GameFailure> {
  if (session.state !== 'OPEN') return fail('INVALID_STATE');
  if (session.activeGame !== null) return fail('GAME_ALREADY_ACTIVE');
  const valid = validateRoomConfig(config);
  if (valid === undefined) return fail('INVALID_GAME_CONFIG');
  const participants = heldControllers(session)
    .filter((c) => c.connection.status !== 'DISCONNECTED')
    .slice(0, valid.maxPlayers)
    .map((c) => c.controllerId);
  const game: GameSession = Object.freeze({
    gameSessionId,
    config: valid,
    state: 'LOBBY',
    participants: Object.freeze(participants),
  });
  return ok({ session: Object.freeze({ ...session, activeGame: game }), game });
}

function currentGame(
  session: ConsoleSession,
  gameSessionId: GameSessionId,
): Result<GameSession, GameFailure> {
  if (session.state !== 'OPEN') return fail('INVALID_STATE');
  const game = session.activeGame;
  if (game === null || game.gameSessionId !== gameSessionId) return fail('STALE_GAME');
  return ok(game);
}

function moveGame(
  session: ConsoleSession,
  gameSessionId: GameSessionId,
  to: GameState,
): Result<ConsoleSession, GameFailure> {
  const game = currentGame(session, gameSessionId);
  if (!game.ok) return game;
  if (!GAME_TRANSITIONS[game.value.state].includes(to)) return fail('INVALID_TRANSITION');
  return ok(Object.freeze({ ...session, activeGame: Object.freeze({ ...game.value, state: to }) }));
}

export function beginMatch(
  session: ConsoleSession,
  gameSessionId: GameSessionId,
): Result<ConsoleSession, GameFailure> {
  const game = currentGame(session, gameSessionId);
  if (!game.ok) return game;
  // Only participants who can actually play count: one who is reconnecting cannot.
  const ready = game.value.participants.filter(
    (id) =>
      session.controllers.find((c) => c.controllerId === id)?.connection.status === 'CONNECTED',
  );
  if (game.value.state === 'LOBBY' && ready.length < game.value.config.minPlayers) {
    return fail('NOT_ENOUGH_PLAYERS');
  }
  return moveGame(session, gameSessionId, 'STARTING');
}

/** The match is on: the controls mean the game. */
export function startPlaying(
  session: ConsoleSession,
  gameSessionId: GameSessionId,
): Result<ConsoleSession, GameFailure> {
  const moved = moveGame(session, gameSessionId, 'PLAYING');
  return moved.ok ? ok(withContext(moved.value, 'GAMEPLAY', null)) : moved;
}

/** The match has ended for the server: back to the console's meaning. */
export function finishMatch(
  session: ConsoleSession,
  gameSessionId: GameSessionId,
): Result<ConsoleSession, GameFailure> {
  const moved = moveGame(session, gameSessionId, 'RESULTS');
  return moved.ok ? ok(withContext(moved.value, 'CONSOLE', null)) : moved;
}

export const returnGameToLobby = (session: ConsoleSession, gameSessionId: GameSessionId) =>
  moveGame(session, gameSessionId, 'LOBBY');

/** Back to Home: the game and its seats end; every controller stays. */
export function exitGame(
  session: ConsoleSession,
  gameSessionId: GameSessionId,
): Result<ConsoleSession, GameFailure> {
  const game = currentGame(session, gameSessionId);
  if (!game.ok) return game;
  return ok(withContext(Object.freeze({ ...session, activeGame: null }), 'CONSOLE', null));
}

/**
 * The host seats / benches. Only in the lobby or between matches (match over: RESULTS), never while
 * a match is running or paused, so nothing changes underneath the people playing.
 */
export function setParticipants(
  session: ConsoleSession,
  gameSessionId: GameSessionId,
  participants: readonly ControllerId[],
): Result<ConsoleSession, GameFailure> {
  const game = currentGame(session, gameSessionId);
  if (!game.ok) return game;
  const { state } = game.value;
  const betweenMatches = state === 'PLAYING' && session.context.value === 'RESULTS';
  if (state !== 'LOBBY' && !betweenMatches) return fail('INVALID_STATE');
  if (new Set(participants).size !== participants.length) return fail('INVALID_PARTICIPANTS');
  const held = new Set(heldControllers(session).map((c) => c.controllerId));
  if (participants.some((id) => !held.has(id))) return fail('UNKNOWN_CONTROLLER');
  if (participants.length > game.value.config.maxPlayers) return fail('TOO_MANY_PARTICIPANTS');
  return ok(
    Object.freeze({
      ...session,
      activeGame: Object.freeze({ ...game.value, participants: Object.freeze([...participants]) }),
    }),
  );
}
