import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

// One shared stack (see global-setup.ts) and one worker: tests are isolated by room, not by
// process, and the stack's ports are ephemeral so nothing collides with a developer's own servers.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: join(tmpdir(), 'foomerang-e2e-results'),
  use: {
    // The system Chrome: no browser download. (Not Safari — see docs/DEVICE_TESTING.md.)
    channel: 'chrome',
    headless: true,
  },
});
