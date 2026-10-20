import { expect, sleep, test, type Host, type Phone } from './support/fixtures';
import { POWER_KINDS, chooseAward } from '@foomerang/foomerang-fu';
import { NODES, routeTo, type Point } from './support/routes';

// Slice 5 through the real path: real touches on real phones → the server → the console → the rules
// → Phaser. The console runs with `?powerups=fast` (a pickup a second), so every power is within reach
// in seconds. The browser can only SEE the rules' state (through the read-only debug hook) and what
// Phaser has drawn; it never injects anything.

const FAR = 140;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Holds a thumb and keeps re-aiming it at `target` from the player's LIVE position until close enough. */
async function steer(host: Host, phone: Phone, id: string, target: Point, within = 14) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const here = await host.body(id);
    const d = dist(here, target);
    if (d <= within) return;
    if (Date.now() > deadline)
      throw new Error(`never reached ${JSON.stringify(target)} from ${JSON.stringify(here)}`);
    await phone.thumbMove(((target.x - here.x) / d) * FAR, ((target.y - here.y) / d) * FAR);
    await sleep(20);
  }
}

/** Walks the planned route to a named place, thumb down throughout. */
async function goTo(host: Host, phone: Phone, id: string, place: keyof typeof NODES, within = 14) {
  const route = routeTo(await host.body(id), place);
  await phone.thumbDown();
  try {
    for (const [i, point] of route.entries()) {
      await steer(host, phone, id, point, i === route.length - 1 ? within : 26);
    }
  } finally {
    await phone.thumbUp();
  }
}

