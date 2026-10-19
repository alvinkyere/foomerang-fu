import {
  browserEnvironment,
  type Cancel,
  type ControllerTransport,
  type SessionEnvironment,
} from '@foomerang/controller-sdk';
import {
  PROTOCOL_VERSION,
  parseServerMessage,
  type Action,
  type ControllerContext,
  type ErrorCode,
  type InputAction,
  type RosterEntry,
  type SecondaryAction,
} from '@foomerang/protocol';
import type { HostStore } from './hostStore';

/**
 * How the console talks to the server. Structurally the same contract as a controller's transport
 * (one object = one connection), so the same Socket.IO adapter serves both. React and Phaser see
 * only HostSession; they never touch a socket.
 */
export type HostTransport = ControllerTransport;
export type HostTransportFactory = () => HostTransport;

export type HostPhase = 'IDLE' | 'CONNECTING' | 'CREATING' | 'ACTIVE' | 'RECONNECTING' | 'ENDED';

export type HostFailure =
  | { readonly kind: 'SERVER'; readonly code: ErrorCode }
  | { readonly kind: 'CONNECTION_FAILED' }
  | { readonly kind: 'CONNECTION_LOST' };

type RoomState = 'LOBBY' | 'STARTING' | 'PLAYING' | 'RESULTS' | 'CLOSING' | 'CLOSED';

/** UI state. Immutable. Deliberately holds NO credential. */
export interface HostState {
  readonly phase: HostPhase;
  readonly joinCode: string | undefined;
  /** Which game this room runs (e.g. 'foomerang-fu'). */
  readonly gameId: string | undefined;
  readonly roomState: RoomState | undefined;
  readonly roster: readonly RosterEntry[];
  readonly failure: HostFailure | undefined;
  /** A refused request (e.g. Start with too few players) that did not end the session. */
  readonly notice: ErrorCode | undefined;
  /**
   * This console page reclaimed the room after a reload (it did not create it): any match the room was playing was
   * running in the page that is gone.
   */
  readonly reclaimed: boolean;
  /** The reclaimed room was in the middle of a match whose simulation was lost: the match was ended and the room is back in the lobby. */
  readonly matchInterrupted: boolean;
}

export interface HostDiagnostics {
  /** Round trip of this console's own heartbeat: one clock, request → response. */
  readonly rttMs: number | undefined;
  readonly reconnects: number;
  readonly movementReceived: number;
  readonly actionsReceived: number;
  readonly ignoredInbound: number;
}

export interface HostSessionOptions {
  readonly transportFactory: HostTransportFactory;
  readonly store?: HostStore;
  readonly environment?: SessionEnvironment;
  readonly clientVersion?: string;
  readonly heartbeatIntervalMs?: number;
  readonly reconnect?: { readonly timeoutMs?: number; readonly backoffMs?: readonly number[] };
}

/** `seq` is the sender's movement sequence on its current connection (it restarts when the phone reconnects). */
export type MovementHandler = (playerId: string, x: number, y: number, seq: number) => void;

/** An authenticated button event from a controller: a game action or a system one (MENU). `eventId` is the sender's unique id for it. */
export interface ControllerAction {
  readonly playerId: string;
  readonly eventId: string;
  readonly action: InputAction;
  readonly phase: 'pressed' | 'released';
}
/** A button event that means something to the GAME. System actions never take this shape. */
export interface PlayerAction extends ControllerAction {
  readonly action: Action;
}
export type ActionHandler = (action: ControllerAction) => void;

const IDLE: HostState = Object.freeze({
  phase: 'IDLE',
  joinCode: undefined,
  gameId: undefined,
  roomState: undefined,
  roster: Object.freeze([]) as readonly RosterEntry[],
  failure: undefined,
  notice: undefined,
  reclaimed: false,
  matchInterrupted: false,
});

/** Reconnect failures that retrying cannot fix. */
const FINAL_ERRORS: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'ROOM_NOT_FOUND',
  'ROOM_CLOSING',
  'UNAUTHORIZED',
  'UNSUPPORTED_PROTOCOL',
]);

