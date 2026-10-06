import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './support/fixtures';

/**
 * DEVELOPMENT EVIDENCE (opt-in: FOOMERANG_GARDEN_MOTION=1). Plays each showcase scenario — real rules, real renderer —
 * on a virtual clock and writes frames at 30 fps to docs/garden/motion/<scenario>/NNN.png, for the side-by-side and motion
 * comparisons with the reference video (scripts/garden/motion.py assembles them).
 */
const OUT = join(process.cwd(), '..', 'docs', 'garden', 'motion');
const ONLY = process.env['FOOMERANG_GARDEN_ONLY']?.split(',');

test('showcase scenarios render on a virtual clock', async ({ browser, stack }) => {
  test.skip(process.env['FOOMERANG_GARDEN_MOTION'] !== '1', 'opt-in');
  test.setTimeout(600_000);
  const context = await browser.newContext({ viewport: { width: 1376, height: 784 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/404/.test(m.text()) && errors.push(m.text()));
  await page.goto(`${stack.consoleUrl}/showcase.html`);
  await page.waitForFunction(() => window.__SHOWCASE__ !== undefined);
  const list = await page.evaluate(() => window.__SHOWCASE__?.scenarios ?? []);
  for (const scenario of list) {
    if (ONLY !== undefined && !ONLY.includes(scenario.name)) continue;
    await page.evaluate((n) => window.__SHOWCASE__?.reset(n), scenario.name);
    const dir = join(OUT, scenario.name);
    mkdirSync(dir, { recursive: true });
    const frames = Math.round(scenario.seconds * 30);
    for (let f = 0; f <= frames; f += 1) {
      await page.evaluate((n) => window.__SHOWCASE__?.frame(n), f);
      await page
        .locator('#arena canvas')
        .screenshot({ path: join(dir, `${String(f).padStart(3, '0')}.png`) });
    }
  }
  expect(errors).toEqual([]);
  await context.close();
});
