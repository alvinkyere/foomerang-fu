import { io, type Socket } from 'socket.io-client';
import type { ControllerTransport, ControllerTransportFactory } from '../transport';

/** One Socket.IO event carries every protocol message, in both directions. */
const EVENT = 'message';

/**
 * The ONLY file in the SDK that knows about Socket.IO. WebSocket-only (no long-polling fallback,
 * matching the server) and no built-in reconnection: reconnecting is the SESSION's job, because
 * it must re-establish identity with a credential, not merely a socket.
 */
export class SocketIOTransport implements ControllerTransport {
  readonly #socket: Socket;

  constructor(url: string, connectTimeoutMs = 5_000) {
    this.#socket = io(url, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      autoConnect: false,
      timeout: connectTimeoutMs,
    });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#socket.once('connect', () => resolve());
      this.#socket.once('connect_error', (error: Error) => {
        this.#socket.close();
        reject(error);
      });
      this.#socket.connect();
    });
  }

  send(message: unknown): void {
    this.#socket.emit(EVENT, message);
  }

  close(): void {
    this.#socket.close();
  }

  onMessage(handler: (raw: unknown) => void): void {
    this.#socket.on(EVENT, (payload: unknown) => handler(payload));
  }

  onClose(handler: () => void): void {
    this.#socket.on('disconnect', () => handler());
  }
}

export function createSocketIOTransportFactory(url: string): ControllerTransportFactory {
  return () => new SocketIOTransport(url);
}
