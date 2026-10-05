import { describe, expect, it } from 'vitest';
import {
  handshakeAcceptedMessageSchema,
  hostReconnectMessageSchema,
  hostReconnectedMessageSchema,
  playerInputMessageSchema,
  playerReconnectMessageSchema,
  playerReconnectedMessageSchema,
  roomCreateMessageSchema,
  roomCreatedMessageSchema,
  roomJoinMessageSchema,
  roomJoinedMessageSchema,
  roomUpdatedMessageSchema,
} from '../src/index';
import { parseClientMessage, parseServerMessage } from '../src/parse';

const TOKEN = 'dGVzdC10b2tlbi10ZXN0LXRva2VuLXRlc3QtdG9rZW4';

const roster = {
  joinCode: 'K7M4PX',
  state: 'LOBBY',
  hostConnection: 'CONNECTED',
  players: [
    { playerId: 'p-1', displayName: 'Alice', connection: 'CONNECTED', seat: 'HELD' },
    { playerId: 'p-2', displayName: 'Bob', connection: 'RECONNECTING', seat: 'HELD' },
    { playerId: 'p-3', displayName: 'Cara', connection: 'DISCONNECTED', seat: 'RELEASED' },
  ],
};

const clientMessages = {
  ROOM_CREATE: { type: 'ROOM_CREATE', payload: { gameId: 'foomerang-fu' } },
  HOST_RECONNECT: { type: 'HOST_RECONNECT', payload: { joinCode: 'K7M4PX', hostToken: TOKEN } },
  ROOM_JOIN: { type: 'ROOM_JOIN', payload: { joinCode: 'K7M4PX', displayName: 'Alvin' } },
  PLAYER_RECONNECT: {
    type: 'PLAYER_RECONNECT',
    payload: { joinCode: 'K7M4PX', reconnectToken: TOKEN },
  },
} as const;

const serverMessages = {
  HANDSHAKE_ACCEPTED: { type: 'HANDSHAKE_ACCEPTED', payload: { protocolVersion: 1 } },
  ROOM_CREATED: { type: 'ROOM_CREATED', payload: { joinCode: 'K7M4PX', hostToken: TOKEN } },
  HOST_RECONNECTED: {
    type: 'HOST_RECONNECTED',
    payload: { joinCode: 'K7M4PX', hostToken: TOKEN },
  },
  ROOM_JOINED: { type: 'ROOM_JOINED', payload: { playerId: 'p-1', reconnectToken: TOKEN } },
  PLAYER_RECONNECTED: {
    type: 'PLAYER_RECONNECTED',
    payload: { playerId: 'p-1', reconnectToken: TOKEN },
  },
  ROOM_UPDATED: { type: 'ROOM_UPDATED', payload: roster },
  PLAYER_INPUT_MOVE: {
    type: 'PLAYER_INPUT',
    payload: { playerId: 'p-1', input: { kind: 'MOVE', seq: 3, x: 0.5, y: -0.5 } },
  },
  PLAYER_INPUT_ACTION: {
    type: 'PLAYER_INPUT',
    payload: {
      playerId: 'p-1',
      input: { kind: 'ACTION', eventId: 'press-000001', action: 'PRIMARY', phase: 'pressed' },
    },
  },
} as const;

describe('client → server room messages', () => {
  it.each(Object.entries(clientMessages))('%s parses', (type, message) => {
    const result = parseClientMessage(message);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message.type).toBe(type);
  });

  describe('ROOM_CREATE', () => {
    it.each(['', 'Foomerang', 'foomerang fu', 'a'.repeat(65), '-leading', 42, null])(
      'rejects gameId %j',
      (gameId) => {
        expect(
          roomCreateMessageSchema.safeParse({ type: 'ROOM_CREATE', payload: { gameId } }).success,
        ).toBe(false);
      },
    );
  });

  describe('ROOM_JOIN', () => {
    it('normalizes the join code to canonical uppercase', () => {
      const parsed = roomJoinMessageSchema.safeParse({
        type: 'ROOM_JOIN',
        payload: { joinCode: 'k7m4px', displayName: 'Alvin' },
      });
      expect(parsed.success && parsed.data.payload.joinCode).toBe('K7M4PX');
    });

    it.each(['K7M4P0', 'K7M4P', '', ' K7M4PX', 123456, null])(
      'rejects join code %j',
      (joinCode) => {
        expect(
          roomJoinMessageSchema.safeParse({
            type: 'ROOM_JOIN',
            payload: { joinCode, displayName: 'x' },
          }).success,
        ).toBe(false);
      },
    );

    it('bounds the display name on the wire (the domain applies the real rules)', () => {
      const withName = (displayName: unknown) =>
        roomJoinMessageSchema.safeParse({
          type: 'ROOM_JOIN',
          payload: { joinCode: 'K7M4PX', displayName },
        });
      expect(withName('').success).toBe(true); // the domain answers INVALID_DISPLAY_NAME, which is a better error than INVALID_MESSAGE
      expect(withName('a'.repeat(64)).success).toBe(true);
      expect(withName('a'.repeat(65)).success).toBe(false);
      expect(withName('a'.repeat(2_000_000)).success).toBe(false);
      expect(withName(42).success).toBe(false);
      expect(withName(null).success).toBe(false);
    });
  });

  describe('credentials on the wire', () => {
    it.each(['', 'x'.repeat(129), 42, null, undefined, {}])(
      'rejects reconnectToken %j',
      (reconnectToken) => {
        expect(
          playerReconnectMessageSchema.safeParse({
            type: 'PLAYER_RECONNECT',
            payload: { joinCode: 'K7M4PX', reconnectToken },
          }).success,
        ).toBe(false);
        expect(
          hostReconnectMessageSchema.safeParse({
            type: 'HOST_RECONNECT',
            payload: { joinCode: 'K7M4PX', hostToken: reconnectToken },
          }).success,
        ).toBe(false);
      },
    );
  });

  it.each(Object.entries(clientMessages))(
    '%s rejects unknown fields and a missing payload',
    (_type, message) => {
      expect(parseClientMessage({ ...message, extra: true }).ok).toBe(false);
      expect(
        parseClientMessage({ ...message, payload: { ...message.payload, extra: true } }).ok,
      ).toBe(false);
      expect(parseClientMessage({ type: message.type }).ok).toBe(false);
    },
  );
});