const DEFAULT_BACKOFF_MS = [250, 500, 1_000, 2_000] as const;
const HEARTBEAT_MEMORY = 16;

const sameRoster = (a: readonly RosterEntry[], b: readonly RosterEntry[]): boolean =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i];
    return (
      y !== undefined &&
      x.playerId === y.playerId &&
      x.displayName === y.displayName &&
      x.connection === y.connection &&
      x.seat === y.seat
    );
  });

/**
 * Everything between the console UI and the wire: handshake as a console, creating or reclaiming
 * the room, the credential (kept private and rotated), the roster, MATCH_START, authenticated
 * player movement, a heartbeat for RTT, and reconnection with backoff.
 */
export class HostSession {
  readonly #factory: HostTransportFactory;
  readonly #store: HostStore | undefined;
  readonly #env: SessionEnvironment;
  readonly #clientVersion: string;
  readonly #heartbeatIntervalMs: number;
  readonly #reconnectTimeoutMs: number;
  readonly #backoffMs: readonly number[];
  readonly #listeners = new Set<() => void>();
  readonly #movementHandlers = new Set<MovementHandler>();
  readonly #actionHandlers = new Set<ActionHandler>();

  #state: HostState = IDLE;
  #hostToken: string | undefined;
  #gameId: string | undefined;
  #transport: HostTransport | undefined;
  #epoch = 0;
  #intent: 'CREATE' | 'RECONNECT' = 'CREATE';
  #disposed = false;

  /** What the controllers' controls should mean, as the console last decided; re-sent on every new connection. */
  #desiredContext: { context: ControllerContext; secondaryAction: SecondaryAction } | undefined;
  #sentContextKey: string | undefined;
  #contextSeq = 0;

  #heartbeatSeq = 0;
  readonly #heartbeatSentAt = new Map<number, number>();
  #cancelHeartbeat: Cancel | undefined;
  #cancelRetry: Cancel | undefined;
  #reconnectStartedAt = 0;
  #attempt = 0;

  #rttMs: number | undefined;
  #reconnects = 0;
  #movementReceived = 0;
  #actionsReceived = 0;
  #ignoredInbound = 0;

  constructor(options: HostSessionOptions) {
    this.#factory = options.transportFactory;
    this.#store = options.store;
    this.#env = options.environment ?? browserEnvironment;
    this.#clientVersion = options.clientVersion ?? '0.1.0';
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? 2_000;
    this.#reconnectTimeoutMs = options.reconnect?.timeoutMs ?? 70_000;
    this.#backoffMs = options.reconnect?.backoffMs ?? DEFAULT_BACKOFF_MS;
  }

  getState(): HostState {
    return this.#state;
  }

