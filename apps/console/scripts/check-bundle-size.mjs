// The console has two budgets, because it ships in two parts:
//   INITIAL  – what the lobby needs (React, protocol, QR, session). Loaded by index.html.
//   LAZY     – everything fetched later; in practice the Phaser arena renderer.
// Budgets are ratchets: raise them only on purpose, in a reviewed change.
//
// It also guards a security property: the development-only debug hook must not exist in a
// production build.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// Raised on purpose (console shell migration, reviewed): the first screen is now the whole console shell
// (home, game page, settings, join, focus/input system, icons, characters), not a lobby form. Measured:
// JS 126.9 -> 139.9 kB, CSS 1.7 -> 7.6 kB gzip. The arena and Phaser stay lazy.
// Raised on purpose (the plaza in real-time 3D, owner-approved 2026-10-17): the lazy total now holds TWO alternative
// renderers — three.js for the market plaza (~156 kB) and Phaser for every other map (~324 kB). A match downloads only
// one of them. Measured lazy total 522.6 kB.
// Raised on purpose (character select, owner-approved 2026-10-19): Foomerang Fu's lobby is now the video's character select
// (its screen, per-phone cursors, the picks model), the first thing after PLAY, beside the QR. Measured: initial JS 144.8 ->
// 147.8 kB gzip. Lazy-loading it was measured too (initial 138.1 kB) but moves the QR library into the lazy total (542.8 kB).
const BUDGET_GZIP_BYTES = { initialJs: 150_000, initialCss: 10_000, lazyJs: 540_000 };
const FORBIDDEN_IN_PRODUCTION = ['__FOOMERANG__'];

const dist = join(process.cwd(), 'dist');
const assetsDir = join(dist, 'assets');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const referenced = new Set(
  [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+)"/g)].map((m) =>
    m[1].replace(/^assets\//, ''),
  ),
);

const totals = { initialJs: 0, initialCss: 0, lazyJs: 0 };
const files = [];
let leaked = [];
for (const file of readdirSync(assetsDir)) {
  const body = readFileSync(join(assetsDir, file));
  const gz = gzipSync(body).length;
  const isJs = file.endsWith('.js');
  const isCss = file.endsWith('.css');
  if (!isJs && !isCss) continue;
  const initial = referenced.has(file);
  const key = isCss ? 'initialCss' : initial ? 'initialJs' : 'lazyJs';
  totals[key] += gz;
  files.push(
    `${initial ? 'initial' : 'lazy   '} ${(gz / 1000).toFixed(1).padStart(7)} kB gzip  ${file}`,
  );
  if (isJs) {
    const text = body.toString('utf8');
    leaked = leaked.concat(
      FORBIDDEN_IN_PRODUCTION.filter((name) => text.includes(name)).map(
        (name) => `${name} in ${file}`,
      ),
    );
  }
}

console.log(files.sort().join('\n'));
let failed = false;
for (const key of Object.keys(totals)) {
  const used = totals[key];
  const budget = BUDGET_GZIP_BYTES[key];
  const ok = used <= budget;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(11)} ${(used / 1000).toFixed(1)} kB gzip  (budget ${(budget / 1000).toFixed(0)} kB)`,
  );
}
if (leaked.length > 0) {
  failed = true;
  console.error(`FAIL development-only code found in the production build: ${leaked.join(', ')}`);
}
if (failed) {
  console.error(
    'Console bundle check failed. Slim it down, or raise the budget deliberately in review.',
  );
  process.exit(1);
}
