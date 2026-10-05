import {
  PROTOCOL_VERSION,
  parseServerMessage,
  type ControllerManifest,
  type ErrorCode,
} from '@foomerang/protocol';
import { browserEnvironment, type Cancel, type SessionEnvironment } from './environment';
import type { Point } from './joystick';
import { DEFAULT_SAMPLER_CONFIG, MovementSampler, type SamplerConfig } from './sampler';
import type { SessionStore } from './store';
import type { ControllerTransport, ControllerTransportFactory } from './transport';

/**
 * The consumer-facing lifecycle. Deliberately coarse: players never see raw network internals.
 *
 *   IDLE ─join()→ CONNECTING → JOINING → READY ⇄ RECONNECTING
 *    ▲  └resume()→ RECONNECTING ┘            └─ (gave up / credential no longer valid) → ENDED
 *    └──── a failed join, or leave() ────────────────────────────────────────────────────┘
 */
export type ControllerPhase =
  'IDLE' | 'CONNECTING' | 'JOINING' | 'READY' | 'RECONNECTING' | 'ENDED';

export type SessionFailure =
  | { readonly kind: 'SERVER'; readonly code: ErrorCode }
  | { readonly kind: 'CONNECTION_FAILED' }
  | { readonly kind: 'CONNECTION_LOST' };

/** UI state. Immutable, and replaced only when something a screen would show has changed. */
export interface ControllerState {
  readonly phase: ControllerPhase;
  readonly joinCode: string | undefined;
  readonly displayName: string | undefined;
  readonly playerId: string | undefined;
  readonly manifest: ControllerManifest | undefined;
  readonly failure: SessionFailure | undefined;
}

/** Engineering numbers, kept apart from the consumer state. */
export interface ControllerDiagnostics {
  readonly rttMs: number | undefined;
  readonly reconnects: number;
  readonly inputsSent: number;
  readonly ignoredInbound: number;
}

export interface ControllerSessionOptions {
  readonly transportFactory: ControllerTransportFactory;
  readonly store?: SessionStore;
  readonly environment?: SessionEnvironment;
  readonly clientType?: 'controller' | 'native-controller';
  readonly clientVersion?: string;
  readonly sampler?: Partial<SamplerConfig>;
  /** The sampling loop. Default 1000/60 ms (60 Hz). */
  readonly samplingIntervalMs?: number;
  /** Default 2000 ms. A separate concern from movement. */
  readonly heartbeatIntervalMs?: number;
  readonly reconnect?: { readonly timeoutMs?: number; readonly backoffMs?: readonly number[] };
}

const IDLE_STATE: ControllerState = Object.freeze({
  phase: 'IDLE',
  joinCode: undefined,
  displayName: undefined,
  playerId: undefined,
  manifest: undefined,
  failure: undefined,
});

/** Reconnect failures that retrying cannot fix. Anything else (rate limits, server hiccups) is retried. */
const FINAL_ERRORS: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'SEAT_RELEASED',
  'INVALID_RECONNECT_TOKEN',
  'ROOM_NOT_FOUND',
  'ROOM_CLOSING',
  'UNAUTHORIZED',
  'UNSUPPORTED_PROTOCOL',
]);

const DEFAULT_BACKOFF_MS = [250, 500, 1_000, 2_000] as const;
const HEARTBEAT_MEMORY = 16;

interface Credentials {
  joinCode: string;
  displayName: string;
  playerId: string | undefined;
  reconnectToken: string | undefined;
}

/**
 * Everything between the UI and the wire. The UI says join(), setControlValue(), neutralize();
 * THIS owns the protocol, handshake, sequence numbers, the 60 Hz sampler, the heartbeat,
 * reconnection and credential rotation. React never sees a sequence number or a socket.
 *
 * Each connection is an EPOCH: sequence numbers restart at 0 and the sampler re-announces its
 * state. Events from a superseded epoch are ignored.
 */
