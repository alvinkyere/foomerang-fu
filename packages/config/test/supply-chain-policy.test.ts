import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceFile = readFileSync(
  fileURLToPath(new URL('../../../pnpm-workspace.yaml', import.meta.url)),
  'utf8',
);

/**
 * STANDING RULE (engineering review, Slice 7): `minimumReleaseAgeExclude` — or any other change to
 * pnpm's package-age policy — must never be added or modified merely to make an install succeed.
 * Any exception to the supply-chain policy needs explicit engineering review and a documented
 * justification (docs/DEPENDENCIES.md).
 *
 * These tests make that rule mechanical: they FAIL on any such change. If you are here because
 * they failed, the answer is almost certainly to pick an older, aged version of the package, not
 * to edit this test. If an exception is genuinely justified, record the review in
 * docs/DEPENDENCIES.md FIRST, then update the allow-list below in the same reviewed change.
 */
describe('supply-chain policy (pnpm-workspace.yaml)', () => {
  it('does not bypass or customize the package-age protection', () => {
    expect(workspaceFile).not.toMatch(/minimumReleaseAge/i);
  });

  it('does not run dependency install scripts unless each one has been reviewed', () => {
    const approvedToRun: string[] = []; // none: every build script is currently denied or absent
    const allowed = [...workspaceFile.matchAll(/^\s{2}['"]?([^'":\s]+)['"]?:\s*true\s*$/gm)].map(
      (m) => m[1],
    );
    expect(allowed.filter((name) => !approvedToRun.includes(name ?? ''))).toEqual([]);
  });

  it('keeps esbuild’s install script explicitly denied (nothing here needs it)', () => {
    expect(workspaceFile).toMatch(/allowBuilds:\s*\n\s+esbuild:\s*false/);
  });
});
