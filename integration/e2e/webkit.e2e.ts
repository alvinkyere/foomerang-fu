import { devices } from '@playwright/test';
import { expect, test } from './support/fixtures';

/**
 * OPT-IN engine check (pnpm e2e:webkit; needs `pnpm exec playwright install webkit`): the console AND
 * the controller in Playwright's WebKit build, the controller driven by MOUSE events through the
 * same Pointer Events code path.
 *
 * This is NOT iOS Safari and NOT a touch screen. It catches WebKit-engine incompatibilities
 * cheaply; it does not replace the physical-iPhone gate (docs/DEVICE_TESTING.md).
 */
test('the console and a controller work in the WebKit engine', async ({ host, stack, browser }) => {
  const code = await host.createRoom();
  const context = await browser.newContext({ ...devices['iPhone 13 landscape'] });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  try {
    await page.goto(`${stack.controllerUrl}/?room=${code}`);
    await page.getByLabel('Your name').fill('WebKit');
    await page.getByRole('button', { name: 'Join' }).click();
    const zone = page.getByRole('group', { name: /joystick/ });
    await expect(zone).toBeVisible();
    await expect(page.getByRole('status')).toHaveText(/Connected/);
    await host.start();
    await host.waitForDrawn(1);
    const id = await host.playerId('WebKit');
    const before = await host.body(id);

    const box = await zone.boundingBox();
    if (box === null) throw new Error('no joystick on screen');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 140, cy, { steps: 6 });
    await expect.poll(async () => (await host.body(id)).x).toBeGreaterThan(before.x + 100);
    await page.mouse.up();
    await host.settled(id); // released: it stops
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