/** A short thumb stroke along a direction: sets the facing (and barely moves). */
async function face(phone: Phone, dx: number, dy: number) {
  const l = Math.hypot(dx, dy);
  await phone.thumbDown();
  await phone.thumbMove((dx / l) * FAR, (dy / l) * FAR);
  await sleep(90);
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
const me = async (host: Host, id: string) => (await host.fu()).players.find((p) => p.id === id);
const owned = async (host: Host, id: string) => (await me(host, id))?.inventory ?? [];

/** The named place a lying Book is at (Books appear only on the four spots). */
const spotName = (p: { x: number; y: number }): keyof typeof NODES =>
  (Object.entries(NODES) as [keyof typeof NODES, Point][]).find(
    ([name, at]) => name.startsWith('spot') && at.x === p.x && at.y === p.y,
  )?.[0] as keyof typeof NODES;

/** Walks to a Book (any one lying there) and takes it. */
async function takeABook(host: Host, phone: Phone, id: string) {
  await expect
    .poll(async () => (await host.fu()).pickups.length, { timeout: 12_000 })
    .toBeGreaterThan(0);
  const before = (await owned(host, id)).length;
  const book = (await host.fu()).pickups[0] as { x: number; y: number };
  await goTo(host, phone, id, spotName(book), 10);
  await expect.poll(async () => (await host.fu()).awards, { timeout: 5_000 }).toBeGreaterThan(0);
  return before;
}

test('Powerups: a Book is one mystery object — it names nothing before it is taken, Phaser draws it, and the award is revealed (and owned) only after', async ({
  powerHost,
  newPhone,
}) => {
  const host = await powerHost();
  const { alice, aliceId } = await setUp(host, newPhone);
  await expect
    .poll(async () => (await host.fu()).pickups.length, { timeout: 8_000 })
    .toBeGreaterThan(0);
  const lying = (await host.fu()).pickups;
  for (const book of lying) expect(Object.keys(book).sort()).toEqual(['id', 'x', 'y']); // no kind, no colour, no clue
  await expect
    .poll(async () => (await host.snapshot()).drawnPickups?.length, { timeout: 5_000 })
    .toBe(lying.length);
  expect(await owned(host, aliceId)).toEqual([]);

  const first = lying[0] as { x: number; y: number; id: number };
  expect(first).toMatchObject({ x: 800, y: 295 }); // the first spot
  await goTo(host, alice, aliceId, 'spotNorth', 10);
  await expect.poll(async () => (await owned(host, aliceId)).length, { timeout: 5_000 }).toBe(1);
  // what it awarded is the rules' own seeded choice for the first Book of the match, nobody else's
  expect(await owned(host, aliceId)).toEqual([chooseAward(POWER_KINDS, 1, 0)]);
  await expect
    .poll(async () => (await host.snapshot()).drawnPickups?.some((p) => p.id === String(first.id)))
    .toBe(false);
});

test('Powerups: a SHIELD absorbs a real SLASH, breaks and leaves the inventory; the very next swing kills', async ({
  powerHost,
  newPhone,
}) => {
  const host = await powerHost('SHIELD');
  const { alice, bob, aliceId, bobId } = await setUp(host, newPhone);
  await takeABook(host, alice, aliceId);
  expect(await owned(host, aliceId)).toEqual(['SHIELD']);

  // Alice steps off the spot, then Bob comes up through the bottom gate and closes to within a swing of her
  await alice.thumbDown();
  await alice.thumbMove(-FAR, 0);
  await sleep(400);
  await alice.thumbUp();
  await host.settled(aliceId);
  await goTo(host, bob, bobId, 'bottomGate', 14);
  await bob.thumbDown();
  try {
    for (let i = 0; i < 400; i += 1) {
      const here = await host.body(bobId);
      const target = here.y > 700 ? { x: 800, y: 690 } : await host.body(aliceId);
      if (here.y <= 700 && dist(here, target) <= 100) break;
      const d = dist(here, target);
      await bob.thumbMove(((target.x - here.x) / d) * FAR, ((target.y - here.y) / d) * FAR);
      await sleep(15);
    }
  } finally {
    await bob.thumbUp();
  }

  await bob.tapSlash();
  await expect.poll(async () => (await owned(host, aliceId)).length, { timeout: 3_000 }).toBe(0);
  expect((await me(host, aliceId))?.alive).toBe(true); // absorbed; the slot is free again
  expect((await host.fu()).phase).toBe('PLAYING');
  await expect.poll(async () => (await me(host, bobId))?.slash, { timeout: 3_000 }).toBe('READY');
  await bob.tapSlash();
  await expect.poll(async () => (await me(host, aliceId))?.alive, { timeout: 3_000 }).toBe(false);
});

test('Powerups: EXTRA_BOOMERANG + EXPLOSIVE_BOOMERANG together — one press throws ONE armed boomerang, a second press the other while the first is out (the video, 7:18.95 / 7:19.15), drawn separately; the power survives the throw', async ({
  powerHost,
  newPhone,
}) => {
  const host = await powerHost('EXTRA_BOOMERANG,EXPLOSIVE_BOOMERANG');
  const { alice, aliceId } = await setUp(host, newPhone);
  await takeABook(host, alice, aliceId);
  await expect.poll(async () => (await owned(host, aliceId)).length, { timeout: 3_000 }).toBe(1);
  await expect
    .poll(async () => (await host.fu()).pickups.length, { timeout: 10_000 })
    .toBeGreaterThan(0);
  const book = (await host.fu()).pickups[0] as { x: number; y: number };
  await goTo(host, alice, aliceId, spotName(book), 10);
  await expect.poll(async () => (await owned(host, aliceId)).length, { timeout: 5_000 }).toBe(2);
  expect([...(await owned(host, aliceId))].sort()).toEqual([
    'EXPLOSIVE_BOOMERANG',
    'EXTRA_BOOMERANG',
  ]);

  const mine = async () => (await host.fu()).boomerangs.filter((b) => b.ownerId === aliceId);
  expect(await mine()).toHaveLength(2);
  expect((await mine()).every((b) => b.state === 'HELD')).toBe(true);
  await face(alice, 0, 1); // facing straight down the open lane
  await alice.tapThrow(); // ONE real THROW press…
  // …throws ONE: her own; the extra stays in her hand
  await expect
    .poll(async () => (await mine()).map((b) => b.state !== 'HELD'), { timeout: 3_000 })
    .toEqual([true, false]);
  await alice.tapThrow(); // a second press, the first still out: the extra goes too
  await expect
    .poll(async () => (await mine()).every((b) => b.state !== 'HELD'), { timeout: 3_000 })
    .toBe(true);
  expect((await mine()).map((b) => b.blast)).toEqual([true, true]); // both armed while Explosive is owned
  await expect
    .poll(async () => (await host.snapshot()).drawnBoomerangs?.map((b) => b.id).sort(), {
      timeout: 3_000,
    })
    .toEqual([aliceId, `${aliceId}#2`].sort());
  await expect
    .poll(async () => (await mine()).every((b) => b.state === 'HELD'), { timeout: 12_000 })
    .toBe(true);
  expect((await me(host, aliceId))?.alive).toBe(true); // her own blasts never hurt her
  expect([...(await owned(host, aliceId))].sort()).toEqual([
    'EXPLOSIVE_BOOMERANG',
    'EXTRA_BOOMERANG',
  ]); // still owned
});
