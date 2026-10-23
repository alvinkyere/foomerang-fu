import { expect, test } from './support/fixtures';

test('the market plaza and the gong islands take turns: start, rematch, and a new match from the lobby (?arena=product)', async ({
  hostAt,
}) => {
  test.setTimeout(300_000);
  // The rotation (?arena=product; the default is the islands for now). Short CPU-only matches. The owner (2026-10-22): the gong islands rotate with the
  // plaza; each two matches in a row (from a fresh bag) play both, and nothing else is ever played.
  const host = await hostAt('?arena=product&kills=1&powerups=off');
  await host.createRoom();
  await host.addCpu('Hard');
  await host.addCpu('Hard');
  await host.start();
  await host.autoContinue(); // CPU-only: the TV presses CONTINUE between rounds
  await host.waitForDrawn(2);

  const product = ['market_plaza', 'gong_islands'];
  const played = async (): Promise<string | null> => {
    await expect.poll(async () => product.includes((await host.snapshot()).arena ?? '')).toBe(true);
    await host.waitForDrawn(2);
    return (await host.snapshot()).arena;
  };
  const matchOver = () =>
    expect(host.page.getByRole('dialog', { name: 'Match over' })).toBeVisible({ timeout: 120_000 });

  const first = await played();
  await matchOver();
  await host.page.getByRole('button', { name: 'Rematch' }).click();
  await expect.poll(async () => (await host.snapshot()).arena).not.toBe(first);
  await played();

  await matchOver();
  await host.page.getByRole('button', { name: 'BACK TO MENU' }).click();
  await expect(host.startButton).toBeVisible();
  await host.start();
  await played();
});

test('every round is on another map: CONTINUE on the scoreboard brings up the other one, drawn', async ({
  hostAt,
}) => {
  test.setTimeout(240_000);
  // the HQ videos change the map at every CONTINUE (pond cross, maze, gong islands); two kills win, so there is a scoreboard
  const host = await hostAt('?arena=product&kills=2&powerups=off');
  await host.createRoom();
  await host.addCpu('Hard');
  await host.addCpu('Hard');
  await host.start();
  await host.waitForDrawn(2);
  const first = (await host.snapshot()).arena;
  await expect(host.continueButton).toBeVisible({ timeout: 120_000 });
  await host.continueButton.click();
  await expect.poll(async () => (await host.snapshot()).arena).not.toBe(first);
  const swapped = Date.now();
  await host.waitForDrawn(2);
  console.log(`the next map was drawn ${Date.now() - swapped} ms after CONTINUE`);
  expect((await host.snapshot()).game?.round).toBe(2);
});

test('for now the product plays the gong islands, every round (no ?arena=: the owner, 2026-10-22)', async ({
  hostAt,
}) => {
  test.setTimeout(240_000);
  const host = await hostAt('?kills=2&powerups=off');
  await host.createRoom();
  await host.addCpu('Hard');
  await host.addCpu('Hard');
  await host.start();
  await host.waitForDrawn(2);
  expect((await host.snapshot()).arena).toBe('gong_islands');
  await expect(host.continueButton).toBeVisible({ timeout: 120_000 });
  await host.continueButton.click();
  await expect.poll(async () => (await host.snapshot()).game?.round).toBe(2);
  expect((await host.snapshot()).arena).toBe('gong_islands');
});
