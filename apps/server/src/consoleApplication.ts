import type {
  ConsoleEndReason,
  ConsoleServerMessage,
  ControllerContextSetMessage,
  ControllerId as WireControllerId,
  ErrorCode,
  GameParticipantsMessage,
  GameSessionId as WireGameSessionId,
  InputEventMessage,
  InputMoveMessage,
} from '@foomerang/protocol';
import {
  effectiveContext,
  heldControllers,
  mayPause,
  participationOf,
  seatOf,
  toControllerId,
  toGameSessionId,
  type ConnectionStatus,
  type ConsoleId,
  type ConsoleRegistry,
  type ConsoleSession,
  type ControllerId,
  type GameFailure,
  type GameSessionId,
  type Result,
} from '@foomerang/room-engine';
import type { GameDefinition } from './application';
import type { BindingTable } from './bindings';
import { BoundedEventWindow } from './dedup';
import type { Diagnostics } from './diagnostics';
import type { Session } from './session';
import {
  CONSOLE_CLOSE_ERRORS,
  CONSOLE_HOST_ERRORS,
  CONTROLLER_JOIN_ERRORS,
  CONTROLLER_RECONNECT_ERRORS,
  CONTROLLER_REMOVE_ERRORS,
  GAME_ERRORS,
} from './translation';

export interface ConsoleApplicationDeps {
  readonly registry: ConsoleRegistry;
  readonly bindings: BindingTable;
  readonly diagnostics: Diagnostics;
  /** The games this server can host: capacity and the controller their participants render. */
  readonly games: ReadonlyMap<string, GameDefinition>;
  /** The injected monotonic clock (MENU coalescing). */
  readonly now: () => number;
  /** Recent action-event ids remembered per controller. */
  readonly eventWindowCapacity: number;
}

/**
 * Simultaneous PAUSE presses (two participants at once) must make ONE toggle: a routed MENU press
 * blocks further MENU presses in the same console until the meaning changes (the TV answered with a
 * new context) or this long has passed (the TV ignored it: pressing again must still work).
 */
export const MENU_COALESCE_MS = 300;

/**
 * Console-session coordination (ADR-004): turns AUTHORIZED, already-parsed requests into
 * console-registry operations and tells the people concerned. Like the legacy Application it never
 * sees a socket, only sessions.
 *
 * The server owns: the console's existence and join code, the TV's authority, controller
 * membership and credentials, connection binding, release / removal, reconnect and reservation
 * timing, cleanup, the active game launch and its participants (as the TV assigns them, validated
 * here), routing / authorization and the controllers' context. It does NOT own CPUs, seating
 * policy, game configuration, matches, rounds, simulation or which screen the TV shows; and it
 * never infers "a controller joined, so it plays".
 *
 * Every message is built from the registry's authoritative session at that moment. What is kept
 * here is only bookkeeping about what was already SAID (TV status, the last view version and who
 * had a game manifest), so things are sent on change, plus per-controller event dedup and the
 * MENU coalescing mark.
 */
export class ConsoleApplication {
  readonly #deps: ConsoleApplicationDeps;
  readonly #toldHostStatus = new Map<ConsoleId, ConnectionStatus>();
  readonly #toldViews = new Map<
    ConsoleId,
    { version: number; game: GameSessionId | null; seated: ReadonlySet<ControllerId> }
  >();
  readonly #lastMenu = new Map<ConsoleId, { at: number; viewVersion: number }>();
  readonly #eventWindows = new Map<ConsoleId, Map<ControllerId, BoundedEventWindow>>();

  constructor(deps: ConsoleApplicationDeps) {
    this.#deps = deps;
  }

  /** Is this code a console session's? (Codes are unique across rooms and consoles.) */
  owns(joinCode: string): boolean {
    return this.#deps.registry.findByJoinCode(joinCode) !== undefined;
  }

  // --- the TV: the console ------------------------------------------------------------------

