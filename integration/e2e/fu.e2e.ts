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

type Point = { x: number; y: number };
const SPAWNS: Point[] = [
  { x: 110, y: 110 }, // slot 0: top-left (Alice, who joins first)
  { x: 1490, y: 790 }, // slot 1: bottom-right (Bob)
];
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Holds a thumb and keeps re-aiming it at `target` from the player's LIVE position until `done`.
 * Steering by position, not by a fixed push, is what lets a test walk a route through walls.
 */
async function steer(
  host: Host,
  phone: Phone,
  id: string,
  target: Point | (() => Promise<Point>),
  within = 20,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const here = await host.body(id);
    const goal = typeof target === 'function' ? await target() : target;
    const d = dist(here, goal);
    if (d <= within) return;
    if (Date.now() > deadline) {
      throw new Error(
        `steering from ${JSON.stringify(here)} never reached ${JSON.stringify(goal)}`,
      );
    }
    await phone.thumbMove(((goal.x - here.x) / d) * FAR, ((goal.y - here.y) / d) * FAR);
    await sleep(25);
  }
}

/** Walks a route: each leg is a point to reach (or a live target and how close to get), thumb never lifted between legs. */
async function walk(
  host: Host,
  phone: Phone,
  id: string,
  legs: { to: Point | (() => Promise<Point>); within?: number }[],
): Promise<void> {
  await phone.thumbDown();
  try {
    for (const leg of legs) await steer(host, phone, id, leg.to, leg.within);
  } finally {
    await phone.thumbUp();
  }
}

/** Alice's way to Bob along the open bottom lane: down the left edge, then right along y = 790. */
const bottomLane = (bobId: string, host: Host, within: number) => [
  { to: { x: 110, y: 790 }, within: 20 },
  { to: () => host.body(bobId), within },
];

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
  // The controller is rendered from the manifest: MOVE joystick + SLASH and THROW buttons.
  const code = await host.createRoom();
  const alice = await newPhone();
  const bob = await newPhone();
  await alice.join(code, 'Alice');
  await bob.join(code, 'Bob');
  for (const phone of [alice, bob]) {
    await expect(phone.page.getByRole('group', { name: /move/i })).toBeVisible();
    await expect(phone.page.getByRole('button', { name: 'THROW' })).toBeVisible();
    await expect(phone.page.getByRole('button', { name: 'SLASH' })).toBeVisible();
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
  expect(spawn).toEqual({ a: SPAWNS[0], b: SPAWNS[1] }); // the arena's own spawn points

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
  // Alice takes the long way round (down the left edge, then along the open bottom lane) to a point
  // 400 short of Bob, facing him, with nothing in the way of a throw.
  await walk(host, alice, aliceId, [
    { to: { x: 110, y: 790 } },
    { to: async () => ({ x: (await host.body(bobId)).x - 400, y: 790 }), within: 30 },
  ]);
  const aliceNow = await host.body(aliceId);
  const bobPos = await host.body(bobId);
  expect(Math.abs(aliceNow.y - bobPos.y)).toBeLessThan(5); // the same lane
  expect(bobPos.x - aliceNow.x).toBeLessThan(560); // within throwing reach
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

const slashOf = async (host: Host, id: string) =>
  (await host.fu()).players.find((p) => p.id === id)?.slash;

test('Foomerang Fu: one player kills another with SLASH, which uses the weapon in hand and never throws it', async ({
  fuHost: host,
  newPhone,
}) => {
  const { alice, aliceId, bobId } = await setUp(host, newPhone);
  expect(await slashOf(host, aliceId)).toBe('READY');
  await walk(host, alice, aliceId, bottomLane(bobId, host, 105));
  // Out of reach is out of reach: a slash from far away would have changed nothing, and we are close now.
  const a = await host.body(aliceId);
  const b = await host.body(bobId);
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(130);

  const before = (await host.snapshot()).diagnostics.actionsReceived;
  await alice.tapSlash();
  await expect.poll(async () => (await host.fu()).phase, { timeout: 4_000 }).toBe('ROUND_OVER');
  const fu = await host.fu();
  expect(fu.winnerId).toBe(aliceId);
  expect(fu.players.find((p) => p.id === bobId)?.alive).toBe(false);
  expect(fu.boomerangs.map((x) => x.state)).toEqual(['HELD', 'HELD']); // nothing was thrown
  expect((await host.snapshot()).diagnostics.actionsReceived - before).toBe(2); // pressed + released

  // The next round starts from the same fresh start, with the swing reset.
  await expect.poll(async () => (await host.fu()).round, { timeout: 10_000 }).toBe(2);
  expect((await host.fu()).players.map((p) => p.slash)).toEqual(['READY', 'READY']);
});

/** Samples Alice's slash phase and boomerang state every 10 ms for `ms`: everything that happened to her weapon. */
async function observe(host: Host, id: string, ms: number) {
  const slash = new Set<string>();
  const boomerang = new Set<string>();
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const fu = await host.fu();
    slash.add(fu.players.find((p) => p.id === id)?.slash ?? '?');
    boomerang.add(fu.boomerangs.find((b) => b.ownerId === id)?.state ?? '?');
    await sleep(10);
  }
  return { slash: [...slash].sort(), boomerang: [...boomerang].sort() };
}

