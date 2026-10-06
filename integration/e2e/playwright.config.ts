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
  projects: [
    {
      name: 'chrome',
      testIgnore: ['**/webkit.e2e.ts'],
      use: {
        // The system Chrome: no browser download. (Not Safari — see docs/DEVICE_TESTING.md.)
        channel: 'chrome',
        headless: true,
        launchOptions: {
          // Only in the https variant (FOOMERANG_E2E_TLS=1): trust exactly the throwaway
          // certificate's public key. Verification stays on for everything else.
          args:
            process.env['FOOMERANG_E2E_SPKI'] === undefined
              ? []
              : [`--ignore-certificate-errors-spki-list=${process.env['FOOMERANG_E2E_SPKI']}`],
        },
      },
    },
    // Opt-in (pnpm e2e:webkit): the WebKit engine, which needs `playwright install webkit`.
    ...(process.env['FOOMERANG_E2E_WEBKIT'] === '1'
      ? [
          {
            name: 'webkit',
            testMatch: ['**/webkit.e2e.ts'],
            use: { browserName: 'webkit' as const, headless: true },
          },
        ]
      : []),
  ],
});
