import { describe, expect, it } from 'vitest';
import {
  CLIENT_TYPES,
  clientTypeSchema,
  clientVersionSchema,
  handshakeMessageSchema,
  handshakePayloadSchema,
} from '../src/client';

const validPayload = { protocolVersion: 1, clientType: 'controller', clientVersion: '0.1.0' };

describe('client types', () => {
  it('are the three platform clients', () => {
    expect([...CLIENT_TYPES]).toEqual(['console', 'controller', 'native-controller']);
  });

  it.each(['console', 'controller', 'native-controller'])('accepts %s', (value) => {
    expect(clientTypeSchema.safeParse(value).success).toBe(true);
  });

  it.each(['admin', 'Controller', 'CONSOLE', 'host', '', ' controller', 42, null, undefined, {}])(
    'rejects %j',
    (value) => {
      expect(clientTypeSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('clientVersion (application release, NOT wire compatibility)', () => {
  it.each(['0.1.0', '0.2.0', '12.34.56', '1.0.0-beta.1', '1.0.0-rc1'])('accepts %s', (value) => {
    expect(clientVersionSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    '',
    '1',
    '1.0',
    'v1.0.0',
    '1.0.0 ',
    'latest',
    '1.0.0+build',
    '1.0.0-',
    'a'.repeat(33),
    1,
    null,
  ])('rejects %j', (value) => {
    expect(clientVersionSchema.safeParse(value).success).toBe(false);
  });
});

describe('handshake payload', () => {
  it('accepts a valid payload', () => {
    expect(handshakePayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  it('does not tie application release to protocol compatibility', () => {
    // Releasing app 0.2.0 / 7.3.1 does not change the wire protocol: still a valid protocol-1 handshake.
    for (const clientVersion of ['0.2.0', '7.3.1']) {
      const result = handshakePayloadSchema.safeParse({ ...validPayload, clientVersion });
      expect(result.success, clientVersion).toBe(true);
    }
  });

  it('is shape-valid for any positive integer protocolVersion (compatibility is decided elsewhere)', () => {
    expect(handshakePayloadSchema.safeParse({ ...validPayload, protocolVersion: 2 }).success).toBe(
      true,
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1', null, undefined])(
    'rejects protocolVersion %j',
    (protocolVersion) => {
      expect(handshakePayloadSchema.safeParse({ ...validPayload, protocolVersion }).success).toBe(
        false,
      );
    },
  );

  it('rejects an invalid clientType', () => {
    expect(handshakePayloadSchema.safeParse({ ...validPayload, clientType: 'admin' }).success).toBe(
      false,
    );
  });

  it.each(['protocolVersion', 'clientType', 'clientVersion'])('rejects a missing %s', (key) => {
    const rest = Object.fromEntries(Object.entries(validPayload).filter(([k]) => k !== key));
    expect(handshakePayloadSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects unknown extra fields', () => {
    expect(handshakePayloadSchema.safeParse({ ...validPayload, isAdmin: true }).success).toBe(
      false,
    );
  });

  it('rejects a __proto__ key arriving from JSON', () => {
    const hostile = JSON.parse(
      '{"protocolVersion":1,"clientType":"controller","clientVersion":"0.1.0","__proto__":{"isAdmin":true}}',
    ) as unknown;
    expect(handshakePayloadSchema.safeParse(hostile).success).toBe(false);
  });

  it.each([null, undefined, 'x', 42, [], [validPayload]])('rejects non-object payload %j', (v) => {
    expect(handshakePayloadSchema.safeParse(v).success).toBe(false);
  });
});

describe('HANDSHAKE message envelope', () => {
  it('has the plain shape { type, payload }', () => {
    const result = handshakeMessageSchema.safeParse({ type: 'HANDSHAKE', payload: validPayload });
    expect(result.success).toBe(true);
  });

  it('does not carry irrelevant metadata (seq, eventId)', () => {
    const withSeq = { type: 'HANDSHAKE', seq: 1, payload: validPayload };
    expect(handshakeMessageSchema.safeParse(withSeq).success).toBe(false);
  });

  it.each([
    { type: 'handshake', payload: validPayload },
    { type: 'HELLO', payload: validPayload },
    { payload: validPayload },
    { type: 'HANDSHAKE' },
  ])('rejects %j', (value) => {
    expect(handshakeMessageSchema.safeParse(value).success).toBe(false);
  });
});
