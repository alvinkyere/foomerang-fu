import { expect, sleep, test, type Host, type Phone } from './support/fixtures';

const FAR = 140;

/** Points a player's thumb along the line from `from` to `to` for a moment, which sets their facing. */
async function aim(
  phone: Phone,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  await phone.thumbDown();
  await phone.thumbMove((dx / length) * FAR, (dy / length) * FAR);
  await sleep(90); // long enough for the direction to register; short enough to barely move
  await phone.thumbUp();
}

async function setUp(host: Host, newPhone: () => Promise<Phone>) {
  const code = await host.createRoom();
  const alice = await newPhone();
  const bob = await newPhone();
  await alice.join(code, 'Alice');
  await bob.join(code, 'Bob');
  await host.start();
  await host.waitForDrawn(2);
  return { alice, bob, aliceId: await host.playerId('Alice'), bobId: await host.playerId('Bob') };
}

test('Foomerang Fu: two controllers move, throw, hit, finish a round and start the next', async ({
  fuHost: host,
  newPhone,
}) => {
  // The controller is rendered from the manifest: MOVE joystick + THROW button.
  const code = await host.createRoom();
  const alice = await newPhone();
  const bob = await newPhone();
  await alice.join(code, 'Alice');
  await bob.join(code, 'Bob');
  for (const phone of [alice, bob]) {
    await expect(phone.page.getByRole('group', { name: /move/i })).toBeVisible();
    await expect(phone.page.getByRole('button', { name: 'THROW' })).toBeVisible();
  }

  await host.start();
  await host.waitForDrawn(2);
  const aliceId = await host.playerId('Alice');
  const bobId = await host.playerId('Bob');

  // --- round 1 begins: everyone alive, every boomerang in hand ---------------------------------
  let fu = await host.fu();
  expect(fu).toMatchObject({ round: 1, phase: 'PLAYING' });
  expect(fu.players.map((p) => p.alive)).toEqual([true, true]);
  expect(fu.boomerangs.map((b) => b.state)).toEqual(['HELD', 'HELD']);
  const spawn = { a: await host.body(aliceId), b: await host.body(bobId) };

  // --- independent movement --------------------------------------------------------------------
  await bob.thumbDown();
  await bob.thumbMove(-FAR, 0);
  await expect.poll(async () => (await host.body(bobId)).x).toBeLessThan(spawn.b.x - 40);
  await bob.thumbUp();
  expect(await host.body(aliceId)).toEqual(spawn.a); // Alice did not move
  await host.settled(bobId);

  // --- independent throws: only the thrower's boomerang leaves their hand ----------------------
  await bob.tapThrow();
  await expect
    .poll(async () => (await host.fu()).boomerangs.find((b) => b.ownerId === bobId)?.state)
    .not.toBe('HELD');
  fu = await host.fu();
  expect(fu.boomerangs.find((b) => b.ownerId === aliceId)?.state).toBe('HELD');
  // What Phaser draws is the boomerang the rules say is flying.
  await expect
    .poll(async () => (await host.snapshot()).drawnBoomerangs?.map((b) => b.id))
    .toEqual([bobId]);
  // ...and it comes back to Bob's hand.
  await expect
    .poll(async () => (await host.fu()).boomerangs.find((b) => b.ownerId === bobId)?.state, {
      timeout: 8_000,
    })
    .toBe('HELD');
  expect((await host.fu()).players.every((p) => p.alive)).toBe(true); // nobody was hit
  expect((await host.snapshot()).drawnBoomerangs).toEqual([]);

  // --- aim at Bob and throw: the hit kills, the round ends -------------------------------------
  const alicePos = await host.body(aliceId);
  const bobPos = await host.body(bobId);
  await aim(alice, alicePos, bobPos);
  const aliceNow = await host.body(aliceId);
  expect(Math.hypot(bobPos.x - aliceNow.x, bobPos.y - aliceNow.y)).toBeLessThan(560); // within throwing reach (spawn gap + range + hit radius)
  await alice.tapThrow();
  await expect.poll(async () => (await host.fu()).phase, { timeout: 8_000 }).toBe('ROUND_OVER');
  fu = await host.fu();
  expect(fu.winnerId).toBe(aliceId);
  expect(fu.players.find((p) => p.id === bobId)?.alive).toBe(false);
  expect(fu.players.find((p) => p.id === aliceId)?.alive).toBe(true);

  // Death is a rules fact; the dead player is still drawn (as a dimmed, crossed-out circle).
  expect((await host.snapshot()).drawn?.map((d) => d.id).sort()).toEqual([aliceId, bobId].sort());

  // --- the next round starts by itself, from the same fresh start ------------------------------
  await expect.poll(async () => (await host.fu()).round, { timeout: 10_000 }).toBe(2);
  fu = await host.fu();
  expect(fu.phase).toBe('PLAYING');
  expect(fu.players.map((p) => p.alive)).toEqual([true, true]);
  expect(fu.boomerangs.map((b) => b.state)).toEqual(['HELD', 'HELD']);
  expect(await host.body(aliceId)).toEqual(spawn.a);
  expect(await host.body(bobId)).toEqual(spawn.b);

  // --- both can still play round 2: the same controllers, no re-joining ------------------------
  await bob.tapThrow();
  await expect
    .poll(async () => (await host.fu()).boomerangs.find((b) => b.ownerId === bobId)?.state)
    .not.toBe('HELD');
});

