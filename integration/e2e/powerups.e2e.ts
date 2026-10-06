import { expect, sleep, test, type Host, type Phone } from './support/fixtures';
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
const holdsPower = async (
  host: Host,
  id: string,
  power: 'overdrive' | 'blast' | 'guard' | 'twin' | 'phase',
) => {
  const p = (await me(host, id))?.powers;
  return p === undefined
    ? false
    : power === 'overdrive' || power === 'phase'
      ? p[power] > 0
      : p[power];
};

test('Powerups: pickups appear on the schedule, Phaser draws exactly the ones the rules have, a walker takes one, and OVERDRIVE makes them faster', async ({
  powerHost: host,
  newPhone,
}) => {
  const { alice, aliceId } = await setUp(host, newPhone);

  // the first pickup is the rules' first: OVERDRIVE, at the first spot
  await expect
    .poll(async () => (await host.fu()).pickups.length, { timeout: 8_000 })
    .toBeGreaterThan(0);
  const first = (await host.fu()).pickups[0];
  expect(first).toMatchObject({ kind: 'OVERDRIVE', x: 800, y: 295 });
  // what is on screen is what the rules say is lying there
  await expect
    .poll(async () => (await host.snapshot()).drawnPickups?.length, { timeout: 5_000 })
    .toBe((await host.fu()).pickups.length);
  expect(
    (await host.snapshot()).drawnPickups?.find((p) => p.id === String(first?.id)),
  ).toMatchObject({ x: 800, y: 295 });

  // Alice walks round the walls and takes it
  await goTo(host, alice, aliceId, 'spotNorth', 10);
  await expect
    .poll(async () => holdsPower(host, aliceId, 'overdrive'), { timeout: 5_000 })
    .toBe(true);
  expect((await host.fu()).pickups.find((p) => p.id === first?.id)).toBeUndefined();
  await expect
    .poll(async () => (await host.snapshot()).drawnPickups?.some((p) => p.id === String(first?.id)))
    .toBe(false);
  expect(await holdsPower(host, 'nobody', 'guard')).toBe(false);

  // …and while it lasts she walks about 1.4× as fast (measured over the simulation's own clock)
  await alice.thumbDown();
  await alice.thumbMove(0, -FAR); // up to the open lane
  await expect.poll(async () => (await host.body(aliceId)).y, { timeout: 3_000 }).toBeLessThan(262);
  await alice.thumbMove(FAR, 0);
  await sleep(120);
  const a = {
    x: (await host.body(aliceId)).x,
    steps: (await host.snapshot()).metrics.simulationSteps,
  };
  await sleep(400);
  const b = {
    x: (await host.body(aliceId)).x,
    steps: (await host.snapshot()).metrics.simulationSteps,
  };
  await alice.thumbUp();
  const speed = (b.x - a.x) / ((b.steps - a.steps) / 60);
  expect(speed).toBeGreaterThan(420 * 1.2); // clearly faster than 420
  expect(speed).toBeLessThan(420 * 1.6); // and not by accident of something else
});

test('Powerups: a GUARD absorbs a real SLASH (once), and the very next one kills', async ({
  powerHost: host,
  newPhone,
}) => {
  const { alice, bob, aliceId, bobId } = await setUp(host, newPhone);
  await expect
    .poll(async () => (await host.fu()).pickups.some((p) => p.kind === 'GUARD'), { timeout: 8_000 })
    .toBe(true);
  await goTo(host, alice, aliceId, 'spotSouth', 10);
  await expect.poll(async () => holdsPower(host, aliceId, 'guard'), { timeout: 5_000 }).toBe(true);

  // Alice steps off the spot (a new GUARD could appear under her feet), then Bob comes up through the
  // bottom gate and closes to within a swing of her, walking towards her so that he faces her
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
  await expect.poll(async () => holdsPower(host, aliceId, 'guard'), { timeout: 3_000 }).toBe(false);
  expect((await me(host, aliceId))?.alive).toBe(true); // the swing was absorbed
  expect((await host.fu()).phase).toBe('PLAYING');

  // the guard is gone; once Bob has recovered, the same swing kills her
  await expect.poll(async () => (await me(host, bobId))?.slash, { timeout: 3_000 }).toBe('READY');
  await bob.tapSlash();
  await expect.poll(async () => (await me(host, aliceId))?.alive, { timeout: 3_000 }).toBe(false);
});

