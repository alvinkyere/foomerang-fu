import type { ControllerManifest, ErrorCode } from '@foomerang/protocol';
import type { Cancel, Scheduler, SessionEnvironment } from '../../src/environment';
import type { SessionStore, StoredSession } from '../../src/store';
import type { ControllerTransport } from '../../src/transport';

// ------------------------------------------------------------------------------------------
// Time: hand-driven, so a 70-second reconnect budget runs in microseconds.
// ------------------------------------------------------------------------------------------

interface Timer {
  readonly id: number;
  due: number;
  readonly callback: () => void;
  readonly interval: number | undefined;
}

export class ManualScheduler implements Scheduler {
  #now = 0;
  #nextId = 1;
  readonly #timers = new Map<number, Timer>();

  get pending(): number {
    return this.#timers.size;
  }

  /** Virtual time: equals the due time of the timer being run, so `now()` is right INSIDE each tick. */
  get time(): number {
    return this.#now;
  }

  setTimeout(callback: () => void, delayMs: number): Cancel {
    return this.#add(callback, delayMs, undefined);
  }

  setInterval(callback: () => void, intervalMs: number): Cancel {
    return this.#add(callback, intervalMs, intervalMs);
  }

  advance(ms: number): void {
    const target = this.#now + ms;
    for (;;) {
      const next = [...this.#timers.values()]
        .filter((timer) => timer.due <= target)
        .sort((a, b) => a.due - b.due || a.id - b.id)[0];
      if (next === undefined) break;
      this.#now = next.due;
      if (next.interval === undefined) this.#timers.delete(next.id);
      else next.due += next.interval;
      next.callback();
    }
    this.#now = target;
  }

  #add(callback: () => void, delayMs: number, interval: number | undefined): Cancel {
    const id = this.#nextId++;
    this.#timers.set(id, { id, due: this.#now + delayMs, callback, interval });
    return () => {
      this.#timers.delete(id);
    };
  }
}

export interface TestClock {
  readonly scheduler: ManualScheduler;
  readonly environment: SessionEnvironment;
  /** Moves virtual time forward, running every timer that falls due, each seeing its own moment. */
  advance(ms: number): void;
}

export function createClock(): TestClock {
  const scheduler = new ManualScheduler();
  return {
    scheduler,
    environment: { scheduler, now: () => scheduler.time },
    advance: (ms) => scheduler.advance(ms),
  };
}

/** Lets already-resolved promises and queued microtasks run (the fake network is asynchronous like a real socket). */
export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// ------------------------------------------------------------------------------------------
// A scripted server and the transports that talk to it.
// ------------------------------------------------------------------------------------------

type Sent = { type: string; seq?: number; eventId?: string; payload?: Record<string, unknown> };

export class FakeTransport implements ControllerTransport {
  readonly sent: Sent[] = [];
  closed = false;
  /** When true, a server drop is recorded but its close EVENT is delivered later via flushClose(). */
  deferCloseEvent = false;
  #onMessage: ((raw: unknown) => void) | undefined;
  #onClose: (() => void) | undefined;
  #closeEventPending = false;

  constructor(readonly network: FakeNetwork) {}

  connect(): Promise<void> {
    return this.network.refuseConnections
      ? Promise.reject(new Error('connection refused'))
      : Promise.resolve();
  }

  send(message: unknown): void {
    if (this.closed) return;
    this.sent.push(message as Sent);
    this.network.serverReceives(this, message as Sent);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.#onClose?.(); // a real socket reports its own close too
  }

  onMessage(handler: (raw: unknown) => void): void {
    this.#onMessage = handler;
  }

  onClose(handler: () => void): void {
    this.#onClose = handler;
  }

  /** The server → client direction, asynchronous like the real thing. */
  deliver(raw: unknown): void {
    queueMicrotask(() => {
      if (!this.closed) this.#onMessage?.(raw);
    });
  }

  /** The network or server ends the connection. */
  serverDrops(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.deferCloseEvent) this.#closeEventPending = true;
    else this.#onClose?.();
  }

  /** A transport can report its end more than once, or late. */
  replayCloseEvent(): void {
    this.#onClose?.();
  }

  flushClose(): void {
    if (!this.#closeEventPending) return;
    this.#closeEventPending = false;
    this.#onClose?.();
  }

  of(type: string): Sent[] {
    return this.sent.filter((message) => message.type === type);
  }
}

const MOVE_MANIFEST: ControllerManifest = {
  gameId: 'foomerang-fu',
  orientation: 'landscape',
  controls: [{ id: 'MOVE', type: 'joystick' }],
};

export class FakeNetwork {
  readonly transports: FakeTransport[] = [];
  refuseConnections = false;
  /** When false the server never acknowledges heartbeats. */
  ackHeartbeats = true;
  /** If set, ROOM_JOIN is answered with this error. */
  joinError: ErrorCode | undefined;
  /** If set, PLAYER_RECONNECT is answered with this error regardless of the token. */
  reconnectError: ErrorCode | undefined;
  manifest: ControllerManifest = MOVE_MANIFEST;
  /** The only credential the server currently accepts. */
  validToken = 'token-0';
  #tokenCounter = 0;

  readonly factory = (): FakeTransport => {
    const transport = new FakeTransport(this);
    this.transports.push(transport);
    return transport;
  };

  get last(): FakeTransport {
    const transport = this.transports.at(-1);
    if (!transport) throw new Error('no transport has been created');
    return transport;
  }

  /** Everything the client has sent of `type`, across all connections, in order. */
  allSent(type: string): Sent[] {
    return this.transports.flatMap((transport) => transport.of(type));
  }

  serverReceives(transport: FakeTransport, message: Sent): void {
    switch (message.type) {
      case 'HANDSHAKE':
        transport.deliver({ type: 'HANDSHAKE_ACCEPTED', payload: { protocolVersion: 1 } });
        return;
      case 'ROOM_JOIN':
        if (this.joinError) {
          transport.deliver({ type: 'ERROR', payload: { code: this.joinError } });
          return;
        }
        this.validToken = `token-${(this.#tokenCounter += 1)}`;
        transport.deliver({
          type: 'ROOM_JOINED',
          payload: { playerId: 'player-1', reconnectToken: this.validToken },
        });
        transport.deliver({ type: 'CONTROLLER_MANIFEST', payload: this.manifest });
        return;
      case 'PLAYER_RECONNECT':
        if (this.reconnectError) {
          transport.deliver({ type: 'ERROR', payload: { code: this.reconnectError } });
          return;
        }
        if (message.payload?.['reconnectToken'] !== this.validToken) {
          transport.deliver({ type: 'ERROR', payload: { code: 'INVALID_RECONNECT_TOKEN' } });
          return;
        }
        this.validToken = `token-${(this.#tokenCounter += 1)}`;
        transport.deliver({
          type: 'PLAYER_RECONNECTED',
          payload: { playerId: 'player-1', reconnectToken: this.validToken },
        });
        transport.deliver({ type: 'CONTROLLER_MANIFEST', payload: this.manifest });
        return;
      case 'HEARTBEAT':
        if (this.ackHeartbeats) transport.deliver({ type: 'HEARTBEAT_ACK', seq: message.seq });
        return;
      default:
        return;
    }
  }
}

export class MemoryStore implements SessionStore {
  value: StoredSession | undefined;
  saves = 0;

  constructor(initial?: StoredSession) {
    this.value = initial;
  }

  load(): StoredSession | undefined {
    return this.value;
  }

  save(session: StoredSession): void {
    this.saves += 1;
    this.value = session;
  }

  clear(): void {
    this.value = undefined;
  }
}