  open(session: Session): void {
    const opened = this.#deps.registry.open();
    if (!opened.ok) return this.#error(session, 'INTERNAL_ERROR');
    const console = opened.value;
    this.#deps.bindings.bindConsoleHost(console.consoleId, console.host.hostId, session);
    this.#toldHostStatus.set(console.consoleId, 'CONNECTED');
    this.#toldViews.set(console.consoleId, {
      version: console.viewVersion,
      game: null,
      seated: new Set(),
    });
    session.send({
      type: 'CONSOLE_OPENED',
      payload: { joinCode: console.joinCode, hostToken: console.host.hostToken.reveal() },
    });
    session.send(snapshot(console));
  }

  reconnectHost(session: Session, joinCode: string, hostToken: string): void {
    const found = this.#deps.registry.findByJoinCode(joinCode);
    if (found === undefined) return this.#error(session, 'ROOM_NOT_FOUND');
    const result = this.#deps.registry.reconnectHost(found.consoleId, hostToken);
    if (!result.ok) return this.#error(session, CONSOLE_HOST_ERRORS[result.reason]);
    const console = result.value.session;
    const { superseded } = this.#deps.bindings.bindConsoleHost(
      console.consoleId,
      console.host.hostId,
      session,
    );
    this.#supersede(superseded);
    session.send({
      type: 'HOST_RECONNECTED',
      payload: { joinCode: console.joinCode, hostToken: console.host.hostToken.reveal() },
    });
    session.send(snapshot(console));
    this.#tellHostStatus(console);
  }

  /** The TV removes a controller: its membership ends for good, and the phone is told why. */
  remove(session: Session, controllerId: WireControllerId): void {
    const consoleId = this.#hostConsole(session);
    if (consoleId === undefined) return;
    const id = toControllerId(controllerId);
    const result = this.#deps.registry.releaseController(consoleId, id, 'REMOVED');
    if (!result.ok) return this.#error(session, CONTROLLER_REMOVE_ERRORS[result.reason]);
    const phone = this.#deps.bindings.controllerSession(consoleId, id);
    if (phone !== undefined) this.#end(phone, 'REMOVED');
    this.#changed(result.value);
  }

  /** The TV closes Foomerang's session: every phone is told and closed; the code is freed. */
  close(session: Session): void {
    const consoleId = this.#hostConsole(session);
    if (consoleId === undefined) return;
    const closing = this.#deps.registry.beginClose(consoleId);
    if (!closing.ok) return this.#error(session, CONSOLE_CLOSE_ERRORS[closing.reason]);
    const closed = this.#finish(closing.value, 'CLOSED_BY_TV');
    session.send(snapshot(closed ?? closing.value));
    // The connection may live on and open a new console; it no longer speaks for this one.
    this.#deps.bindings.detach(session);
  }

  // --- the TV: games (C4) -------------------------------------------------------------------

  /** A new launch: a new epoch, with nobody seated (the TV seats). */
  launch(session: Session, gameId: string): void {
    const consoleId = this.#hostConsole(session);
    if (consoleId === undefined) return;
    const game = this.#deps.games.get(gameId);
    if (game === undefined) return this.#error(session, 'UNKNOWN_GAME');
    const result = this.#deps.registry.launchGame(consoleId, {
      gameId,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
    });
    if (!result.ok) return this.#error(session, GAME_ERRORS[result.reason]);
    this.#changed(result.value.session);
  }

  /** The TV's desired participants; the gateway has already dropped a stale `seq`. */
  participants(session: Session, message: GameParticipantsMessage): void {
    const consoleId = this.#hostConsole(session);
    if (consoleId === undefined) return;
    const { gameSessionId, participants } = message.payload;
    this.#gameOp(session, (registry) =>
      registry.setParticipants(
        consoleId,
        toGameSessionId(gameSessionId),
        participants.map((p) => ({ controllerId: toControllerId(p.controllerId), seat: p.seat })),
      ),
    );
  }

  /** LOBBY → STARTING → PLAYING: the controls mean the game (for its participants). */
  matchStart(session: Session, gameSessionId: WireGameSessionId | undefined): void {
    const consoleId = this.#hostConsole(session);
    if (consoleId === undefined) return;
    if (gameSessionId === undefined) return this.#error(session, 'INVALID_MESSAGE');
    const id = toGameSessionId(gameSessionId);
    this.#gameOp(session, (registry) => {
      const begun = registry.beginMatch(consoleId, id);
      if (!begun.ok) return begun;
      const playing = registry.startPlaying(consoleId, id);
      if (!playing.ok) throw new Error(`startPlaying failed after beginMatch: ${playing.reason}`);
      return playing;
    });
  }

  /** PLAYING → RESULTS → LOBBY: back to the console's meaning. */
  matchEnd(session: Session, gameSessionId: WireGameSessionId | undefined): void {
    const consoleId = this.#hostConsole(session);
    if (consoleId === undefined) return;
    if (gameSessionId === undefined) return this.#error(session, 'INVALID_MESSAGE');
    const id = toGameSessionId(gameSessionId);
    this.#gameOp(session, (registry) => {
      const finished = registry.finishMatch(consoleId, id);
      if (!finished.ok) return finished;
      const back = registry.returnGameToLobby(consoleId, id);
      if (!back.ok) throw new Error(`returnGameToLobby failed after finishMatch: ${back.reason}`);
      return back;
    });
  }

  /** Back to Home: the launch, its seats and its routing end; every controller stays. */
  exit(session: Session, gameSessionId: WireGameSessionId): void {
    const consoleId = this.#hostConsole(session);
    if (consoleId === undefined) return;
    const id = toGameSessionId(gameSessionId);
    this.#gameOp(session, (registry) => registry.exitGame(consoleId, id));
  }

  /**
   * The TV says what the controls mean (it can never say WAITING: that is derived per controller).
   * The gateway has dropped a stale `seq`; a context for a launch that is no longer active is
   * dropped here, so a delayed PAUSED for one game can never pause the next.
   */
  context(session: Session, message: ControllerContextSetMessage): void {
    const consoleId = this.#hostConsole(session);
    if (consoleId === undefined) return;
    const { context, secondaryAction, gameSessionId } = message.payload;
    if (gameSessionId === undefined) return this.#error(session, 'INVALID_MESSAGE');
    const console = this.#deps.registry.get(consoleId);
    if (console === undefined) return;
    if ((console.activeGame?.gameSessionId ?? null) !== (gameSessionId ?? null)) {
      this.#deps.diagnostics.increment('staleGameDiscarded');
      return;
    }
    const result = this.#deps.registry.setContext(consoleId, context, secondaryAction);
    if (!result.ok) return this.#error(session, GAME_ERRORS[result.reason]);
    this.#changed(result.value);
  }

  /**
   * The TV asks for ONE controller to vibrate. Passed on only to a participant of THIS console's running match (a request
   * for an ended launch, the lobby, a waiting controller or another console's phone is dropped silently: it is feedback, not
   * a command). The phone is told only its own rumble.
   */
  rumble(
    session: Session,
    payload: {
      gameSessionId: WireGameSessionId;
      controllerId: string;
      intensity: number;
      durationMs: number;
    },
  ): void {
    const consoleId = this.#hostConsole(session);
    if (consoleId === undefined) return;
    const console = this.#deps.registry.get(consoleId);
    const game = console?.activeGame;
    if (
      console === undefined ||
      game === undefined ||
      game === null ||
      game.gameSessionId !== toGameSessionId(payload.gameSessionId)
    ) {
      this.#deps.diagnostics.increment('staleGameDiscarded');
      return;
    }
    if (game.state !== 'PLAYING') return;
    const id = toControllerId(payload.controllerId);
    if (participationOf(console, id) !== 'PARTICIPANT') return;
    this.#deps.bindings.controllerSession(consoleId, id)?.send({
      type: 'RUMBLE',
      payload: {
        gameSessionId: payload.gameSessionId,
        intensity: payload.intensity,
        durationMs: payload.durationMs,
      },
    });
  }

  // --- phones -------------------------------------------------------------------------------

  join(session: Session, joinCode: string, displayName: string): void {
    const result = this.#deps.registry.join(joinCode, displayName);
    if (!result.ok) return this.#error(session, CONTROLLER_JOIN_ERRORS[result.reason]);
    const { session: console, controller } = result.value;
    this.#deps.bindings.bindController(console.consoleId, controller.controllerId, session);
    session.send({
      type: 'CONTROLLER_JOINED',
      payload: {
        controllerId: wireId(controller.controllerId),
        reconnectToken: controller.reconnectToken.reveal(),
      },
    });
    this.#welcome(session, console, controller.controllerId);
    this.#notifyHost(console);
  }

  reconnect(session: Session, joinCode: string, reconnectToken: string): void {
    const found = this.#deps.registry.findByJoinCode(joinCode);
    if (found === undefined) return this.#error(session, 'ROOM_NOT_FOUND');
    const result = this.#deps.registry.reconnectController(found.consoleId, reconnectToken);
    if (!result.ok) return this.#error(session, CONTROLLER_RECONNECT_ERRORS[result.reason]);
    const { session: console, controller } = result.value;
    const { superseded } = this.#deps.bindings.bindController(
      console.consoleId,
      controller.controllerId,
      session,
    );
    this.#supersede(superseded);
    session.send({
      type: 'CONTROLLER_RECONNECTED',
      payload: {
        controllerId: wireId(controller.controllerId),
        reconnectToken: controller.reconnectToken.reveal(),
      },
    });
    this.#welcome(session, console, controller.controllerId);
    this.#notifyHost(console);
  }

  /** The phone leaves Foomerang now: terminal, no reservation wait. */
  leave(session: Session): void {
    const identity = session.identity;
    if (identity?.kind !== 'CONTROLLER') return;
    const result = this.#deps.registry.releaseController(
      identity.consoleId,
      identity.controllerId,
      'LEFT',
    );
    this.#deps.bindings.detach(session);
    if (result.ok) this.#changed(result.value);
  }

  // --- input routing (C4) -------------------------------------------------------------------

  /** Movement: the gateway has already dropped stale `seq` on this connection. */
  routeMove(session: Session, message: InputMoveMessage): void {
    const route = this.#route(session);
    if (route === undefined) return;
    route.host.send({
      type: 'CONTROLLER_INPUT',
      payload: {
        controllerId: wireId(route.controllerId),
        gameSessionId: route.gameSessionId,
        input: { kind: 'MOVE', seq: message.seq, ...message.payload },
      },
    });
    this.#deps.diagnostics.increment('movementRouted');
  }

  /**
   * Button events. A WAITING controller's never reach the TV. A MENU press (pause / resume) needs
   * pause authority (an active participant of a running match) and passes the coalescing window;
   * its release flows for anyone who may act, so the TV never sees a hold that cannot end.
   */
  routeEvent(session: Session, message: InputEventMessage): void {
    const route = this.#route(session);
    if (route === undefined) return;
    const { action, phase } = message.payload;
    if (action === 'MENU' && phase === 'pressed') {
      if (!mayPause(route.console, route.controllerId)) return this.#dropped();
      const now = this.#deps.now();
      const last = this.#lastMenu.get(route.console.consoleId);
      if (
        last !== undefined &&
        last.viewVersion === route.console.viewVersion &&
        now - last.at < MENU_COALESCE_MS
      ) {
        return this.#dropped();
      }
    }
    const window = this.#window(route.console.consoleId, route.controllerId);
    if (window.record(message.eventId) === 'DUPLICATE') {
      this.#deps.diagnostics.increment('duplicateEventsDiscarded');
      return;
    }
    if (action === 'MENU' && phase === 'pressed') {
      this.#lastMenu.set(route.console.consoleId, {
        at: this.#deps.now(),
        viewVersion: route.console.viewVersion,
      });
    }
    route.host.send({
      type: 'CONTROLLER_INPUT',
      payload: {
        controllerId: wireId(route.controllerId),
        gameSessionId: route.gameSessionId,
        input: { kind: 'ACTION', eventId: message.eventId, action, phase },
      },
    });
    this.#deps.diagnostics.increment('eventsRouted');
  }

  // --- transports and time ------------------------------------------------------------------

  /**
   * A transport ended. Only the connection that CURRENTLY speaks for an identity can disconnect
   * it; a superseded connection's late close is ignored (the stale-close race).
   */
  sessionClosed(session: Session): void {
    const identity = session.identity;
    if (identity === undefined) return;
    if (identity.kind !== 'CONSOLE_HOST' && identity.kind !== 'CONTROLLER') return;
    if (!this.#deps.bindings.release(session)) {
      this.#deps.diagnostics.increment('staleClosesIgnored');
      return;
    }
    if (identity.kind === 'CONTROLLER') {
      const result = this.#deps.registry.disconnectController(
        identity.consoleId,
        identity.controllerId,
      );
      if (result.ok) this.#notifyHost(result.value);
      return;
    }
    const result = this.#deps.registry.disconnectHost(identity.consoleId);
    if (result.ok) this.#tellHostStatus(result.value);
  }

  /**
   * Housekeeping: advance every console to now, tell the TV and phones what changed, and end the
   * consoles whose TV did not come back in time. Correctness never depends on how often it runs.
   */
  reconcileSweep(): void {
    for (const console of this.#deps.registry.reconcile()) {
      if (console.state === 'CLOSING') {
        this.#finish(console, 'TV_GONE');
        continue;
      }
      this.#changed(console);
      this.#tellHostStatus(console);
    }
  }

  // --- internals ----------------------------------------------------------------------------

  /** Who may this connection's input be routed for, if anyone? (Identity: the connection's.) */
  #route(session: Session):
    | {
        console: ConsoleSession;
        controllerId: ControllerId;
        host: Session;
        gameSessionId: WireGameSessionId | null;
      }
    | undefined {
    const identity = session.identity;
    if (identity?.kind !== 'CONTROLLER') return undefined;
    const console = this.#deps.registry.get(identity.consoleId);
    if (console === undefined) return undefined;
    if (effectiveContext(console, identity.controllerId) === 'WAITING') {
      this.#dropped();
      return undefined;
    }
    const host = this.#deps.bindings.consoleHostSession(console.consoleId);
    if (host === undefined) {
      this.#deps.diagnostics.increment('inputDroppedNoHost');
      return undefined;
    }
    const game = console.activeGame?.gameSessionId;
    return {
      console,
      controllerId: identity.controllerId,
      host,
      gameSessionId: game === undefined ? null : wireGameId(game),
    };
  }

  #dropped(): void {
    this.#deps.diagnostics.increment('consoleInputDropped');
  }

  /**
   * Runs one game operation: a launch that is no longer active is dropped quietly (and counted);
   * any other refusal is an error to the TV; success tells everyone concerned.
   */
  #gameOp(
    session: Session,
    run: (registry: ConsoleRegistry) => Result<ConsoleSession, GameFailure | 'CONSOLE_NOT_FOUND'>,
  ): void {
    const result = run(this.#deps.registry);
    if (!result.ok) {
      if (result.reason === 'STALE_GAME') {
        this.#deps.diagnostics.increment('staleGameDiscarded');
        return;
      }
      return this.#error(session, GAME_ERRORS[result.reason]);
    }
    this.#changed(result.value);
  }

  /** After any committed change: the TV's snapshot, and the phones' views if their meaning moved. */
  #changed(console: ConsoleSession): void {
    this.#notifyHost(console);
    this.#syncViews(console);
  }

  /**
   * Sends every bound phone its view when the console's view version has moved. A phone that has
   * just become a participant of this launch gets the game's manifest FIRST, so it never holds a
   * game meaning without the controls for it.
   */
  #syncViews(console: ConsoleSession): void {
    const told = this.#toldViews.get(console.consoleId);
    if (told?.version === console.viewVersion) return;
    const game = console.activeGame?.gameSessionId ?? null;
    const seated = new Set((console.activeGame?.participants ?? []).map((p) => p.controllerId));
    for (const phone of this.#deps.bindings.controllerSessions(console.consoleId)) {
      const identity = phone.identity;
      if (identity?.kind !== 'CONTROLLER') continue;
      const id = identity.controllerId;
      const newlySeated = seated.has(id) && (told?.game !== game || !told.seated.has(id));
      if (newlySeated) this.#sendManifest(phone, console);
      phone.send(view(console, id));
    }
    this.#toldViews.set(console.consoleId, { version: console.viewVersion, game, seated });
  }

  /** Identity first, then (if it plays) the game's controls, its meaning, the TV's status. */
  #welcome(session: Session, console: ConsoleSession, controllerId: ControllerId): void {
    if (participationOf(console, controllerId) === 'PARTICIPANT')
      this.#sendManifest(session, console);
    session.send(view(console, controllerId));
    session.send({
      type: 'CONSOLE_STATUS',
      payload: { hostConnection: console.host.connection.status },
    });
  }

  #sendManifest(session: Session, console: ConsoleSession): void {
    const gameId = console.activeGame?.config.gameId;
    const game = gameId === undefined ? undefined : this.#deps.games.get(gameId);
    if (gameId === undefined || game === undefined) return;
    session.send({
      type: 'CONTROLLER_MANIFEST',
      payload: {
        gameId,
        orientation: game.controller.orientation,
        controls: [...game.controller.controls],
      },
    });
  }

  /** CLOSING → every phone told and closed → CLOSED, evicted, code freed. Returns the CLOSED value. */
  #finish(console: ConsoleSession, reason: ConsoleEndReason): ConsoleSession | undefined {
    for (const phone of this.#deps.bindings.controllerSessions(console.consoleId)) {
      this.#end(phone, reason);
    }
    const host = this.#deps.bindings.consoleHostSession(console.consoleId);
    if (host !== undefined && reason === 'TV_GONE') this.#deps.bindings.detach(host);
    this.#deps.bindings.forgetConsole(console.consoleId);
    this.#toldHostStatus.delete(console.consoleId);
    this.#toldViews.delete(console.consoleId);
    this.#lastMenu.delete(console.consoleId);
    this.#eventWindows.delete(console.consoleId);
    const closed = this.#deps.registry.completeClose(console.consoleId);
    return closed.ok ? closed.value : undefined;
  }

  /** This phone's membership is over: tell it why, strip its identity, close its connection. */
  #end(phone: Session, reason: ConsoleEndReason): void {
    phone.send({ type: 'CONSOLE_ENDED', payload: { reason } });
    this.#deps.bindings.detach(phone);
    phone.close();
  }

  #notifyHost(console: ConsoleSession): void {
    this.#deps.bindings.consoleHostSession(console.consoleId)?.send(snapshot(console));
  }

  /** Phones hear about the TV's connection only when it changes. */
  #tellHostStatus(console: ConsoleSession): void {
    const status = console.host.connection.status;
    if (this.#toldHostStatus.get(console.consoleId) === status) return;
    this.#toldHostStatus.set(console.consoleId, status);
    for (const phone of this.#deps.bindings.controllerSessions(console.consoleId)) {
      phone.send({ type: 'CONSOLE_STATUS', payload: { hostConnection: status } });
    }
  }

  #window(consoleId: ConsoleId, controllerId: ControllerId): BoundedEventWindow {
    let windows = this.#eventWindows.get(consoleId);
    if (windows === undefined) {
      windows = new Map();
      this.#eventWindows.set(consoleId, windows);
    }
    let window = windows.get(controllerId);
    if (window === undefined) {
      window = new BoundedEventWindow(this.#deps.eventWindowCapacity);
      windows.set(controllerId, window);
    }
    return window;
  }

  #hostConsole(session: Session): ConsoleId | undefined {
    const identity = session.identity;
    return identity?.kind === 'CONSOLE_HOST' ? identity.consoleId : undefined;
  }

  #supersede(previous: Session | undefined): void {
    if (previous === undefined) return;
    this.#deps.diagnostics.increment('takeovers');
    previous.close();
  }

  #error(session: Session, code: ErrorCode): void {
    session.send({ type: 'ERROR', payload: { code } });
  }
}