test('Foomerang Fu: holding THROW throws once, and sends exactly one press and one release', async ({
  fuHost: host,
  newPhone,
}) => {
  const { bob, bobId } = await setUp(host, newPhone);
  const before = (await host.snapshot()).diagnostics.actionsReceived;
  let throws = 0;
  let last = 'HELD';
  const watcher = (async () => {
    const until = Date.now() + 2_600;
    while (Date.now() < until) {
      const state = (await host.fu()).boomerangs.find((b) => b.ownerId === bobId)?.state ?? 'HELD';
      if (last === 'HELD' && state === 'THROWN') throws += 1;
      last = state;
      await sleep(20);
    }
  })();
  await bob.holdThrow(2_400); // a very long hold: the boomerang goes out and comes back while the finger stays down
  await watcher;
  expect(throws).toBe(1);
  expect((await host.snapshot()).diagnostics.actionsReceived - before).toBe(2); // pressed + released, nothing else
});

test('Foomerang Fu: a controller reload does not lose the player, and the new page can throw', async ({
  fuHost: host,
  newPhone,
}) => {
  const { bob, bobId } = await setUp(host, newPhone);
  await bob.page.reload();
  await expect(bob.page.getByRole('status')).toHaveText(/Connected/);
  await expect(bob.page.getByRole('button', { name: 'THROW' })).toBeVisible();
  await expect
    .poll(async () => (await host.snapshot()).roster.find((r) => r.playerId === bobId)?.connection)
    .toBe('CONNECTED');
  await bob.tapThrow();
  await expect
    .poll(async () => (await host.fu()).boomerangs.find((b) => b.ownerId === bobId)?.state)
    .not.toBe('HELD');
});

test('Foomerang Fu: performance of ordinary two-player combat (recorded, with a loose floor)', async ({
  fuHost: host,
  newPhone,
}) => {
  const { alice, bob, aliceId, bobId } = await setUp(host, newPhone);
  await sleep(500);
  const startSteps = (await host.snapshot()).metrics.simulationSteps;
  // Ten seconds of both players steering and throwing.
  const until = Date.now() + 10_000;
  let i = 0;
  while (Date.now() < until) {
    const phone = i % 2 === 0 ? alice : bob;
    await phone.thumbDown();
    await phone.thumbMove(i % 3 === 0 ? FAR : -FAR, i % 4 === 0 ? FAR : -FAR);
    await sleep(350);
    await phone.thumbUp();
    await phone.tapThrow();
    i += 1;
  }
  const { metrics } = await host.snapshot();
  console.log(
    `FU PERF (dev server, headless Chrome): fps=${metrics.fps?.toFixed(1)} frameMs=${metrics.frameMs?.toFixed(2)} ` +
      `steps=${metrics.simulationSteps - startSteps} catchUp=${metrics.catchUpFrames} ` +
      `discardEvents=${metrics.discardEvents} discardedMs=${metrics.discardedSimulationMs.toFixed(0)}`,
  );
  expect(metrics.simulationSteps - startSteps).toBeGreaterThan(400); // it kept simulating at ~60/s
  expect(metrics.fps ?? 0).toBeGreaterThan(30); // a loose floor; the figure above is the evidence
  expect(await host.body(aliceId)).toBeDefined();
  expect(await host.body(bobId)).toBeDefined();
});
