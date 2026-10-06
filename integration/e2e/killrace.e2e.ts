import { expect, test, type Host } from './support/fixtures';

/** Adds a CPU of a difficulty in the lobby, exactly as a host with a mouse would. */
async function addCpu(host: Host, difficulty: 'Easy' | 'Medium' | 'Hard'): Promise<void> {
  await host.page.getByLabel('New CPU difficulty').selectOption({ label: difficulty });
  await host.page.getByRole('button', { name: 'Add CPU' }).click();
}

const holes = (host: Host, name: string) =>
  host.page
    .getByLabel('Kill race')
    .getByRole('img', { name: new RegExp(`^${name}: \\d+ of \\d+ kills$`) });

test('Free For All in the lobby: it is available and chosen, and Hide & Seek is visible, says COMING SOON and is genuinely disabled', async ({
  hostAt,
}) => {
  const host = await hostAt('?powerups=off');
  await host.createRoom();
  const modes = host.page.getByRole('group', { name: 'Game mode' });
  await expect(modes).toContainText('FREE FOR ALL');
  await expect(modes).toContainText('Available');
  await expect(modes).toContainText('HIDE & SEEK');
  await expect(modes).toContainText('COMING SOON');
  await expect(modes.getByRole('radio', { name: /FREE FOR ALL/ })).toBeChecked();
  const hide = modes.getByRole('radio', { name: /HIDE & SEEK/ });
  await expect(hide).toBeDisabled();
  await hide.click({ force: true }).catch(() => undefined); // it cannot be activated
  await expect(modes.getByRole('radio', { name: /FREE FOR ALL/ })).toBeChecked();
  await expect(hide).not.toBeChecked();
});

test('a CPU-only Free For All (nobody on a phone) is a race: meters fill, the match is won at the target, and REMATCH and RETURN TO LOBBY work', async ({
  hostAt,
}) => {
  test.setTimeout(180_000);
  const host = await hostAt('?kills=3&powerups=off');
  await host.createRoom();
  await addCpu(host, 'Hard');
  await addCpu(host, 'Hard');
  await host.start();
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
  await expect(host.page.getByRole('dialog', { name: 'Match over' })).toContainText(
    'WINS THE MATCH',
  );
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
  await host.page.getByRole('button', { name: 'Return to lobby' }).click();
  await expect(host.page.getByRole('button', { name: 'Start' })).toBeVisible();
  await expect(host.page.getByRole('group', { name: 'Game mode' })).toBeVisible();
  expect((await host.snapshot()).roomState).toBe('LOBBY');
});

test('a person who joins while the match is running connects and waits; the rematch takes them in', async ({
  hostAt,
  newPhone,
}) => {
  test.setTimeout(180_000);
  const host = await hostAt('?kills=2&powerups=off');
  const code = await host.createRoom();
  await addCpu(host, 'Hard');
  await addCpu(host, 'Hard');
  await host.start();
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
  const host = await hostAt('?kills=14&powerups=off');
  await host.createRoom();
  await addCpu(host, 'Easy');
  await addCpu(host, 'Easy');
  await host.start();
  await host.waitForDrawn(2);
  await host.page.reload();
  await expect(host.page.getByText(/The match was interrupted/)).toBeVisible({ timeout: 15_000 });
  await expect(host.page.getByRole('button', { name: 'Start' })).toBeVisible();
  expect((await host.snapshot()).game).toBeUndefined(); // no match is running
  expect((await host.snapshot()).roomState).toBe('LOBBY');
});
