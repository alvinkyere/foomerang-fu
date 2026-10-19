import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import {
  CONSOLE_CONTROLLER,
  CONSOLE_END_REASONS,
  CONTROLLER_CONTEXTS,
  EFFECTIVE_CONTEXTS,
  PROTOCOL_VERSION,
  consoleClientMessageSchema,
  consoleServerMessageSchema,
  controllerIdSchema,
  controllerManifestSchema,
  gameSessionIdSchema,
  parseClientMessage,
  parseConsoleClientMessage,
  parseConsoleServerMessage,
  parseServerMessage,
  type ControllerId,
  type GameSessionId,
} from '../src/index';

const CODE = 'K7M4PX';
const CTRL = '3f1c2a9e-1111-4c0d-9a9a-0123456789ab'; // the server issues UUIDs
const CTRL_B = 'controller-2';
const GAME = '9b8a7c6d-2222-4e5f-8a1b-abcdefabcdef';
const TOKEN = 'secret-credential-abc';

/** A valid example of every console-flow message, by direction. */
const CLIENT = {
  CONSOLE_OPEN: { type: 'CONSOLE_OPEN', payload: {} },
  CONSOLE_CLOSE: { type: 'CONSOLE_CLOSE', payload: {} },
  CONTROLLER_REMOVE: { type: 'CONTROLLER_REMOVE', payload: { controllerId: CTRL } },
  GAME_LAUNCH: { type: 'GAME_LAUNCH', payload: { gameId: 'foomerang-fu' } },
  GAME_PARTICIPANTS: {
    type: 'GAME_PARTICIPANTS',
    seq: 4,
    payload: {
      gameSessionId: GAME,
      participants: [
        { controllerId: CTRL, seat: 1 },
        { controllerId: CTRL_B, seat: 3 },
      ],
    },
  },
  MATCH_START: { type: 'MATCH_START', payload: { gameSessionId: GAME } },
  MATCH_END: { type: 'MATCH_END', payload: { gameSessionId: GAME } },
  GAME_EXIT: { type: 'GAME_EXIT', payload: { gameSessionId: GAME } },
  CONTROLLER_RUMBLE: {
    type: 'CONTROLLER_RUMBLE',
    payload: { gameSessionId: GAME, controllerId: CTRL, intensity: 0.6, durationMs: 180 },
  },
  CONTROLLER_JOIN: { type: 'CONTROLLER_JOIN', payload: { joinCode: CODE, displayName: 'Alice' } },
  CONTROLLER_RECONNECT: {
    type: 'CONTROLLER_RECONNECT',
    payload: { joinCode: CODE, reconnectToken: TOKEN },
  },
  CONTROLLER_LEAVE: { type: 'CONTROLLER_LEAVE', payload: {} },
} as const;

const SERVER = {
  CONSOLE_OPENED: { type: 'CONSOLE_OPENED', payload: { joinCode: CODE, hostToken: TOKEN } },
  CONSOLE_UPDATED: {
    type: 'CONSOLE_UPDATED',
    payload: {
      joinCode: CODE,
      state: 'OPEN',
      hostConnection: 'CONNECTED',
      controllers: [
        { controllerId: CTRL, displayName: 'Alice', connection: 'CONNECTED', membership: 'HELD' },
        {
          controllerId: CTRL_B,
          displayName: 'Bob',
          connection: 'RECONNECTING',
          membership: 'HELD',
        },
      ],
      game: {
        gameSessionId: GAME,
        gameId: 'foomerang-fu',
        state: 'LOBBY',
        participants: [{ controllerId: CTRL, seat: 1 }],
      },
    },
  },
  CONTROLLER_INPUT: {
    type: 'CONTROLLER_INPUT',
    payload: {
      controllerId: CTRL,
      gameSessionId: GAME,
      input: { kind: 'ACTION', eventId: 'press-000001', action: 'MENU', phase: 'pressed' },
    },
  },
  CONTROLLER_JOINED: {
    type: 'CONTROLLER_JOINED',
    payload: { controllerId: CTRL, reconnectToken: TOKEN },
  },
  CONTROLLER_RECONNECTED: {
    type: 'CONTROLLER_RECONNECTED',
    payload: { controllerId: CTRL, reconnectToken: TOKEN },
  },
  CONTROLLER_CONTEXT: {
    type: 'CONTROLLER_CONTEXT',
    payload: {
      context: 'GAMEPLAY',
      secondaryAction: null,
      version: 7,
      participation: { gameSessionId: GAME, status: 'PARTICIPANT', seat: 2 },
    },
  },
  CONSOLE_STATUS: { type: 'CONSOLE_STATUS', payload: { hostConnection: 'RECONNECTING' } },
  RUMBLE: { type: 'RUMBLE', payload: { gameSessionId: GAME, intensity: 1, durationMs: 600 } },
  CONSOLE_ENDED: { type: 'CONSOLE_ENDED', payload: { reason: 'REMOVED' } },
} as const;

