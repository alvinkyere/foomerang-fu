import { expect, test } from './support/fixtures';

test('the market plaza and the gong islands take turns: start, rematch, and a new match from the lobby (no ?arena= pin)', async ({
  hostAt,
}) => {
  test.setTimeout(300_000);
  // The product's address: no map pinned. Short CPU-only matches. The owner (2026-10-22): the gong islands rotate with the
  // plaza; each two matches in a row (from a fresh bag) play both, and nothing else is ever played.
  const host = await hostAt('?kills=1&powerups=off');
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
