import { centroidOfColor, decodePng } from './support/png';
import { expect, test } from './support/fixtures';

const FAR = 140;
const AMBER: readonly [number, number, number] = [0xe6, 0x9f, 0x00]; // slot 1's colour

/**
 * The same journey against the PRODUCTION build (`vite build`), where the debug hook does not
 * exist. Everything here is what a person could see: this proves Phaser really draws a circle that
 * really follows the thumb, not merely that our own state says so.
 */
test('production build: there is no debug hook, and the drawn circle follows the thumb', async ({
  productionHost: host,
  newPhone,
}) => {
  expect(await host.page.evaluate(() => typeof window.__FOOMERANG__)).toBe('undefined');

  const code = await host.createRoom();
  const phone = await newPhone();
  await phone.join(code, 'Alice');
  await expect(host.page.getByRole('listitem')).toHaveText('●1AliceConnected');
  await host.start();

  const canvas = host.page.getByTestId('arena').locator('canvas');
  await expect(canvas).toBeVisible(); // Phaser was fetched and started

  const look = async () => centroidOfColor(decodePng(await canvas.screenshot()), AMBER);
  await expect
    .poll(async () => (await look())?.count ?? 0, { message: 'the circle is on the canvas' })
    .toBeGreaterThan(500);
  const home = await look();
  if (home === undefined) throw new Error('no circle drawn');

  await phone.thumbDown();
  await phone.thumbMove(FAR, 0);
  await expect
    .poll(async () => ((await look())?.x ?? 0) - home.x, {
      message: 'the circle moved right on screen',
    })
    .toBeGreaterThan(80);
  await phone.thumbUp();

  // and it comes to rest where it stopped, rather than drifting on
  const rest1 = await look();
  await host.page.waitForTimeout(400);
  const rest2 = await look();
  expect(Math.abs((rest2?.x ?? 0) - (rest1?.x ?? 0))).toBeLessThan(2);
  expect(Math.abs((rest2?.y ?? 0) - home.y)).toBeLessThan(2); // purely horizontal
});
