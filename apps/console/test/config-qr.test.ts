import { describe, expect, it } from 'vitest';
import { buildJoinUrl, resolveConsoleConfig } from '../src/config';
import { createQrMatrix, qrPath } from '../src/qr';

const page = { protocol: 'http:', hostname: '192.168.1.20' };

describe('console configuration (explicit and validated — the LAN address is never guessed)', () => {
  it('defaults to the controller and server on the same machine that served the console', () => {
    const config = resolveConsoleConfig({
      ...page,
      controllerUrl: undefined,
      serverUrl: undefined,
    });
    expect(config).toEqual({
      ok: true,
      controllerBaseUrl: 'http://192.168.1.20:5173',
      serverUrl: 'http://192.168.1.20:3001',
      warnings: [],
    });
  });

  it('uses FOOMERANG_CONTROLLER_URL and FOOMERANG_SERVER_URL when given', () => {
    const config = resolveConsoleConfig({
      ...page,
      controllerUrl: 'https://play.example.com',
      serverUrl: 'https://api.example.com:8443',
    });
    expect(config).toMatchObject({
      ok: true,
      controllerBaseUrl: 'https://play.example.com',
      serverUrl: 'https://api.example.com:8443',
    });
  });

  it.each([
    ['not a url', 'is not a valid URL'],
    ['ftp://example.com', 'http or https'],
    ['javascript:alert(1)', 'http or https'],
    ['http://user:pass@example.com', 'credentials'],
    ['http://example.com/?room=ABC123', 'query'],
    ['http://example.com/#frag', 'fragment'],
    ['//example.com', 'is not a valid URL'],
  ])(
    'rejects a bad controller URL (%s) at startup with a clear reason',
    (controllerUrl, reason) => {
      const config = resolveConsoleConfig({ ...page, controllerUrl, serverUrl: undefined });
      expect(config.ok).toBe(false);
      if (!config.ok) expect(config.problems.join(' ')).toContain(reason);
    },
  );

  it('rejects a bad server URL too, and reports every problem at once', () => {
    const config = resolveConsoleConfig({ ...page, controllerUrl: 'nope', serverUrl: 'ftp://x' });
    expect(config.ok).toBe(false);
    if (!config.ok) expect(config.problems).toHaveLength(2);
  });

  it('keeps a path on the controller base URL (a deployment may live under /play)', () => {
    const config = resolveConsoleConfig({
      ...page,
      controllerUrl: 'https://example.com/play/',
      serverUrl: undefined,
    });
    expect(config).toMatchObject({ ok: true, controllerBaseUrl: 'https://example.com/play' });
  });

  describe('warns, honestly, when the QR could not work from a phone', () => {
    it.each(['localhost', '127.0.0.1', '[::1]'])('the controller URL points at %s', (hostname) => {
      const config = resolveConsoleConfig({
        protocol: 'http:',
        hostname,
        controllerUrl: undefined,
        serverUrl: undefined,
      });
      expect(config.ok && config.warnings.join(' ')).toMatch(/phone/i);
      expect(config.ok && config.warnings.join(' ')).toMatch(/FOOMERANG_CONTROLLER_URL/);
    });

    it('an explicit LAN URL silences it, even when the console itself is on localhost', () => {
      const config = resolveConsoleConfig({
        protocol: 'http:',
        hostname: 'localhost',
        controllerUrl: 'http://192.168.1.20:5173',
        serverUrl: undefined,
      });
      expect(config.ok && config.warnings).toEqual([]);
    });
  });
});

describe('the join URL (what the QR carries): the room, and nothing privileged', () => {
  it('is the controller base URL plus ?room=CODE', () => {
    expect(buildJoinUrl('http://192.168.1.20:5173', 'K7M4PX')).toBe(
      'http://192.168.1.20:5173/?room=K7M4PX',
    );
    expect(buildJoinUrl('https://example.com/play', 'K7M4PX')).toBe(
      'https://example.com/play/?room=K7M4PX',
    );
  });

  it('carries exactly one parameter: scanning identifies a room, it authenticates nobody', () => {
    const url = new URL(buildJoinUrl('http://192.168.1.20:5173', 'K7M4PX'));
    expect([...url.searchParams.keys()]).toEqual(['room']);
    expect(url.hash).toBe('');
    expect(url.username + url.password).toBe('');
  });

  it.each(['', 'K7M4P', 'K7M4P0', 'k7m4px', 'K7M4PXX', 'a b c d', '<script>'])(
    'refuses to build a link for an invalid room code (%j)',
    (code) => {
      expect(() => buildJoinUrl('http://192.168.1.20:5173', code)).toThrow();
    },
  );
});

describe('QR matrix (qrcode-generator, rendered by us — no library markup is injected)', () => {
  const url = 'http://192.168.1.20:5173/?room=K7M4PX';

  it('is a square matrix with the three finder patterns in the corners', () => {
    const { size, dark } = createQrMatrix(url);
    expect(size).toBeGreaterThanOrEqual(21);
    expect((size - 17) % 4).toBe(0); // 21, 25, 29, ... = 17 + 4 × version
    for (const [r0, c0] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ] as const) {
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 7; c += 1) {
          const ring = r === 0 || r === 6 || c === 0 || c === 6;
          const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          expect(dark[r0 + r]?.[c0 + c], `finder at ${r0},${c0} cell ${r},${c}`).toBe(ring || core);
        }
      }
    }
  });

  it('is deterministic, and different content gives a different matrix', () => {
    expect(createQrMatrix(url)).toEqual(createQrMatrix(url));
    expect(createQrMatrix(url).dark).not.toEqual(
      createQrMatrix(url.replace('K7M4PX', 'ABCDEF')).dark,
    );
  });

  it('uses medium error correction (readable on a TV from across a room, even slightly dirty)', () => {
    // A higher version for the same text would mean more modules; M keeps a ~40-char URL small.
    expect(createQrMatrix(url).size).toBeLessThanOrEqual(33);
  });

  it('turns into an SVG path with a 4-module quiet zone, and one rect per dark module', () => {
    const matrix = createQrMatrix(url);
    const { viewBox, d } = qrPath(matrix);
    expect(viewBox).toBe(matrix.size + 8);
    const darkModules = matrix.dark.flat().filter(Boolean).length;
    const painted = [...d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)].reduce(
      (sum, m) => sum + Number(m[3]),
      0,
    );
    expect(painted).toBe(darkModules); // horizontal runs, so the sum of run lengths is the dark count
    const xs = [...d.matchAll(/M(\d+) (\d+)h/g)].map((m) => Number(m[1]));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(4);
  });

  it('is an empty-but-valid QR for nothing: it never throws on arbitrary text', () => {
    for (const text of ['', 'x', 'é'.repeat(30), url]) {
      expect(() => createQrMatrix(text)).not.toThrow();
    }
  });
});