test('Powerups: a Phase Dash goes through a wall (entry → inside → exit), ends in open space, spends a charge, and the wall is solid again afterwards', async ({
  powerHost: host,
  newPhone,
}) => {
  const { alice, aliceId } = await setUp(host, newPhone);
  await expect
    .poll(async () => (await host.fu()).pickups.some((p) => p.kind === 'PHASE_DASH'), {
      timeout: 10_000,
    })
    .toBe(true);
  await goTo(host, alice, aliceId, 'spotWest', 10);
  await expect.poll(async () => holdsPower(host, aliceId, 'phase'), { timeout: 5_000 }).toBe(true);
  expect((await me(host, aliceId))?.powers.phase).toBe(2);

  // face the corridor wall (x 350–400, just to her left) and press DASH
  await face(alice, -1, 0);
  const start = await host.settled(aliceId);
  expect(start.x).toBeGreaterThanOrEqual(436 - 1); // flush against the wall: nowhere to walk
  let sawPhasing = false;
  let sawInside = false;
  let drawnInsideWall = false;
  const watcher = (async () => {
    const until = Date.now() + 900;
    while (Date.now() < until) {
      const snap = await host.snapshot();
      const self = snap.game?.players.find((p) => p.id === aliceId);
      if (self?.phasing === true) sawPhasing = true;
      if (self?.inWall === true) {
        sawInside = true;
        const body = snap.bodies.find((b) => b.id === aliceId);
        const drawn = snap.drawn?.find((d) => d.id === aliceId);
        if (
          body !== undefined &&
          drawn !== undefined &&
          body.x < 400 + 36 &&
          Math.abs(drawn.x - body.x) < 40
        ) {
          drawnInsideWall = true; // Phaser really drew her in the wall, where the rules put her
        }
      }
      await sleep(3);
    }
  })();
  await alice.tapDash();
  await watcher;
  expect(sawPhasing).toBe(true);
  expect(sawInside).toBe(true);
  expect(drawnInsideWall).toBe(true);

  const end = await host.settled(aliceId);
  expect(end.x).toBeCloseTo(286, 0); // through the inner wall, flush before the outer one (not 260: that is inside it)
  expect(end.x).toBeLessThan(350 - 36 + 0.5); // in the corridor
  expect(end.y).toBeCloseTo(start.y, 0); // a straight line
  const after = await me(host, aliceId);
  expect(after?.alive).toBe(true);
  expect(after?.powers.phase).toBe(1); // one crossing, one charge
  expect(after?.dash).toBe('READY');

  // walls are solid again: pushing right stops flush against the wall she just came through
  await alice.thumbDown();
  await alice.thumbMove(FAR, 0);
  await sleep(700);
  await alice.thumbUp();
  expect((await host.body(aliceId)).x).toBeLessThanOrEqual(350 - 36 + 0.5);
});

test('Powerups: TWIN_THROW + BLAST_BOOMERANG — two boomerangs, the first armed, drawn separately; the armed one explodes at the arena edge and the pair comes home', async ({
  powerHost: host,
  newPhone,
}) => {
  const { alice, aliceId } = await setUp(host, newPhone);
  await expect
    .poll(async () => (await host.fu()).pickups.some((p) => p.kind === 'BLAST_BOOMERANG'), {
      timeout: 12_000,
    })
    .toBe(true);
  await goTo(host, alice, aliceId, 'spotEast', 10);
  await expect.poll(async () => holdsPower(host, aliceId, 'blast'), { timeout: 5_000 }).toBe(true);
  // the twin appears (the schedule's fifth pickup) on the first free spot, which — she is standing on it — is hers to take
  await expect.poll(async () => holdsPower(host, aliceId, 'twin'), { timeout: 12_000 }).toBe(true);

  const mine = async () => (await host.fu()).boomerangs.filter((b) => b.ownerId === aliceId);
  expect(await mine()).toHaveLength(2);
  expect((await mine()).every((b) => b.state === 'HELD')).toBe(true);

  await face(alice, 0, 1); // down the open right-hand lane, towards the arena edge
  await alice.tapThrow();
  await expect.poll(async () => (await mine())[0]?.state, { timeout: 3_000 }).not.toBe('HELD');
  expect((await mine())[0]?.blast).toBe(true); // her own boomerang is the armed one
  expect((await mine())[1]?.state).toBe('HELD'); // one press, one boomerang
  await alice.tapThrow();
  await expect.poll(async () => (await mine())[1]?.state, { timeout: 3_000 }).not.toBe('HELD');
  expect((await mine())[1]?.blast).toBe(false);
  // Phaser draws two boomerangs, each where the rules have it
  await expect
    .poll(async () => (await host.snapshot()).drawnBoomerangs?.map((b) => b.id).sort(), {
      timeout: 3_000,
    })
    .toEqual([aliceId, `${aliceId}#2`].sort());

  // the armed one detonates (spent) on reaching the edge, and then both come home and are caught
  await expect
    .poll(
      async () => {
        const [own] = await mine();
        return own !== undefined && own.state !== 'HELD' && !own.blast;
      },
      { timeout: 6_000 },
    )
    .toBe(true);
  await expect
    .poll(async () => (await mine()).every((b) => b.state === 'HELD'), { timeout: 10_000 })
    .toBe(true);
  expect((await me(host, aliceId))?.alive).toBe(true); // her own blast never hurts her
});
