import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SocketIOTransport } from '@foomerang/controller-sdk';
import { PROTOCOL_VERSION } from '@foomerang/protocol';
import { createFoomerangServer } from '@foomerang/server';

interface VercelService {
  readonly root: string;
  readonly framework?: string;
  readonly runtime?: string;
  readonly entrypoint?: string;
  readonly bindings?: readonly unknown[];
}

interface VercelRewrite {
  readonly source: string;
  readonly destination: {
    readonly service: string;
  };
}

interface VercelConfig {
  readonly services: Record<string, VercelService>;
  readonly rewrites: readonly VercelRewrite[];
}

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const vercelJson: VercelConfig = JSON.parse(readFileSync(`${repoRoot}vercel.json`, 'utf8'));

describe('vercel.json multi-service deployment configuration', () => {
  it('defines the three required services with expected roots and runtimes', () => {
    expect(vercelJson.services).toBeDefined();
    expect(vercelJson.services['console']).toEqual({
      root: 'apps/console',
      framework: 'vite',
    });
    expect(vercelJson.services['controller']).toEqual({
      root: 'apps/controller',
      framework: 'vite',
    });
    expect(vercelJson.services['server']).toEqual({
      root: 'apps/server',
      runtime: 'node',
      entrypoint: 'src/main.ts',
    });
  });

  it('declares no internal service bindings (client browsers connect to public endpoints)', () => {
    for (const [name, service] of Object.entries(vercelJson.services)) {
      expect(
        service.bindings ?? [],
        `service ${name} should have no internal service bindings`,
      ).toEqual([]);
    }
  });

  it('orders rewrites so /socket.io/* and /controller/* precede the console catch-all', () => {
    const rewrites = vercelJson.rewrites;
    const socketIoIndices = rewrites
      .map((r, i) => (r.destination.service === 'server' ? i : -1))
      .filter((i) => i !== -1);
    const controllerIndices = rewrites
      .map((r, i) => (r.destination.service === 'controller' ? i : -1))
      .filter((i) => i !== -1);
    const consoleCatchAllIndex = rewrites.findIndex(
      (r) => r.destination.service === 'console' && r.source === '/(.*)',
    );

    expect(socketIoIndices.length).toBeGreaterThan(0);
    expect(controllerIndices.length).toBeGreaterThan(0);
    expect(consoleCatchAllIndex).toBeGreaterThan(-1);

    // Every socket.io and controller rule must come before the console catch-all
    for (const idx of socketIoIndices) {
      expect(idx).toBeLessThan(consoleCatchAllIndex);
    }
    for (const idx of controllerIndices) {
      expect(idx).toBeLessThan(consoleCatchAllIndex);
    }
    // The console catch-all must be the last rewrite rule
    expect(consoleCatchAllIndex).toBe(rewrites.length - 1);
  });
});

/** Matches a pathname against Vercel-style rewrite source patterns. */
function routeRequest(
  urlPath: string,
  rewrites: readonly VercelRewrite[],
): { service: string; source: string } | undefined {
  const [pathname] = urlPath.split('?');
  if (pathname === undefined) return undefined;
  for (const rewrite of rewrites) {
    // Convert Vercel source pattern to RegExp:
    // /(.*) -> /.*
    // /path/(.*) -> /path/.*
    // /exact -> exact match
    const pattern = new RegExp(`^${rewrite.source.replace(/\(\.\*\)/g, '.*')}$`);
    if (pattern.test(pathname)) {
      return { service: rewrite.destination.service, source: rewrite.source };
    }
  }
  return undefined;
}

describe('Vercel routing precedence and fallback isolation', () => {
  const rewrites = vercelJson.rewrites;

  it('routes socket.io requests to the realtime server and never lets console swallow them', () => {
    const socketPaths = [
      '/socket.io',
      '/socket.io/',
      '/socket.io/?EIO=4&transport=websocket',
      '/socket.io/?EIO=4&transport=polling&t=12345',
      '/socket.io/arbitrary/subpath',
    ];
    for (const path of socketPaths) {
      const match = routeRequest(path, rewrites);
      expect(match?.service, `Path ${path} must route to server`).toBe('server');
    }
  });

  it('routes controller requests to the phone controller and never lets console swallow them', () => {
    const controllerPaths = [
      '/controller',
      '/controller/',
      '/controller/index.html',
      '/controller/assets/index-BBP2x95x.js',
      '/controller/assets/index-EfyWS6YJ.css',
      '/controller/?room=K7M4PX',
    ];
    for (const path of controllerPaths) {
      const match = routeRequest(path, rewrites);
      expect(match?.service, `Path ${path} must route to controller`).toBe('controller');
    }
  });

  it('routes root and console SPA paths to the console host display', () => {
    const consolePaths = [
      '/',
      '/index.html',
      '/assets/index-DxVHKKhZ.js',
      '/assets/index-B1-MiMSP.css',
      '/settings',
      '/games',
    ];
    for (const path of consolePaths) {
      const match = routeRequest(path, rewrites);
      expect(match?.service, `Path ${path} must route to console`).toBe('console');
    }
  });
});

