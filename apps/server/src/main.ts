import { createFoomerangServer } from './server';

// Development entry point: `pnpm --filter @foomerang/server start`.
// Binds all interfaces by default so a phone on the same Wi-Fi can reach a dev machine. That is a
// DEVELOPMENT configuration; a production deployment needs proper origin / network / TLS controls.
const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '0.0.0.0';

const server = createFoomerangServer({
  port,
  host,
  // Log the message only: never an object that might one day carry a credential.
  onInternalError: (error) =>
    console.error('internal error:', error instanceof Error ? error.message : 'unknown'),
});

const { port: bound } = await server.start();
console.log(`Foomerang server listening on ${host}:${bound}  (WebSocket only)`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    console.log(`\n${signal}: shutting down`);
    void server.stop().then(() => process.exit(0));
  });
}
