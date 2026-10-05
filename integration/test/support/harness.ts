import {
  SocketIOTransport,
  createControllerSession,
  createStorageSessionStore,
  type ControllerPhase,
  type ControllerSession,
  type ControllerTransport,
  type SessionStore,
} from '@foomerang/controller-sdk';
import { PROTOCOL_VERSION, parseServerMessage, type ServerMessage } from '@foomerang/protocol';
import { createFoomerangServer, type FoomerangServer } from '@foomerang/server';

type OfType<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

const WAIT_MS = 4_000;

/** A real server on an ephemeral port, real Socket.IO, real clocks. */
export interface Stack {
  readonly server: FoomerangServer;
  readonly port: number;
  readonly url: string;
}

export async function startStack(): Promise<Stack> {
  const server = createFoomerangServer({ host: '127.0.0.1', port: 0 });
  const { port } = await server.start();
  return { server, port, url: `http://127.0.0.1:${port}` };
}

/** A stand-in for the TV (console): speaks the protocol through the SDK's transport. */
export class HostClient {
  readonly history: ServerMessage[] = [];
  readonly #unconsumed: ServerMessage[] = [];
  readonly #waiters: (() => void)[] = [];
  readonly #transport: ControllerTransport;
  joinCode = '';
  hostToken = '';

  private constructor(transport: ControllerTransport) {
    this.#transport = transport;
    transport.onMessage((raw) => {
      const parsed = parseServerMessage(raw);
      if (!parsed.ok)
        throw new Error(`host received an invalid server message: ${JSON.stringify(raw)}`);
      this.history.push(parsed.message);
      this.#unconsumed.push(parsed.message);
      for (const wake of this.#waiters.splice(0)) wake();
    });
  }

  static async create(url: string): Promise<HostClient> {
    const transport = new SocketIOTransport(url);
    const host = new HostClient(transport);
    await transport.connect();
    transport.send({
      type: 'HANDSHAKE',
      payload: { protocolVersion: PROTOCOL_VERSION, clientType: 'console', clientVersion: '0.1.0' },
    });
    await host.next('HANDSHAKE_ACCEPTED');
    transport.send({ type: 'ROOM_CREATE', payload: { gameId: 'foomerang-fu' } });
    const created = await host.next('ROOM_CREATED');
    host.joinCode = created.payload.joinCode;
    host.hostToken = created.payload.hostToken;
    return host;
  }

  /** Waits for, and consumes, the next message of `type` (optionally matching `where`). */
  next<T extends ServerMessage['type']>(
    type: T,
    where: (message: OfType<T>) => boolean = () => true,
    timeoutMs = WAIT_MS,
  ): Promise<OfType<T>> {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(
        () =>
          reject(
            new Error(
              `host: timed out waiting for ${type}; saw [${this.history.map((m) => m.type).join(', ')}]`,
            ),
          ),
        timeoutMs,
      );
      const attempt = (): void => {
        const index = this.#unconsumed.findIndex((m) => m.type === type && where(m as OfType<T>));
        if (index >= 0) {
          clearTimeout(deadline);
          resolve(this.#unconsumed.splice(index, 1)[0] as OfType<T>);
        } else {
          this.#waiters.push(attempt);
        }
      };
      attempt();
    });
  }

  /** Every routed input received so far, in order. */
  inputs(playerId?: string): OfType<'PLAYER_INPUT'>['payload'][] {
    return this.history
      .filter((m): m is OfType<'PLAYER_INPUT'> => m.type === 'PLAYER_INPUT')
      .map((m) => m.payload)
      .filter((p) => playerId === undefined || p.playerId === playerId);
  }

  close(): void {
    this.#transport.close();
  }
}

/** An in-memory `Storage`, so the REAL storage-backed session store is what gets exercised. */
export function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

export interface Controller {
  readonly session: ControllerSession;
  readonly store: SessionStore;
  /** Every transport this session has opened, oldest first. */
  readonly transports: SocketIOTransport[];
  waitForPhase(phase: ControllerPhase, timeoutMs?: number): Promise<void>;
}

export function newController(
  url: string,
  store: SessionStore = createStorageSessionStore(memoryStorage()),
): Controller {
  const transports: SocketIOTransport[] = [];
  const session = createControllerSession({
    store,
    transportFactory: () => {
      const transport = new SocketIOTransport(url);
      transports.push(transport);
      return transport;
    },
  });
  return {
    session,
    store,
    transports,
    waitForPhase: (phase, timeoutMs = WAIT_MS) =>
      new Promise((resolve, reject) => {
        if (session.getState().phase === phase) return resolve();
        const deadline = setTimeout(() => {
          off();
          reject(
            new Error(`timed out waiting for phase ${phase}; stuck in ${session.getState().phase}`),
          );
        }, timeoutMs);
        const off = session.subscribe(() => {
          if (session.getState().phase !== phase) return;
          clearTimeout(deadline);
          off();
          resolve();
        });
      }),
  };
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
