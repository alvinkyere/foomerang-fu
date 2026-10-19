import {
  PROTOCOL_VERSION,
  parseServerMessage,
  type ControllerContext,
  type ControllerManifest,
  type ErrorCode,
  type SecondaryAction,
  type SystemAction,
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

/** What the controller's controls mean right now, as the host last said (see CONTROLLER_CONTEXT). */
export interface ControllerContextState {
  readonly context: ControllerContext;
  readonly secondaryAction: SecondaryAction;
  /** The room's authoritative version: anything older is stale. */
  readonly version: number;
}

/** UI state. Immutable, and replaced only when something a screen would show has changed. */
export interface ControllerState {
  readonly phase: ControllerPhase;
  readonly joinCode: string | undefined;
  readonly displayName: string | undefined;
  readonly playerId: string | undefined;
  readonly manifest: ControllerManifest | undefined;
  /** Undefined until the host's context has arrived: the controller is not interactive before that. */
  readonly context: ControllerContextState | undefined;
  readonly failure: SessionFailure | undefined;
}

/** A vibration the TV asks of this phone: how strong (0..1) and for how long. */
export interface Rumble {
  readonly intensity: number;
  readonly durationMs: number;
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
  /**
   * Makes the unique id each button event carries (the server deduplicates on it). Default: a
   * random per-session prefix plus a counter, so ids are unique across reloads without needing
   * crypto.randomUUID (absent in insecure contexts such as plain-HTTP LAN testing).
   */
  readonly newEventId?: () => string;
}

const IDLE_STATE: ControllerState = Object.freeze({
  phase: 'IDLE',
  joinCode: undefined,
  displayName: undefined,
  playerId: undefined,
  manifest: undefined,
  context: undefined,
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
/** A stick within this distance of centre counts as neutral when deciding whether a held stick may count again. */
const NEUTRAL_RADIUS = 0.12;

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
  readonly #rumbleListeners = new Set<(rumble: Rumble) => void>();

  #state: ControllerState = IDLE_STATE;
  #credentials: Credentials | undefined;
  #transport: ControllerTransport | undefined;
  #epoch = 0;
  #intent: 'JOIN' | 'RECONNECT' = 'JOIN';
  #awaitingManifest = false;
  /** A manifest and a context arrive one after the other; the controller is interactive only once it has both. */
  #pendingManifest: ControllerManifest | undefined;
  #pendingContext: ControllerContextState | undefined;
  /** The stick was held when the context changed: it reads as neutral until it genuinely returns to neutral. */
  #stickLatched = false;
  #stick: Point = { x: 0, y: 0 };
  #disposed = false;

  #movementSeq = 0;
  #eventSeq = 0;
  readonly #heldButtons = new Set<string>();
  readonly #heldSystem = new Set<SystemAction>();
  readonly #newEventId: () => string;
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
    const prefix = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    let counter = 0;
    this.#newEventId = options.newEventId ?? ((): string => `${prefix}-${(counter += 1)}`);
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

  /** Called on every vibration the TV asks of this phone. Returns an unsubscribe function. */
  onRumble(listener: (rumble: Rumble) => void): () => void {
    if (this.#disposed) return () => undefined;
    this.#rumbleListeners.add(listener);
    return () => {
      this.#rumbleListeners.delete(listener);
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
    this.#stick = value;
    if (this.#stickLatched) {
      if (Math.hypot(value.x, value.y) > NEUTRAL_RADIUS) {
        this.#sampler.setMovement(0, 0); // held through a context change: it does not count until released
        return;
      }
      this.#stickLatched = false;
    }
    this.#sampler.setMovement(value.x, value.y);
  }

  /**
   * A button went down (`true`) or up (`false`). The manifest says which generic action the button
   * sends; the game decides what it means. Each CHANGE sends exactly one event with a fresh id:
   *
   * - holding sends nothing more (no auto-repeat), so a held button cannot act twice;
   * - there is no retry and no queue — an event that cannot be sent right now (the connection is
   *   down) is dropped, because firing a stale THROW seconds later would be worse than losing it;
   * - ordering and delivery are the connection's (Socket.IO over TCP), and the server drops any id
   *   it has already seen.
   */
  setButton(controlId: string, pressed: boolean): void {
    if (this.#disposed || this.#state.phase !== 'READY') return;
    const control = this.#state.manifest?.controls.find((c) => c.id === controlId);
    if (control?.type !== 'button') return;
    if (this.#heldButtons.has(controlId) === pressed) return;
    if (pressed) this.#heldButtons.add(controlId);
    else this.#heldButtons.delete(controlId);
    this.#send({
      type: 'INPUT_EVENT',
      seq: this.#eventSeq++,
      eventId: this.#newEventId(),
      payload: { action: control.action, phase: pressed ? 'pressed' : 'released' },
    });
  }

  /**
   * The phone's own system button (MENU: pause / resume), which no manifest describes and no game
   * receives. Same rules as a game button: one event per change, no retry. A press is only sent where
   * pausing means something (a match is on, or paused); a release is always sent for a press that
   * was, so the console's record of the hold always ends.
   */
  setSystemButton(action: SystemAction, pressed: boolean): void {
    if (this.#disposed || this.#state.phase !== 'READY') return;
    if (this.#heldSystem.has(action) === pressed) return;
    if (pressed) {
      const context = this.#state.context?.context;
      if (context !== 'GAMEPLAY' && context !== 'PAUSED') return;
      this.#heldSystem.add(action);
    } else {
      this.#heldSystem.delete(action);
    }
    this.#send({
      type: 'INPUT_EVENT',
      seq: this.#eventSeq++,
      eventId: this.#newEventId(),
      payload: { action, phase: pressed ? 'pressed' : 'released' },
    });
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
    for (const controlId of [...this.#heldButtons]) this.setButton(controlId, false);
    for (const action of [...this.#heldSystem]) this.setSystemButton(action, false);
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
    this.#pendingManifest = undefined;
    this.#pendingContext = undefined;
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
          this.#pendingManifest = message.payload;
          this.#setState({ ...this.#state, manifest: message.payload });
          this.#maybeEnterReady();
        } else if (phase === 'READY') {
          this.#setState({ ...this.#state, manifest: message.payload });
        }
        return;

      case 'CONTROLLER_CONTEXT':
        this.#receiveContext({
          context: message.payload.context,
          secondaryAction: message.payload.secondaryAction,
          version: message.payload.version,
        });
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

      case 'RUMBLE':
        for (const listener of this.#rumbleListeners) {
          try {
            listener({
              intensity: message.payload.intensity,
              durationMs: message.payload.durationMs,
            });
          } catch {
            // vibration is an enhancement: a failing listener never breaks the session
          }
        }
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

  /** Interactive only when BOTH the manifest and the host's context are known: never a flash of the wrong labels. */
  #maybeEnterReady(): void {
    const manifest = this.#pendingManifest;
    const context = this.#pendingContext;
    if (manifest === undefined || context === undefined) return;
    this.#pendingManifest = undefined;
    this.#pendingContext = undefined;
    this.#enterReady(manifest, context);
  }

  #receiveContext(next: ControllerContextState): void {
    const phase = this.#state.phase;
    if (phase === 'READY') {
      const current = this.#state.context;
      if (current !== undefined && next.version <= current.version) return; // stale or repeated
      this.#setState({ ...this.#state, context: next });
      if (current === undefined || current.context !== next.context) this.#latchHeldControls();
      return;
    }
    if (phase === 'JOINING' || phase === 'RECONNECTING') {
      this.#pendingContext = next;
      this.#maybeEnterReady();
    }
  }

  /**
   * A context boundary: whatever is held NOW belongs to the old meaning. The stick reads neutral at
   * once and stays neutral until it really returns to neutral; a held button already sent its press
   * and will send only its release. Nothing here waits on a timer.
   */
  #latchHeldControls(): void {
    if (Math.hypot(this.#stick.x, this.#stick.y) > NEUTRAL_RADIUS) {
      this.#stickLatched = true;
      this.#sampler.setMovement(0, 0);
      this.#sampleAndSend();
    }
  }

  #enterReady(manifest: ControllerManifest, context: ControllerContextState): void {
    this.#stopServices();
    this.#cancelRetry?.();
    this.#cancelRetry = undefined;
    // A new epoch: sequences restart, and the sampler re-announces the current state.
    this.#movementSeq = 0;
    this.#eventSeq = 0;
    this.#heldButtons.clear();
    this.#heldSystem.clear();
    this.#heartbeatSeq = 0;
    this.#heartbeatSentAt.clear();
    this.#stickLatched = false;
    this.#stick = { x: 0, y: 0 };
    this.#sampler.reset();
    this.#cancelSampler = this.#env.scheduler.setInterval(
      () => this.#sampleAndSend(),
      this.#samplingIntervalMs,
    );
    this.#cancelHeartbeat = this.#env.scheduler.setInterval(
      () => this.#heartbeat(),
      this.#heartbeatIntervalMs,
    );
    this.#setState({ ...this.#state, phase: 'READY', manifest, context, failure: undefined });
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
