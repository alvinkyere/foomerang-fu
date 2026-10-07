import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './support/fixtures';

/**
 * The visual-fidelity evidence for Garden: the canvas as the canonical camera draws it, written to docs/garden/ so it can be
 * overlaid on "Garden Map - Fu". (Run with FOOMERANG_GARDEN_SHOTS=1 to write them; the test otherwise only checks that the
 * arena draws.)
 */
const OUT = join(process.cwd(), '..', 'docs', 'garden');

test('Garden draws: the canonical canvas, with four characters in it', async ({ hostAt }) => {
  test.setTimeout(120_000);
  const host = await hostAt('?arena=garden&powerups=off&kills=13');
  await host.createRoom();
  for (const d of ['Easy', 'Medium', 'Hard', 'Easy'] as const) await host.addCpu(d);
  await host.start();
  await host.waitForDrawn(4);
  await host.page.waitForTimeout(1500);
  const canvas = host.page.getByTestId('arena').locator('canvas');
  await expect(canvas).toBeVisible();
  if (process.env['FOOMERANG_GARDEN_SHOTS'] === '1') {
    mkdirSync(OUT, { recursive: true });
    await canvas.screenshot({ path: join(OUT, 'implementation.png') });
  }
});

test('Garden in the PRODUCTION build: its renderer chunk is fetched (only now), the arena draws, and nothing errors', async ({
  browser,
  stack,
}) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const { Host: HostClass } = await import('./support/fixtures');
  const host = new HostClass(
    await context.newPage(),
    `${stack.productionConsoleUrl}/?arena=garden&powerups=off&kills=13`,
  );
  await host.open();
  try {
    expect(host.requests.some((u) => /GardenArena/.test(u))).toBe(false); // the lobby never downloads it
    await host.createRoom();
    await host.addCpu('Medium');
    await host.addCpu('Hard');
    await host.start();
    const canvas = host.page.getByTestId('arena').locator('canvas');
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => host.requests.some((u) => /GardenArena/.test(u)), { timeout: 20_000 })
      .toBe(true);
    await host.page.waitForTimeout(1500);
    const picture = await canvas.screenshot();
    expect(picture.length).toBeGreaterThan(50_000); // not a blank canvas
  } finally {
    expect(host.errors).toEqual([]);
    await context.close();
  }
});
