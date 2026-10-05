import { ERROR_CODES } from '@foomerang/protocol';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRoomParam, resolveServerUrl } from '../src/config';
import { ERROR_COPY, failureMessage } from '../src/copy';
import { orientationHint } from '../src/orientation';

describe('QR link: ?room=', () => {
  it.each([
    ['?room=K7M4PX', 'K7M4PX'],
    ['?room=k7m4px', 'K7M4PX'],
    ['?foo=1&room=K7M4PX&bar=2', 'K7M4PX'],
    ['?room=%20K7M4PX%20', undefined], // spaces are not part of a code
  ])('%s → %s', (search, expected) => {
    expect(parseRoomParam(search)).toBe(expected);
  });

  it.each([
    '',
    '?',
    '?room=',
    '?room=K7M4P',
    '?room=K7M4P0',
    '?room=K7M4PXX',
    '?room=<script>',
    '?rooms=K7M4PX',
  ])('ignores an absent or invalid room (%j) rather than prefilling nonsense', (search) => {
    expect(parseRoomParam(search)).toBeUndefined();
  });
});

describe('which server to talk to', () => {
  const base = {
    search: '',
    protocol: 'http:',
    hostname: '192.168.1.20',
    envUrl: undefined,
    allowOverride: false,
  };

  it('defaults to port 3001 on the machine that served the page (a phone loading from the dev laptop)', () => {
    expect(resolveServerUrl(base)).toBe('http://192.168.1.20:3001');
    expect(resolveServerUrl({ ...base, protocol: 'https:', hostname: 'play.example' })).toBe(
      'https://play.example:3001',
    );
  });

  it('honours an explicit build-time URL', () => {
    expect(resolveServerUrl({ ...base, envUrl: 'https://api.example:8443' })).toBe(
      'https://api.example:8443',
    );
  });

  it('a ?server= override works in development only', () => {
    const search = '?server=http://10.0.0.7:4000';
    expect(resolveServerUrl({ ...base, search, allowOverride: true })).toBe('http://10.0.0.7:4000');
    expect(resolveServerUrl({ ...base, search, allowOverride: false })).toBe(
      'http://192.168.1.20:3001',
    );
  });

  it.each([
    '?server=javascript:alert(1)',
    '?server=ftp://x',
    '?server=not a url',
    '?server=',
    '?server=//evil.example',
  ])('refuses a malformed or non-HTTP override (%j) even in development', (search) => {
    expect(resolveServerUrl({ ...base, search, allowOverride: true })).toBe(
      'http://192.168.1.20:3001',
    );
  });
});

describe('consumer copy: protocol codes become human words', () => {
  it('has a message for EVERY protocol error code', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_COPY[code], code).toBeTruthy();
    }
  });

  it('never shows a code, jargon or network internals', () => {
    const messages = [
      ...Object.values(ERROR_COPY),
      failureMessage({ kind: 'CONNECTION_FAILED' }),
      failureMessage({ kind: 'CONNECTION_LOST' }),
    ];
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(8);
      expect(message.length).toBeLessThan(120);
      expect(message).not.toMatch(
        /[A-Z]{3,}_[A-Z_]+|protocol|socket|token|credential|handshake|payload|ERROR/,
      );
    }
  });

  it('is specific where it matters', () => {
    expect(failureMessage({ kind: 'SERVER', code: 'ROOM_FULL' })).toMatch(/full/i);
    expect(failureMessage({ kind: 'SERVER', code: 'ROOM_NOT_FOUND' })).toMatch(/room/i);
    expect(failureMessage({ kind: 'SERVER', code: 'SEAT_RELEASED' })).toMatch(/spot|seat/i);
    expect(failureMessage({ kind: 'SERVER', code: 'INVALID_RECONNECT_TOKEN' })).toMatch(
      /another device/i,
    );
    expect(failureMessage({ kind: 'CONNECTION_FAILED' })).toMatch(/wi-?fi/i);
  });
});

describe('orientationHint', () => {
  it.each([
    ['landscape', 'portrait', 'LANDSCAPE'],
    ['portrait', 'landscape', 'PORTRAIT'],
    ['landscape', 'landscape', undefined],
    ['portrait', 'portrait', undefined],
    ['any', 'portrait', undefined],
    ['any', 'landscape', undefined],
  ] as const)('game wants %s, phone is %s → %s', (wants, is, expected) => {
    expect(orientationHint(wants, is)).toBe(expected);
  });
});

describe('stylesheet contract (jsdom cannot evaluate CSS, so the properties that matter are guarded here)', () => {
  const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

  it('respects every safe-area inset (notches, home indicator, landscape sensor housing)', () => {
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(css, side).toContain(`env(safe-area-inset-${side}`);
    }
  });

  it('honours reduced motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('sizes to the real viewport on mobile browsers (dynamic viewport units, not 100vh)', () => {
    expect(css).toContain('100dvh');
  });

  it('keeps the play surface free of browser gestures and text selection', () => {
    expect(css).toMatch(/touch-action:\s*none/);
    expect(css).toMatch(/user-select:\s*none/);
    expect(css).toMatch(/-webkit-touch-callout:\s*none/);
    expect(css).toMatch(/overscroll-behavior:\s*none/);
  });

  it('has comfortable touch targets (>= 48 px) and visible keyboard focus', () => {
    const target = /--tap-target:\s*(\d+)px/.exec(css);
    expect(Number(target?.[1])).toBeGreaterThanOrEqual(48);
    expect(css).toContain(':focus-visible');
  });

  it('defines its palette as tokens, not scattered literals', () => {
    expect(css).toMatch(/:root\s*{[^}]*--color-/s);
  });
});