test('Foomerang Fu: the rendered THROW button throws and never slashes; the rendered SLASH button slashes and never throws', async ({
  fuHost: host,
  newPhone,
}) => {
  const { alice, aliceId } = await setUp(host, newPhone);
  // Throw along the open top lane, away from Bob, so it cannot end the round.
  const at = await host.body(aliceId);
  await aim(alice, at, { x: at.x + 100, y: at.y });

  // Press the button labelled THROW.
  const afterThrow = observe(host, aliceId, 700);
  await alice.tapThrow();
  const threw = await afterThrow;
  expect(threw.boomerang).toContain('THROWN'); // the boomerang left her hand
  expect(threw.slash).toEqual(['READY']); // and she never swung

  // Wait for the boomerang to come home, then press the button labelled SLASH.
  await expect
    .poll(async () => (await host.fu()).boomerangs.find((x) => x.ownerId === aliceId)?.state, {
      timeout: 8_000,
    })
    .toBe('HELD');
  const afterSlash = observe(host, aliceId, 700);
  await alice.tapSlash();
  const swung = await afterSlash;
  expect(swung.slash).toContain('ACTIVE'); // she swung
  expect(swung.boomerang).toEqual(['HELD']); // and nothing was thrown
});

test('Foomerang Fu: SLASH is unavailable while the boomerang is away, and works again once it is back', async ({
  fuHost: host,
  newPhone,
}) => {
  const { alice, aliceId } = await setUp(host, newPhone);
  // Face away from Bob so the throw cannot end the round, then throw.
  const at = await host.body(aliceId);
  await aim(alice, at, { x: at.x + 100, y: at.y }); // along the open top lane
  await alice.tapThrow();
  await expect
    .poll(async () => (await host.fu()).boomerangs.find((x) => x.ownerId === aliceId)?.state)
    .not.toBe('HELD');
  await alice.tapSlash();
  await sleep(250);
  expect(await slashOf(host, aliceId)).toBe('READY'); // nothing swung, and nothing is saved for later
  // Home again: now it swings.
  await expect
    .poll(async () => (await host.fu()).boomerangs.find((x) => x.ownerId === aliceId)?.state, {
      timeout: 8_000,
    })
    .toBe('HELD');
  await alice.tapSlash();
  await expect.poll(async () => slashOf(host, aliceId), { intervals: [10] }).not.toBe('READY');
});