type Json = Record<string, unknown>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const withPayload = (message: Json, patch: Json): Json => ({
  ...message,
  payload: { ...(message['payload'] as Json), ...patch },
});
const without = (message: Json, key: string): Json => ({
  ...message,
  payload: Object.fromEntries(
    Object.entries(message['payload'] as Json).filter(([k]) => k !== key),
  ),
});
const client = (raw: unknown) => parseConsoleClientMessage(raw);
const server = (raw: unknown) => parseConsoleServerMessage(raw);

describe('every console-flow message: valid examples parse, in the right direction only', () => {
  it.each(Object.entries(CLIENT))('client → server %s', (_type, message) => {
    expect(client(clone(message))).toEqual({ ok: true, message });
    expect(server(clone(message)).ok, 'a client message is never a server message').toBe(false);
  });

  it.each(Object.entries(SERVER))('server → client %s', (_type, message) => {
    expect(server(clone(message))).toEqual({ ok: true, message });
    // CONTROLLER_CONTEXT exists in both directions with different shapes; nothing else may cross.
    if (message.type !== 'CONTROLLER_CONTEXT') expect(client(clone(message)).ok).toBe(false);
  });
});

describe('malformed payloads, unknown keys and missing fields are INVALID_MESSAGE', () => {
  const all = { ...CLIENT, ...SERVER } as Record<string, Json>;
  const parse = (type: string) => (type in CLIENT ? client : server);

  it.each(Object.keys(all))('%s: a smuggled extra field is rejected (strict)', (type) => {
    const message = all[type] as Json;
    expect(parse(type)(withPayload(message, { admin: true })).ok).toBe(false);
    expect(parse(type)({ ...message, extra: 1 }).ok).toBe(false);
  });

  it.each(Object.keys(all))('%s: a non-object payload is rejected', (type) => {
    for (const payload of [null, 'x', 42, [], undefined]) {
      expect(parse(type)({ ...(all[type] as Json), payload }).ok).toBe(false);
    }
  });

  it.each(
    Object.entries(all).flatMap(([type, message]) =>
      Object.keys(message['payload'] as Json).map((key) => [type, key] as const),
    ),
  )('%s without %s is rejected', (type, key) => {
    expect(parse(type)(without(all[type] as Json, key)).ok).toBe(false);
  });

  it('a state message without its seq, or with a bad one, is rejected', () => {
    const noSeq = Object.fromEntries(
      Object.entries(CLIENT.GAME_PARTICIPANTS).filter(([k]) => k !== 'seq'),
    );
    expect(client(noSeq).ok).toBe(false);
    for (const seq of [-1, 1.5, 4_294_967_296, '4']) {
      expect(client({ ...CLIENT.GAME_PARTICIPANTS, seq }).ok).toBe(false);
    }
  });

  it('never throws on hostile input', () => {
    const hostile = [
      JSON.parse('{"type":"CONSOLE_OPEN","payload":{},"__proto__":{"admin":true}}'),
      new Proxy(
        {},
        {
          get: () => {
            throw new Error('boom');
          },
        },
      ),
      Object.create(null),
    ];
    for (const raw of hostile) {
      expect(() => client(raw)).not.toThrow();
      expect(() => server(raw)).not.toThrow();
    }
  });
});