export class ControllerSession {
  readonly #factory: ControllerTransportFactory;
  readonly #store: SessionStore | undefined;
  readonly #env: SessionEnvironment;
  readonly #clientType: 'controller' | 'native-controller';
  readonly #clientVersion: string;
  readonly #samplingIntervalMs: number;
  readonly #heartbeatIntervalMs: number;
  readonly #reconnectTimeoutMs: number;
  readonly #backoffMs: readonly number[];
  readonly #sampler: MovementSampler;
  readonly #listeners = new Set<() => void>();

  #state: ControllerState = IDLE_STATE;
  #credentials: Credentials | undefined;
  #transport: ControllerTransport | undefined;
  #epoch = 0;
  #intent: 'JOIN' | 'RECONNECT' = 'JOIN';
  #awaitingManifest = false;
  #disposed = false;

  #movementSeq = 0;
  #heartbeatSeq = 0;
  readonly #heartbeatSentAt = new Map<number, number>();
  #cancelSampler: Cancel | undefined;
  #cancelHeartbeat: Cancel | undefined;
  #cancelRetry: Cancel | undefined;
  #reconnectStartedAt = 0;
  #attempt = 0;

  #rttMs: number | undefined;
  #reconnects = 0;
  #inputsSent = 0;
  #ignoredInbound = 0;

  constructor(options: ControllerSessionOptions) {
    this.#factory = options.transportFactory;
    this.#store = options.store;
    this.#env = options.environment ?? browserEnvironment;
    this.#clientType = options.clientType ?? 'controller';
    this.#clientVersion = options.clientVersion ?? '0.1.0';
    this.#samplingIntervalMs = options.samplingIntervalMs ?? 1000 / 60;
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? 2_000;
    this.#reconnectTimeoutMs = options.reconnect?.timeoutMs ?? 70_000;
    this.#backoffMs = options.reconnect?.backoffMs ?? DEFAULT_BACKOFF_MS;
    this.#sampler = new MovementSampler({ ...DEFAULT_SAMPLER_CONFIG, ...options.sampler });
  }

  // --- what the UI reads ------------------------------------------------------------------

  getState(): ControllerState {
    return this.#state;
  }

