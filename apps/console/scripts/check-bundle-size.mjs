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

const BUDGET_GZIP_BYTES = { initialJs: 130_000, initialCss: 5_000, lazyJs: 380_000 };
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
