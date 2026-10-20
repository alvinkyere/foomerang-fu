import { expect, test } from './support/fixtures';

test('only the market plaza, every match: start, rematch, and a new match from the lobby (no ?arena= pin)', async ({
  hostAt,
}) => {
  test.setTimeout(240_000);
  // The product's address: no map pinned. Short CPU-only matches. The owner (2026-10-16): only the plaza until it is perfected.
  const host = await hostAt('?kills=1&powerups=off');
  await host.createRoom();
  await host.addCpu('Hard');
  await host.addCpu('Hard');
  await host.start();
  await host.autoContinue(); // CPU-only: the TV presses CONTINUE between rounds
  await host.waitForDrawn(2);

  const onThePlaza = async () => {
    await expect.poll(async () => (await host.snapshot()).arena).toBe('market_plaza');
    await host.waitForDrawn(2);
  };
  const matchOver = () =>
    expect(host.page.getByRole('dialog', { name: 'Match over' })).toBeVisible({ timeout: 90_000 });

  await onThePlaza();
  await matchOver();
  await host.page.getByRole('button', { name: 'Rematch' }).click();
  await onThePlaza();

  await matchOver();
  await host.page.getByRole('button', { name: 'BACK TO MENU' }).click();
  await expect(host.startButton).toBeVisible();
  await host.start();
  await onThePlaza();
});
