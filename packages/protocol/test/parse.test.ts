import { describe, expect, it } from 'vitest';
import { parseClientMessage, parseServerMessage } from '../src/parse';

const handshake = (payload: Record<string, unknown> = {}) => ({
  type: 'HANDSHAKE',
  payload: { protocolVersion: 1, clientType: 'controller', clientVersion: '0.1.0', ...payload },
});
const move = (x: unknown, y: unknown) => ({ type: 'INPUT_MOVE', seq: 1, payload: { x, y } });
const press = {
  type: 'INPUT_EVENT',
  seq: 2,
  eventId: 'press-000001',
  payload: { action: 'PRIMARY', phase: 'pressed' },
};
const beat = { type: 'HEARTBEAT', seq: 3 };

const codeOf = (value: unknown) => {
  const result = parseClientMessage(value);
  return result.ok ? 'OK' : result.code;
};

describe('parseClientMessage — protocol compatibility', () => {
  it('accepts the current protocol version (1)', () => {
    expect(parseClientMessage(handshake({ protocolVersion: 1 })).ok).toBe(true);
  });

  it.each([2, 3, 99, 4_294_967_295])(
    'answers a well-formed handshake for unsupported version %s with UNSUPPORTED_PROTOCOL',
    (protocolVersion) => {
      expect(codeOf(handshake({ protocolVersion }))).toBe('UNSUPPORTED_PROTOCOL');
    },
  );

  it('answers a future-version handshake with UNSUPPORTED_PROTOCOL even if its shape changed', () => {
    // A v2 client may have renamed/restructured fields. It must still be told "unsupported
    // protocol", not "invalid message", so it can show the right upgrade prompt.
    const futureShape = {
      type: 'HANDSHAKE',
      payload: { protocolVersion: 2, client: { kind: 'controller' }, build: 'xyz' },
    };
    expect(codeOf(futureShape)).toBe('UNSUPPORTED_PROTOCOL');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1', null])(
    'treats a non-positive-integer protocolVersion (%j) as malformed, not "unsupported"',
    (protocolVersion) => {
      expect(codeOf(handshake({ protocolVersion }))).toBe('INVALID_MESSAGE');
    },
  );

  it('application version does not affect compatibility', () => {
    expect(parseClientMessage(handshake({ clientVersion: '0.2.0' })).ok).toBe(true);
    expect(parseClientMessage(handshake({ clientVersion: '9.9.9' })).ok).toBe(true);
  });

  it('rejects an invalid clientType as INVALID_MESSAGE', () => {
    expect(codeOf(handshake({ clientType: 'admin' }))).toBe('INVALID_MESSAGE');
  });
});

describe('parseClientMessage — accepts each client message type', () => {
  it.each([
    ['HANDSHAKE', handshake()],
    ['INPUT_MOVE', move(0.5, -0.5)],
    ['INPUT_EVENT', press],
    ['HEARTBEAT', beat],
  ])('%s', (type, value) => {
    const result = parseClientMessage(value);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message.type).toBe(type);
  });

  it('returns a discriminated, typed message', () => {
    const result = parseClientMessage(move(0.25, 0.75));
    if (result.ok && result.message.type === 'INPUT_MOVE') {
      expect(result.message.payload.x).toBe(0.25); // compile-time: payload is narrowed
      expect(result.message.seq).toBe(1);
    } else {
      expect.unreachable('expected INPUT_MOVE');
    }
  });

  it('survives a JSON round trip', () => {
    for (const value of [handshake(), move(0.1, 0.2), press, beat]) {
      expect(parseClientMessage(JSON.parse(JSON.stringify(value))).ok).toBe(true);
    }
  });
});

