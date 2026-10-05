import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

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
