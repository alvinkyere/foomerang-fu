import {
  GARDEN_ARENA,
  GARDEN_BOOK_SPOTS,
  GARDEN_SPAWNS,
  GARDEN_WALLS,
  DEFAULT_FU_CONFIG,
} from '@foomerang/foomerang-fu';
import { expect, sleep, test, type Host, type Phone } from './support/fixtures';

/**
 * GARDEN through the real path: phones → server → console → rules → renderer. Controllers are real touches on real
 * pages; positions are read back from the console's authoritative state, never written. Alice is slot 0 (spawn
 * GARDEN_SPAWNS[0]) and Bob slot 1 (GARDEN_SPAWNS[1]).
 */
const FAR = 140;
const R = DEFAULT_FU_CONFIG.playerRadius;
type Point = { x: number; y: number };
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const walls = GARDEN_ARENA.walls ?? [];

// --- a route over Garden's own geometry (the same walls the rules use), for walking a real thumb through its corridors ----
const STEP = 24;
const nx = Math.floor(GARDEN_ARENA.width / STEP) + 1;
const ny = Math.floor(GARDEN_ARENA.height / STEP) + 1;
const open = (i: number, j: number): boolean => {
  const x = i * STEP;
  const y = j * STEP;
  if (x < R + 8 || y < R + 8 || x > GARDEN_ARENA.width - R - 8 || y > GARDEN_ARENA.height - R - 8)
    return false;
  return !walls.some((w) => {
    const cx = Math.max(w.x, Math.min(x, w.x + w.width));
    const cy = Math.max(w.y, Math.min(y, w.y + w.height));
    return Math.hypot(x - cx, y - cy) < R + 12;
  });
};
function route(from: Point, to: Point): Point[] {
  const start: [number, number] = [Math.round(from.x / STEP), Math.round(from.y / STEP)];
  const goal: [number, number] = [Math.round(to.x / STEP), Math.round(to.y / STEP)];
  const prev = new Map<number, number>();
  const key = (i: number, j: number) => i * ny + j;
  const queue = [start];
  prev.set(key(...start), -1);
  for (let h = 0; h < queue.length; h += 1) {
    const [i, j] = queue[h] as [number, number];
    if (i === goal[0] && j === goal[1]) break;
    for (const [a, b] of [
      [i + 1, j],
      [i - 1, j],
      [i, j + 1],
      [i, j - 1],
      [i + 1, j + 1],
      [i - 1, j - 1],
      [i + 1, j - 1],
      [i - 1, j + 1],
    ] as [number, number][]) {
      if (a < 0 || b < 0 || a >= nx || b >= ny || prev.has(key(a, b)) || !open(a, b)) continue;
      if (a !== i && b !== j && (!open(a, j) || !open(i, b))) continue;
      prev.set(key(a, b), key(i, j));
      queue.push([a, b]);
    }
  }
  const path: Point[] = [];
  let at = key(...goal);
  if (!prev.has(at)) throw new Error(`no route to ${to.x},${to.y}`);
  while (at !== -1) {
    path.unshift({ x: Math.floor(at / ny) * STEP, y: (at % ny) * STEP });
    at = prev.get(at) as number;
  }
  return path;
}

/** Walks a held thumb along the route to `target`, re-aiming at each waypoint from the LIVE position. */
async function walkTo(
  host: Host,
  phone: Phone,
  id: string,
  target: Point,
  within = 30,
): Promise<void> {
  const path = route(await host.body(id), target);
  await phone.thumbDown();
  try {
    for (const way of [...path.slice(1), target]) {
      const deadline = Date.now() + 20_000;
      for (;;) {
        const here = await host.body(id);
        const d = dist(here, way);
        if (d <= (way === target ? within : 30)) break;
        if (Date.now() > deadline)
          throw new Error(`stuck on the way to ${way.x},${way.y} from ${here.x},${here.y}`);
        await phone.thumbMove(((way.x - here.x) / d) * FAR, ((way.y - here.y) / d) * FAR);
        await sleep(25);
      }
    }
  } finally {
    await phone.thumbUp();
  }
}

/** Points the thumb along `dir` for a moment: that sets the facing (and barely moves the body). */
async function face(phone: Phone, dir: Point): Promise<void> {
  const d = Math.hypot(dir.x, dir.y);
  await phone.thumbDown();
  await phone.thumbMove((dir.x / d) * FAR, (dir.y / d) * FAR);
  await sleep(90);
  await phone.thumbUp();
}

async function twoPhones(host: Host, newPhone: () => Promise<Phone>) {
  const code = await host.createRoom();
  const alice = await newPhone();
  const bob = await newPhone();
  await alice.join(code, 'Alice');
  await bob.join(code, 'Bob');
  await host.start();
  await host.waitForDrawn(2);
  return { alice, bob, aliceId: await host.playerId('Alice'), bobId: await host.playerId('Bob') };
}