test('Foomerang Fu: players are solid — walking straight into another player stops in contact, never overlapping', async ({
  fuHost: host,
  newPhone,
}) => {
  const { alice, aliceId, bobId } = await setUp(host, newPhone);
  // Get next to Bob along the bottom lane, then keep walking at him for far longer than it takes.
  await alice.thumbDown();
  await steer(host, alice, aliceId, { x: 110, y: 790 });
  let closest = Number.POSITIVE_INFINITY;
  const until = Date.now() + 9_000;
  while (Date.now() < until) {
    const a = await host.body(aliceId);
    const b = await host.body(bobId);
    closest = Math.min(closest, dist(a, b));
    await alice.thumbMove(FAR, 0);
    await sleep(10);
  }
  await alice.thumbUp();
  const radius = 36; // DEFAULT_FU_CONFIG.playerRadius
  expect(closest).toBeGreaterThan(2 * radius - 0.5); // they got right up to each other…
  expect(closest).toBeLessThan(2 * radius + 40); // …(and did walk into contact)…
  const a = await host.body(aliceId);
  const b = await host.body(bobId);
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * radius - 0.5); // …but never overlapped
});

test('Foomerang Fu: the arena’s walls are drawn exactly as the rules define them', async ({
  fuHost: host,
  newPhone,
}) => {
  await setUp(host, newPhone);
  const snapshot = await host.snapshot();
  const rules = (await host.fu()).walls;
  expect(rules.length).toBeGreaterThanOrEqual(8);
  expect(snapshot.drawnWalls).toEqual(rules);
});

test('Foomerang Fu: a wall stops a player walking into it, and stops a thrown boomerang, which turns back', async ({
  fuHost: host,
  newPhone,
}) => {
  const { alice, aliceId } = await setUp(host, newPhone);
  // The left corridor's outer wall occupies x 200–250, y 300–600. Stand in the open left lane in front of it.
  await walk(host, alice, aliceId, [{ to: { x: 110, y: 450 }, within: 12 }]);
  await host.settled(aliceId);
  const wallX = 200;
  const radius = 36;

  // --- walking into it stops flush against it, drawn where the rules say --------------------------
  await alice.thumbDown();
  await alice.thumbMove(FAR, 0);
  await expect
    .poll(async () => (await host.body(aliceId)).x, { timeout: 4_000 })
    .toBeGreaterThan(wallX - radius - 1);
  await sleep(400); // still pushing: no creep, no jitter, no penetration
  await alice.thumbUp();
  const stopped = await host.body(aliceId);
  expect(stopped.x).toBeCloseTo(wallX - radius, 3);
  const drawn = (await host.snapshot()).drawn?.find((d) => d.id === aliceId);
  expect(drawn?.x).toBeCloseTo(stopped.x, 3);

  // --- back off, then throw at it ------------------------------------------------------------------
  await alice.thumbDown();
  await alice.thumbMove(-FAR, 0);
  await expect.poll(async () => (await host.body(aliceId)).x).toBeLessThan(70);
  await alice.thumbUp();
  await alice.thumbDown();
  await alice.thumbMove(FAR, 0); // face right again…
  await sleep(60);
  await alice.thumbUp(); // …having moved only a few units
  const from = await host.body(aliceId);
  await alice.tapThrow();
  let farthest = 0;
  let turnedAt: { x: number; y: number } | undefined;
  const until = Date.now() + 3_000;
  while (Date.now() < until) {
    const b = (await host.fu()).boomerangs.find((x) => x.ownerId === aliceId);
    if (b !== undefined && b.state !== 'HELD') {
      farthest = Math.max(farthest, b.x);
      if (b.state === 'RETURNING' && turnedAt === undefined) turnedAt = { x: b.x, y: b.y };
    }
    if (b?.state === 'HELD' && turnedAt !== undefined) break;
    await sleep(8);
  }
  expect(from.x).toBeLessThan(120);
  expect(turnedAt, 'the boomerang turned back').toBeDefined();
  // it never got past the wall face (200) less its own radius (14), and turned close to it
  expect(farthest).toBeLessThanOrEqual(wallX - 14 + 0.01);
  expect(farthest).toBeGreaterThan(wallX - 14 - 40); // …a flight, not a point-blank turn
  expect((await host.fu()).boomerangs.find((x) => x.ownerId === aliceId)?.state).toBe('HELD'); // and it came home
  expect((await host.fu()).players.find((p) => p.id === aliceId)?.alive).toBe(true);
});

