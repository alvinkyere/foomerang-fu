import { expect, sleep, test } from './support/fixtures';

// Character select (game-setting.mp4), end to end on the real stack: each phone moves its OWN cursor on the TV, SELECT
// readies it, a character someone is ready on cannot be taken, the begin bar appears once nobody is choosing, a phone's
// SELECT begins the match, and every player is drawn in the plaza as the character they chose.

test('phones pick their characters on the TV, get READY, begin from a phone, and play as what they chose', async ({
  hostAt,
  newPhone,
}) => {
  const host = await hostAt('?powerups=off'); // the product: the market plaza, in 3D
  const code = await host.createRoom();
  await expect(host.characterSelect).toBeVisible();
  const alice = await newPhone();
  await alice.join(code, 'Alice');
  const bob = await newPhone();
  await bob.join(code, 'Bob');
  const tile = (name: string) => host.page.getByRole('gridcell', { name: new RegExp(`^${name}`) });
  const circle = (n: number) =>
    host.page.getByRole('listitem', { name: new RegExp(`^Player ${n}:`) });

  // two people moving at the same moment: neither cancels the other
  await Promise.all([alice.flick('up'), bob.flick('right')]); // bread → banana; coffee → ice cream
  await expect(tile('Banana')).toHaveAccessibleName('Banana: P1');
  await expect(tile('Ice Cream')).toHaveAccessibleName('Ice Cream: P2');

  await alice.ready();
  await expect(circle(1)).toHaveAccessibleName('Player 1: Alice, Banana, ready');
  // Bob walks onto Alice's banana: he may look, but not take it
  await bob.flick('up'); // ice cream → avocado
  await bob.flick('right'); // → banana
  await expect(tile('Banana')).toHaveAccessibleName('Banana: P1 ready, P2');
  await bob.ready();
  await expect(circle(2)).toHaveAccessibleName('Player 2: Bob, Banana, choosing');
  await expect(host.startButton).toHaveCount(0); // somebody is still choosing: no begin bar

  await bob.flick('right'); // milk
  await bob.ready();
  await expect(circle(2)).toHaveAccessibleName('Player 2: Bob, Milk, ready');
  await expect(host.startButton).toBeVisible();

  await bob.ready(); // everyone is READY: a ready player's SELECT begins
  await expect(host.page.getByTestId('arena')).toBeVisible();
  const aliceId = await host.playerId('Alice');
  const bobId = await host.playerId('Bob');
  await expect
    .poll(async () => (await host.snapshot()).drawnCharacters, { timeout: 15_000 })
    .toEqual({ [aliceId]: 'banana', [bobId]: 'milk' });
});

test('the TV can always add bots once every person is ready, and a phone’s BACK never closes the room', async ({
  fuHost: host,
  newPhone,
}) => {
  const code = await host.createRoom();
  const alice = await newPhone();
  await alice.join(code, 'Alice');
  await alice.tap('BACK'); // choosing: BACK does nothing on the TV
  await sleep(200);
  await expect(host.page.getByRole('dialog', { name: 'Close this room?' })).toHaveCount(0);
  await alice.ready();
  await expect(host.page.getByTestId('bots')).toHaveText('NO BOTS');
  await alice.flick('right'); // a ready player's ▶: one more bot
  await expect(host.page.getByTestId('bots')).toHaveText('1 BOT');
  await expect(host.cpuSeat(1)).toBeVisible();
  await alice.tap('BACK'); // ready: BACK un-readies (and the bar goes until she is ready again)
  await expect(host.startButton).toHaveCount(0);
  await expect(host.page.getByRole('dialog', { name: 'Close this room?' })).toHaveCount(0);
});
