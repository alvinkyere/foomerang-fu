import { describe, expect, it } from 'vitest';
import { SocketIOTransport } from '@foomerang/controller-sdk';
import { PROTOCOL_VERSION } from '@foomerang/protocol';

/**
 * LIVE-DEPLOYMENT test: it talks to a real deployed preview over the internet, so ordinary (offline)
 * validation does not run it. Run it deliberately:
 *
 *   FOOMERANG_LIVE_PREVIEW=1 pnpm --filter @foomerang/integration exec vitest run test/preview-live.test.ts
 *
 * `FOOMERANG_PREVIEW_URL` points it at another deployment.
 */
const LIVE = process.env['FOOMERANG_LIVE_PREVIEW'] === '1';

describe.skipIf(!LIVE)('Live Vercel Preview Smoke Test', () => {
  const PREVIEW_URL =
    process.env['FOOMERANG_PREVIEW_URL'] ??
    'https://foomerang-gqolr6sdf-alvin-kyeres-projects.vercel.app';

  it('connects to deployed preview via Socket.IO WebSocket and completes handshake', async () => {
    const transport = new SocketIOTransport(PREVIEW_URL);
    await transport.connect();

    const response = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Handshake response timeout (10s)')), 10000);
      transport.onMessage((msg) => {
        clearTimeout(timer);
        resolve(msg);
      });

      transport.send({
        type: 'HANDSHAKE',
        payload: {
          protocolVersion: PROTOCOL_VERSION,
          clientType: 'console',
          clientVersion: '0.1.0',
        },
      });
    });

    expect(response).toMatchObject({
      type: 'HANDSHAKE_ACCEPTED',
    });

    transport.close();
  }, 15000);
});
