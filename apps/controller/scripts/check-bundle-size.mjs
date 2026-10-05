// The controller must load fast (six friends are waiting at the TV), so its size is a tracked
// budget, not an accident. The budget is a ratchet: raise it only on purpose, in a reviewed change.
// Run automatically after `vite build` (and therefore by `pnpm validate`).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_GZIP_BYTES = { js: 130_000, css: 10_000 }; // measured at introduction: ~112 kB JS, ~1.7 kB CSS

const assets = join(process.cwd(), 'dist', 'assets');
const totals = { js: 0, css: 0 };
for (const file of readdirSync(assets)) {
  const kind = file.endsWith('.js') ? 'js' : file.endsWith('.css') ? 'css' : undefined;
  if (kind) totals[kind] += gzipSync(readFileSync(join(assets, file))).length;
}

let failed = false;
for (const kind of ['js', 'css']) {
  const used = totals[kind];
  const budget = BUDGET_GZIP_BYTES[kind];
  const ok = used <= budget;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${kind.toUpperCase().padEnd(3)} ${(used / 1000).toFixed(1)} kB gzip  (budget ${(budget / 1000).toFixed(0)} kB)`,
  );
}
if (failed) {
  console.error(
    'Controller bundle is over budget. Slim it down, or raise the budget deliberately in review.',
  );
  process.exit(1);
}
