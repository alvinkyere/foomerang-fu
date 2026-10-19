import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './support/fixtures';

/**
 * The plaza's real shapes (owner, 2026-10-19: "the left bottom corner where some pots and boxes are, there is a barrier
 * there"). The two crates and two pots there used to be one 200 × 240 block of grid cells reaching the frame's bottom; now
 * each is solid only where its model stands, so a player walks down past them and along under the pots into the corner.
 * FOOMERANG_PLAZA_SHOTS=1 writes a screenshot of her there next to the reconstruction's runtime shots.
 */
const ROUTE = [
  [1000, 470],
  [800, 560],
  [660, 820],
  [640, 1040],
  [430, 1062],
] as const;

test('the plaza’s bottom-left corner is open: a player walks past the crates and under the pots into it', async ({
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
  const id = await host.playerId('Alice');
  await expect.poll(async () => (await host.snapshot()).arena).toBe('market_plaza');

  // steer by position, waypoint to waypoint (the rules decide where she can go; nothing is teleported)
  await alice.thumbDown();
  for (const [tx, ty] of ROUTE) {
    const until = Date.now() + 12_000;
    for (;;) {
      const p = await host.body(id);
      const d = Math.hypot(tx - p.x, ty - p.y);
      if (d < 16) break;
      if (Date.now() > until)
        throw new Error(`stuck on the way to (${tx}, ${ty}): ${JSON.stringify(p)}`);
      await alice.thumbMove(((tx - p.x) / d) * 140, ((ty - p.y) / d) * 140);
      await new Promise((r) => setTimeout(r, 30));
    }
  }
  await alice.thumbUp();
  const end = await host.body(id);
  // where the old block was (x 440–640, y 840–1080): she stands inside its footprint, on open sand
  expect(end.x).toBeLessThan(460);
  expect(end.y).toBeGreaterThan(1040);
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
    await new Promise((r) => setTimeout(r, 500));
    await host.page
      .getByTestId('arena')
      .locator('canvas')
      .screenshot({ path: join(dir, 'corner.png') });
  }
  expect(host.errors).toEqual([]);
});