describe('rumble: the TV asks for a controller to vibrate; the server passes it to that phone only', () => {
  it('intensity is a fraction 0..1 and the duration a short whole number of milliseconds', () => {
    for (const intensity of [0, 0.01, 0.5, 1])
      expect(client(withPayload(CLIENT.CONTROLLER_RUMBLE, { intensity })).ok, `${intensity}`).toBe(
        true,
      );
    for (const intensity of [-0.1, 1.01, Number.NaN, Number.POSITIVE_INFINITY, '1'])
      expect(
        client(withPayload(CLIENT.CONTROLLER_RUMBLE, { intensity })).ok,
        `${String(intensity)}`,
      ).toBe(false);
    for (const durationMs of [20, 1000])
      expect(server(withPayload(SERVER.RUMBLE, { durationMs })).ok, `${durationMs}`).toBe(true);
    for (const durationMs of [0, 19, 1001, 50.5, -5])
      expect(server(withPayload(SERVER.RUMBLE, { durationMs })).ok, `${durationMs}`).toBe(false);
  });

  it('the phone is never told who else rumbles: RUMBLE carries no controller id', () => {
    expect(server(withPayload(SERVER.RUMBLE, { controllerId: CTRL })).ok).toBe(false);
  });
});

describe('identities: opaque, bounded, and impossible to mix up', () => {
  const BAD_IDS = ['', ' ', 'has space', 'a/b', 'x'.repeat(65), 'naïve', 42, null];

  it.each([
    [
      'CONTROLLER_REMOVE',
      (id: unknown) => withPayload(CLIENT.CONTROLLER_REMOVE, { controllerId: id }),
      client,
    ],
    [
      'CONTROLLER_JOINED',
      (id: unknown) => withPayload(SERVER.CONTROLLER_JOINED, { controllerId: id }),
      server,
    ],
    [
      'CONTROLLER_INPUT',
      (id: unknown) => withPayload(SERVER.CONTROLLER_INPUT, { controllerId: id }),
      server,
    ],
    ['GAME_EXIT', (id: unknown) => withPayload(CLIENT.GAME_EXIT, { gameSessionId: id }), client],
    [
      'MATCH_START',
      (id: unknown) => withPayload(CLIENT.MATCH_START, { gameSessionId: id }),
      client,
    ],
    [
      'GAME_PARTICIPANTS (participant)',
      (id: unknown) =>
        withPayload(CLIENT.GAME_PARTICIPANTS, { participants: [{ controllerId: id, seat: 1 }] }),
      client,
    ],
  ] as const)('%s rejects malformed ids', (_name, build, parse) => {
    for (const id of BAD_IDS) expect(parse(build(id)).ok, String(id)).toBe(false);
  });

  it('a controller id and a game session id are distinct types (compile-time)', () => {
    const controller = controllerIdSchema.parse(CTRL);
    const game = gameSessionIdSchema.parse(GAME);
    expectTypeOf(controller).toEqualTypeOf<ControllerId>();
    expectTypeOf(game).toEqualTypeOf<GameSessionId>();
    expectTypeOf<ControllerId>().not.toEqualTypeOf<GameSessionId>();
    // @ts-expect-error a game session id is not a controller id
    const blurred: ControllerId = game;
    // @ts-expect-error nor is a plain string (e.g. a legacy playerId)
    const plain: GameSessionId = 'game-1';
    expect([blurred, plain]).toHaveLength(2);
  });

  it('the console session’s own id never travels: no message carries one', () => {
    const everything = JSON.stringify({ ...CLIENT, ...SERVER });
    expect(everything).not.toMatch(/consoleId|consoleSessionId|participantId|playerId/);
  });
});

