import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFoomerangServer } from '../src/server';
import { RealClient } from './support/SocketIOTransportClient';

/**
 * Optional TLS (wss://) for a real phone over HTTPS. The certificate here is a throwaway generated
 * for the test; the client TRUSTS IT EXPLICITLY (`ca`) — certificate verification is never switched off.
 */
let dir: string;
let cert: string;
let key: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'foomerang-tls-'));
  writeFileSync(
    join(dir, 'openssl.cnf'),
    [
      '[req]',
      'distinguished_name = dn',
      'x509_extensions = ext',
      'prompt = no',
      '[dn]',
      'CN = localhost',
      '[ext]',
      'subjectAltName = IP:127.0.0.1,DNS:localhost',
    ].join('\n'),
  );
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-config',
      join(dir, 'openssl.cnf'),
      '-keyout',
      join(dir, 'key.pem'),
      '-out',
      join(dir, 'cert.pem'),
    ],
    { stdio: 'ignore' },
  );
  cert = readFileSync(join(dir, 'cert.pem'), 'utf8');
  key = readFileSync(join(dir, 'key.pem'), 'utf8');
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const handshake = {
  type: 'HANDSHAKE',
  payload: { protocolVersion: 1, clientType: 'console', clientVersion: '0.1.0' },
};

/** Connects and completes a handshake, or reports that the connection could not be made. */
async function attempt(
  port: number,
  tls: { ca?: string } | undefined,
): Promise<'ACCEPTED' | 'REFUSED'> {
  let client: RealClient;
  try {
    client = await RealClient.connect(port, tls === undefined ? {} : { tls });
  } catch {
    return 'REFUSED';
  }
  try {
    client.send(handshake);
    await client.take('HANDSHAKE_ACCEPTED');
    return 'ACCEPTED';
  } catch {
    return 'REFUSED';
  } finally {
    client.close();
  }
}

describe('TLS (wss)', () => {
  it('serves the protocol over wss to a client that trusts its certificate', async () => {
    const server = createFoomerangServer({ host: '127.0.0.1', port: 0, tls: { cert, key } });
    const { port } = await server.start();
    try {
      expect(await attempt(port, { ca: cert })).toBe('ACCEPTED');
    } finally {
      await server.stop();
    }
  });

  it('is genuinely encrypted and verified: a client that does not trust the certificate is refused', async () => {
    const server = createFoomerangServer({ host: '127.0.0.1', port: 0, tls: { cert, key } });
    const { port } = await server.start();
    try {
      expect(await attempt(port, {})).toBe('REFUSED');
    } finally {
      await server.stop();
    }
  });

  it('without a certificate the server stays plain ws (the development default)', async () => {
    const server = createFoomerangServer({ host: '127.0.0.1', port: 0 });
    const { port } = await server.start();
    try {
      expect(await attempt(port, undefined)).toBe('ACCEPTED');
      expect(await attempt(port, { ca: cert })).toBe('REFUSED');
    } finally {
      await server.stop();
    }
  });
});
