import { expect, sleep, test } from './support/fixtures';

// Holding the thumb fully to the right/down: well past the joystick's radius, so the value saturates.
const FAR = 140;

// The renderer module and the Phaser library itself (not the few-line loader that names them).
const HEAVY_PHASER = /PhaserArena|deps\/phaser/;

test('a person can open Foomerang, create a room, join from two phones and move their own circles', async ({
  host,
  newPhone,
}) => {
  // --- console creates the room ---------------------------------------------------------------
  const code = await host.createRoom();
  await expect(
    host.page.getByRole('img', { name: `QR code to join room ${code} from a phone` }),
  ).toBeVisible();
  // The manual code sits beside the QR, and the link it carries is the room and nothing else.
  const link = host.page.locator('.join-url');
  const url = new URL((await link.textContent()) ?? '');
  expect(url.searchParams.get('room')).toBe(code);
  expect([...url.searchParams.keys()]).toEqual(['room']);
  expect(url.hash + url.username + url.password).toBe('');
  // This stack runs on loopback, so the console must warn that a real phone could not use the QR.
  await expect(host.page.getByRole('alert')).toContainText('FOOMERANG_CONTROLLER_URL');

  // --- two controllers join -------------------------------------------------------------------
  const alice = await newPhone();
  const bob = await newPhone();
  await alice.join(code, 'Alice');
  await bob.join(code, 'Bob');

  const lobby = host.page.getByRole('list').getByRole('listitem');
  await expect(lobby).toHaveText(['●1AliceConnected', '■2BobConnected']);
  const aliceId = await host.playerId('Alice');
  const bobId = await host.playerId('Bob');
  expect(aliceId).not.toBe(bobId);

  // --- the lobby has not paid for Phaser ------------------------------------------------------
  expect(host.requests.filter((u) => HEAVY_PHASER.test(u))).toEqual([]);

  // --- start ----------------------------------------------------------------------------------
  await host.start();
  await host.waitForDrawn(2);
  expect(host.requests.filter((u) => HEAVY_PHASER.test(u)).length).toBeGreaterThan(0); // fetched only now
  const start = { a: await host.body(aliceId), b: await host.body(bobId) };
  expect(start.a).not.toEqual(start.b);

  // --- Alice's thumb moves only Alice's circle ------------------------------------------------
  await alice.thumbDown();
  await alice.thumbMove(FAR, 0);
  await expect.poll(async () => (await host.body(aliceId)).x).toBeGreaterThan(start.a.x + 120);
  expect(await host.body(bobId)).toEqual(start.b); // nobody else moved
  expect((await host.body(aliceId)).y).toBe(start.a.y); // purely horizontal
  await alice.thumbUp();
  const aliceStop = await host.settled(aliceId);

  // --- Bob's thumb moves only Bob's circle (down is +Y) ---------------------------------------
  await bob.thumbDown();
  await bob.thumbMove(0, FAR);
  await expect.poll(async () => (await host.body(bobId)).y).toBeGreaterThan(start.b.y + 120);
  expect(await host.body(aliceId)).toEqual(aliceStop);
  expect((await host.body(bobId)).x).toBe(start.b.x);
  await bob.thumbUp();
  const bobStop = await host.settled(bobId);

  // --- what is on screen is what the simulation says ------------------------------------------
  await expect
    .poll(async () => {
      const s = await host.snapshot();
      return s.drawn?.map((d) => [d.id, d.x, d.y]);
    })
    .toEqual([
      [aliceId, aliceStop.x, aliceStop.y],
      [bobId, bobStop.x, bobStop.y],
    ]);

  // --- Alice's network drops: same identity, same circle ---------------------------------------
  const before = await host.snapshot();
  await alice.loseNetwork();
  await expect
    .poll(
      async () => (await host.snapshot()).roster.find((r) => r.playerId === aliceId)?.connection,
    )
    .toBe('RECONNECTING');
  expect((await host.snapshot()).bodies.map((b) => b.id)).toEqual([aliceId, bobId]); // her circle is still there
  alice.restoreNetwork();
  await expect
    .poll(
      async () => (await host.snapshot()).roster.find((r) => r.playerId === aliceId)?.connection,
      {
        timeout: 20_000,
      },
    )
    .toBe('CONNECTED');
  const after = await host.snapshot();
  expect(after.roster.map((r) => r.playerId)).toEqual(before.roster.map((r) => r.playerId)); // no new player
  expect(after.slots).toEqual(before.slots); // same slot, so same colour, number and marker
  expect(after.bodies.map((b) => b.id)).toEqual([aliceId, bobId]);
  expect(await host.body(aliceId)).toEqual(aliceStop); // exactly where she left it

  // ...and the same circle answers her thumb again.
  await alice.thumbDown();
  await alice.thumbMove(-FAR, 0);
  await expect.poll(async () => (await host.body(aliceId)).x).toBeLessThan(aliceStop.x - 100);
  expect(await host.body(bobId)).toEqual(bobStop);
  await alice.thumbUp();
});