describe('parseClientMessage — rejects with INVALID_MESSAGE', () => {
  it.each([
    ['unknown type', { type: 'TELEPORT', payload: {} }],
    ['lowercase type', { ...beat, type: 'heartbeat' }],
    ['missing type', { seq: 1 }],
    ['type not a string', { type: 7, seq: 1 }],
    ['NaN axis', move(Number.NaN, 0)],
    ['Infinity axis', move(0, Number.POSITIVE_INFINITY)],
    ['out-of-range axis', move(2, 0)],
    ['axis as pixels', move(394, 12)],
    ['axis null (what JSON.stringify makes of NaN)', move(null, 0)],
    ['negative seq', { ...beat, seq: -1 }],
    ['malformed eventId', { ...press, eventId: 'no' }],
    ['missing eventId', { type: 'INPUT_EVENT', seq: 2, payload: press.payload }],
    ['extra fields', { ...beat, admin: true }],
    ['server-only message sent by a client (HEARTBEAT_ACK)', { type: 'HEARTBEAT_ACK', seq: 1 }],
    [
      'server-only message sent by a client (ERROR)',
      { type: 'ERROR', payload: { code: 'ROOM_FULL' } },
    ],
    ['join code in a movement message', { ...move(0, 0), joinCode: 'K7M4PX' }],
  ])('%s', (_label, value) => {
    expect(codeOf(value)).toBe('INVALID_MESSAGE');
  });

  it('rejects a __proto__ key arriving from JSON', () => {
    const hostile = JSON.parse(
      '{"type":"HEARTBEAT","seq":1,"__proto__":{"isAdmin":true}}',
    ) as unknown;
    expect(codeOf(hostile)).toBe('INVALID_MESSAGE');
  });

  it('does not pollute prototypes while rejecting', () => {
    codeOf(JSON.parse('{"type":"HEARTBEAT","seq":1,"__proto__":{"polluted":true}}'));
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('parseClientMessage — never throws on hostile input', () => {
  const throwingGetter = {
    get type(): string {
      throw new Error('boom');
    },
  };
  const circular: Record<string, unknown> = { type: 'HEARTBEAT' };
  circular['self'] = circular;
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'HEARTBEAT'],
    ['JSON text instead of an object', '{"type":"HEARTBEAT","seq":1}'],
    ['number', 42],
    ['boolean', true],
    ['bigint', 10n],
    ['symbol', Symbol('x')],
    ['function', () => beat],
    ['array', [beat]],
    ['empty object', {}],
    ['object with throwing getter', throwingGetter],
    ['circular object', circular],
    ['revoked proxy', revoked.proxy],
    ['huge type string (1 MB)', { type: 'x'.repeat(1_000_000), seq: 1 }],
    ['huge eventId (1 MB)', { ...press, eventId: 'x'.repeat(1_000_000) }],
    ['huge handshake string', handshake({ clientVersion: '1.0.0-' + 'a'.repeat(1_000_000) })],
    ['null-prototype object', Object.assign(Object.create(null), beat)],
  ])('%s', (_label, value) => {
    let result: ReturnType<typeof parseClientMessage> | undefined;
    expect(() => {
      result = parseClientMessage(value);
    }).not.toThrow();
    // Only the null-prototype object is a well-formed message; everything else is rejected.
    if (result?.ok === false) expect(result.code).toBe('INVALID_MESSAGE');
  });
});

describe('parseServerMessage', () => {
  it('accepts ERROR with every stable code', () => {
    for (const code of [
      'INVALID_MESSAGE',
      'UNSUPPORTED_PROTOCOL',
      'ROOM_NOT_FOUND',
      'ROOM_FULL',
      'INVALID_RECONNECT_TOKEN',
      'RATE_LIMITED',
      'UNAUTHORIZED',
    ]) {
      const result = parseServerMessage({ type: 'ERROR', payload: { code } });
      expect(result.ok, code).toBe(true);
    }
  });

  it('accepts HEARTBEAT_ACK', () => {
    expect(parseServerMessage({ type: 'HEARTBEAT_ACK', seq: 3 }).ok).toBe(true);
  });

  it.each([
    ['free-text error', { type: 'ERROR', payload: { code: 'bad room bro' } }],
    ['unknown code', { type: 'ERROR', payload: { code: 'EXPLODED' } }],
    [
      'human message smuggled in (copy belongs to clients)',
      { type: 'ERROR', payload: { code: 'ROOM_FULL', message: 'This game is full.' } },
    ],
    ['missing code', { type: 'ERROR', payload: {} }],
    ['client message sent as server message', move(0, 0)],
    ['unknown type', { type: 'TELEPORT' }],
    ['null', null],
  ])('rejects %s', (_label, value) => {
    const result = parseServerMessage(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_MESSAGE');
  });
});