describe('Live multi-service gateway routing over real HTTP and WebSockets', () => {
  it('connects a real Socket.IO client through the gateway and routes non-socket traffic separately', async () => {
    // 1. Start real realtime server on ephemeral port
    const realtimeServer = createFoomerangServer({ host: '127.0.0.1', port: 0 });
    const { port: serverPort } = await realtimeServer.start();

    // 2. Start a simulated Vercel edge gateway implementing vercel.json rewrites
    const gateway = createServer((req: IncomingMessage, res: ServerResponse) => {
      const route = routeRequest(req.url ?? '/', vercelJson.rewrites);
      if (route?.service === 'server') {
        // Forward HTTP polling requests to the server
        fetch(`http://127.0.0.1:${serverPort}${req.url}`, {
          method: req.method ?? 'GET',
          headers: req.headers as Record<string, string>,
        })
          .then(async (upstream) => {
            res.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
            const buf = await upstream.arrayBuffer();
            res.end(Buffer.from(buf));
          })
          .catch(() => {
            res.writeHead(502);
            res.end();
          });
        return;
      }
      if (route?.service === 'controller') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><html><body>CONTROLLER_APP</body></html>');
        return;
      }
      if (route?.service === 'console') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><html><body>CONSOLE_APP</body></html>');
        return;
      }
      res.writeHead(404);
      res.end('Not Found');
    });

    // Handle WebSocket upgrade through the gateway
    gateway.on('upgrade', (req, socket, head) => {
      const route = routeRequest(req.url ?? '/', vercelJson.rewrites);
      if (route?.service === 'server') {
        // Proxy raw TCP stream to realtime server
        const upstream = connect(serverPort, '127.0.0.1', () => {
          upstream.write(
            `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
              Object.entries(req.headers)
                .map(([k, v]) => `${k}: ${v}`)
                .join('\r\n') +
              '\r\n\r\n',
          );
          upstream.write(head);
          socket.pipe(upstream).pipe(socket);
        });
        upstream.on('error', () => socket.destroy());
        socket.on('error', () => upstream.destroy());
      } else {
        socket.destroy();
      }
    });

    const gatewayPort = await new Promise<number>((resolve) => {
      gateway.listen(0, '127.0.0.1', () => {
        const addr = gateway.address();
        resolve(typeof addr === 'object' && addr !== null ? addr.port : 0);
      });
    });

    try {
      // 3. Test HTTP routes through the gateway
      const rootRes = await fetch(`http://127.0.0.1:${gatewayPort}/`);
      expect(await rootRes.text()).toContain('CONSOLE_APP');

      const controllerRes = await fetch(`http://127.0.0.1:${gatewayPort}/controller`);
      expect(await controllerRes.text()).toContain('CONTROLLER_APP');

      const controllerSlashRes = await fetch(`http://127.0.0.1:${gatewayPort}/controller/`);
      expect(await controllerSlashRes.text()).toContain('CONTROLLER_APP');

      // 4. Test real Socket.IO WebSocket client connecting through the gateway URL
      const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;
      const transport = new SocketIOTransport(gatewayUrl);
      await transport.connect();

      // Handshake with the server through the gateway
      const accepted = new Promise<void>((resolve, reject) => {
        transport.onMessage((raw: unknown) => {
          const msg = raw as { type?: string };
          if (msg.type === 'HANDSHAKE_ACCEPTED') resolve();
          if (msg.type === 'REFUSED') reject(new Error('Handshake refused'));
        });
      });

      transport.send({
        type: 'HANDSHAKE',
        payload: {
          protocolVersion: PROTOCOL_VERSION,
          clientType: 'console',
          clientVersion: '0.1.0',
        },
      });

      await accepted;
      transport.close();
    } finally {
      await realtimeServer.stop();
      await new Promise<void>((resolve) => gateway.close(() => resolve()));
    }
  });
});
