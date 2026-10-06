import { expect, sleep, test, type Host } from './support/fixtures';

/** Chooses a difficulty in the lobby and adds a CPU, exactly as a host with a mouse would. */
async function addCpu(host: Host, difficulty: 'Easy' | 'Medium' | 'Hard'): Promise<void> {
  await host.page.getByLabel('New CPU difficulty').selectOption({ label: difficulty });
  await host.page.getByRole('button', { name: 'Add CPU' }).click();
}

test('Foomerang Fu: one real controller plays a mixed match against a Medium and a Hard CPU, started from the lobby', async ({
  fuHost: host,
  newPhone,
}) => {
  const code = await host.createRoom();
  const alice = await newPhone();
  await alice.join(code, 'Alice');

  // One person alone is not a match: Start waits until there are two participants.
  await expect(host.page.getByRole('button', { name: 'Start' })).toBeDisabled();
  await addCpu(host, 'Medium');
  await addCpu(host, 'Hard');
  await expect(host.page.getByRole('button', { name: 'Start' })).toBeEnabled();
  const rows = host.page.getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText('CPU 1');
  await expect(rows.nth(2)).toContainText('CPU 2');
  await expect(host.page.getByLabel('Difficulty of CPU 1')).toHaveValue('MEDIUM');
  await expect(host.page.getByLabel('Difficulty of CPU 2')).toHaveValue('HARD');

  await host.start();
  await host.waitForDrawn(3);
  const aliceId = await host.playerId('Alice');

  // The server only ever knew the person; the CPUs are bodies with software controllers.
  const snapshot = await host.snapshot();
  expect(snapshot.roster.map((r) => r.displayName)).toEqual(['Alice']);
  expect(snapshot.game?.players.map((p) => p.id)).toEqual([aliceId, 'cpu:1', 'cpu:2']);
  expect(snapshot.game?.cpus.map((c) => [c.id, c.difficulty])).toEqual([
    ['cpu:1', 'MEDIUM'],
    ['cpu:2', 'HARD'],
  ]);

  // The real controller still works, through the network path, in the same match: a press leaves her hand.
  await alice.tapThrow();
  await expect
    .poll(async () => (await host.fu()).boomerangs.find((b) => b.ownerId === aliceId)?.state, {
      timeout: 3_000,
    })
    .not.toBe('HELD');

  // The CPUs play: they move, and between them use the same buttons a person has.
  await expect
    .poll(
      async () => {
        const fu = await host.fu();
        return fu.cpus.reduce((n, c) => n + c.throws + c.slashes + c.dashes, 0);
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  const fu = await host.fu();
  expect(fu.cpuDecisionMs.decisions).toBeGreaterThan(100);
  expect(fu.cpuDecisionMs.meanMs).toBeLessThan(2);
  // Everything is drawn: three circles, one per participant, with the CPUs named.
  expect((await host.snapshot()).drawn).toHaveLength(3);
});

test('Foomerang Fu: a CPU can be removed and its difficulty changed before the match, and a full table stops at six', async ({
  fuHost: host,
  newPhone,
}) => {
  const code = await host.createRoom();
  const alice = await newPhone();
  await alice.join(code, 'Alice');
  for (let i = 0; i < 5; i += 1) await addCpu(host, 'Easy');
  await expect(host.page.getByRole('button', { name: 'Add CPU' })).toBeDisabled();
  await expect(host.page.getByRole('listitem')).toHaveCount(6);
  await host.page.getByRole('button', { name: 'Remove CPU 3' }).click();
  await expect(host.page.getByRole('listitem')).toHaveCount(5);
  await host.page.getByLabel('Difficulty of CPU 5').selectOption({ label: 'Hard' });
  await host.start();
  await host.waitForDrawn(5);
  const fu = await host.fu();
  expect(fu.cpus.map((c) => [c.id, c.difficulty])).toEqual([
    ['cpu:1', 'EASY'],
    ['cpu:2', 'EASY'],
    ['cpu:4', 'EASY'],
    ['cpu:5', 'HARD'],
  ]);
});

/**
 * OPT-IN (FOOMERANG_E2E_CPU6=1): a full table of six, the most the game allows — one idle controller and
 * five Hard CPUs (a lobby always has a person; six Hard CPUs with no one at the table are measured by the
 * evaluation harness without a browser). Reports the host's frame rate, what deciding for the CPUs costs
 * per step, and how much simulation time the host had to discard.
 */
test('six Hard CPUs on Garden (the stress case, nobody on a phone): host frame rate, frame time, CPU decision cost and discarded simulation', async ({
  browser,
  stack,
}) => {
  test.skip(process.env['FOOMERANG_E2E_CPU6'] !== '1', 'opt-in: pnpm e2e:cpu6');
  const SECONDS = Number(process.env['FOOMERANG_E2E_CPU6_SECONDS'] ?? 60);
  test.setTimeout((SECONDS + 60) * 1000);
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const { Host: HostClass } = await import('./support/fixtures');
  const arena = process.env['FOOMERANG_E2E_ARENA'] ?? 'garden';
  const host = new HostClass(
    await context.newPage(),
    `${stack.consoleUrl}/?arena=${arena}&kills=14&powerups=high`,
  );
  await host.open();
  try {
    await host.createRoom();
    const count = Number(process.env['FOOMERANG_E2E_CPUS'] ?? 6);
    for (let i = 0; i < count; i += 1) await addCpu(host, 'Hard');
    await host.start();
    await host.waitForDrawn(count);
    const fps: number[] = [];
    const frameMean: number[] = [];
    const frameMax: number[] = [];
    const end = Date.now() + SECONDS * 1000;
    while (Date.now() < end) {
      await sleep(2_000);
      const m = (await host.snapshot()).metrics;
      if (m.fps !== undefined) fps.push(m.fps);
      if (m.frameMs !== undefined) frameMean.push(m.frameMs);
      if (m.frameMaxMs !== undefined) frameMax.push(m.frameMaxMs);
    }
    const snapshot = await host.snapshot();
    const sorted = [...fps].sort((a, b) => a - b);
    const report = [
      `${count} Hard CPUs on ${arena}, ${SECONDS}s, dev console, headless Chrome`,
      `FPS samples: n=${fps.length} min=${sorted[0]?.toFixed(2)} median=${sorted[Math.floor(sorted.length / 2)]?.toFixed(2)} max=${sorted.at(-1)?.toFixed(2)}`,
      `frame time: mean of means ${(frameMean.reduce((a, b) => a + b, 0) / Math.max(frameMean.length, 1)).toFixed(2)} ms, worst frame in any window ${Math.max(0, ...frameMax).toFixed(1)} ms`,
      `CPU decisions: ${JSON.stringify(snapshot.game?.cpuDecisionMs)}`,
      `simulation steps ${snapshot.metrics.simulationSteps}, catch-up frames ${snapshot.metrics.catchUpFrames}, discard events ${snapshot.metrics.discardEvents}, discarded simulation ${snapshot.metrics.discardedSimulationMs} ms`,
    ].join('\n');
    console.log(report);
    test.info().annotations.push({ type: 'cpu6 report', description: report });
    expect(fps.length).toBeGreaterThan(5);
  } finally {
    expect(host.errors).toEqual([]);
    await context.close();
  }
});
