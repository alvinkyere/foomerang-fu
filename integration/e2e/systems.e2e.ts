import { expect, sleep, test, type Host, type Phone } from './support/fixtures';

// Slice 6 through the real path: real touches → server → console → rules → Phaser, in the experimental
// arena (`?arena=systems`). The browser sees the rules' state through the read-only debug hook and what
// Phaser drew; it never changes either.

type Point = { x: number; y: number };
const FAR = 140;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

async function steer(
  host: Host,
  phone: Phone,
  id: string,
  target: Point | (() => Promise<Point>),
  within = 14,
) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const here = await host.body(id);
    const goal = typeof target === 'function' ? await target() : target;
    const d = dist(here, goal);
    if (d <= within) return;
    if (Date.now() > deadline)
      throw new Error(`never reached ${JSON.stringify(goal)} from ${JSON.stringify(here)}`);
    await phone.thumbMove(((goal.x - here.x) / d) * FAR, ((goal.y - here.y) / d) * FAR);
    await sleep(15);
  }
}
async function walk(
  host: Host,
  phone: Phone,
  id: string,
  legs: (Point | (() => Promise<Point>))[],
  within = 14,
) {
  await phone.thumbDown();
  try {
    for (const [i, leg] of legs.entries())
      await steer(host, phone, id, leg, i === legs.length - 1 ? within : 24);
  } finally {
    await phone.thumbUp();
  }
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
const systems = async (host: Host) => (await host.fu()).systems;
const alive = async (host: Host, id: string) =>
  (await host.fu()).players.find((p) => p.id === id)?.alive;

test('Arena systems: a timed GATE is readable before it closes, blocks a real walker while closed, and lets them through when it opens again', async ({
  systemsHost: host,
  newPhone,
}) => {
  const { alice, aliceId } = await setUp(host, newPhone);
  // from the top-left spawn down the open left flank (round the flank cover) to the doorway of the left gate (x 470–520, y 400–500)
  await walk(
    host,
    alice,
    aliceId,
    [
      { x: 110, y: 320 },
      { x: 420, y: 320 },
      { x: 420, y: 450 },
    ],
    12,
  );
  await host.settled(aliceId);

  // the telegraph: OPEN, then CLOSING (still passable), then CLOSED — Phaser draws the same status the rules have
  const seen: string[] = [];
  const until = Date.now() + 9_000;
  while (Date.now() < until) {
    const snap = await host.snapshot();
    const status = snap.game?.systems.gates[0]?.status;
    if (status !== undefined && seen.at(-1) !== status) seen.push(status);
    if (status !== undefined && snap.drawnSystems?.gates[0]?.status !== undefined) {
      expect(['OPEN', 'CLOSING', 'CLOSED']).toContain(snap.drawnSystems.gates[0].status);
    }
    if (status === 'CLOSED') break;
    await sleep(30);
  }
  expect(seen.slice(-2)).toEqual(['CLOSING', 'CLOSED']); // she was warned before it shut
  const shut = await host.snapshot();
  expect(shut.drawnSystems?.gates[0]?.status).toBe('CLOSED'); // and Phaser agrees

  // closed: pushing into it stops flush against it
  await alice.thumbDown();
  await alice.thumbMove(FAR, 0);
  await sleep(900);
  expect((await host.body(aliceId)).x).toBeLessThanOrEqual(470 - 36 + 0.5);
  expect((await systems(host)).gates[0]?.status).toBe('CLOSED');

  // it opens on schedule and she walks straight through
  await expect
    .poll(async () => (await systems(host)).gates[0]?.status, { timeout: 12_000, intervals: [50] })
    .toBe('OPEN');
  await expect
    .poll(async () => (await host.body(aliceId)).x, { timeout: 4_000 })
    .toBeGreaterThan(560);
  await alice.thumbUp();
  expect(await alive(host, aliceId)).toBe(true);
});

test('Arena systems: a moving PLATFORM carries a rider (who keeps control), and a rider is not touched by the lethal floor it crosses', async ({
  systemsHost: host,
  newPhone,
}) => {
  const { alice, aliceId } = await setUp(host, newPhone);
  const platform = async () => {
    const r = (await systems(host)).platforms[0]?.rect ?? { x: 0, y: 0, width: 0, height: 0 };
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  // along the open top lane, then down onto the platform's live centre (the strip is still SAFE this early)
  await walk(host, alice, aliceId, [{ x: 700, y: 110 }, platform], 10);
  const t0 = (await host.fu()).roundTime;
  const p0 = await platform();
  const a0 = await host.body(aliceId);
  // standing still (thumb up), she is carried: she moves exactly as the platform does
  await sleep(1_000);
  const a1 = await host.body(aliceId);
  const p1 = await platform();
  expect(Math.abs(p1.x - p0.x)).toBeGreaterThan(20); // it really moved
  expect(a1.x - a0.x).toBeCloseTo(p1.x - p0.x, -1);
  expect(Math.abs(a1.y - a0.y)).toBeLessThan(12);
  expect((await host.snapshot()).drawn?.find((d) => d.id === aliceId)?.x).toBeCloseTo(a1.x, -1); // Phaser draws her carried (she is still moving between the two reads)
  expect((await host.fu()).roundTime).toBeGreaterThan(t0);

  // she keeps control: a push sideways adds to the ride
  await alice.thumbDown();
  await alice.thumbMove(0, -FAR);
  await sleep(120);
  await alice.thumbUp();
  expect((await host.body(aliceId)).y).toBeLessThan(a1.y - 20);

  // and the floor under the platform turns lethal around her without touching her: put her back on it and ride through ACTIVE
  await walk(host, alice, aliceId, [platform], 12);
  let sawActive = false;
  const until = Date.now() + 14_000;
  while (Date.now() < until) {
    const snap = await host.snapshot();
    const h = snap.game?.systems.hazards[0];
    const me = snap.game?.players.find((p) => p.id === aliceId);
    const rect = snap.game?.systems.platforms[0]?.rect;
    const body = snap.bodies.find((b) => b.id === aliceId);
    if (h?.phase === 'ACTIVE') sawActive = true;
    expect(me?.alive, `during ${h?.phase}`).toBe(true);
    if (rect !== undefined && body !== undefined && h?.phase === 'ACTIVE') {
      const onIt =
        body.x >= rect.x &&
        body.x <= rect.x + rect.width &&
        body.y >= rect.y &&
        body.y <= rect.y + rect.height;
      if (!onIt)
        await steerBack(host, alice, aliceId, {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
        });
    }
    if (sawActive && h?.phase === 'SAFE') break;
    await sleep(40);
  }
  expect(sawActive).toBe(true);
  expect(await alive(host, aliceId)).toBe(true);
});

/** (a gentle nudge back onto the platform if a held thumb drifted her off: she must stay on it for the whole ACTIVE window) */
async function steerBack(host: Host, phone: Phone, id: string, target: Point) {
  await phone.thumbDown();
  try {
    await steer(host, phone, id, target, 15);
  } finally {
    await phone.thumbUp();
  }
}

test('Arena systems: the lethal FLOOR is telegraphed SAFE → WARNING → ACTIVE, harmless until ACTIVE, and kills a player who stays on it', async ({
  systemsHost: host,
  newPhone,
}) => {
  const { alice, aliceId, bobId } = await setUp(host, newPhone);
  // wait at the strip's edge on the open top lane (x 680), off the platform's path side
  await walk(
    host,
    alice,
    aliceId,
    [
      { x: 680, y: 110 },
      { x: 680, y: 200 },
    ],
    10,
  );
  await host.settled(aliceId);
  expect((await systems(host)).hazards[0]?.phase).toBe('SAFE');

  // WARNING is announced (and drawn) before it is dangerous
  await expect
    .poll(async () => (await systems(host)).hazards[0]?.phase, { timeout: 10_000, intervals: [30] })
    .toBe('WARNING');
  const warning = await host.snapshot();
  expect(warning.drawnSystems?.hazards[0]?.phase).toBeDefined();
  expect(warning.game?.systems.hazards[0]?.secondsToChange).toBeGreaterThan(0.5); // long enough to read and act

  // she steps onto the strip during the warning and stops in the middle of it: untouched
  await walk(host, alice, aliceId, [{ x: 680, y: 300 }], 8);
  expect((await host.body(aliceId)).y).toBeGreaterThan(245);
  expect((await host.body(aliceId)).y).toBeLessThan(345);
  expect((await systems(host)).hazards[0]?.phase).toBe('WARNING');
  expect(await alive(host, aliceId)).toBe(true);

  // she stays; ACTIVE arrives on schedule and kills her, and Bob wins the round
  await expect
    .poll(async () => (await systems(host)).hazards[0]?.phase, { timeout: 4_000, intervals: [20] })
    .toBe('ACTIVE');
  await expect.poll(async () => alive(host, aliceId), { timeout: 2_000 }).toBe(false);
  const fu = await host.fu();
  expect(fu.phase).toBe('ROUND_OVER');
  expect(fu.winnerId).toBe(bobId);

  // and the next round starts with the clock at zero and the floor SAFE again
  await expect.poll(async () => (await host.fu()).round, { timeout: 10_000 }).toBe(2);
  const next = await host.fu();
  expect(next.roundTime).toBeLessThan(2);
  expect(next.systems.hazards[0]?.phase).toBe('SAFE');
});
