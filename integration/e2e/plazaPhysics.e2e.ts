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

test('a boomerang breaks a plaza crate: it vanishes and bursts into planks that stay on the ground', async ({
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

  // walk to just above the bottom-left crates, then face down at the nearer one and throw
  await alice.thumbDown();
  for (const [tx, ty] of [
    [1000, 470],
    [800, 560],
    [600, 800],
  ] as const) {
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
  const here = await host.body(id);
  const crate = { x: 577, y: 912 }; // CRATE_16_crates_0 (plaza.glb)
  const d = Math.hypot(crate.x - here.x, crate.y - here.y);
  await alice.thumbMove(((crate.x - here.x) / d) * 60, ((crate.y - here.y) / d) * 60);
  await new Promise((r) => setTimeout(r, 60));
  await alice.thumbUp();
  await alice.tapThrow();

  await expect
    .poll(async () => (await host.fu()).broken, { timeout: 4_000 })
    .toContain('CRATE_16_crates_0');
  await expect
    .poll(async () => (await host.snapshot()).drawnProps?.broken ?? [], { timeout: 2_000 })
    .toContain('CRATE_16_crates_0');
  expect((await host.snapshot()).drawnProps?.pieces ?? 0).toBeGreaterThanOrEqual(6);
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
    await new Promise((r) => setTimeout(r, 1200)); // the planks have landed
    await host.page
      .getByTestId('arena')
      .locator('canvas')
      .screenshot({ path: join(dir, 'crate_broken.png') });
  }
  expect(host.errors).toEqual([]);
});
