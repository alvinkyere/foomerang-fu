import { createServer, type Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type { ServerTransport, TransportConnection } from '../transport';

export interface SocketIOTransportOptions {
  /** 0 = pick a free ephemeral port. */
  readonly port: number;
  readonly host: string;
  /** Hard cap on one inbound message. Socket.IO closes a connection that exceeds it. */
  readonly maxPayloadBytes: number;
  readonly pingIntervalMs: number;
  readonly pingTimeoutMs: number;
}

/** One Socket.IO event carries every protocol message, in both directions. */
const EVENT = 'message';

/**
 * The ONLY place that knows about Socket.IO. WebSocket-only: there is deliberately no long-polling
 * fallback (it would add latency we want to measure, not hide).
 */
export class SocketIOTransport implements ServerTransport {
  readonly #options: SocketIOTransportOptions;
  #handler: ((connection: TransportConnection) => void) | undefined;
  #http: HttpServer | undefined;
  #io: Server | undefined;

  constructor(options: SocketIOTransportOptions) {
    this.#options = options;
  }

  onConnection(handler: (connection: TransportConnection) => void): void {
    this.#handler = handler;
  }

  async start(): Promise<{ port: number }> {
    const http = createServer();
    const io = new Server(http, {
      transports: ['websocket'],
      serveClient: false,
      maxHttpBufferSize: this.#options.maxPayloadBytes,
      pingInterval: this.#options.pingIntervalMs,
      pingTimeout: this.#options.pingTimeoutMs,
    });
    io.on('connection', (socket) => this.#handler?.(wrap(socket)));
    this.#http = http;
    this.#io = io;

    await new Promise<void>((resolve, reject) => {
      http.once('error', reject);
      http.listen(this.#options.port, this.#options.host, () => {
        http.off('error', reject);
        resolve();
      });
    });
    const address = http.address();
    if (address === null || typeof address === 'string') throw new Error('server has no TCP port');
    return { port: address.port };
  }

  async stop(): Promise<void> {
    const io = this.#io;
    const http = this.#http;
    this.#io = undefined;
    this.#http = undefined;
    if (io !== undefined) await io.close(); // disconnects every socket and closes the HTTP server
    http?.closeAllConnections();
  }
}

function wrap(socket: Socket): TransportConnection {
  return {
    id: socket.id,
    send: (message) => {
      socket.emit(EVENT, message);
    },
    close: () => {
      socket.disconnect(true);
    },
    onMessage: (handler) => {
      // Only the first argument is a message; acks and extra arguments are ignored.
      socket.on(EVENT, (payload: unknown) => handler(payload));
    },
    onClose: (handler) => {
      socket.on('disconnect', () => handler());
    },
  };
}