test('Foomerang Fu: a returning boomerang cannot pass through cover — even when its owner ducks behind it — and still gets home', async ({
  fuHost: host,
  newPhone,
}) => {
  const { alice, aliceId } = await setUp(host, newPhone);
  const walls = (await host.fu()).walls;
  const clearance = (p: Point) =>
    Math.min(
      ...walls.map((w) =>
        Math.hypot(
          p.x - Math.min(Math.max(p.x, w.x), w.x + w.width),
          p.y - Math.min(Math.max(p.y, w.y), w.y + w.height),
        ),
      ),
    );
  // Throw right along the open top lane, then immediately start ducking down the left lane, so that by the
  // time the boomerang turns back Alice is behind the left corridor's wall (x 200–250, y 300–600).
  await aim(alice, SPAWNS[0] as Point, { x: 210, y: 110 });
  await alice.tapThrow();
  const mine = async () => (await host.fu()).boomerangs.find((b) => b.ownerId === aliceId);
  await alice.thumbDown();
  await alice.thumbMove(0, FAR);
  let tightest = Number.POSITIVE_INFINITY;
  let sawReturning = 0;
  let wallFollowing = 0;
  let home = false;
  const until = Date.now() + 8_000;
  while (Date.now() < until) {
    const b = await mine();
    if (b === undefined) break;
    if (b.state !== 'HELD') {
      tightest = Math.min(tightest, clearance(b));
      if (b.state === 'RETURNING') sawReturning += 1;
      if (b.state === 'RETURNING' && b.follow !== 0) wallFollowing += 1;
    } else if (sawReturning > 0) {
      home = true;
      break;
    }
    await sleep(6);
  }
  await alice.thumbUp();
  expect(sawReturning).toBeGreaterThan(5);
  expect(wallFollowing, 'it really did have to slide along cover').toBeGreaterThan(0);
  expect(tightest).toBeGreaterThanOrEqual(14 - 0.01); // never inside a wall, at any sampled moment
  expect(home).toBe(true); // and it found its way back to her
  expect((await host.fu()).players.find((p) => p.id === aliceId)?.alive).toBe(true);
});

test('Foomerang Fu: holding SLASH swings once and sends exactly one press and one release', async ({
  fuHost: host,
  newPhone,
}) => {
  const { alice, aliceId } = await setUp(host, newPhone);
  const before = (await host.snapshot()).diagnostics.actionsReceived;
  let swings = 0;
  let last = 'READY';
  const watcher = (async () => {
    const until = Date.now() + 2_200;
    while (Date.now() < until) {
      const state = (await slashOf(host, aliceId)) ?? 'READY';
      if (last === 'READY' && state === 'ACTIVE') swings += 1;
      last = state;
      await sleep(10);
    }
  })();
  await alice.holdButton('SLASH', 1_800); // a very long hold: the swing finishes and recovers while the finger stays down
  await watcher;
  expect(swings).toBe(1);
  expect((await host.snapshot()).diagnostics.actionsReceived - before).toBe(2);
});

test('Foomerang Fu: a controller reload does not lose the player, manufactures no actions, and the new page can throw and slash', async ({
  fuHost: host,
  newPhone,
}) => {
  const { bob, bobId } = await setUp(host, newPhone);
  const actionsBefore = (await host.snapshot()).diagnostics.actionsReceived;
  await bob.page.reload();
  await expect(bob.page.getByRole('status')).toHaveText(/Connected/);
  await expect(bob.page.getByRole('button', { name: 'THROW' })).toBeVisible();
  await expect
    .poll(async () => (await host.snapshot()).roster.find((r) => r.playerId === bobId)?.connection)
    .toBe('CONNECTED');
  await sleep(600); // long enough for any stray press to have arrived
  expect((await host.snapshot()).diagnostics.actionsReceived).toBe(actionsBefore);
  expect(await slashOf(host, bobId)).toBe('READY');
  expect((await host.fu()).boomerangs.find((b) => b.ownerId === bobId)?.state).toBe('HELD');
  await bob.tapSlash();
  await expect.poll(async () => slashOf(host, bobId), { intervals: [10] }).not.toBe('READY');
  await expect.poll(async () => slashOf(host, bobId), { timeout: 3_000 }).toBe('READY');
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