  subscribe(listener: () => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  diagnostics(): HostDiagnostics {
    return {
      rttMs: this.#rttMs,
      reconnects: this.#reconnects,
      movementReceived: this.#movementReceived,
      actionsReceived: this.#actionsReceived,
      ignoredInbound: this.#ignoredInbound,
    };
  }

  /** Authenticated movement from players, as (playerId, x, y). Returns an unsubscribe function. */
  onMovement(handler: MovementHandler): () => void {
    this.#movementHandlers.add(handler);
    return () => {
      this.#movementHandlers.delete(handler);
    };
  }

  /** Authenticated button events (the server has already deduplicated them). Returns an unsubscribe function. */
  onAction(handler: ActionHandler): () => void {
    this.#actionHandlers.add(handler);
    return () => {
      this.#actionHandlers.delete(handler);
    };
  }

  // --- what the UI does ---------------------------------------------------------------------

  createRoom(gameId: string): void {
    if (this.#disposed || this.#state.phase !== 'IDLE') return;
    this.#gameId = gameId;
    this.#set({ ...IDLE, phase: 'CONNECTING', gameId });
    this.#open('CREATE');
  }

  /** After a reload: reclaim the stored room. False (and nothing happens) if none is stored. */
  resume(): boolean {
    if (this.#disposed || this.#state.phase !== 'IDLE') return false;
    const stored = this.#store?.load();
    if (stored === undefined) return false;
    this.#hostToken = stored.hostToken;
    this.#gameId = stored.gameId;
    this.#set({
      ...IDLE,
      phase: 'RECONNECTING',
      joinCode: stored.joinCode,
      gameId: stored.gameId,
      reclaimed: true,
    });
    this.#reconnectStartedAt = this.#env.now();
    this.#attempt = 0;
    this.#open('RECONNECT');
    return true;
  }

  /**
   * Says what the phones' controls mean now (CONTROLLER_CONTEXT). The console owns this: it is sent
   * once the connection is live, never twice for the same thing, and again after a reconnect (the
   * server keeps its own copy, but this console is the authority).
   */
  setContext(context: ControllerContext, secondaryAction: SecondaryAction = null): void {
    this.#desiredContext = { context, secondaryAction };
    this.#flushContext();
  }

  #flushContext(): void {
    const desired = this.#desiredContext;
    if (this.#disposed || desired === undefined || this.#state.phase !== 'ACTIVE') return;
    const key = `${desired.context}/${desired.secondaryAction?.label ?? ''}`;
    if (key === this.#sentContextKey) return;
    this.#sentContextKey = key;
    this.#send({
      type: 'CONTROLLER_CONTEXT',
      seq: this.#contextSeq++,
      payload: { context: desired.context, secondaryAction: desired.secondaryAction },
    });
  }

  /** Make ONE player's phone vibrate (the game's feedback). Sent only while the room is active; dropped otherwise. */
  rumble(playerId: string, intensity: number, durationMs: number): void {
    if (this.#disposed || this.#state.phase !== 'ACTIVE') return;
    this.#send({ type: 'PLAYER_RUMBLE', payload: { playerId, intensity, durationMs } });
  }

  startMatch(): void {
    if (this.#disposed || this.#state.phase !== 'ACTIVE') return;
    this.#set({ ...this.#state, notice: undefined });
    this.#send({ type: 'MATCH_START', payload: {} });
  }

  /** The match is over (or lost): the room goes back to the lobby. */
  endMatch(): void {
    if (this.#disposed || this.#state.phase !== 'ACTIVE') return;
    this.#send({ type: 'MATCH_END', payload: {} });
  }

  /** Give up the room: forget the credential and return to IDLE. */
  leave(): void {
    if (this.#disposed) return;
    this.#teardown();
    this.#store?.clear();
    this.#hostToken = undefined;
    this.#set(IDLE);
  }

  /** The view is gone: stop everything. The stored credential is kept so a reload can resume. */
  dispose(): void {
    if (this.#disposed) return;
    this.#teardown();
    this.#disposed = true;
    this.#listeners.clear();
    this.#movementHandlers.clear();
    this.#actionHandlers.clear();
  }

  // --- connection management ----------------------------------------------------------------

  #open(intent: 'CREATE' | 'RECONNECT'): void {
    const epoch = (this.#epoch += 1);
    this.#intent = intent;
    this.#contextSeq = 0; // a new connection is a new stream
    this.#sentContextKey = undefined;
    const transport = this.#factory();
    this.#transport = transport;
    const live = (): boolean => epoch === this.#epoch && !this.#disposed;

    transport.onMessage((raw) => {
      if (live()) this.#receive(raw);
    });
    transport.onClose(() => {
      if (live()) this.#transportClosed();
    });
    transport.connect().then(
      () => {
        if (!live()) return;
        this.#send({
          type: 'HANDSHAKE',
          payload: {
            protocolVersion: PROTOCOL_VERSION,
            clientType: 'console',
            clientVersion: this.#clientVersion,
          },
        });
      },
      () => {
        if (live()) this.#connectFailed();
      },
    );
  }

  #abandonTransport(): void {
    this.#epoch += 1;
    const transport = this.#transport;
    this.#transport = undefined;
    try {
      transport?.close();
    } catch {
      // closing a dead connection must not throw into the session
    }
  }

  #teardown(): void {
    this.#cancelHeartbeat?.();
    this.#cancelHeartbeat = undefined;
    this.#cancelRetry?.();
    this.#cancelRetry = undefined;
    this.#abandonTransport();
  }

  #transportClosed(): void {
    switch (this.#state.phase) {
      case 'ACTIVE':
        this.#beginReconnect();
        return;
      case 'RECONNECTING':
        this.#scheduleRetry();
        return;
      case 'CONNECTING':
      case 'CREATING':
        this.#failCreate({ kind: 'CONNECTION_FAILED' });
        return;
      default:
        return;
    }
  }

