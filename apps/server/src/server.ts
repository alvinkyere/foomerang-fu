import {
  ConsoleRegistry,
  JoinCodeSpace,
  RoomRegistry,
  type ConsoleTimings,
  type RoomTimings,
} from '@foomerang/room-engine';
import { Application, DEFAULT_GAMES, validateGames, type GameDefinition } from './application';
import { BindingTable } from './bindings';
import { ConsoleApplication } from './consoleApplication';
import { Diagnostics, type DiagnosticsSnapshot } from './diagnostics';
import { createNodeEnvironment, type ServerEnvironment } from './environment';
import { Gateway } from './gateway';
import { DEFAULT_RATE_LIMITS, type RateLimits } from './rateLimit';
import { realScheduler, type CancelFn, type Scheduler } from './scheduler';
import { SocketIOTransport, type TlsCredentials } from './socketio/SocketIOTransport';
import type { ServerTransport } from './transport';

export interface ServerOptions {
  /** TCP port for the default transport. 0 (default) picks a free ephemeral port. */
  readonly port?: number;
  /** Interface to bind. Default '0.0.0.0' so phones on the LAN can reach a dev machine. */
  readonly host?: string;
  /** Games the server can host (capacity etc.). Default: Foomerang Fu, 2–6 players. */
  readonly games?: Readonly<Record<string, GameDefinition>>;
  readonly environment?: ServerEnvironment;
  readonly scheduler?: Scheduler;
  readonly transport?: ServerTransport;
  readonly timings?: Partial<RoomTimings>;
  /** Console-session durations (ADR-004): reconnecting window, membership reservation, TV absence. */
  readonly consoleTimings?: Partial<ConsoleTimings>;
  /** Initial handshake deadline. Default 5000. */
  readonly handshakeTimeoutMs?: number;
  /** Housekeeping sweep interval. Default 1000. Correctness never depends on it. */
  readonly reconcileIntervalMs?: number;
  /** Default 500. */
  readonly maxConnections?: number;
  readonly rateLimits?: Partial<RateLimits>;
  /** Recent action-event ids remembered per player. Default 256. */
  readonly eventWindowCapacity?: number;
  /** Largest accepted inbound message for the default transport. Default 16 KiB. */
  readonly maxPayloadBytes?: number;
  /** Heartbeat of the default transport. Defaults 5000 / 5000. */
  readonly pingIntervalMs?: number;
  readonly pingTimeoutMs?: number;
  /**
   * Serve https / wss. Needed when the controller page itself is served over https (a production-
   * representative phone test): browsers refuse a plain ws:// connection from an https page.
   */
  readonly tls?: TlsCredentials;
  /** Receives unexpected exceptions (never contains credentials by construction). */
  readonly onInternalError?: (error: unknown) => void;
}

export interface FoomerangServer {
  /** Starts listening; resolves with the bound port. A server can be started once. */
  start(): Promise<{ port: number }>;
  /** Stops accepting work, stops housekeeping, closes the transport. Idempotent. */
  stop(): Promise<void>;
  diagnostics(): DiagnosticsSnapshot;
}

export function createFoomerangServer(options: ServerOptions = {}): FoomerangServer {
  const environment = options.environment ?? createNodeEnvironment();
  const scheduler = options.scheduler ?? realScheduler;
  const diagnostics = new Diagnostics();
  const onInternalError = options.onInternalError ?? (() => undefined);

  // One join-code space for legacy rooms and console sessions, so a code never means both.
  const joinCodes = new JoinCodeSpace();
  const registry = new RoomRegistry(environment, {
    joinCodes,
    ...(options.timings ? { timings: options.timings } : {}),
  });
  const consoleRegistry = new ConsoleRegistry(environment, {
    joinCodes,
    ...(options.consoleTimings ? { timings: options.consoleTimings } : {}),
  });
  const bindings = new BindingTable();
  const consoles = new ConsoleApplication({ registry: consoleRegistry, bindings, diagnostics });
  const application = new Application({
    registry,
    bindings,
    games: validateGames(options.games ?? DEFAULT_GAMES),
    diagnostics,
    eventWindowCapacity: options.eventWindowCapacity ?? 256,
  });

  const transport =
    options.transport ??
    new SocketIOTransport({
      port: options.port ?? 0,
      host: options.host ?? '0.0.0.0',
      maxPayloadBytes: options.maxPayloadBytes ?? 16 * 1024,
      pingIntervalMs: options.pingIntervalMs ?? 5_000,
      pingTimeoutMs: options.pingTimeoutMs ?? 5_000,
      tls: options.tls,
    });

  const gateway = new Gateway({
    transport,
    application,
    consoles,
    scheduler,
    now: environment.now,
    diagnostics,
    onInternalError,
    config: {
      handshakeTimeoutMs: options.handshakeTimeoutMs ?? 5_000,
      maxConnections: options.maxConnections ?? 500,
      limits: { ...DEFAULT_RATE_LIMITS, ...options.rateLimits },
    },
  });

  let state: 'IDLE' | 'RUNNING' | 'STOPPED' = 'IDLE';
  let cancelSweep: CancelFn | undefined;

  const sweep = (): void => {
    try {
      application.reconcileSweep();
      consoles.reconcileSweep();
    } catch (error) {
      diagnostics.increment('internalErrors');
      try {
        onInternalError(error);
      } catch {
        // see Gateway
      }
    }
  };

  return {
    async start() {
      if (state !== 'IDLE') throw new Error(`server cannot be started from state ${state}`);
      state = 'RUNNING';
      gateway.attach();
      try {
        const { port } = await transport.start();
        cancelSweep = scheduler.setInterval(sweep, options.reconcileIntervalMs ?? 1_000);
        return { port };
      } catch (error) {
        state = 'STOPPED';
        throw error;
      }
    },

    async stop() {
      if (state === 'STOPPED') return;
      const wasRunning = state === 'RUNNING';
      state = 'STOPPED';
      if (!wasRunning) return;
      gateway.shutdown(); // 1. stop accepting work, cancel handshake timers
      cancelSweep?.(); //    2. stop housekeeping
      cancelSweep = undefined;
      await transport.stop(); // 3. close the transport
    },

    diagnostics: () => diagnostics.snapshot(),
  };
}
