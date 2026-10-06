import { parseClientMessage, type ClientMessage, type ErrorCode } from '@foomerang/protocol';
import type { Application } from './application';
import type { Diagnostics } from './diagnostics';
import { classifyMessage, type MessageClass, type RateLimits } from './rateLimit';
import type { CancelFn, Scheduler } from './scheduler';
import { Session } from './session';
import type { ServerTransport, TransportConnection } from './transport';

export interface GatewayConfig {
  readonly handshakeTimeoutMs: number;
  readonly maxConnections: number;
  readonly limits: RateLimits;
}

export interface GatewayDeps {
  readonly transport: ServerTransport;
  readonly application: Application;
  readonly scheduler: Scheduler;
  /** Monotonic milliseconds. Used for rate limiting only. */
  readonly now: () => number;
  readonly diagnostics: Diagnostics;
  readonly config: GatewayConfig;
  readonly onInternalError: (error: unknown) => void;
}

/**
 * The SESSION LAYER. It answers “who is this connection allowed to act as?”, and nothing else:
 *
 *   Transport → [ here ] → Application → room-engine
 *
 * Every inbound message is: classified and rate-limited → parsed (the protocol trust boundary;
 * until then it is `unknown`) → checked against the connection's lifecycle and identity → only
 * then handed to the application. A connection must complete a HANDSHAKE before anything else is
 * accepted, and a reconnect is a new connection that handshakes again.
 */
export class Gateway {
  readonly #deps: GatewayDeps;
  readonly #sessions = new Set<Session>();
  readonly #handshakeTimers = new Map<Session, CancelFn>();
  #stopped = false;

  constructor(deps: GatewayDeps) {
    this.#deps = deps;
  }

  attach(): void {
    this.#deps.transport.onConnection((connection) => this.#accept(connection));
  }

