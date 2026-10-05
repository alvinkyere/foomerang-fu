import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

interface PackageJson {
  name: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(repoRoot + path, 'utf8')) as T;

const workspaceDirs = ['apps', 'games', 'packages', 'integration'].flatMap((group) =>
  readdirSync(repoRoot + group, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(`${repoRoot}${group}/${e.name}/package.json`))
    .map((e) => `${group}/${e.name}`),
);
// A top-level, test-only workspace (real packages exercised together; Playwright joins it later).
if (existsSync(`${repoRoot}integration/package.json`)) workspaceDirs.push('integration');

/** Which @foomerang/* workspace packages each package may depend on. Everyone may use @foomerang/config. */
const allowedWorkspaceDeps: Record<string, string[]> = {
  'apps/console': ['protocol', 'game-core', 'controller-sdk', 'ui', 'foomerang-fu'],
  'apps/controller': ['protocol', 'controller-sdk', 'ui'],
  'apps/server': ['protocol', 'room-engine'],
  'games/foomerang-fu': ['game-core', 'protocol'],
  'packages/protocol': [],
  'packages/game-core': [],
  'packages/room-engine': ['protocol'],
  'packages/controller-sdk': ['protocol'],
  'packages/ui': [],
  'packages/config': [],
  // Test-only: may exercise any package. Nothing may depend on it (nothing lists it above).
  integration: [
    'protocol',
    'room-engine',
    'game-core',
    'controller-sdk',
    'server',
    'ui',
    'foomerang-fu',
  ],
};

const purePackages = ['packages/game-core', 'packages/protocol', 'packages/room-engine'];

describe('workspace boundaries', () => {
  it('every workspace package is covered by the allow-list (new packages need a conscious decision)', () => {
    expect([...workspaceDirs].sort()).toEqual(Object.keys(allowedWorkspaceDeps).sort());
  });

  it.each(workspaceDirs)('%s only depends on allowed workspace packages', (dir) => {
    const pkg = readJson<PackageJson>(`${dir}/package.json`);
    const all = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    const workspaceDeps = Object.keys(all)
      .filter((d) => d.startsWith('@foomerang/') && d !== '@foomerang/config')
      .map((d) => d.slice('@foomerang/'.length));
    const allowed = allowedWorkspaceDeps[dir] ?? [];
    expect(workspaceDeps.filter((d) => !allowed.includes(d))).toEqual([]);
  });

  it.each(workspaceDirs)('%s exposes typecheck and test scripts', (dir) => {
    const pkg = readJson<PackageJson>(`${dir}/package.json`);
    expect(pkg.scripts).toMatchObject({
      typecheck: expect.any(String),
      test: expect.any(String),
    });
  });

  it.each(purePackages)('%s has zero runtime dependencies on third-party code', (dir) => {
    const pkg = readJson<PackageJson>(`${dir}/package.json`);
    // protocol is allowed exactly one future runtime dependency: zod (ADR to follow).
    const allowedRuntime = dir === 'packages/protocol' ? ['zod'] : [];
    // Workspace packages (@foomerang/*) are governed by the allow-list test above, not this one.
    const thirdParty = Object.keys(pkg.dependencies ?? {}).filter(
      (d) => !d.startsWith('@foomerang/'),
    );
    expect(thirdParty.filter((d) => !allowedRuntime.includes(d))).toEqual([]);
    expect(Object.keys(pkg.peerDependencies ?? {})).toEqual([]);
  });

  it.each(purePackages)('%s type-checks against the DOM-free preset', (dir) => {
    const tsconfig = readJson<{ extends: string }>(`${dir}/tsconfig.json`);
    expect(tsconfig.extends).toBe('@foomerang/config/tsconfig/pure.json');
  });
});

describe('shared tsconfig presets', () => {
  it('base is strict', () => {
    const base = readJson<{ compilerOptions: Record<string, unknown> }>(
      'packages/config/tsconfig/base.json',
    );
    expect(base.compilerOptions).toMatchObject({
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
    });
  });

  it('pure preset has no DOM lib and no ambient type packages', () => {
    const pure = readJson<{ compilerOptions: { lib: string[]; types: string[] } }>(
      'packages/config/tsconfig/pure.json',
    );
    expect(pure.compilerOptions.lib.map((l) => l.toUpperCase())).not.toContain('DOM');
    expect(pure.compilerOptions.types).toEqual([]);
  });
});
