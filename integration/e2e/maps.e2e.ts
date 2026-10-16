import { expect, test } from './support/fixtures';

const RECONSTRUCTED = [
  'market_plaza',
  'harbour_fort',
  'sky_islands',
  'pond_garden',
  'lakeshore',
  'farm_plots',
  'flooded_ruins',
  'hedge_maze',
  'toaster_dock',
  'twin_log_rink',
  'hex_grove',
  'stone_ruins',
  'cross_pond',
  'diamond_walls',
];

test('a different map every match, always: start, rematch, and a new match from the lobby (no ?arena= pin)', async ({
  hostAt,
}) => {
  test.setTimeout(240_000);
  // The product's address: no map pinned. Short CPU-only matches.
  const host = await hostAt('?kills=1&powerups=off');
  await host.createRoom();
  await host.addCpu('Hard');
  await host.addCpu('Hard');
  await host.start();
  await host.waitForDrawn(2);

  const maps: string[] = [];
  const recordMap = async () => {
    await expect.poll(async () => (await host.snapshot()).arena).not.toBeNull();
    const arena = (await host.snapshot()).arena ?? '';
    expect(RECONSTRUCTED).toContain(arena); // never the Garden, never a test arena
    maps.push(arena);
  };
  const matchOver = () =>
    expect(host.page.getByRole('dialog', { name: 'Match over' })).toBeVisible({ timeout: 90_000 });

  await recordMap();
  await matchOver();
  await host.page.getByRole('button', { name: 'Rematch' }).click();
  await expect.poll(async () => (await host.snapshot()).arena).not.toBe(maps[0]);
  await recordMap();

  await matchOver();
  await host.page.getByRole('button', { name: 'Return to lobby' }).click();
  await expect(host.startButton).toBeVisible();
  await host.start();
  await expect.poll(async () => (await host.snapshot()).arena).not.toBe(maps[1]);
  await recordMap();

  expect(maps[1]).not.toBe(maps[0]);
  expect(maps[2]).not.toBe(maps[1]);
  // the arena really drew on each map: the renderer was swapped, not left on the first one
  await host.waitForDrawn(2);
});
