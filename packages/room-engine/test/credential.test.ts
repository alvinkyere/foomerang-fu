import { describe, expect, it } from 'vitest';
import { Credential, toHostToken, toReconnectToken } from '../src/credential';

const SECRET = 'sup3r-s3cret-t0ken-value';
const INSPECT = Symbol.for('nodejs.util.inspect.custom');

describe('Credential', () => {
  it('reveals its value only through explicit reveal()', () => {
    expect(toReconnectToken(SECRET).reveal()).toBe(SECRET);
  });

  it('rejects an empty credential (programming error)', () => {
    expect(() => toReconnectToken('')).toThrow();
  });

  describe('never leaks through routine representations', () => {
    const token = toReconnectToken(SECRET);
    const representations: [string, () => string][] = [
      ['String()', () => String(token)],
      ['template literal', () => `token=${token}`],
      ['concatenation', () => 'token=' + token],
      ['JSON.stringify', () => JSON.stringify(token)],
      ['nested JSON.stringify', () => JSON.stringify({ player: { reconnectToken: token } })],
      ['array JSON.stringify', () => JSON.stringify([token, token])],
      ['object spread', () => JSON.stringify({ ...token })],
      ['Object.keys', () => Object.keys(token).join(',')],
      ['Object.getOwnPropertyNames', () => Object.getOwnPropertyNames(token).join(',')],
      ['Object.entries', () => JSON.stringify(Object.entries(token))],
    ];

    it.each(representations)('%s does not contain the secret', (_label, render) => {
      expect(render()).not.toContain(SECRET);
    });

    it('redacts explicitly where a string form is produced', () => {
      expect(String(token)).toBe('[REDACTED]');
      expect(JSON.stringify(token)).toBe('"[REDACTED]"');
    });

    it('answers the Node inspect hook with a redacted string', () => {
      const hook = (token as unknown as Record<symbol, () => string>)[INSPECT];
      expect(hook?.call(token)).toBe('[REDACTED]');
    });
  });

  describe('equals (constant-time comparison)', () => {
    const token = toReconnectToken(SECRET);

    it('is true for the exact value', () => {
      expect(token.equals(SECRET)).toBe(true);
    });

    it.each([
      ['different value, same length', 'sup3r-s3cret-t0ken-valuf'],
      ['prefix', SECRET.slice(0, -1)],
      ['extension', SECRET + 'x'],
      ['empty', ''],
      ['case change', SECRET.toUpperCase()],
      ['unrelated', 'hello'],
    ])('is false for %s', (_label, candidate) => {
      expect(token.equals(candidate)).toBe(false);
    });
  });

  describe('kinds are not interchangeable', () => {
    it('ReconnectToken and HostToken are distinct types', () => {
      const takesHost = (token: ReturnType<typeof toHostToken>): string => typeof token;
      takesHost(toHostToken('abc'));
      // @ts-expect-error a ReconnectToken is not a HostToken
      takesHost(toReconnectToken('abc'));
      // @ts-expect-error a raw string is not a credential
      takesHost('abc');
      expect(new Credential<'x'>('v').reveal()).toBe('v');
    });
  });
});
