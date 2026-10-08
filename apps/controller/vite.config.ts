import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Optional HTTPS (needed to try a phone over a production-representative origin). The variables
// are PATHS to PEM files; the private key is read from disk and never put in an env value.
const tlsCert = process.env['FOOMERANG_TLS_CERT'];
const tlsKey = process.env['FOOMERANG_TLS_KEY'];
const https =
  tlsCert !== undefined && tlsKey !== undefined
    ? { cert: readFileSync(tlsCert), key: readFileSync(tlsKey) }
    : undefined;

export default defineConfig({
  base: process.env['VITE_BASE_URL'] ?? (process.env['VERCEL'] ? '/controller/' : './'),
  plugins: [react()],
  // `host: true` listens on the LAN so a real phone can load the page from a dev machine.
  server: { host: true, port: 5173, ...(https ? { https } : {}) },
  preview: { host: true, port: 4173, ...(https ? { https } : {}) },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    css: false,
  },
});