test('Garden: the arena Phaser draws is the arena the rules use (the same walls), and everyone starts on their own Garden spawn', async ({
  hostAt,
  newPhone,
}) => {
  const host = await hostAt('?arena=garden&powerups=off');
  const { aliceId, bobId } = await twoPhones(host, newPhone);
  const snapshot = await host.snapshot();
  expect(snapshot.drawnWalls).toHaveLength(walls.length);
  expect(snapshot.drawnWalls).toEqual(walls.map((w) => ({ ...w })));
  expect(snapshot.game?.walls).toEqual(walls.map((w) => ({ ...w })));
  expect(await host.body(aliceId)).toEqual(GARDEN_SPAWNS[0]);
  expect(await host.body(bobId)).toEqual(GARDEN_SPAWNS[1]);
  await expect(host.page.getByLabel('Kill race')).toContainText('ROUND 1 / 9');
});

test('Garden: MOVE and wall collision — a thumb walks Alice up into the top wall and she stops flush against it, as drawn', async ({
  hostAt,
  newPhone,
}) => {
  const host = await hostAt('?arena=garden&powerups=off');
  const { alice, aliceId } = await twoPhones(host, newPhone);
  const h1 = GARDEN_WALLS.find((w) => w.id === 'H1');
  if (h1 === undefined) throw new Error('H1');
  await alice.thumbDown();
  await alice.thumbMove(0, -FAR);
  await expect
    .poll(async () => (await host.body(aliceId)).y, { timeout: 8_000 })
    .toBeLessThan(h1.y + h1.height + R + 1);
  await sleep(400);
  await alice.thumbUp();
  const at = await host.body(aliceId);
  expect(at.x).toBeCloseTo(GARDEN_SPAWNS[0]?.x ?? 0, 3);
  expect(at.y).toBeCloseTo(h1.y + h1.height + R, 1); // flush with the wall's south face, not inside it
  // what Phaser drew is where the rules put her
  const drawn = (await host.snapshot()).drawn?.find((c) => c.id === aliceId);
  expect(drawn?.y).toBeCloseTo(at.y, 1);
});

test('Garden: player/player collision — Alice walks through the corridors to Bob and cannot enter him', async ({
  hostAt,
  newPhone,
}) => {
  test.setTimeout(120_000);
  const host = await hostAt('?arena=garden&powerups=off&kills=14');
  const { alice, aliceId, bobId } = await twoPhones(host, newPhone);
  const bob = await host.body(bobId);
  await walkTo(host, alice, aliceId, { x: bob.x + 130, y: bob.y });
  await alice.thumbDown();
  await alice.thumbMove(-FAR, 0); // keep pushing into him
  await sleep(1200);
  const here = await host.body(aliceId);
  await alice.thumbUp();
  expect(dist(here, await host.body(bobId))).toBeGreaterThanOrEqual(2 * R - 1);
  expect(dist(here, await host.body(bobId))).toBeLessThan(2 * R + 12);
});

test('Garden: THROW goes out, hits the wall, comes RETURNING and is caught; DASH moves a set distance; SLASH swings', async ({
  hostAt,
  newPhone,
}) => {
  const host = await hostAt('?arena=garden&powerups=off');
  const { alice, aliceId } = await twoPhones(host, newPhone);
  const mine = async () => (await host.fu()).boomerangs.find((b) => b.ownerId === aliceId)?.state;
  await face(alice, { x: 1, y: 0 }); // east, down the open lane: out to the wall at x = 690, then home
  await alice.tapThrow();
  const seen = new Set<string>();
  const until = Date.now() + 6_000;
  while (Date.now() < until) {
    const s = await mine();
    if (s !== undefined) seen.add(s);
    if (seen.has('RETURNING') && s === 'HELD') break;
    await sleep(8);
  }
  expect(seen.has('THROWN')).toBe(true);
  expect(seen.has('RETURNING')).toBe(true);
  expect(await mine()).toBe('HELD');

  // DASH (west, along the open top lane): exactly the configured burst
  const before = await host.body(aliceId);
  await face(alice, { x: -1, y: 0 });
  const start = await host.body(aliceId);
  await alice.tapDash();
  await sleep(500);
  const after = await host.body(aliceId);
  expect(Math.abs(after.x - start.x)).toBeGreaterThan(100);
  expect(Math.abs(after.x - start.x)).toBeLessThanOrEqual(
    DEFAULT_FU_CONFIG.dashSpeed * DEFAULT_FU_CONFIG.dashSeconds + 24,
  );
  void before;

  // SLASH: the swing is ACTIVE for a moment, then recovers
  await alice.tapSlash();
  let swung = false;
  for (let i = 0; i < 40 && !swung; i += 1) {
    swung = (await host.fu()).players.find((p) => p.id === aliceId)?.slash !== 'READY';
    await sleep(8);
  }
  expect(swung).toBe(true);
});