describe('authority-relevant identity fields', () => {
  it('a phone never names who it is: JOIN carries a name, RECONNECT a credential, LEAVE nothing', () => {
    expect(client(withPayload(CLIENT.CONTROLLER_JOIN, { controllerId: CTRL })).ok).toBe(false);
    expect(client(withPayload(CLIENT.CONTROLLER_RECONNECT, { controllerId: CTRL })).ok).toBe(false);
    expect(client(withPayload(CLIENT.CONTROLLER_LEAVE, { controllerId: CTRL })).ok).toBe(false);
  });

  it('host operations carry no credential (the connection’s identity authorizes them)', () => {
    for (const message of [
      CLIENT.CONSOLE_CLOSE,
      CLIENT.CONTROLLER_REMOVE,
      CLIENT.GAME_LAUNCH,
      CLIENT.GAME_EXIT,
    ]) {
      expect(client(withPayload(message, { hostToken: TOKEN })).ok).toBe(false);
    }
  });

  it('snapshots carry no credential, ever', () => {
    const leaky = clone(SERVER.CONSOLE_UPDATED) as unknown as {
      payload: { controllers: Json[] };
    };
    (leaky.payload.controllers[0] as Json)['reconnectToken'] = TOKEN;
    expect(server(leaky).ok).toBe(false);
    expect(server(withPayload(SERVER.CONSOLE_UPDATED, { hostToken: TOKEN })).ok).toBe(false);
  });

  it('a credential is bounded and non-empty', () => {
    for (const reconnectToken of ['', 'x'.repeat(129)]) {
      expect(client(withPayload(CLIENT.CONTROLLER_RECONNECT, { reconnectToken })).ok).toBe(false);
      expect(server(withPayload(SERVER.CONTROLLER_JOINED, { reconnectToken })).ok).toBe(false);
    }
  });

  it('only the TV seats: participants are a host message; a join can never name a game or a seat', () => {
    expect(client(withPayload(CLIENT.CONTROLLER_JOIN, { gameSessionId: GAME })).ok).toBe(false);
    expect(client(withPayload(CLIENT.CONTROLLER_JOIN, { seat: 1 })).ok).toBe(false);
  });

  it('CPUs never travel: a participant is a controller with a seat, nothing else', () => {
    const cpu = withPayload(CLIENT.GAME_PARTICIPANTS, {
      participants: [{ controllerId: CTRL, seat: 1, cpu: 'HARD' }],
    });
    expect(client(cpu).ok).toBe(false);
    const cpuKind = withPayload(CLIENT.GAME_PARTICIPANTS, {
      participants: [{ kind: 'CPU', seat: 2 }],
    });
    expect(client(cpuKind).ok).toBe(false);
  });
});

describe('game-scoped messages name their launch (stale ones are recognisable)', () => {
  it.each(['GAME_PARTICIPANTS', 'MATCH_START', 'MATCH_END', 'GAME_EXIT'] as const)(
    '%s requires a gameSessionId',
    (type) => {
      expect(client(without(CLIENT[type], 'gameSessionId')).ok).toBe(false);
    },
  );

  it('participation in a phone’s view names the launch it belongs to', () => {
    const view = clone(SERVER.CONTROLLER_CONTEXT) as unknown as {
      payload: { participation: Json };
    };
    delete view.payload.participation['gameSessionId'];
    expect(server(view).ok).toBe(false);
  });

  it('the active game in a snapshot names its launch', () => {
    const snapshot = clone(SERVER.CONSOLE_UPDATED) as unknown as { payload: { game: Json } };
    delete snapshot.payload.game['gameSessionId'];
    expect(server(snapshot).ok).toBe(false);
  });

  it('GAME_PARTICIPANTS: a controller once, a seat once, within the wire bound', () => {
    const twice = withPayload(CLIENT.GAME_PARTICIPANTS, {
      participants: [
        { controllerId: CTRL, seat: 1 },
        { controllerId: CTRL, seat: 2 },
      ],
    });
    const shared = withPayload(CLIENT.GAME_PARTICIPANTS, {
      participants: [
        { controllerId: CTRL, seat: 1 },
        { controllerId: CTRL_B, seat: 1 },
      ],
    });
    const many = withPayload(CLIENT.GAME_PARTICIPANTS, {
      participants: Array.from({ length: 17 }, (_, i) => ({ controllerId: `c-${i}`, seat: i + 1 })),
    });
    for (const bad of [twice, shared, many]) expect(client(bad).ok).toBe(false);
    for (const seat of [0, -1, 1.5, 17]) {
      expect(
        client(
          withPayload(CLIENT.GAME_PARTICIPANTS, { participants: [{ controllerId: CTRL, seat }] }),
        ).ok,
      ).toBe(false);
    }
    expect(client(withPayload(CLIENT.GAME_PARTICIPANTS, { participants: [] })).ok).toBe(true);
  });

  it('a snapshot never shows a participant who is not a member holding membership', () => {
    const stranger = clone(SERVER.CONSOLE_UPDATED) as unknown as {
      payload: { game: { participants: Json[] }; controllers: Json[] };
    };
    stranger.payload.game.participants = [{ controllerId: 'nobody', seat: 1 }];
    expect(server(stranger).ok).toBe(false);
    const released = clone(SERVER.CONSOLE_UPDATED) as unknown as {
      payload: { controllers: Json[] };
    };
    (released.payload.controllers[0] as Json)['membership'] = 'RELEASED';
    (released.payload.controllers[0] as Json)['connection'] = 'DISCONNECTED';
    expect(server(released).ok).toBe(false);
  });
});

