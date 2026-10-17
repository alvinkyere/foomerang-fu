import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './support/fixtures';

/**
 * The plaza's border (owner, 2026-10-17), in the real game: a player may walk out past the dashed line onto the sand beyond
 * it (the camera follows), but one who stays out there for 5 seconds explodes. Two phones, the real rules, the 3D plaza.
 * FOOMERANG_PLAZA_SHOTS=1 writes a screenshot of the player outside next to the reconstruction's runtime shots.
 */
const SAFE_ZONE_WEST = 271;

test('the plaza border: a player walks out past the dashed line, stays, and explodes after 5 seconds', async ({
  hostAt,
  newPhone,
}) => {
  test.setTimeout(90_000);
  const host = await hostAt('?arena=market_plaza&powerups=off&kills=14');
  const code = await host.createRoom();
  const alice = await newPhone();
  const bob = await newPhone();
  await alice.join(code, 'Alice');
  await bob.join(code, 'Bob');
  await host.start();
  await host.waitForDrawn(2);
  const aliceId = await host.playerId('Alice');
  await expect.poll(async () => (await host.snapshot()).arena).toBe('market_plaza');

  // walk west until past the dashed line, then let go
  await alice.thumbDown();
  const deadline = Date.now() + 20_000;
  for (;;) {
    const here = await host.body(aliceId);
    if (here.x < SAFE_ZONE_WEST - 60) break;
    if (Date.now() > deadline) throw new Error(`never got outside: ${JSON.stringify(here)}`);
    await alice.thumbMove(-140, 0);
    await new Promise((r) => setTimeout(r, 30));
  }
  await alice.thumbUp();
  const out = Date.now();
  const alive = async () =>
    (await host.snapshot()).game?.players.find((p) => p.id === aliceId)?.alive ?? false;
  expect(await alive(), 'still alive just after stepping out').toBe(true);

  // the camera has followed her out: she is drawn on screen
  await new Promise((r) => setTimeout(r, 1500));
  if (process.env['FOOMERANG_PLAZA_SHOTS'] === '1') {
    const dir = join(
      process.cwd(),
      '..',
      'art',
      'reconstruction',
      'output',
      'runtime',
      'market_plaza',
    );
    mkdirSync(dir, { recursive: true });
    await host.page
      .getByTestId('arena')
      .locator('canvas')
      .screenshot({ path: join(dir, 'outside.png') });
  }
  expect(await alive(), 'alive 1.5 s outside').toBe(true);

  // ...and explodes at 5 s (a little slack for the snapshot's polling)
  await expect.poll(alive, { timeout: 8_000, intervals: [100] }).toBe(false);
  const lived = (Date.now() - out) / 1000;
  expect(lived).toBeGreaterThan(4.3);
  expect(lived).toBeLessThan(6.5);
  expect(host.errors).toEqual([]);
});