test('Garden: a kill fills a hole, a round ends and the next begins — Alice walks to Bob, slashes, and the race and the round move on', async ({
  hostAt,
  newPhone,
}) => {
  test.setTimeout(120_000);
  const host = await hostAt('?arena=garden&powerups=off&kills=14');
  const { alice, aliceId, bobId } = await twoPhones(host, newPhone);
  const bob = await host.body(bobId);
  await walkTo(host, alice, aliceId, { x: bob.x + 100, y: bob.y }, 20);
  await face(alice, { x: -1, y: 0 });
  await alice.tapSlash();
  await expect.poll(async () => (await host.fu()).scores[aliceId], { timeout: 6_000 }).toBe(1);
  await expect(
    host.page.getByLabel('Kill race').getByRole('img', { name: 'Alice: 1 of 14 kills' }),
  ).toBeVisible();
  expect((await host.fu()).players.find((p) => p.id === bobId)?.alive).toBe(false);
  // the round ends; the next one starts with everyone back on their spawn, the kill kept
  await expect.poll(async () => (await host.fu()).round, { timeout: 10_000 }).toBe(2);
  const next = await host.fu();
  expect(next.scores[aliceId]).toBe(1);
  expect(await host.body(aliceId)).toEqual(GARDEN_SPAWNS[0]);
  expect(await host.body(bobId)).toEqual(GARDEN_SPAWNS[1]);
});

test('Garden: a real controller deflects an incoming boomerang with a timed SLASH along a Garden corridor', async ({
  hostAt,
  newPhone,
}) => {
  test.setTimeout(120_000);
  const host = await hostAt('?arena=garden&powerups=off&kills=14');
  const { alice, bob, aliceId, bobId } = await twoPhones(host, newPhone);
  // Bob stays on his spawn (bottom-left lane); Alice comes to 340 east of him along the open lane, faces him and throws.
  const bobAt = await host.body(bobId);
  const lane = { x: bobAt.x + 340, y: bobAt.y };
  await walkTo(host, alice, aliceId, lane, 22);
  await face(alice, { x: -1, y: 0 });
  await face(bob, { x: 1, y: 0 });
  let slashed = false;
  const reflexes = (async () => {
    const until = Date.now() + 6_000;
    while (Date.now() < until && !slashed) {
      const fu = await host.fu();
      const b = fu.boomerangs.find((x) => x.ownerId === aliceId);
      const me = await host.body(bobId);
      if (b?.state === 'THROWN' && Math.hypot(b.x - me.x, b.y - me.y) <= 200) {
        slashed = true;
        await bob.tapSlash();
      }
      await sleep(2);
    }
  })();
  await alice.tapThrow();
  let deflected = false;
  let bobDied = false;
  const until = Date.now() + 8_000;
  while (Date.now() < until) {
    const fu = await host.fu();
    const b = fu.boomerangs.find((x) => x.ownerId === aliceId);
    if (fu.players.find((p) => p.id === bobId)?.alive === false) bobDied = true;
    if (b?.state === 'DEFLECTED' && b.deflectedBy === bobId) deflected = true;
    if (deflected && b?.state === 'HELD') break;
    await sleep(6);
  }
  await reflexes;
  expect(slashed).toBe(true);
  expect(bobDied).toBe(false);
  expect(deflected).toBe(true);
});

test('Garden: a Book is a mystery until taken; taking it (through the corridors) grants PHASE_DASH, and a real DASH then goes through a Garden wall', async ({
  hostAt,
  newPhone,
}) => {
  test.setTimeout(150_000);
  const host = await hostAt('?arena=garden&powerups=fast&enable=PHASE_DASH&kills=14');
  const { alice, aliceId } = await twoPhones(host, newPhone);
  await expect
    .poll(async () => (await host.fu()).pickups.length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const book = (await host.fu()).pickups[0];
  if (book === undefined) throw new Error('no Book');
  expect(GARDEN_BOOK_SPOTS.some((p) => p.x === book.x && p.y === book.y)).toBe(true);
  expect(Object.keys(book).sort()).toEqual(['id', 'x', 'y']); // it names nothing
  await walkTo(host, alice, aliceId, { x: book.x, y: book.y }, 18);
  await expect
    .poll(async () => (await host.fu()).players.find((p) => p.id === aliceId)?.inventory, {
      timeout: 8_000,
    })
    .toEqual(['PHASE_DASH']);

  // stand just south of H6 (a stone wall 36 thick) and dash north through it
  const h6 = GARDEN_WALLS.find((w) => w.id === 'H6');
  if (h6 === undefined) throw new Error('H6');
  const below = { x: h6.x + 208, y: h6.y + h6.height + R + 20 };
  await walkTo(host, alice, aliceId, below, 14);
  await face(alice, { x: 0, y: -1 });
  await alice.tapDash();
  let inWall = false;
  const until = Date.now() + 2_000;
  while (Date.now() < until) {
    const p = (await host.fu()).players.find((q) => q.id === aliceId);
    if (p?.inWall === true) inWall = true;
    await sleep(6);
  }
  const end = await host.body(aliceId);
  expect(inWall, 'the body was inside the wall during the phase').toBe(true);
  expect(end.y).toBeLessThan(h6.y - R + 4); // came out the north side
});