  /** Stop accepting work, cancel timers, close everything. Idempotent. */
  shutdown(): void {
    this.#stopped = true;
    for (const cancel of this.#handshakeTimers.values()) cancel();
    this.#handshakeTimers.clear();
    for (const session of [...this.#sessions]) session.close();
  }

  // ---------------------------------------------------------------------------------------

  #accept(connection: TransportConnection): void {
    const { diagnostics, config, scheduler } = this.#deps;
    if (this.#stopped || this.#sessions.size >= config.maxConnections) {
      diagnostics.increment('connectionsRefused');
      connection.close();
      return;
    }
    const session = new Session(connection, config.limits);
    this.#sessions.add(session);
    diagnostics.increment('connectionsAccepted');

    this.#handshakeTimers.set(
      session,
      scheduler.setTimeout(() => this.#handshakeTimedOut(session), config.handshakeTimeoutMs),
    );
    connection.onMessage((raw) => this.#receive(session, raw));
    connection.onClose(() => this.#closed(session));
  }

  #closed(session: Session): void {
    session.lifecycle = 'CLOSED';
    this.#cancelHandshakeTimer(session);
    this.#sessions.delete(session);
    if (this.#stopped) return;
    try {
      this.#deps.application.sessionClosed(session);
    } catch (error) {
      this.#internalError(error);
    }
  }

  #handshakeTimedOut(session: Session): void {
    this.#handshakeTimers.delete(session);
    if (session.lifecycle !== 'UNNEGOTIATED') return;
    this.#deps.diagnostics.increment('handshakeTimeouts');
    this.#reject(session, 'HANDSHAKE_REQUIRED');
  }

  #receive(session: Session, raw: unknown): void {
    if (session.lifecycle === 'CLOSED' || session.lifecycle === 'REJECTED') return;

    // 1. Cheap classification and budget check BEFORE any parsing work.
    const messageClass = classifyMessage(raw);
    if (!session.admit(messageClass, this.#deps.now())) {
      this.#rateLimited(session, messageClass);
      return;
    }

    // 2. The trust boundary: unknown → typed message, or an error code.
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      this.#invalid(session, parsed.code);
      return;
    }

    // 3. Lifecycle, then authorization, then the application.
    if (session.lifecycle === 'UNNEGOTIATED') {
      this.#negotiate(session, parsed.message);
      return;
    }
    try {
      this.#dispatch(session, parsed.message);
    } catch (error) {
      this.#internalError(error);
      session.send({ type: 'ERROR', payload: { code: 'INTERNAL_ERROR' } });
    }
  }

  #negotiate(session: Session, message: ClientMessage): void {
    if (message.type !== 'HANDSHAKE') {
      // Anything but a handshake first — e.g. INPUT_MOVE — is refused and the connection closed,
      // so a later HANDSHAKE cannot retroactively legitimise it.
      this.#deps.diagnostics.increment('handshakesRejected');
      this.#reject(session, 'HANDSHAKE_REQUIRED');
      return;
    }
    this.#cancelHandshakeTimer(session);
    session.clientType = message.payload.clientType;
    session.lifecycle = 'ACTIVE';
    this.#deps.diagnostics.increment('handshakesAccepted');
    session.send({
      type: 'HANDSHAKE_ACCEPTED',
      payload: { protocolVersion: message.payload.protocolVersion },
    });
  }

  /** ACTIVE connections only. */
  #dispatch(session: Session, message: ClientMessage): void {
    const { application } = this.#deps;
    switch (message.type) {
      case 'HANDSHAKE':
        // Negotiation happens once per transport connection.
        this.#invalid(session, 'INVALID_MESSAGE');
        return;

      case 'HEARTBEAT':
        application.heartbeat(session, message);
        return;

      case 'ROOM_CREATE':
        if (!this.#mayActAsNewHost(session)) return this.#unauthorized(session);
        application.createRoom(session, message.payload.gameId);
        return;
      case 'HOST_RECONNECT':
        if (!this.#mayActAsNewHost(session)) return this.#unauthorized(session);
        application.reconnectHost(session, message.payload.joinCode, message.payload.hostToken);
        return;

      case 'MATCH_START':
        if (session.identity?.kind !== 'HOST') return this.#unauthorized(session);
        application.startMatch(session);
        return;

      case 'ROOM_JOIN':
        if (!this.#mayActAsNewPlayer(session)) return this.#unauthorized(session);
        application.joinRoom(session, message.payload.joinCode, message.payload.displayName);
        return;
      case 'PLAYER_RECONNECT':
        if (!this.#mayActAsNewPlayer(session)) return this.#unauthorized(session);
        application.reconnectPlayer(
          session,
          message.payload.joinCode,
          message.payload.reconnectToken,
        );
        return;

      case 'INPUT_MOVE':
        if (session.identity?.kind !== 'PLAYER') return this.#unauthorized(session);
        // Movement is STATE: ordered within this connection, latest wins. A stale arrival is
        // normal reordering, not a protocol violation — discard it quietly.
        if (message.seq <= session.lastMovementSeq) {
          this.#deps.diagnostics.increment('staleMovementDiscarded');
          return;
        }
        session.lastMovementSeq = message.seq;
        application.routeMove(session, message);
        return;
      case 'INPUT_EVENT':
        if (session.identity?.kind !== 'PLAYER') return this.#unauthorized(session);
        application.routeEvent(session, message);
        return;

      default: {
        const unreachable: never = message;
        throw new Error(`unhandled message: ${JSON.stringify(unreachable)}`);
      }
    }
  }

  // Only a console without an identity may create or reclaim a room; only a controller without
  // an identity may join or reconnect as a player. One connection, one identity.
  #mayActAsNewHost = (session: Session): boolean =>
    session.clientType === 'console' && session.identity === undefined;
  #mayActAsNewPlayer = (session: Session): boolean =>
    session.clientType !== 'console' && session.identity === undefined;

  #unauthorized(session: Session): void {
    this.#deps.diagnostics.increment('unauthorizedMessages');
    session.send({ type: 'ERROR', payload: { code: 'UNAUTHORIZED' } });
  }

  #invalid(session: Session, code: ErrorCode): void {
    if (session.lifecycle === 'UNNEGOTIATED') {
      this.#deps.diagnostics.increment('handshakesRejected');
      this.#reject(session, code);
      return;
    }
    session.invalidMessages += 1;
    this.#deps.diagnostics.increment('invalidMessages');
    session.send({ type: 'ERROR', payload: { code } });
    if (session.invalidMessages > this.#deps.config.limits.maxInvalidMessages) {
      this.#closeForAbuse(session);
    }
  }

  #rateLimited(session: Session, messageClass: MessageClass): void {
    session.droppedMessages += 1;
    this.#deps.diagnostics.increment('rateLimitedMessages');
    if (session.droppedMessages > this.#deps.config.limits.maxDroppedMessages) {
      this.#closeForAbuse(session);
      return;
    }
    if (session.lifecycle === 'UNNEGOTIATED') {
      this.#reject(session, 'RATE_LIMITED');
      return;
    }
    // Quiet drop for high-frequency traffic; an explicit answer for requests a human is waiting on.
    if (messageClass === 'handshake' || messageClass === 'room') {
      session.send({ type: 'ERROR', payload: { code: 'RATE_LIMITED' } });
    }
  }

  #closeForAbuse(session: Session): void {
    this.#deps.diagnostics.increment('connectionsClosedForAbuse');
    this.#reject(session, 'RATE_LIMITED');
  }

  /** Tell the client why, then end the connection. */
  #reject(session: Session, code: ErrorCode): void {
    session.send({ type: 'ERROR', payload: { code } });
    session.lifecycle = 'REJECTED';
    this.#cancelHandshakeTimer(session);
    session.close();
  }

  #cancelHandshakeTimer(session: Session): void {
    this.#handshakeTimers.get(session)?.();
    this.#handshakeTimers.delete(session);
  }

  #internalError(error: unknown): void {
    this.#deps.diagnostics.increment('internalErrors');
    try {
      this.#deps.onInternalError(error);
    } catch {
      // The reporting hook must not be able to break the server either.
    }
  }
}