describe('contexts stay semantic; WAITING is the server’s, per controller', () => {
  const view = (patch: Json) => withPayload(SERVER.CONTROLLER_CONTEXT, patch);

  it('the effective vocabulary is the four contexts plus WAITING, and nothing screen-like', () => {
    expect([...EFFECTIVE_CONTEXTS]).toEqual([...CONTROLLER_CONTEXTS, 'WAITING']);
    for (const screen of ['HOME', 'SETTINGS', 'FU_LOBBY', 'ABOUT', 'LOBBY']) {
      expect(server(view({ context: screen })).ok, screen).toBe(false);
    }
  });

  it('the TV cannot set WAITING: its CONTROLLER_CONTEXT keeps the four contexts', () => {
    const set = {
      type: 'CONTROLLER_CONTEXT',
      seq: 1,
      payload: { context: 'WAITING', secondaryAction: null },
    };
    expect(client(set).ok).toBe(false);
    expect(client({ ...set, payload: { context: 'PAUSED', secondaryAction: null } }).ok).toBe(true);
  });

  it('WAITING belongs to a controller waiting in the active launch, and to nobody else', () => {
    const waiting = { gameSessionId: GAME, status: 'WAITING' };
    expect(server(view({ context: 'WAITING', participation: waiting })).ok).toBe(true);
    expect(server(view({ context: 'WAITING', participation: null })).ok).toBe(false);
    expect(
      server(
        view({ context: 'WAITING', participation: { ...waiting, status: 'PARTICIPANT', seat: 1 } }),
      ).ok,
    ).toBe(false);
    // a spare controller in the lobby navigates the console: CONSOLE + WAITING participation is fine
    expect(server(view({ context: 'CONSOLE', participation: waiting })).ok).toBe(true);
  });

  it('a participant has a seat; a waiting controller has none; no game means participation null', () => {
    const p = (participation: unknown) => server(view({ participation }));
    expect(p({ gameSessionId: GAME, status: 'PARTICIPANT' }).ok).toBe(false);
    expect(p({ gameSessionId: GAME, status: 'WAITING', seat: 1 }).ok).toBe(false);
    expect(p({ gameSessionId: GAME, status: 'NONE' }).ok).toBe(false);
    expect(server(view({ context: 'CONSOLE', participation: null })).ok).toBe(true);
  });

  it('the view’s version is positive and bounded; an older view is the phone’s to discard', () => {
    for (const version of [0, -1, 1.5, 4_294_967_296]) {
      expect(server(view({ version })).ok).toBe(false);
    }
  });

  it('enumerated fields reject anything else', () => {
    expect(server(withPayload(SERVER.CONSOLE_ENDED, { reason: 'LEFT' })).ok).toBe(false);
    expect([...CONSOLE_END_REASONS]).toEqual(['CLOSED_BY_TV', 'TV_GONE', 'REMOVED']);
    expect(server(withPayload(SERVER.CONSOLE_STATUS, { hostConnection: 'GONE' })).ok).toBe(false);
    expect(server(withPayload(SERVER.CONSOLE_UPDATED, { state: 'LOBBY' })).ok).toBe(false);
    const game = clone(SERVER.CONSOLE_UPDATED) as unknown as { payload: { game: Json } };
    game.payload.game['state'] = 'CLOSING'; // closing belongs to the console, not a game
    expect(server(game).ok).toBe(false);
    expect(client(withPayload(CLIENT.GAME_LAUNCH, { gameId: 'Foomerang Fu' })).ok).toBe(false);
  });
});