  /** For `useSyncExternalStore`. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  diagnostics(): ControllerDiagnostics {
    return {
      rttMs: this.#rttMs,
      reconnects: this.#reconnects,
      inputsSent: this.#inputsSent,
      ignoredInbound: this.#ignoredInbound,
    };
  }

  // --- what the UI does -------------------------------------------------------------------

  join(joinCode: string, displayName: string): void {
    if (this.#disposed || this.#state.phase !== 'IDLE') return;
    const code = joinCode.trim().toUpperCase();
    const name = displayName.trim();
    this.#credentials = {
      joinCode: code,
      displayName: name,
      playerId: undefined,
      reconnectToken: undefined,
    };
    this.#setState({ ...IDLE_STATE, phase: 'CONNECTING', joinCode: code, displayName: name });
    this.#open('JOIN');
  }

  /**
   * After a page reload: reclaim the stored player instead of asking again. Returns false (and
   * does nothing) when there is nothing stored, or it is for a different room than `joinCode`.
   */
  resume(joinCode?: string): boolean {
    if (this.#disposed || this.#state.phase !== 'IDLE') return false;
    const stored = this.#store?.load();
    if (stored === undefined) return false;
    if (joinCode !== undefined && joinCode.trim().toUpperCase() !== stored.joinCode) return false;
    this.#credentials = { ...stored };
    this.#setState({
      ...IDLE_STATE,
      phase: 'RECONNECTING',
      joinCode: stored.joinCode,
      displayName: stored.displayName,
      playerId: stored.playerId,
    });
    this.#reconnectStartedAt = this.#env.now();
    this.#attempt = 0;
    this.#open('RECONNECT');
    return true;
  }

  /**
   * The current value of a joystick control, in [-1, 1] with +Y down. Cheap and safe to call at
   * any rate: it only updates state. The 60 Hz sampler decides what is worth sending.
   *
   * Today the FIRST joystick in the manifest drives movement, whatever the game calls it (the
   * protocol has one movement message). Other controls are ignored until the protocol has
   * messages for them.
   */
  setControlValue(controlId: string, value: Point): void {
    if (this.#disposed) return;
    const primary = this.#state.manifest?.controls.find((control) => control.type === 'joystick');
    if (primary === undefined || primary.id !== controlId) return;
    this.#sampler.setMovement(value.x, value.y);
  }

  /**
   * Neutral NOW, for interruptions (page hidden, pointer cancelled, window blurred). Sent
   * immediately rather than waiting for the next tick, because a hidden page's timers may be
   * throttled; it goes through the same sampler, so there is no second input path.
   */
  neutralize(): void {
    if (this.#disposed) return;
    this.#sampler.neutralize();
    if (this.#state.phase === 'READY') this.#sampleAndSend();
  }

  /** Voluntarily leave: forget the credential and return to IDLE. */
  leave(): void {
    if (this.#disposed) return;
    this.#teardown();
    this.#store?.clear();
    this.#credentials = undefined;
    this.#sampler.neutralize();
    this.#setState(IDLE_STATE);
  }

  /** The view is gone: stop everything, say nothing more. The stored credential is kept (a reload may resume). */
  dispose(): void {
    if (this.#disposed) return;
    this.#teardown();
    this.#disposed = true;
    this.#listeners.clear();
  }

  // --- connection management ------------------------------------------------------------

  #open(intent: 'JOIN' | 'RECONNECT'): void {
    const epoch = (this.#epoch += 1);
    this.#intent = intent;
    this.#awaitingManifest = false;
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
            clientType: this.#clientType,
            clientVersion: this.#clientVersion,
          },
        });
      },
      () => {
        if (live()) this.#connectFailed();
      },
    );
  }

  /** Detaches from the current transport (its events stop mattering) and closes it. */
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

  #stopServices(): void {
    this.#cancelSampler?.();
    this.#cancelHeartbeat?.();
    this.#cancelSampler = undefined;
    this.#cancelHeartbeat = undefined;
  }

  #teardown(): void {
    this.#stopServices();
    this.#cancelRetry?.();
    this.#cancelRetry = undefined;
    this.#abandonTransport();
  }

  #transportClosed(): void {
    switch (this.#state.phase) {
      case 'READY':
        this.#beginReconnect();
        return;
      case 'RECONNECTING':
        this.#scheduleRetry();
        return;
      case 'CONNECTING':
      case 'JOINING':
        this.#failJoin({ kind: 'CONNECTION_FAILED' });
        return;
      default:
        return;
    }
  }

  #connectFailed(): void {
    if (this.#intent === 'JOIN') this.#failJoin({ kind: 'CONNECTION_FAILED' });
    else this.#scheduleRetry();
  }

  #failJoin(failure: SessionFailure): void {
    this.#teardown();
    this.#credentials = undefined;
    this.#setState({ ...IDLE_STATE, failure });
  }

  #beginReconnect(): void {
    this.#stopServices();
    this.#abandonTransport();
    this.#reconnects += 1;
    this.#reconnectStartedAt = this.#env.now();
    this.#attempt = 0;
    this.#setState({ ...this.#state, phase: 'RECONNECTING', failure: undefined });
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

  /** Final: the player cannot continue. The credential is discarded. */
  #end(failure: SessionFailure): void {
    this.#teardown();
    this.#store?.clear();
    this.#credentials = undefined;
    this.#setState({ ...this.#state, phase: 'ENDED', failure });
  }

  // --- messages -------------------------------------------------------------------------

  #receive(raw: unknown): void {
    const parsed = parseServerMessage(raw);
    if (!parsed.ok) {
      this.#ignoredInbound += 1;
      return;
    }
    const message = parsed.message;
    const credentials = this.#credentials;
    const phase = this.#state.phase;

    switch (message.type) {
      case 'HANDSHAKE_ACCEPTED':
        if (credentials === undefined) return;
        if (this.#intent === 'JOIN' && phase === 'CONNECTING') {
          this.#setState({ ...this.#state, phase: 'JOINING' });
          this.#send({
            type: 'ROOM_JOIN',
            payload: { joinCode: credentials.joinCode, displayName: credentials.displayName },
          });
        } else if (this.#intent === 'RECONNECT' && phase === 'RECONNECTING') {
          this.#send({
            type: 'PLAYER_RECONNECT',
            payload: {
              joinCode: credentials.joinCode,
              reconnectToken: credentials.reconnectToken ?? '',
            },
          });
        }
        return;

      case 'ROOM_JOINED':
      case 'PLAYER_RECONNECTED':
        if (credentials === undefined) return;
        if (phase !== 'JOINING' && phase !== 'RECONNECTING') return;
        credentials.playerId = message.payload.playerId;
        credentials.reconnectToken = message.payload.reconnectToken;
        // The rotated credential is saved BEFORE anything else: losing it would strand the player.
        this.#store?.save({
          joinCode: credentials.joinCode,
          displayName: credentials.displayName,
          playerId: message.payload.playerId,
          reconnectToken: message.payload.reconnectToken,
        });
        this.#awaitingManifest = true;
        this.#setState({ ...this.#state, playerId: message.payload.playerId });
        return;

      case 'CONTROLLER_MANIFEST':
        if (this.#awaitingManifest) {
          this.#awaitingManifest = false;
          this.#enterReady(message.payload);
        } else if (phase === 'READY') {
          this.#setState({ ...this.#state, manifest: message.payload });
        }
        return;

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
        this.#ignoredInbound += 1; // host-only messages are not for controllers
    }
  }

  #serverError(code: ErrorCode): void {
    switch (this.#state.phase) {
      case 'CONNECTING':
      case 'JOINING':
        this.#failJoin({ kind: 'SERVER', code });
        return;
      case 'RECONNECTING':
        if (FINAL_ERRORS.has(code)) this.#end({ kind: 'SERVER', code });
        else this.#scheduleRetry();
        return;
      default:
        this.#ignoredInbound += 1; // e.g. a rate-limit notice while playing: the connection will tell us if it matters
    }
  }

  #enterReady(manifest: ControllerManifest): void {
    this.#stopServices();
    this.#cancelRetry?.();
    this.#cancelRetry = undefined;
    // A new epoch: sequences restart, and the sampler re-announces the current state.
    this.#movementSeq = 0;
    this.#heartbeatSeq = 0;
    this.#heartbeatSentAt.clear();
    this.#sampler.reset();
    this.#cancelSampler = this.#env.scheduler.setInterval(
      () => this.#sampleAndSend(),
      this.#samplingIntervalMs,
    );
    this.#cancelHeartbeat = this.#env.scheduler.setInterval(
      () => this.#heartbeat(),
      this.#heartbeatIntervalMs,
    );
    this.#setState({ ...this.#state, phase: 'READY', manifest, failure: undefined });
  }

  #sampleAndSend(): void {
    if (this.#state.phase !== 'READY') return;
    const movement = this.#sampler.sample(this.#env.now());
    if (movement === undefined) return;
    this.#inputsSent += 1;
    this.#send({
      type: 'INPUT_MOVE',
      seq: this.#movementSeq++,
      payload: { x: movement.x, y: movement.y },
    });
  }

  #heartbeat(): void {
    if (this.#state.phase !== 'READY') return;
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

  #setState(next: ControllerState): void {
    if (this.#disposed) return;
    const changed = (Object.keys(next) as (keyof ControllerState)[]).some(
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

export function createControllerSession(options: ControllerSessionOptions): ControllerSession {
  return new ControllerSession(options);
}
