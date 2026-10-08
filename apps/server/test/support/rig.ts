import type { ClientType } from '@foomerang/protocol';
import { createFoomerangServer, type FoomerangServer, type ServerOptions } from '../../src/server';
import { FakeClient, FakeTransport, TestEnvironment } from './fakes';
import { ManualScheduler } from './manualScheduler';

/** Builders for client → server messages (plain objects, as they would arrive off the wire). */
export const msg = {
  handshake: (clientType: ClientType = 'controller', protocolVersion = 1) => ({
    type: 'HANDSHAKE',
    payload: { protocolVersion, clientType, clientVersion: '0.1.0' },
  }),
  create: (gameId = 'foomerang-fu') => ({ type: 'ROOM_CREATE', payload: { gameId } }),
  hostReconnect: (joinCode: string, hostToken: string) => ({
    type: 'HOST_RECONNECT',
    payload: { joinCode, hostToken },
  }),
  join: (joinCode: string, displayName = 'Alvin') => ({
    type: 'ROOM_JOIN',
    payload: { joinCode, displayName },
  }),
  reconnect: (joinCode: string, reconnectToken: string) => ({
    type: 'PLAYER_RECONNECT',
    payload: { joinCode, reconnectToken },
  }),
  move: (seq: number, x = 0.5, y = 0) => ({ type: 'INPUT_MOVE', seq, payload: { x, y } }),
  press: (eventId: string, seq = 1, action: 'PRIMARY' | 'SECONDARY' = 'PRIMARY') => ({
    type: 'INPUT_EVENT',
    seq,
    eventId,
    payload: { action, phase: 'pressed' },
  }),
  heartbeat: (seq = 1) => ({ type: 'HEARTBEAT', seq }),
  // console-session flow (ADR-004)
  consoleOpen: () => ({ type: 'CONSOLE_OPEN', payload: {} }),
  consoleClose: () => ({ type: 'CONSOLE_CLOSE', payload: {} }),
  controllerJoin: (joinCode: string, displayName = 'Alvin') => ({
    type: 'CONTROLLER_JOIN',
    payload: { joinCode, displayName },
  }),
  controllerReconnect: (joinCode: string, reconnectToken: string) => ({
    type: 'CONTROLLER_RECONNECT',
    payload: { joinCode, reconnectToken },
  }),
  controllerLeave: () => ({ type: 'CONTROLLER_LEAVE', payload: {} }),
  controllerRemove: (controllerId: string) => ({
    type: 'CONTROLLER_REMOVE',
    payload: { controllerId },
  }),
};

export interface Rig {
  readonly env: TestEnvironment;
  readonly scheduler: ManualScheduler;
  readonly transport: FakeTransport;
  readonly server: FoomerangServer;
  readonly internalErrors: unknown[];
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Connects WITHOUT handshaking. */
  raw(): FakeClient;
  /** Connects and completes the handshake. */
  connect(clientType?: ClientType): FakeClient;
  /** A console that has created a room. */
  host(gameId?: string): { client: FakeClient; joinCode: string; hostToken: string };
  /** A controller that has joined `joinCode`. */
  player(
    joinCode: string,
    name?: string,
  ): { client: FakeClient; playerId: string; reconnectToken: string };
  /** A TV that has opened a console session (ADR-004). */
  console(): { client: FakeClient; joinCode: string; hostToken: string };
  /** A phone that has joined a console session as a controller. */
  controller(
    joinCode: string,
    name?: string,
  ): { client: FakeClient; controllerId: string; reconnectToken: string };
  /** Moves the monotonic clock AND the scheduler forward together (so the 1 s sweep fires). */
  advance(ms: number): void;
}

export function createRig(options: Partial<ServerOptions> = {}): Rig {
  const env = new TestEnvironment();
  const scheduler = new ManualScheduler();
  const transport = new FakeTransport();
  const internalErrors: unknown[] = [];
  const server = createFoomerangServer({
    environment: env,
    scheduler,
    transport,
    onInternalError: (error) => internalErrors.push(error),
    ...options,
  });

  const rig: Rig = {
    env,
    scheduler,
    transport,
    server,
    internalErrors,
    async start() {
      await server.start();
    },
    stop: () => server.stop(),
    raw: () => new FakeClient(transport.connect()),
    connect(clientType = 'controller') {
      const client = new FakeClient(transport.connect());
      client.send(msg.handshake(clientType));
      if (!client.last('HANDSHAKE_ACCEPTED')) throw new Error('test setup: handshake not accepted');
      return client;
    },
    host(gameId) {
      const client = rig.connect('console');
      client.send(msg.create(gameId));
      const created = client.last('ROOM_CREATED');
      if (!created) throw new Error(`test setup: room not created: ${client.errors().join(',')}`);
      return { client, joinCode: created.payload.joinCode, hostToken: created.payload.hostToken };
    },
    player(joinCode, name = 'Alvin') {
      const client = rig.connect('controller');
      client.send(msg.join(joinCode, name));
      const joined = client.last('ROOM_JOINED');
      if (!joined) throw new Error(`test setup: join failed: ${client.errors().join(',')}`);
      return {
        client,
        playerId: joined.payload.playerId,
        reconnectToken: joined.payload.reconnectToken,
      };
    },
    console() {
      const client = rig.connect('console');
      client.send(msg.consoleOpen());
      const opened = client.last('CONSOLE_OPENED');
      if (!opened) throw new Error(`test setup: console not opened: ${client.errors().join(',')}`);
      return { client, joinCode: opened.payload.joinCode, hostToken: opened.payload.hostToken };
    },
    controller(joinCode, name = 'Alvin') {
      const client = rig.connect('controller');
      client.send(msg.controllerJoin(joinCode, name));
      const joined = client.last('CONTROLLER_JOINED');
      if (!joined)
        throw new Error(`test setup: controller join failed: ${client.errors().join(',')}`);
      return {
        client,
        controllerId: joined.payload.controllerId,
        reconnectToken: joined.payload.reconnectToken,
      };
    },
    advance(ms) {
      env.time += ms;
      scheduler.advance(ms);
    },
  };
  return rig;
}