/**
 * The seam between domain and wire ids. Both are server-issued opaque strings; the brands differ on
 * purpose (a domain id is never a wire id by accident), so the crossing is spelled out here.
 */
const wireId = (id: ControllerId): WireControllerId => id as string as WireControllerId;
const wireGameId = (id: GameSessionId): WireGameSessionId => id as string as WireGameSessionId;

/**
 * The TV's snapshot: a consumer of the authoritative session. Controllers that hold membership, in
 * console join order; the active launch with its seated participants; never a credential, never a
 * CPU.
 */
function snapshot(console: ConsoleSession): ConsoleServerMessage {
  const game = console.activeGame;
  return {
    type: 'CONSOLE_UPDATED',
    payload: {
      joinCode: console.joinCode,
      state: console.state,
      hostConnection: console.host.connection.status,
      controllers: heldControllers(console).map((c) => ({
        controllerId: wireId(c.controllerId),
        displayName: c.displayName,
        connection: c.connection.status,
        membership: c.membership.status,
      })),
      game:
        game === null
          ? null
          : {
              gameSessionId: wireGameId(game.gameSessionId),
              gameId: game.config.gameId,
              state: game.state,
              participants: game.participants.map((p) => ({
                controllerId: wireId(p.controllerId),
                seat: p.seat,
              })),
            },
    },
  };
}

/** One phone's view: only what THIS controller needs, in one atomic message. */
function view(console: ConsoleSession, controllerId: ControllerId): ConsoleServerMessage {
  const game = console.activeGame;
  const participation = participationOf(console, controllerId);
  const seat = seatOf(console, controllerId);
  return {
    type: 'CONTROLLER_CONTEXT',
    payload: {
      context: effectiveContext(console, controllerId),
      secondaryAction: console.context.secondaryAction,
      version: console.viewVersion,
      participation:
        game === null || participation === 'NONE'
          ? null
          : participation === 'PARTICIPANT' && seat !== undefined
            ? { gameSessionId: wireGameId(game.gameSessionId), status: 'PARTICIPANT', seat }
            : { gameSessionId: wireGameId(game.gameSessionId), status: 'WAITING' },
    },
  };
}
