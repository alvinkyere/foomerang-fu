import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// ---------------------------------------------------------------------------
// Architecture boundaries (see docs/ARCHITECTURE.md). Tested in
// packages/config/test/lint-boundaries.test.ts.
// ---------------------------------------------------------------------------

const SOCKET_IO = ['socket.io', 'socket.io/*', 'socket.io-client', 'socket.io-client/*'];
const APPS_AND_GAMES = [
  '@foomerang/console',
  '@foomerang/controller',
  '@foomerang/server',
  '@foomerang/foomerang-fu',
];
const FRAMEWORKS_AND_RENDERER = [
  'react',
  'react/*',
  'react-dom',
  'react-dom/*',
  'phaser',
  'phaser/*',
];
const NODE_BUILTINS = [
  'node:*',
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs',
  'http', 'http2', 'https', 'net', 'os', 'path', 'process', 'readline', 'stream', 'timers',
  'tls', 'url', 'util', 'vm', 'worker_threads', 'zlib',
]; // prettier-ignore

const importBan = (names, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: names, message }] }],
});

const SOCKET_IO_MESSAGE =
  'Socket.IO may only be imported inside a SocketIOTransport file (transport boundary).';
const PURE_MESSAGE =
  'Pure packages must not depend on frameworks, the renderer, the network, Node, or apps/games.';

const PURE_GLOBALS = [
  'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate',
  'requestAnimationFrame', 'cancelAnimationFrame', 'queueMicrotask',
  'fetch', 'WebSocket', 'XMLHttpRequest', 'performance', 'crypto',
  'process', 'Buffer', 'require', '__dirname', '__filename',
].map((name) => ({
  name,
  message: 'Not available in pure code. Time, randomness and I/O are injected, never read ambiently.',
})); // prettier-ignore

const pureRules = {
  ...importBan(
    [...SOCKET_IO, ...APPS_AND_GAMES, ...FRAMEWORKS_AND_RENDERER, ...NODE_BUILTINS],
    PURE_MESSAGE,
  ),
  'no-restricted-globals': ['error', ...PURE_GLOBALS],
  'no-restricted-properties': [
    'error',
    { object: 'Date', property: 'now', message: 'Inject a clock instead.' },
    { object: 'Math', property: 'random', message: 'Inject a seeded PRNG instead.' },
    { object: 'performance', property: 'now', message: 'Inject a clock instead.' },
  ],
};

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.turbo/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,

  // Everyone: Socket.IO only behind the transport boundary.
  { rules: importBan(SOCKET_IO, SOCKET_IO_MESSAGE) },

  // Shared packages may never import apps or games (dependency direction).
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    rules: importBan(
      [...SOCKET_IO, ...APPS_AND_GAMES],
      'Shared packages must not import apps or games.',
    ),
  },

  // Pure code: simulation, protocol, room logic, and game rules (everything in the game except its render layer).
  {
    files: [
      'packages/game-core/src/**/*.ts',
      'packages/protocol/src/**/*.ts',
      'packages/room-engine/src/**/*.ts',
      'games/foomerang-fu/src/**/*.ts',
    ],
    ignores: ['**/*.test.ts', 'games/foomerang-fu/src/render/**'],
    rules: pureRules,
  },

  // Phaser in the console lives in ONE directory (and is lazy-loaded from there). React, the
  // session and the runtime see only the ArenaRenderer interface.
  {
    files: ['apps/console/src/**/*.{ts,tsx}'],
    ignores: ['apps/console/src/render/phaser/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: SOCKET_IO, message: SOCKET_IO_MESSAGE },
            {
              // a regex, not a gitignore-style group: './render/phaser/...' is OUR directory
              regex: '^phaser(/.*)?$',
              message:
                'Phaser may only be imported inside apps/console/src/render/phaser (the renderer boundary).',
            },
          ],
        },
      ],
    },
  },

  // React: the rules of hooks, and stale-closure / effect mistakes, in every UI package.
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/ui/src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },

  // Plain Node scripts (build checks, dev tools).
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', setTimeout: 'readonly' },
    },
  },

  // The only places allowed to touch Socket.IO.
  {
    files: ['**/SocketIOTransport*.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },

  prettier,
);
