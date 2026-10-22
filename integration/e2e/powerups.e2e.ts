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
  // (where it lies is the match's random choice, one of the spots: owner, 2026-10-22)
  await goTo(host, alice, aliceId, spotName(first), 10);
  await expect.poll(async () => (await owned(host, aliceId)).length, { timeout: 5_000 }).toBe(1);
  // what it awarded is the rules' own seeded choice for the first Book of the match, nobody else's (from her pool: every power
  // but BATTLE_ROYALE, which this arena has no border for)
  const pool = POWER_KINDS.filter((kind) => kind !== 'BATTLE_ROYALE');
  expect(await owned(host, aliceId)).toEqual([chooseAward(pool, (await host.fu()).seed, 0)]);
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
  // Books until she owns both (Books lie at random spots now: her way to one may cross another)
  for (let i = 0; i < 4 && (await owned(host, aliceId)).length < 2; i += 1) {
    await takeABook(host, alice, aliceId);
    await sleep(300);
  }
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

test('Powerups: ICE_BOOMERANG — a real throw that reaches Bob freezes him where he stands (the video: 1.83 s) instead of killing him; then the ice shatters and he moves again', async ({
  powerHost,
  newPhone,
}) => {
  const host = await powerHost('ICE_BOOMERANG');
  const { alice, bob, aliceId, bobId } = await setUp(host, newPhone);
  await takeABook(host, alice, aliceId);
  expect(await owned(host, aliceId)).toEqual(['ICE_BOOMERANG']);
  // (the Book lay at a random spot: she goes to the north spot, in the open, so Bob can walk straight up to her)
  await goTo(host, alice, aliceId, 'spotNorth', 10);
  // Bob walks up to within a short throw of her, then she faces him and throws
  await bob.thumbDown();
  try {
    for (let i = 0; i < 600; i += 1) {
      const here = await host.body(bobId);
      const target = await host.body(aliceId);
      if (dist(here, target) <= 180) break;
      const d = dist(here, target);
      await bob.thumbMove(((target.x - here.x) / d) * FAR, ((target.y - here.y) / d) * FAR);
      await sleep(15);
    }
  } finally {
    await bob.thumbUp();
  }
  await host.settled(bobId);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const a = await host.body(aliceId);
    const b = await host.body(bobId);
    await face(alice, b.x - a.x, b.y - a.y);
    await expect
      .poll(async () => (await me(host, aliceId))?.charge, { timeout: 2_000 })
      .toBe('NONE');
    await alice.tapThrow();
    const frozen = await expect
      .poll(async () => (await me(host, bobId))?.frozen ?? 0, { timeout: 1_500 })
      .toBeGreaterThan(0)
      .then(() => true)
      .catch(() => false);
    if (frozen) break;
    // missed: it comes home, or (stopped by a wall: Books lie at random spots now) lies there, and she holds THROW to call it
    const state = async () =>
      (await host.fu()).boomerangs.find((x) => x.ownerId === aliceId)?.state;
    await expect.poll(state, { timeout: 8_000 }).toMatch(/^(HELD|GROUNDED)$/);
    for (let i = 0; i < 4 && (await state()) !== 'HELD'; i += 1) await alice.holdThrow(1_500);
    await expect.poll(state, { timeout: 4_000 }).toBe('HELD');
  }
  expect((await me(host, bobId))?.frozen ?? 0).toBeGreaterThan(0);
  expect((await me(host, bobId))?.alive).toBe(true); // frozen, not dead
  // frozen: his thumb moves nothing
  const at = await host.body(bobId);
  await bob.thumbDown();
  await bob.thumbMove(FAR, 0);
  await sleep(400);
  await bob.thumbUp();
  if (((await me(host, bobId))?.frozen ?? 0) > 0) expect(await host.body(bobId)).toEqual(at);
  // the ice shatters within the measured 1.83 s; he is alive and moves again
  await expect.poll(async () => (await me(host, bobId))?.frozen ?? 0, { timeout: 3_000 }).toBe(0);
  expect((await me(host, bobId))?.alive).toBe(true);
});

test('Powerups: TELEPORT_BOOMERANG — with her boomerang out, a second press of THROW puts her where it is, and it is in her hand again (the owner, 2026-10-22)', async ({
  powerHost,
  newPhone,
}) => {
  const host = await powerHost('TELEPORT_BOOMERANG');
  const { alice, aliceId } = await setUp(host, newPhone);
  await takeABook(host, alice, aliceId);
  expect(await owned(host, aliceId)).toEqual(['TELEPORT_BOOMERANG']);
  await goTo(host, alice, aliceId, 'upperLeft', 14); // the open lane: a long throw to the right
  await face(alice, 1, 0);
  const from = await host.body(aliceId);
  const state = async () => (await host.fu()).boomerangs.find((b) => b.ownerId === aliceId);
  await alice.tapThrow();
  await expect.poll(async () => (await state())?.state, { timeout: 2_000 }).not.toBe('HELD');
  await sleep(250); // let it fly out a way
  await alice.tapThrow();
  await expect.poll(async () => (await state())?.state, { timeout: 2_000 }).toBe('HELD');
  const to = await host.body(aliceId);
  expect(dist(from, to)).toBeGreaterThan(120); // she went to it: no walk covers that in the time
});

test('Powerups: TELEKINESIS — with her boomerang out, holding THROW and pushing the thumb steers the boomerang, not her; let go, it comes home (the owner, 2026-10-22)', async ({
  powerHost,
  newPhone,
}) => {
  const host = await powerHost('TELEKINESIS');
  const { alice, aliceId } = await setUp(host, newPhone);
  await takeABook(host, alice, aliceId);
  expect(await owned(host, aliceId)).toEqual(['TELEKINESIS']);
  await goTo(host, alice, aliceId, 'upperLeft', 14); // the open lane
  await face(alice, 1, 0);
  const mine = async () => (await host.fu()).boomerangs.find((b) => b.ownerId === aliceId);
  await alice.tapThrow();
  await expect.poll(async () => (await mine())?.state, { timeout: 2_000 }).not.toBe('HELD');
  await sleep(150);
  const me = await host.body(aliceId);
  const was = (await mine()) as { x: number; y: number };
  await alice.steerWithThrow(0, FAR, 700); // thumb down the screen: the boomerang goes down the arena
  const now = (await mine()) as { x: number; y: number; state: string };
  expect(now.y - was.y).toBeGreaterThan(100); // steered down
  expect(dist(await host.body(aliceId), me)).toBeLessThan(20); // she stood still
  // let go: it heads home; if a wall blocks its way it drops, and she holds THROW to call it, as with any boomerang
  await expect
    .poll(async () => (await mine())?.state, { timeout: 6_000 })
    .toMatch(/^(HELD|GROUNDED)$/);
  for (let i = 0; i < 4 && (await mine())?.state !== 'HELD'; i += 1) await alice.holdThrow(1_500);
  await expect.poll(async () => (await mine())?.state, { timeout: 4_000 }).toBe('HELD');
});