test('releasing the thumb stops the circle at once — without waiting for the freshness timeout', async ({
  host,
  newPhone,
}) => {
  const code = await host.createRoom();
  const phone = await newPhone();
  await phone.join(code, 'Solo');
  await host.start();
  await host.waitForDrawn(1);
  const id = await host.playerId('Solo');
  const origin = await host.body(id);

  await phone.thumbDown();
  await phone.thumbMove(FAR, 0);
  await expect.poll(async () => (await host.body(id)).x).toBeGreaterThan(origin.x + 100);
  await phone.thumbUp();

  // A neutral message, not an expiry: the circle is still within a few frames' travel of where it was.
  const releasedAt = await host.body(id);
  await sleep(300);
  const later = await host.body(id);
  expect(later.x - releasedAt.x).toBeLessThan(60); // ≤ ~60 ms of drift at 420 u/s, never 300 ms' worth (126)
  await sleep(300);
  expect(await host.body(id)).toEqual(later);
  expect((await host.snapshot()).metrics.staleNeutralizations).toBe(0); // it was a release, not a timeout
});

test('if the host stops hearing refreshes, the circle stops instead of running forever — and nobody is disconnected', async ({
  host,
  newPhone,
}) => {
  const code = await host.createRoom();
  const phone = await newPhone();
  await phone.join(code, 'Solo');
  await host.start();
  await host.waitForDrawn(1);
  const id = await host.playerId('Solo');
  const origin = await host.body(id);

  await phone.thumbDown();
  await phone.thumbMove(FAR, 0);
  await expect.poll(async () => (await host.body(id)).x).toBeGreaterThan(origin.x + 100);

  // The thumb is still down, but its refreshes no longer arrive (a lost release is the same thing).
  phone.dropUplink(true);
  const dropAt = await host.body(id);
  await sleep(1_500); // three times the 500 ms freshness window
  const stopped = await host.body(id);
  expect(stopped.x - dropAt.x).toBeLessThan(420 * 0.5 + 40); // it kept going for at most the freshness window...
  await sleep(500);
  expect(await host.body(id)).toEqual(stopped); // ...and then stopped dead

  const snapshot = await host.snapshot();
  expect(snapshot.metrics.staleNeutralizations).toBeGreaterThanOrEqual(1);
  expect(snapshot.roster.find((r) => r.playerId === id)?.connection).toBe('CONNECTED'); // not a disconnect

  // Refreshes come back (the thumb never moved): the circle goes again.
  phone.dropUplink(false);
  await expect
    .poll(async () => (await host.body(id)).x, { timeout: 5_000 })
    .toBeGreaterThan(stopped.x + 40);
  await phone.thumbUp();
});

test('reloading a controller reclaims the same player; reloading the console reclaims the same room', async ({
  host,
  newPhone,
}) => {
  const code = await host.createRoom();
  const phone = await newPhone();
  await phone.join(code, 'Alice');
  const id = await host.playerId('Alice');

  await phone.page.reload();
  await expect(phone.page.getByRole('status')).toHaveText(/Connected/);
  await expect
    .poll(async () => (await host.snapshot()).roster.map((r) => [r.playerId, r.connection]))
    .toEqual([[id, 'CONNECTED']]);

  await host.page.reload();
  await expect(host.page.locator('.room-code')).toHaveText(code);
  await expect
    .poll(async () => (await host.snapshot()).roster.map((r) => [r.playerId, r.displayName]))
    .toEqual([[id, 'Alice']]);
});

test('Start with nobody in the room is refused with an explanation, and the lobby stays', async ({
  host,
}) => {
  await host.createRoom();
  await host.page.getByRole('button', { name: 'Start' }).click();
  await expect(host.page.getByRole('status')).toContainText('Waiting for more players');
  await expect(host.page.getByTestId('arena')).toHaveCount(0);
});

test('the development debug snapshot never carries a credential', async ({ host }) => {
  // The hook exists here because this stack runs Vite in development. Its absence from the
  // production build is checked by production.e2e.ts and by apps/console/scripts/check-bundle-size.mjs.
  const snapshot = await host.page.evaluate(() => JSON.stringify(window.__FOOMERANG__?.snapshot()));
  expect(snapshot).not.toMatch(/token/i);
});
