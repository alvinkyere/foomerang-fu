import type { ServerMessage } from '@foomerang/protocol';
import { io, type Socket } from 'socket.io-client';

type OfType<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

const EVENT = 'message';
const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * A REAL Socket.IO client for integration tests (file name matches the lint exemption that
 * confines Socket.IO imports to *SocketIOTransport* files). It queues what the server sends so a
 * test can await “the next ROOM_UPDATED” without racing or sleeping.
 */
export class RealClient {
  /** Everything received, in order, never consumed. */
  readonly history: ServerMessage[] = [];
  closed = false;

  readonly #socket: Socket;
  readonly #unconsumed: ServerMessage[] = [];
  readonly #waiters: (() => void)[] = [];
  readonly #closedWaiters: (() => void)[] = [];

  private constructor(socket: Socket) {
    this.#socket = socket;
    socket.on(EVENT, (message: ServerMessage) => {
      this.history.push(message);
      this.#unconsumed.push(message);
      for (const wake of this.#waiters.splice(0)) wake();
    });
    socket.on('disconnect', () => {
      this.closed = true;
      for (const wake of this.#closedWaiters.splice(0)) wake();
      for (const wake of this.#waiters.splice(0)) wake();
    });
  }

  static connect(
    port: number,
    options: { transports?: ('websocket' | 'polling')[] } = {},
  ): Promise<RealClient> {
    return new Promise((resolve, reject) => {
      const socket = io(`http://127.0.0.1:${port}`, {
        transports: options.transports ?? ['websocket'],
        forceNew: true,
        reconnection: false,
        timeout: DEFAULT_TIMEOUT_MS,
      });
      socket.once('connect', () => resolve(new RealClient(socket)));
      socket.once('connect_error', (error) => {
        socket.close();
        reject(error);
      });
    });
  }

  send(message: unknown): void {
    this.#socket.emit(EVENT, message);
  }

  /** Waits for, and consumes, the next message of `type`. */
  take<T extends ServerMessage['type']>(
    type: T,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<OfType<T>> {
    return this.takeWhere((m): m is OfType<T> => m.type === type, `a ${type}`, timeoutMs);
  }

  /** Waits for, and consumes, the next message satisfying `match`. */
  takeWhere<M extends ServerMessage>(
    match: (message: ServerMessage) => message is M,
    description = 'a matching message',
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<M> {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        reject(
          new Error(
            `timed out waiting for ${description}; received [${this.history.map((m) => m.type).join(', ')}]`,
          ),
        );
      }, timeoutMs);
      const attempt = (): void => {
        const index = this.#unconsumed.findIndex(match);
        if (index >= 0) {
          clearTimeout(deadline);
          resolve(this.#unconsumed.splice(index, 1)[0] as M);
        } else if (this.closed) {
          clearTimeout(deadline);
          reject(new Error(`connection closed while waiting for ${description}`));
        } else {
          this.#waiters.push(attempt);
        }
      };
      attempt();
    });
  }

  /** Resolves once the server (or network) has closed the connection. */
  waitClosed(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    if (this.closed) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error('timed out waiting for the connection to close')),
        timeoutMs,
      );
      this.#closedWaiters.push(() => {
        clearTimeout(deadline);
        resolve();
      });
    });
  }

  all<T extends ServerMessage['type']>(type: T): OfType<T>[] {
    return this.history.filter((m): m is OfType<T> => m.type === type);
  }

  errors(): string[] {
    return this.all('ERROR').map((m) => m.payload.code);
  }

  /** The client disappears (phone locked, Wi-Fi lost). */
  close(): void {
    this.#socket.close();
  }
}