describe('protocol version: still 1, negotiated once, for both flows', () => {
  const handshake = (protocolVersion: number) => ({
    type: 'HANDSHAKE',
    payload: { protocolVersion, clientType: 'controller', clientVersion: '0.1.0' },
  });

  it('C2 is additive: the protocol version is unchanged', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('the console flow speaks version 1 and answers an unknown version like the legacy flow', () => {
    expect(client(handshake(1)).ok).toBe(true);
    expect(client(handshake(2))).toEqual({ ok: false, code: 'UNSUPPORTED_PROTOCOL' });
    expect(parseClientMessage(handshake(2))).toEqual({ ok: false, code: 'UNSUPPORTED_PROTOCOL' });
  });

  it('no console-flow message repeats the version (it is per connection, not per message)', () => {
    expect(client(withPayload(CLIENT.CONSOLE_OPEN, { protocolVersion: 1 })).ok).toBe(false);
    expect(client(withPayload(CLIENT.CONTROLLER_JOIN, { protocolVersion: 1 })).ok).toBe(false);
  });
});

describe('compatibility: the legacy ROOM_* flow is untouched', () => {
  it('since C4 the server’s trust boundary accepts every console-flow client message', () => {
    for (const message of Object.values(CLIENT)) {
      expect(parseClientMessage(clone(message)), message.type).toEqual({ ok: true, message });
    }
    // what the server SENDS is still never something a client may send (and vice versa)
    for (const message of Object.values(SERVER)) {
      expect(parseServerMessage(clone(message)).ok, message.type).toBe(false);
    }
  });

  it('MATCH_*: the console flow requires the launch; the server boundary also takes the legacy {}', () => {
    expect(client({ type: 'MATCH_START', payload: {} }).ok).toBe(false);
    expect(parseClientMessage({ type: 'MATCH_START', payload: {} }).ok).toBe(true);
    expect(parseClientMessage({ type: 'MATCH_END', payload: { gameSessionId: GAME } }).ok).toBe(
      true,
    );
    expect(parseClientMessage({ type: 'MATCH_END', payload: { gameSessionId: 'bad id' } }).ok).toBe(
      false,
    );
  });

  it('legacy messages still parse at the legacy boundary, exactly as before', () => {
    const legacy = [
      { type: 'ROOM_CREATE', payload: { gameId: 'foomerang-fu' } },
      { type: 'ROOM_JOIN', payload: { joinCode: CODE, displayName: 'Alice' } },
      { type: 'PLAYER_RECONNECT', payload: { joinCode: CODE, reconnectToken: TOKEN } },
      { type: 'MATCH_START', payload: {} },
      { type: 'MATCH_END', payload: {} },
    ];
    for (const message of legacy) expect(parseClientMessage(message).ok, message.type).toBe(true);
    expect(
      parseServerMessage({
        type: 'CONTROLLER_CONTEXT',
        payload: { context: 'CONSOLE', secondaryAction: null, version: 1 },
      }).ok,
    ).toBe(true);
  });

  it('the console flow does not accept ROOM_* (no mixing of flows on one connection)', () => {
    expect(client({ type: 'ROOM_CREATE', payload: { gameId: 'foomerang-fu' } }).ok).toBe(false);
    expect(client({ type: 'ROOM_JOIN', payload: { joinCode: CODE, displayName: 'A' } }).ok).toBe(
      false,
    );
    expect(client({ type: 'MATCH_START', payload: {} }).ok).toBe(false); // console MATCH_* is game-scoped
  });

  it('shared messages are reused, not copied: both flows accept the same HOST_RECONNECT and input', () => {
    const shared = [
      { type: 'HOST_RECONNECT', payload: { joinCode: CODE, hostToken: TOKEN } },
      { type: 'INPUT_MOVE', seq: 1, payload: { x: 0, y: 0 } },
      {
        type: 'INPUT_EVENT',
        seq: 1,
        eventId: 'press-000001',
        payload: { action: 'MENU', phase: 'pressed' },
      },
      { type: 'HEARTBEAT', seq: 1 },
    ];
    for (const message of shared) {
      expect(client(message).ok, message.type).toBe(parseClientMessage(message).ok);
    }
  });
});

describe('epoch fields (C4): routed input and the TV’s context name their launch', () => {
  it('CONTROLLER_INPUT always says which launch it was routed under (or none)', () => {
    expect(server(withPayload(SERVER.CONTROLLER_INPUT, { gameSessionId: null })).ok).toBe(true);
    expect(server(without(SERVER.CONTROLLER_INPUT, 'gameSessionId')).ok).toBe(false);
    expect(server(withPayload(SERVER.CONTROLLER_INPUT, { gameSessionId: 'bad id' })).ok).toBe(
      false,
    );
  });

  it('the TV’s CONTROLLER_CONTEXT may name its launch (null: none); legacy rooms omit it', () => {
    const set = (payload: Json) => ({
      type: 'CONTROLLER_CONTEXT',
      seq: 2,
      payload: { context: 'PAUSED', secondaryAction: null, ...payload },
    });
    expect(client(set({ gameSessionId: GAME })).ok).toBe(true);
    expect(client(set({ gameSessionId: null })).ok).toBe(true);
    expect(client(set({})).ok).toBe(true);
    expect(parseClientMessage(set({ gameSessionId: GAME })).ok).toBe(true);
    expect(client(set({ gameSessionId: 'bad id' })).ok).toBe(false);
    expect(client(set({ gameSessionId: GAME, context: 'WAITING' })).ok).toBe(false); // still never WAITING
  });
});

describe('the base console controller (a platform constant, never sent)', () => {
  it('is a valid controller (the same rules as any game’s manifest) using the generic actions', () => {
    const asManifest = { gameId: 'foomerang', ...CONSOLE_CONTROLLER };
    expect(controllerManifestSchema.safeParse(asManifest).success).toBe(true);
    const actions = CONSOLE_CONTROLLER.controls.flatMap((c) =>
      c.type === 'button' ? [c.action] : [],
    );
    expect(actions).toEqual(['PRIMARY', 'SECONDARY', 'TERTIARY']);
  });
});

describe('the unions are complete and directional', () => {
  const types = (schema: z.ZodDiscriminatedUnion) =>
    schema.options.map(
      (o) => (o as unknown as { shape: { type: { value: string } } }).shape.type.value,
    );

  it('client → server', () => {
    expect(types(consoleClientMessageSchema as unknown as z.ZodDiscriminatedUnion).sort()).toEqual(
      [
        'CONSOLE_CLOSE',
        'CONSOLE_OPEN',
        'CONTROLLER_CONTEXT',
        'CONTROLLER_JOIN',
        'CONTROLLER_LEAVE',
        'CONTROLLER_RECONNECT',
        'CONTROLLER_REMOVE',
        'CONTROLLER_RUMBLE',
        'GAME_EXIT',
        'GAME_LAUNCH',
        'GAME_PARTICIPANTS',
        'HANDSHAKE',
        'HEARTBEAT',
        'HOST_RECONNECT',
        'INPUT_EVENT',
        'INPUT_MOVE',
        'MATCH_END',
        'MATCH_START',
      ].sort(),
    );
  });

  it('server → client', () => {
    expect(types(consoleServerMessageSchema as unknown as z.ZodDiscriminatedUnion).sort()).toEqual(
      [
        'CONSOLE_ENDED',
        'CONSOLE_OPENED',
        'CONSOLE_STATUS',
        'CONSOLE_UPDATED',
        'CONTROLLER_CONTEXT',
        'CONTROLLER_INPUT',
        'CONTROLLER_JOINED',
        'CONTROLLER_MANIFEST',
        'CONTROLLER_RECONNECTED',
        'ERROR',
        'HANDSHAKE_ACCEPTED',
        'HEARTBEAT_ACK',
        'HOST_RECONNECTED',
        'RUMBLE',
      ].sort(),
    );
  });
});