  #connectFailed(): void {
    if (this.#intent === 'CREATE') this.#failCreate({ kind: 'CONNECTION_FAILED' });
    else this.#scheduleRetry();
  }

  #failCreate(failure: HostFailure): void {
    this.#teardown();
    this.#set({ ...IDLE, failure });
  }

  #beginReconnect(): void {
    this.#cancelHeartbeat?.();
    this.#cancelHeartbeat = undefined;
    this.#abandonTransport();
    this.#reconnects += 1;
    this.#reconnectStartedAt = this.#env.now();
    this.#attempt = 0;
    this.#set({ ...this.#state, phase: 'RECONNECTING', failure: undefined });
    this.#open('RECONNECT');
  }

  #scheduleRetry(): void {
    this.#abandonTransport();
    if (this.#env.now() - this.#reconnectStartedAt >= this.#reconnectTimeoutMs) {
      this.#end({ kind: 'CONNECTION_LOST' });
      return;
    }
    const delay = this.#backoffMs[Math.min(this.#attempt, this.#backoffMs.length - 1)] ?? 2_000;
    this.#attempt += 1;
    this.#cancelRetry = this.#env.scheduler.setTimeout(() => {
      this.#cancelRetry = undefined;
      if (this.#state.phase === 'RECONNECTING') this.#open('RECONNECT');
    }, delay);
  }

  /** Final: the room cannot be reclaimed. The credential is discarded. */
  #end(failure: HostFailure): void {
    this.#teardown();
    this.#store?.clear();
    this.#hostToken = undefined;
    this.#set({ ...this.#state, phase: 'ENDED', failure });
  }

  // --- messages -----------------------------------------------------------------------------

  #receive(raw: unknown): void {
    const parsed = parseServerMessage(raw);
    if (!parsed.ok) {
      this.#ignoredInbound += 1;
      return;
    }
    const message = parsed.message;
    const phase = this.#state.phase;

    switch (message.type) {
      case 'HANDSHAKE_ACCEPTED':
        if (this.#intent === 'CREATE' && phase === 'CONNECTING') {
          this.#set({ ...this.#state, phase: 'CREATING' });
          this.#send({ type: 'ROOM_CREATE', payload: { gameId: this.#gameId ?? '' } });
        } else if (this.#intent === 'RECONNECT' && phase === 'RECONNECTING') {
          this.#send({
            type: 'HOST_RECONNECT',
            payload: { joinCode: this.#state.joinCode ?? '', hostToken: this.#hostToken ?? '' },
          });
        }
        return;

      case 'ROOM_CREATED':
      case 'HOST_RECONNECTED':
        if (phase !== 'CREATING' && phase !== 'RECONNECTING') return;
        this.#hostToken = message.payload.hostToken;
        // The rotated credential is saved BEFORE anything else: losing it would strand the room.
        this.#store?.save({
          joinCode: message.payload.joinCode,
          hostToken: message.payload.hostToken,
          gameId: this.#gameId ?? '',
        });
        this.#enterActive(message.payload.joinCode);
        return;

      case 'ROOM_UPDATED': {
        if (phase !== 'ACTIVE') return;
        const { state, players, joinCode } = message.payload;
        const roster = sameRoster(this.#state.roster, players) ? this.#state.roster : players;
        // A page that has just reclaimed a room which is PLAYING has no simulation: the match it was playing died with
        // the old page. Never pretend otherwise (and never silently restart round 1): end that match, show the lobby, say why.
        if (this.#state.reclaimed && this.#state.roomState === undefined && state === 'PLAYING') {
          this.#send({ type: 'MATCH_END', payload: {} });
          this.#set({
            ...this.#state,
            joinCode,
            roomState: 'LOBBY',
            roster,
            notice: undefined,
            matchInterrupted: true,
          });
          return;
        }
        this.#set({
          ...this.#state,
          joinCode,
          roomState: state,
          roster,
          notice: state === this.#state.roomState ? this.#state.notice : undefined,
          matchInterrupted: state === 'LOBBY' ? this.#state.matchInterrupted : false,
        });
        return;
      }

      case 'PLAYER_INPUT': {
        const { playerId, input } = message.payload;
        if (input.kind === 'ACTION') {
          this.#actionsReceived += 1;
          const action: ControllerAction = {
            playerId,
            eventId: input.eventId,
            action: input.action,
            phase: input.phase,
          };
          for (const handler of [...this.#actionHandlers]) {
            try {
              handler(action);
            } catch {
              // one bad consumer must not break the session
            }
          }
          return;
        }
        this.#movementReceived += 1;
        for (const handler of [...this.#movementHandlers]) {
          try {
            handler(playerId, input.x, input.y, input.seq);
          } catch {
            // one bad consumer must not break the session
          }
        }
        return;
      }

      case 'HEARTBEAT_ACK': {
        const sentAt = this.#heartbeatSentAt.get(message.seq);
        if (sentAt !== undefined) {
          this.#rttMs = this.#env.now() - sentAt;
          this.#heartbeatSentAt.delete(message.seq);
        }
        return;
      }

      case 'ERROR':
        this.#serverError(message.payload.code);
        return;

      default:
        this.#ignoredInbound += 1; // controller-only messages are not for the console
    }
  }

  #serverError(code: ErrorCode): void {
    switch (this.#state.phase) {
      case 'CONNECTING':
      case 'CREATING':
        this.#failCreate({ kind: 'SERVER', code });
        return;
      case 'RECONNECTING':
        if (FINAL_ERRORS.has(code)) this.#end({ kind: 'SERVER', code });
        else this.#scheduleRetry();
        return;
      case 'ACTIVE':
        this.#set({ ...this.#state, notice: code });
        return;
      default:
        this.#ignoredInbound += 1;
    }
  }

  #enterActive(joinCode: string): void {
    this.#cancelHeartbeat?.();
    this.#cancelRetry?.();
    this.#cancelRetry = undefined;
    this.#heartbeatSeq = 0;
    this.#heartbeatSentAt.clear();
    this.#cancelHeartbeat = this.#env.scheduler.setInterval(
      () => this.#heartbeat(),
      this.#heartbeatIntervalMs,
    );
    this.#set({ ...this.#state, phase: 'ACTIVE', joinCode, failure: undefined, notice: undefined });
    this.#flushContext();
  }

  #heartbeat(): void {
    if (this.#state.phase !== 'ACTIVE') return;
    const seq = this.#heartbeatSeq++;
    this.#heartbeatSentAt.set(seq, this.#env.now());
    if (this.#heartbeatSentAt.size > HEARTBEAT_MEMORY) {
      const oldest = this.#heartbeatSentAt.keys().next();
      if (!oldest.done) this.#heartbeatSentAt.delete(oldest.value);
    }
    this.#send({ type: 'HEARTBEAT', seq });
  }

  #send(message: unknown): void {
    try {
      this.#transport?.send(message);
    } catch {
      // A dying socket reports itself through onClose.
    }
  }

  #set(next: HostState): void {
    if (this.#disposed) return;
    const changed = (Object.keys(next) as (keyof HostState)[]).some(
      (key) => next[key] !== this.#state[key],
    );
    if (!changed) return;
    this.#state = Object.freeze({ ...next });
    for (const listener of [...this.#listeners]) {
      try {
        listener();
      } catch {
        // one bad subscriber must not break the session
      }
    }
  }
}
