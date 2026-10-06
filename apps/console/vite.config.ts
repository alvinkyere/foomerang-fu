import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// FOOMERANG_* variables (e.g. FOOMERANG_CONTROLLER_URL) are intentionally readable by the page;
// they hold URLs, never secrets.
export default defineConfig({
  envPrefix: ['VITE_', 'FOOMERANG_'],
  plugins: [react()],
  // `host: true` listens on the LAN so the console can be opened by its LAN address.
  server: { host: true, port: Number(process.env['PORT'] ?? 5174) },
  preview: { host: true, port: 4174 },
  build: { chunkSizeWarningLimit: 2_000 }, // Phaser is large by nature; it is lazy-loaded and budgeted separately
  test: { environment: 'jsdom', setupFiles: ['./test/setup.ts'], css: false },
});
