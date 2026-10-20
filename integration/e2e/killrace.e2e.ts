import { expect, test, type Host } from './support/fixtures';

const holes = (host: Host, name: string) =>
  host.page
    .getByLabel('Kill race')
    .getByRole('img', { name: new RegExp(`^${name}: \\d+ of \\d+ kills$`) });

test('Game Settings names Free For All, and Hide & Seek is visible, says Coming soon and cannot be chosen', async ({
  hostAt,
}) => {
  const host = await hostAt('?arena=market_plaza&powerups=off');
  await host.page.getByRole('button', { name: 'Foomerang Fu', exact: true }).click();
  await host.page.getByRole('button', { name: 'Game Settings' }).click();
  const sheet = host.page.getByRole('dialog', { name: 'Game Settings' });
  await expect(sheet).toContainText('Free For All');
  await expect(sheet).toContainText('Hide & Seek');
  await expect(sheet).toContainText('Coming soon');
  await sheet.getByRole('button', { name: /Hide & Seek/ }).click(); // an info row: pressing it changes nothing
  await expect(sheet).toContainText('Free For All');
});

test('a CPU-only Free For All (nobody on a phone) is a race: meters fill, the match is won at the target, and REMATCH and RETURN TO LOBBY work', async ({
  hostAt,
}) => {
  test.setTimeout(180_000);
  const host = await hostAt('?arena=market_plaza&kills=3&powerups=off');
  await host.createRoom();
  await host.addCpu('Hard');
  await host.addCpu('Hard');
  await host.start();
  await host.autoContinue(); // nobody on a phone: the TV presses CONTINUE between rounds
  await host.waitForDrawn(2);

  // The race is on screen: a row for each, three holes each (the shortened test match), the round named.
  await expect(host.page.getByLabel('Kill race')).toContainText('ROUND 1 / 9');
  await expect(holes(host, 'CPU 1')).toHaveAttribute('aria-label', 'CPU 1: 0 of 3 kills');

  // A kill fills a hole, and what is drawn is what the rules say.
  await expect
    .poll(async () => Object.values((await host.fu()).scores).reduce((a, b) => a + b, 0), {
      timeout: 60_000,
    })
    .toBeGreaterThan(0);
  const scores = (await host.fu()).scores;
  for (const [id, kills] of Object.entries(scores)) {
    const name = id === 'cpu:1' ? 'CPU 1' : 'CPU 2';
    await expect(holes(host, name)).toHaveAttribute(
      'aria-label',
      new RegExp(`^${name}: ${kills} of 3 kills$`),
    );
  }

  // The match ends the moment somebody fills the last hole — mid-round, with no waiting for anything else.
  await expect(host.page.getByRole('dialog', { name: 'Match over' })).toBeVisible({
    timeout: 120_000,
  });
  const over = await host.fu();
  expect(over.phase).toBe('MATCH_OVER');
  const winner = over.matchOver?.winnerId ?? '';
  expect(over.scores[winner]).toBeGreaterThanOrEqual(3);
  await expect(
    host.page.getByRole('dialog', { name: 'Match over' }).getByRole('heading', { name: / WINS!$/ }),
  ).toBeVisible();
  const frozen = JSON.stringify((await host.fu()).scores);
  await host.page.waitForTimeout(1_500);
  expect(JSON.stringify((await host.fu()).scores)).toBe(frozen); // nothing is scored after the win

  // REMATCH: the same two CPUs, a brand-new match.
  await host.page.getByRole('button', { name: 'Rematch' }).click();
  await expect.poll(async () => (await host.fu()).phase).toBe('PLAYING');
  const fresh = await host.fu();
  expect(fresh.round).toBe(1);
  expect(Object.values(fresh.scores)).toEqual([0, 0]);
  expect(fresh.cpus.map((c) => c.difficulty)).toEqual(['HARD', 'HARD']);

  // RETURN TO LOBBY (the server moves the room back to its lobby; the host can start again).
  await expect(host.page.getByRole('dialog', { name: 'Match over' })).toBeVisible({
    timeout: 120_000,
  });
  await host.page.getByRole('button', { name: 'BACK TO MENU' }).click();
  await expect(host.startButton).toBeVisible();
  await expect(host.page.getByTestId('room-code')).toBeVisible(); // the shell is back, on Join, in the same room
  expect((await host.snapshot()).roomState).toBe('LOBBY');
});

test('a person who joins while the match is running connects and waits; the rematch takes them in', async ({
  hostAt,
  newPhone,
}) => {
  test.setTimeout(180_000);
  const host = await hostAt('?arena=market_plaza&kills=2&powerups=off');
  const code = await host.createRoom();
  await host.addCpu('Hard');
  await host.addCpu('Hard');
  await host.start();
  await host.autoContinue(); // nobody on a phone: the TV presses CONTINUE between rounds
  await host.waitForDrawn(2);

  const late = await newPhone();
  await late.join(code, 'Latecomer'); // the room is PLAYING: the controller connects all the same
  const lateId = await host.playerId('Latecomer');
  expect((await host.fu()).players.map((p) => p.id)).not.toContain(lateId); // no body halfway through a match
  await expect(host.page.getByText(/Waiting for the next match: Latecomer/)).toBeVisible({
    timeout: 10_000,
  });

  await expect(host.page.getByRole('dialog', { name: 'Match over' })).toBeVisible({
    timeout: 120_000,
  });
  await expect(host.page.getByText(/Waiting for the next match: Latecomer/)).toBeVisible();
  await host.page.getByRole('button', { name: 'Rematch' }).click();
  await host.waitForDrawn(3);
  const fu = await host.fu();
  expect(fu.players.map((p) => p.id)).toContain(lateId);
  expect(Object.values(fu.scores)).toEqual([0, 0, 0]);
});

test('reloading the console page mid-match loses the match, says so, and returns the room to the lobby (it never silently restarts round 1)', async ({
  hostAt,
}) => {
  test.setTimeout(120_000);
  const host = await hostAt('?arena=market_plaza&kills=14&powerups=off');
  await host.createRoom();
  await host.addCpu('Easy');
  await host.addCpu('Easy');
  await host.start();
  await host.waitForDrawn(2);
  await host.page.reload();
  await expect(
    host.page.getByText(/The last match ended because this screen was reloaded/),
  ).toBeVisible({ timeout: 15_000 });
  await expect(host.startButton).toBeVisible();
  expect((await host.snapshot()).game).toBeUndefined(); // no match is running
  expect((await host.snapshot()).roomState).toBe('LOBBY');
});
