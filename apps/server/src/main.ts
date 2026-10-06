import { readFileSync } from 'node:fs';
import { createFoomerangServer } from './server';

// Development entry point: `pnpm --filter @foomerang/server start`.
// Binds all interfaces by default so a phone on the same Wi-Fi can reach a dev machine. That is a
// DEVELOPMENT configuration; a production deployment needs proper origin / network / TLS controls.
const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '0.0.0.0';

// Optional TLS: FOOMERANG_TLS_CERT and FOOMERANG_TLS_KEY are PATHS to PEM files (the key is a
// secret and is only ever read from disk — never printed, never put in an env value itself).
const certPath = process.env['FOOMERANG_TLS_CERT'];
const keyPath = process.env['FOOMERANG_TLS_KEY'];
if ((certPath === undefined) !== (keyPath === undefined)) {
  console.error('Set both FOOMERANG_TLS_CERT and FOOMERANG_TLS_KEY, or neither.');
  process.exit(1);
}
const tls =
  certPath !== undefined && keyPath !== undefined
    ? { cert: readFileSync(certPath), key: readFileSync(keyPath) }
    : undefined;

const server = createFoomerangServer({
  port,
  host,
  ...(tls ? { tls } : {}),
  // Log the message only: never an object that might one day carry a credential.
  onInternalError: (error) =>
    console.error('internal error:', error instanceof Error ? error.message : 'unknown'),
});

const { port: bound } = await server.start();
console.log(
  `Foomerang server listening on ${host}:${bound}  (${tls ? 'wss, TLS' : 'ws, plain'}; WebSocket only)`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    console.log(`\n${signal}: shutting down`);
    void server.stop().then(() => process.exit(0));
  });
}
