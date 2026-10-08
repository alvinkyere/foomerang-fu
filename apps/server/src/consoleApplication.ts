import type {
  ConsoleEndReason,
  ConsoleServerMessage,
  ControllerId as WireControllerId,
  ErrorCode,
} from '@foomerang/protocol';
import {
  effectiveContext,
  heldControllers,
  toControllerId,
  type ConnectionStatus,
  type ConsoleId,
  type ConsoleRegistry,
  type ConsoleSession,
  type ControllerId,
} from '@foomerang/room-engine';
import type { BindingTable } from './bindings';
import type { Diagnostics } from './diagnostics';
import type { Session } from './session';
import {
  CONSOLE_CLOSE_ERRORS,
  CONSOLE_HOST_ERRORS,
  CONTROLLER_JOIN_ERRORS,
  CONTROLLER_RECONNECT_ERRORS,
  CONTROLLER_REMOVE_ERRORS,
} from './translation';

export interface ConsoleApplicationDeps {
  readonly registry: ConsoleRegistry;
  readonly bindings: BindingTable;
  readonly diagnostics: Diagnostics;
}

/**
 * Console-session coordination (ADR-004, Checkpoint C3): turns AUTHORIZED, already-parsed requests
 * into console-registry operations and tells the people concerned. Like the legacy Application it
 * never sees a socket, only sessions.
 *
 * The server owns: the console's existence and join code, the TV's authority, controller
 * membership and credentials, connection binding, release / removal, reconnect and reservation
 * timing, cleanup, and snapshot / status routing. It does NOT own CPUs, lobby composition, matches,
 * rounds, simulation or which screen the TV shows.
 *
 * Every message it sends is built from the registry's authoritative session at that moment; there
 * is no parallel copy of console state here, only the last TV status each console's phones were
 * told (so a status is sent on change, not on every sweep).
 */
export class ConsoleApplication {
  readonly #deps: ConsoleApplicationDeps;
  readonly #toldHostStatus = new Map<ConsoleId, ConnectionStatus>();

  constructor(deps: ConsoleApplicationDeps) {
    this.#deps = deps;
  }

  /** Is this code a console session's? (Codes are unique across rooms and consoles.) */
  owns(joinCode: string): boolean {
    return this.#deps.registry.findByJoinCode(joinCode) !== undefined;
  }

  // --- the TV ---------------------------------------------------------------------------------

  open(session: Session): void {
    const opened = this.#deps.registry.open();
    if (!opened.ok) return this.#error(session, 'INTERNAL_ERROR');
    const console = opened.value;
    this.#deps.bindings.bindConsoleHost(console.consoleId, console.host.hostId, session);
    this.#toldHostStatus.set(console.consoleId, 'CONNECTED');
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
    this.#notifyHost(result.value);
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

  // --- phones ---------------------------------------------------------------------------------

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
    if (result.ok) this.#notifyHost(result.value);
  }

  // --- transports and time --------------------------------------------------------------------

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
      this.#notifyHost(console);
      this.#tellHostStatus(console);
    }
  }

  // --- internals ------------------------------------------------------------------------------

  /** Identity first, then what its controls mean, then the TV's status: never a wrong label. */
  #welcome(session: Session, console: ConsoleSession, controllerId: ControllerId): void {
    session.send(view(console, controllerId));
    session.send({
      type: 'CONSOLE_STATUS',
      payload: { hostConnection: console.host.connection.status },
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

/**
 * The TV's snapshot: a consumer of the authoritative session. Controllers that hold membership, in
 * console join order; never a credential. (Released memberships are history, not management.)
 */
function snapshot(console: ConsoleSession): ConsoleServerMessage {
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
      // Games are served from C4; until then a console never has one.
      game: null,
    },
  };
}

/** One phone's view: only what THIS controller needs. */
function view(console: ConsoleSession, controllerId: ControllerId): ConsoleServerMessage {
  return {
    type: 'CONTROLLER_CONTEXT',
    payload: {
      context: effectiveContext(console, controllerId),
      secondaryAction: console.context.secondaryAction,
      version: console.context.version,
      participation: null, // C4: participation in the active game launch
    },
  };
}