describe('server → client messages', () => {
  it.each(Object.entries(serverMessages))('%s parses', (_name, message) => {
    expect(parseServerMessage(message).ok).toBe(true);
  });

  it('exposes each schema', () => {
    expect(
      handshakeAcceptedMessageSchema.safeParse(serverMessages.HANDSHAKE_ACCEPTED).success,
    ).toBe(true);
    expect(roomCreatedMessageSchema.safeParse(serverMessages.ROOM_CREATED).success).toBe(true);
    expect(hostReconnectedMessageSchema.safeParse(serverMessages.HOST_RECONNECTED).success).toBe(
      true,
    );
    expect(roomJoinedMessageSchema.safeParse(serverMessages.ROOM_JOINED).success).toBe(true);
    expect(
      playerReconnectedMessageSchema.safeParse(serverMessages.PLAYER_RECONNECTED).success,
    ).toBe(true);
  });

  describe('ROOM_UPDATED (roster snapshot for the host)', () => {
    const update = (patch: Record<string, unknown>) =>
      roomUpdatedMessageSchema.safeParse({
        type: 'ROOM_UPDATED',
        payload: { ...roster, ...patch },
      });

    it('accepts an empty roster and every connection / seat / room state', () => {
      expect(update({ players: [] }).success).toBe(true);
      for (const state of ['LOBBY', 'STARTING', 'PLAYING', 'RESULTS', 'CLOSING', 'CLOSED']) {
        expect(update({ state }).success, state).toBe(true);
      }
    });

    it.each([
      ['unknown room state', { state: 'LIMBO' }],
      ['unknown host connection', { hostConnection: 'ASLEEP' }],
      [
        'too many players',
        {
          players: Array.from({ length: 65 }, (_, i) => ({
            playerId: `p${i}`,
            displayName: 'x',
            connection: 'CONNECTED',
            seat: 'HELD',
          })),
        },
      ],
      [
        'bad connection',
        { players: [{ playerId: 'p', displayName: 'x', connection: 'GONE', seat: 'HELD' }] },
      ],
      [
        'bad seat',
        { players: [{ playerId: 'p', displayName: 'x', connection: 'CONNECTED', seat: 'FREE' }] },
      ],
      [
        'a credential smuggled into a player entry',
        {
          players: [
            {
              playerId: 'p',
              displayName: 'x',
              connection: 'CONNECTED',
              seat: 'HELD',
              reconnectToken: TOKEN,
            },
          ],
        },
      ],
    ])('rejects %s', (_label, patch) => {
      expect(update(patch).success).toBe(false);
    });
  });

  describe('PLAYER_INPUT (input routed to the host)', () => {
    const input = (value: unknown) =>
      playerInputMessageSchema.safeParse({
        type: 'PLAYER_INPUT',
        payload: { playerId: 'p-1', input: value },
      });

    it.each([
      ['unknown kind', { kind: 'TELEPORT', x: 0, y: 0 }],
      ['MOVE axis out of range', { kind: 'MOVE', seq: 1, x: 2, y: 0 }],
      ['MOVE axis NaN', { kind: 'MOVE', seq: 1, x: Number.NaN, y: 0 }],
      ['MOVE bad seq', { kind: 'MOVE', seq: -1, x: 0, y: 0 }],
      ['MOVE with eventId', { kind: 'MOVE', seq: 1, x: 0, y: 0, eventId: 'press-000001' }],
      [
        'ACTION bad eventId',
        { kind: 'ACTION', eventId: 'no', action: 'PRIMARY', phase: 'pressed' },
      ],
      [
        'ACTION bad action',
        { kind: 'ACTION', eventId: 'press-000001', action: 'NOPE', phase: 'pressed' },
      ],
    ])('rejects %s', (_label, value) => {
      expect(input(value).success).toBe(false);
    });
  });
});

describe('direction is enforced both ways', () => {
  it.each(Object.entries(clientMessages))(
    'a server cannot be impersonated: %s is not a server message',
    (_t, message) => {
      expect(parseServerMessage(message).ok).toBe(false);
    },
  );

  it.each(Object.entries(serverMessages))('a client cannot send %s', (_t, message) => {
    expect(parseClientMessage(message).ok).toBe(false);
  });
});
