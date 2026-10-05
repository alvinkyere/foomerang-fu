import { JOIN_CODE_ALPHABET, type ServerMessage } from '@foomerang/protocol';
import {
  toHostId,
  toHostToken,
  toPlayerId,
  toReconnectToken,
  toRoomId,
  type RoomEnvironment,
} from '@foomerang/room-engine';
import type { ServerTransport, TransportConnection } from '../../src/transport';

type OfType<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

/** An in-memory transport connection. Close events can be HELD BACK to reproduce races exactly. */
export class FakeConnection implements TransportConnection {
  readonly id: string;
  readonly sent: unknown[] = [];
  closed = false;
  /** When true, a close is recorded but its event is not delivered until `flushClose()`. */
  deferCloseEvent = false;
  #onMessage: ((raw: unknown) => void) | undefined;
  readonly #onClose: (() => void)[] = [];
  #closeEventPending = false;

  constructor(id: string) {
    this.id = id;
  }

  send(message: unknown): void {
    if (!this.closed) this.sent.push(message);
  }

  /** Server-initiated close. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.#signalClose();
  }

  onMessage(handler: (raw: unknown) => void): void {
    this.#onMessage = handler;
  }

  onClose(handler: () => void): void {
    this.#onClose.push(handler);
  }

  /** The remote end sends something. Ignored once the connection is closed. */
  receive(raw: unknown): void {
    if (!this.closed) this.#onMessage?.(raw);
  }

  /** The remote end goes away (phone locked, Wi-Fi lost). */
  dropFromClient(): void {
    if (this.closed) return;
    this.closed = true;
    this.#signalClose();
  }

  /** Delivers a close event that was held back. */
  flushClose(): void {
    if (!this.#closeEventPending) return;
    this.#closeEventPending = false;
    for (const handler of this.#onClose) handler();
  }

  #signalClose(): void {
    if (this.deferCloseEvent) this.#closeEventPending = true;
    else for (const handler of this.#onClose) handler();
  }
}

export class FakeTransport implements ServerTransport {
  readonly connections: FakeConnection[] = [];
  started = false;
  stopped = false;
  #handler: ((connection: TransportConnection) => void) | undefined;

  onConnection(handler: (connection: TransportConnection) => void): void {
    this.#handler = handler;
  }

  start(): Promise<{ port: number }> {
    this.started = true;
    return Promise.resolve({ port: 0 });
  }

  stop(): Promise<void> {
    this.stopped = true;
    for (const connection of this.connections) connection.close();
    return Promise.resolve();
  }

  /** Simulates a new inbound transport connection. */
  connect(): FakeConnection {
    const connection = new FakeConnection(`fake-${this.connections.length + 1}`);
    this.connections.push(connection);
    this.#handler?.(connection);
    return connection;
  }
}

export class FakeClient {
  constructor(readonly connection: FakeConnection) {}

  send(message: unknown): this {
    this.connection.receive(message);
    return this;
  }

  get received(): ServerMessage[] {
    return this.connection.sent as ServerMessage[];
  }

  all<T extends ServerMessage['type']>(type: T): OfType<T>[] {
    return this.received.filter((message): message is OfType<T> => message.type === type);
  }

  last<T extends ServerMessage['type']>(type: T): OfType<T> | undefined {
    return this.all(type).at(-1);
  }

  errors(): string[] {
    return this.all('ERROR').map((message) => message.payload.code);
  }

  get closed(): boolean {
    return this.connection.closed;
  }

  /** The phone disappears. */
  drop(): void {
    this.connection.dropFromClient();
  }
}

/** n-th distinct, valid join code. */
export function codeFor(n: number): string {
  const base = JOIN_CODE_ALPHABET.length;
  let rest = n;
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code = JOIN_CODE_ALPHABET.charAt(rest % base) + code;
    rest = Math.floor(rest / base);
  }
  return code;
}

/** Deterministic environment with a hand-driven monotonic clock. Credentials are recognisable in tests. */
export class TestEnvironment implements RoomEnvironment {
  time = 1_000;
  #n = { room: 0, player: 0, host: 0, reconnect: 0, hostToken: 0, code: 0 };
  /** Set to make the next call to newPlayerId throw (simulates a system fault in the domain). */
  failNextPlayerId = false;

  readonly secrets: string[] = [];

  now = () => this.time;
  newRoomId = () => toRoomId(`room-${(this.#n.room += 1)}`);
  newPlayerId = () => {
    if (this.failNextPlayerId) {
      this.failNextPlayerId = false;
      throw new Error('simulated environment fault');
    }
    return toPlayerId(`player-${(this.#n.player += 1)}`);
  };
  newHostId = () => toHostId(`host-${(this.#n.host += 1)}`);
  newReconnectToken = () => {
    const value = `RECONNECT-SECRET-${String((this.#n.reconnect += 1)).padStart(4, '0')}`;
    this.secrets.push(value);
    return toReconnectToken(value);
  };
  newHostToken = () => {
    const value = `HOST-SECRET-${String((this.#n.hostToken += 1)).padStart(4, '0')}`;
    this.secrets.push(value);
    return toHostToken(value);
  };
  nextJoinCodeCandidate = () => codeFor((this.#n.code += 1));
}
