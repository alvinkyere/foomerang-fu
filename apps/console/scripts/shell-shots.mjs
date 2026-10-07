/* global clearTimeout, localStorage */
// Development tool: screenshots of the console shell preview (harness.html) for design review.
//   node scripts/shell-shots.mjs [--size 1920x1080] [--out ../../docs/shell] [--only home,join]
// Uses the system Chrome through the integration workspace's Playwright; starts its own Vite server.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const [width, height] = opt('size', '1920x1080').split('x').map(Number);
const out = join(process.cwd(), opt('out', '../../docs/shell'));
const only = opt('only', '')?.split(',').filter(Boolean);
const suffix = width === 1920 ? '' : `-${width}x${height}`;
mkdirSync(out, { recursive: true });

const require = createRequire(join(process.cwd(), '../../integration/package.json'));
const { chromium } = require('@playwright/test');

const port = 5191;
const server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 30_000);
  server.stdout.on('data', (d) => {
    if (String(d).includes('Local')) {
      clearTimeout(t);
      resolve();
    }
  });
});

const SHOTS = [
  { name: '1-home', query: 'screen=home', keys: [] },
  { name: '2-game-detail', query: 'screen=home', keys: ['Enter'] },
  { name: '3-settings', query: 'screen=settings', keys: ['ArrowRight'] },
  {
    name: '3b-settings-accessibility',
    query: 'screen=settings',
    keys: ['ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowRight'],
  },
  { name: '4-join', query: 'screen=join', keys: [] },
  {
    name: '5-home-system-bar',
    query: 'screen=home',
    keys: ['ArrowDown', 'ArrowRight', 'ArrowRight'],
  },
  { name: '6-join-reconnecting', query: 'screen=join&join=reconnecting&seats=empty', keys: [] },
];
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const shot of SHOTS) {
    if (only?.length && !only.some((o) => shot.name.includes(o))) continue;
    const page = await browser.newPage({ viewport: { width, height } });
    await page.addInitScript(() => localStorage.clear());
    await page.goto(`http://localhost:${port}/harness.html?${shot.query}`);
    await page.waitForTimeout(700);
    for (const key of shot.keys) {
      await page.keyboard.press(key);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(650);
    await page.screenshot({ path: join(out, `${shot.name}${suffix}.png`) });
    console.log('wrote', `${shot.name}${suffix}.png`);
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
