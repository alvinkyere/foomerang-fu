import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, isSupportedProtocolVersion } from '../src/version';

describe('protocol version', () => {
  it('is 1 for the first protocol', () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it('supports the current version', () => {
    expect(isSupportedProtocolVersion(PROTOCOL_VERSION)).toBe(true);
    expect(isSupportedProtocolVersion(1)).toBe(true);
  });

  it.each([0, 2, 99, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1', null, undefined, {}])(
    'does not support %s',
    (value) => {
      expect(isSupportedProtocolVersion(value)).toBe(false);
    },
  );
});
