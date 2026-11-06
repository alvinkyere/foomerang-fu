#!/bin/zsh
# The meadow in the game, against the HQ frame (copy of art/lily_island/shoot_hq.sh; same needs). usage: shoot_hq.sh NAME WAIT_MS -- the game on ?arena=meadow&frame=hq at 1920x1080
# (a copy of the repo with node_modules) and writes $TMPDIR/NAME.png. usage: shoot_hq.sh NAME WAIT_MS -- the game on ?arena=meadow&frame=hq at 1920x1080 (the validation worktree, a temporary e2e test, removed after)
R="/Users/alvin/Desktop/Foomerang Fu"; V="${GLADE_V:-${TMPDIR%/}/foomerang-validate}"      # (GLADE_V: another worktree with node_modules)
cd $V && git reset -q --hard "$(git -C "$R" rev-parse HEAD)" && git clean -fdq apps art games integration docs
cd $R; { git diff --name-only -z; git ls-files -o -z --exclude-standard; } | tr '\0' '\n' | grep -vE "mp4$|jpg$|/output/|/venv/" | sort -u | while IFS= read -r f; do mkdir -p "$V/$(dirname "$f")"; cp "$f" "$V/$f"; done
cd $V
cat > integration/e2e/zz-look.e2e.ts <<TS
// TEMPORARY (not committed)
import { test } from './support/fixtures';
test('pond', async ({ hostAt }) => {
  test.setTimeout(120_000);
  const host = await hostAt('?arena=meadow&frame=hq&powerups=off&kills=14&intro=off' + '$3');
  await host.page.setViewportSize({ width: 1920, height: 1080 });
  const errors: string[] = [];
  host.page.on('pageerror', (e) => errors.push(String(e)));
  await host.createRoom();
  await host.addCpu('Easy');
  await host.addCpu('Easy');
  await host.start();
  await host.page.waitForTimeout($2);
  await host.page.screenshot({ path: '${TMPDIR%/}/$1.png' });
  console.log('ERRORS', errors.length, errors.slice(0, 3).join(' | '));
});
TS
(cd apps/console && npx vite build >/dev/null 2>&1) || echo BUILD FAILED
cd integration && pnpm exec playwright test -c e2e/playwright.config.ts zz-look.e2e.ts 2>&1 | grep -E "passed|failed|ERRORS" || true
rm e2e/zz-look.e2e.ts
