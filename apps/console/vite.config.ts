import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Only these two variables are readable by the page, and they hold URLs, never secrets. The prefix
// list is deliberately NOT the whole 'FOOMERANG_' namespace: that would also hand the page the
// location of the TLS key (test/viteConfig.test.ts).
// Optional HTTPS (needed to try a phone over a production-representative origin). The variables
// are PATHS to PEM files; the private key is read from disk and never put in an env value.
const tlsCert = process.env['FOOMERANG_TLS_CERT'];
const tlsKey = process.env['FOOMERANG_TLS_KEY'];
const https =
  tlsCert !== undefined && tlsKey !== undefined
    ? { cert: readFileSync(tlsCert), key: readFileSync(tlsKey) }
    : undefined;

export default defineConfig({
  envPrefix: ['VITE_', 'FOOMERANG_CONTROLLER_URL', 'FOOMERANG_SERVER_URL'],
  plugins: [react()],
  // `host: true` listens on the LAN so the console can be opened by its LAN address.
  server: { host: true, port: Number(process.env['PORT'] ?? 5174), ...(https ? { https } : {}) },
  preview: { host: true, port: 4174, ...(https ? { https } : {}) },
  build: { chunkSizeWarningLimit: 2_000 }, // Phaser is large by nature; it is lazy-loaded and budgeted separately
  test: { environment: 'jsdom', setupFiles: ['./test/setup.ts'], css: false },
});
