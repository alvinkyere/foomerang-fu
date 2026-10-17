import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it, vi } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

// The first lint of a cold checkout parses the whole type-aware project (about 10 s on a clean clone
// while the other packages' tests run in parallel), which exceeded vitest's 5 s default. This only
// gives the cold start room; every assertion is unchanged.
vi.setConfig({ testTimeout: 60_000 });

async function ruleIds(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: repoRoot + filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? `fatal:${m.message}`);
}

describe('architecture boundaries enforced by lint', () => {
  describe('pure packages (game-core, protocol, room-engine)', () => {
    const pure = [
      'packages/game-core/src/x.ts',
      'packages/protocol/src/x.ts',
      'packages/room-engine/src/x.ts',
    ];

    it.each(pure)('%s accepts clean pure code', async (file) => {
      expect(await ruleIds(file, 'export const add = (a: number, b: number) => a + b;\n')).toEqual(
        [],
      );
    });

    it.each(pure)('%s rejects framework, renderer, network and Node imports', async (file) => {
      for (const mod of [
        'react',
        'react-dom',
        'phaser',
        'socket.io',
        'socket.io-client',
        'node:fs',
        'fs',
      ]) {
        expect(await ruleIds(file, `import x from '${mod}';\nexport { x };\n`), mod).toContain(
          'no-restricted-imports',
        );
      }
    });

    it.each(pure)('%s rejects hidden time and randomness', async (file) => {
      expect(await ruleIds(file, 'export const t = Date.now();\n')).toContain(
        'no-restricted-properties',
      );
      expect(await ruleIds(file, 'export const r = Math.random();\n')).toContain(
        'no-restricted-properties',
      );
      expect(await ruleIds(file, 'export const p = performance.now();\n')).toContain(
        'no-restricted-globals',
      );
    });

    it.each(pure)('%s rejects DOM and runtime globals', async (file) => {
      for (const g of ['window', 'document', 'navigator', 'setTimeout', 'fetch', 'process']) {
        expect(
          await ruleIds(file, `export const v = typeof ${g};\nexport const w = ${g};\n`),
          g,
        ).toContain('no-restricted-globals');
      }
    });

    it.each(pure)('%s may not import apps or games', async (file) => {
      for (const mod of [
        '@foomerang/console',
        '@foomerang/controller',
        '@foomerang/server',
        '@foomerang/foomerang-fu',
      ]) {
        expect(await ruleIds(file, `import x from '${mod}';\nexport { x };\n`), mod).toContain(
          'no-restricted-imports',
        );
      }
    });
  });

  describe('Foomerang Fu game rules vs renderer', () => {
    it('rules may not import Phaser', async () => {
      expect(
        await ruleIds('games/foomerang-fu/src/rules/x.ts', "import 'phaser';\nexport {};\n"),
      ).toContain('no-restricted-imports');
    });

    it('the render layer may import Phaser', async () => {
      expect(
        await ruleIds('games/foomerang-fu/src/render/scene.ts', "import 'phaser';\nexport {};\n"),
      ).toEqual([]);
    });
  });

  describe('Phaser stays inside the console’s renderer directory', () => {
    it('is rejected in console UI, runtime and session code', async () => {
      for (const file of [
        'apps/console/src/ui/x.tsx',
        'apps/console/src/runtime/x.ts',
        'apps/console/src/host/x.ts',
        'apps/console/src/render/viewModel.ts',
      ]) {
        expect(await ruleIds(file, "import 'phaser';\nexport {};\n"), file).toContain(
          'no-restricted-imports',
        );
      }
    });

    it('is allowed in apps/console/src/render/phaser', async () => {
      expect(
        await ruleIds('apps/console/src/render/phaser/x.ts', "import 'phaser';\nexport {};\n"),
      ).toEqual([]);
    });
  });

  describe('three.js stays inside the console’s 3D renderer directory', () => {
    it('is rejected in console UI, runtime, session code and the Phaser renderer', async () => {
      for (const file of [
        'apps/console/src/ui/x.tsx',
        'apps/console/src/runtime/x.ts',
        'apps/console/src/host/x.ts',
        'apps/console/src/render/viewModel.ts',
        'apps/console/src/render/phaser/x.ts',
      ]) {
        expect(await ruleIds(file, "import 'three';\nexport {};\n"), file).toContain(
          'no-restricted-imports',
        );
        expect(
          await ruleIds(file, "import 'three/examples/jsm/loaders/GLTFLoader.js';\nexport {};\n"),
          file,
        ).toContain('no-restricted-imports');
      }
    });

    it('is rejected in pure code', async () => {
      expect(
        await ruleIds('games/foomerang-fu/src/rules/x.ts', "import 'three';\nexport {};\n"),
      ).toContain('no-restricted-imports');
    });

    it('is allowed in apps/console/src/render/three', async () => {
      expect(
        await ruleIds('apps/console/src/render/three/x.ts', "import 'three';\nexport {};\n"),
      ).toEqual([]);
    });
  });

  describe('Socket.IO stays behind the transport boundary', () => {
    it('is rejected anywhere outside a SocketIOTransport file', async () => {
      for (const file of [
        'packages/controller-sdk/src/x.ts',
        'apps/console/src/x.tsx',
        'apps/controller/src/x.tsx',
        'apps/server/src/x.ts',
      ]) {
        expect(
          await ruleIds(file, "import { io } from 'socket.io-client';\nexport { io };\n"),
          file,
        ).toContain('no-restricted-imports');
      }
    });

    it('is rejected in the session layer and the application, even for the server package', async () => {
      for (const file of [
        'apps/server/src/gateway.ts',
        'apps/server/src/application.ts',
        'apps/server/src/session.ts',
        'apps/server/src/server.ts',
      ]) {
        expect(
          await ruleIds(file, "import { Server } from 'socket.io';\nexport { Server };\n"),
          file,
        ).toContain('no-restricted-imports');
      }
    });

    it('is allowed in the test-side Socket.IO client helper only', async () => {
      expect(
        await ruleIds(
          'apps/server/test/support/SocketIOTransportClient.ts',
          "import { io } from 'socket.io-client';\nexport { io };\n",
        ),
      ).toEqual([]);
      expect(
        await ruleIds(
          'apps/server/test/integration.test.ts',
          "import { io } from 'socket.io-client';\nexport { io };\n",
        ),
      ).toContain('no-restricted-imports');
    });

    it('is allowed inside SocketIOTransport files', async () => {
      expect(
        await ruleIds(
          'apps/server/src/transport/SocketIOTransport.ts',
          "import { Server } from 'socket.io';\nexport { Server };\n",
        ),
      ).toEqual([]);
      expect(
        await ruleIds(
          'packages/controller-sdk/src/SocketIOTransport.ts',
          "import { io } from 'socket.io-client';\nexport { io };\n",
        ),
      ).toEqual([]);
    });
  });

  describe('dependency direction', () => {
    it('shared packages may not import apps or games', async () => {
      for (const file of ['packages/ui/src/x.ts', 'packages/controller-sdk/src/x.ts']) {
        expect(
          await ruleIds(file, "import x from '@foomerang/server';\nexport { x };\n"),
          file,
        ).toContain('no-restricted-imports');
      }
    });
  });
});
