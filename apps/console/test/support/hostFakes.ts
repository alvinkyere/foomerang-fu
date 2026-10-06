import type {
  ControllerTransport,
  Cancel,
  Scheduler,
  SessionEnvironment,
} from '@foomerang/controller-sdk';
import type { ErrorCode } from '@foomerang/protocol';

interface Timer {
  readonly id: number;
  due: number;
  readonly callback: () => void;
  readonly interval: number | undefined;
}

/** Hand-driven time: a 70-second reconnect budget runs in microseconds. */
export class ManualScheduler implements Scheduler {
  #now = 0;
  #nextId = 1;
  readonly #timers = new Map<number, Timer>();

  get pending(): number {
    return this.#timers.size;
  }
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

export function createClock() {
  const scheduler = new ManualScheduler();
  const environment: SessionEnvironment = { scheduler, now: () => scheduler.time };
  return { scheduler, environment, advance: (ms: number) => scheduler.advance(ms) };
}

export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

type Sent = { type: string; seq?: number; payload?: Record<string, unknown> };

export class FakeHostTransport implements ControllerTransport {
  readonly sent: Sent[] = [];
  closed = false;
  #onMessage: ((raw: unknown) => void) | undefined;
  #onClose: (() => void) | undefined;

  constructor(readonly network: FakeHostNetwork) {}

  connect(): Promise<void> {
    return this.network.refuseConnections
      ? Promise.reject(new Error('refused'))
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
    this.#onClose?.();
  }
  onMessage(handler: (raw: unknown) => void): void {
    this.#onMessage = handler;
  }
  onClose(handler: () => void): void {
    this.#onClose = handler;
  }
  deliver(raw: unknown): void {
    queueMicrotask(() => {
      if (!this.closed) this.#onMessage?.(raw);
    });
  }
  serverDrops(): void {
    if (this.closed) return;
    this.closed = true;
    this.#onClose?.();
  }
  of(type: string): Sent[] {
    return this.sent.filter((m) => m.type === type);
  }
}

export const roster = (
  ...entries: { playerId: string; displayName: string; connection?: string; seat?: string }[]
) =>
  entries.map((e) => ({
    connection: 'CONNECTED',
    seat: 'HELD',
    ...e,
  }));

/** A scripted server for the HOST side of the protocol. */
export class FakeHostNetwork {
  readonly transports: FakeHostTransport[] = [];
  refuseConnections = false;
  ackHeartbeats = true;
  createError: ErrorCode | undefined;
  reconnectError: ErrorCode | undefined;
  startError: ErrorCode | undefined;
  validToken = 'host-token-0';
  #counter = 0;
  joinCode = 'K7M4PX';

  readonly factory = (): FakeHostTransport => {
    const transport = new FakeHostTransport(this);
    this.transports.push(transport);
    return transport;
  };

  get last(): FakeHostTransport {
    const transport = this.transports.at(-1);
    if (!transport) throw new Error('no transport');
    return transport;
  }

  allSent(type: string): Sent[] {
    return this.transports.flatMap((t) => t.of(type));
  }

  /** Server → host snapshots, to be called from tests. */
  roomUpdated(
    transport: FakeHostTransport,
    state: string,
    players: ReturnType<typeof roster>,
  ): void {
    transport.deliver({
      type: 'ROOM_UPDATED',
      payload: { joinCode: this.joinCode, state, hostConnection: 'CONNECTED', players },
    });
  }

  serverReceives(transport: FakeHostTransport, message: Sent): void {
    switch (message.type) {
      case 'HANDSHAKE':
        transport.deliver({ type: 'HANDSHAKE_ACCEPTED', payload: { protocolVersion: 1 } });
        return;
      case 'ROOM_CREATE':
        if (this.createError) {
          transport.deliver({ type: 'ERROR', payload: { code: this.createError } });
          return;
        }
        this.validToken = `host-token-${(this.#counter += 1)}`;
        transport.deliver({
          type: 'ROOM_CREATED',
          payload: { joinCode: this.joinCode, hostToken: this.validToken },
        });
        this.roomUpdated(transport, 'LOBBY', []);
        return;
      case 'HOST_RECONNECT':
        if (this.reconnectError) {
          transport.deliver({ type: 'ERROR', payload: { code: this.reconnectError } });
          return;
        }
        if (message.payload?.['hostToken'] !== this.validToken) {
          transport.deliver({ type: 'ERROR', payload: { code: 'UNAUTHORIZED' } });
          return;
        }
        this.validToken = `host-token-${(this.#counter += 1)}`;
        transport.deliver({
          type: 'HOST_RECONNECTED',
          payload: { joinCode: this.joinCode, hostToken: this.validToken },
        });
        this.roomUpdated(transport, 'LOBBY', []);
        return;
      case 'MATCH_START':
        if (this.startError)
          transport.deliver({ type: 'ERROR', payload: { code: this.startError } });
        return;
      case 'HEARTBEAT':
        if (this.ackHeartbeats) transport.deliver({ type: 'HEARTBEAT_ACK', seq: message.seq });
        return;
      default:
        return;
    }
  }
}

export class MemoryHostStore {
  value: { joinCode: string; hostToken: string } | undefined;
  load() {
    return this.value;
  }
  save(value: { joinCode: string; hostToken: string }) {
    this.value = value;
  }
  clear() {
    this.value = undefined;
  }
}
