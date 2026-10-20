import { expect, sleep, test } from './support/fixtures';

test('Foomerang Fu: one real controller plays a mixed match against a Medium and a Hard CPU, started from the lobby', async ({
  fuHost: host,
  newPhone,
}) => {
  const code = await host.createRoom();
  const alice = await newPhone();
  await alice.join(code, 'Alice');

  // One person alone is not a match: once she is READY on a character, begin still waits for two participants.
  await alice.ready();
  await expect(host.startButton).toBeDisabled();
  await host.addCpu('Medium');
  await host.addCpu('Hard');
  await expect(host.startButton).toBeEnabled();
  await expect(host.filledSeats).toHaveCount(3);
  await expect(host.cpuSeat(1)).toContainText('Medium');
  await expect(host.cpuSeat(2)).toContainText('Hard');

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
  for (let i = 0; i < 5; i += 1) await host.addCpu('Easy');
  await expect(host.page.getByRole('button', { name: 'One bot more' })).toBeDisabled(); // six is the most
  await expect(host.filledSeats).toHaveCount(6);
  await host.removeCpu(3);
  await expect(host.filledSeats).toHaveCount(5);
  await host.cpuSeat(5).focus();
  await host.page.keyboard.press('ArrowRight'); // Easy -> Medium
  await host.page.keyboard.press('ArrowRight'); // Medium -> Hard
  await expect(host.cpuSeat(5)).toContainText('Hard');
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
test('six Hard CPUs on a reconstructed map (the stress case, nobody on a phone): host frame rate, frame time, CPU decision cost and discarded simulation', async ({
  browser,
  stack,
}) => {
  test.skip(process.env['FOOMERANG_E2E_CPU6'] !== '1', 'opt-in: pnpm e2e:cpu6');
  const SECONDS = Number(process.env['FOOMERANG_E2E_CPU6_SECONDS'] ?? 60);
  test.setTimeout((SECONDS + 60) * 1000);
  const [vw, vh] = (process.env['FOOMERANG_E2E_VIEWPORT'] ?? '1600x900').split('x').map(Number);
  const context = await browser.newContext({ viewport: { width: vw ?? 1600, height: vh ?? 900 } });
  const { Host: HostClass } = await import('./support/fixtures');
  const arena = process.env['FOOMERANG_E2E_ARENA'] ?? 'market_plaza';
  const host = new HostClass(
    await context.newPage(),
    `${stack.consoleUrl}/?arena=${arena}&kills=14&powerups=high`,
  );
  await host.open();
  const throttle = Number(process.env['FOOMERANG_E2E_CPU_THROTTLE'] ?? 1);
  if (throttle > 1) {
    // emulate a slower host (a TV-class device): Chrome slows the page's main thread by this factor
    const cdp = await context.newCDPSession(host.page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }
  try {
    await host.createRoom();
    const count = Number(process.env['FOOMERANG_E2E_CPUS'] ?? 6);
    for (let i = 0; i < count; i += 1) await host.addCpu('Hard');
    await host.start();
    await host.autoContinue(); // keep the CPUs playing round after round (the scoreboard waits for CONTINUE)
    await host.waitForDrawn(count);
    // every frame's interval, from the page's own animation frames (for percentiles and the 1% low)
    await host.page.evaluate(() => {
      const w = window as unknown as { __ft: number[] };
      w.__ft = [];
      let last = performance.now();
      const tick = (t: number): void => {
        w.__ft.push(t - last);
        last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
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
    const ft = (
      await host.page.evaluate(() => (window as unknown as { __ft: number[] }).__ft)
    ).slice(1);
    const fts = [...ft].sort((a, b) => a - b);
    const pct = (q: number): number =>
      fts[Math.min(fts.length - 1, Math.floor(q * fts.length))] ?? 0;
    const total = ft.reduce((a, b) => a + b, 0);
    const worst1 = fts.slice(Math.floor(fts.length * 0.99));
    const env = await host.page.evaluate(() => {
      const c = document.querySelector('[data-testid="arena"] canvas') as HTMLCanvasElement | null;
      return {
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio,
        backing: c === null ? 'none' : `${c.width}x${c.height}`,
        cores: navigator.hardwareConcurrency,
      };
    });
    const report = [
      `${count} Hard CPUs on ${arena}, ${SECONDS}s, viewport ${vw}x${vh}, CPU throttle ${throttle}x, dev console, headless Chrome`,
      `browser ${env.ua}; DPR ${env.dpr}; canvas backing ${env.backing}; ${env.cores} logical cores`,
      `per-frame: n=${ft.length} average FPS ${((ft.length / total) * 1000).toFixed(2)}, 1% low FPS ${(1000 / (worst1.reduce((a, b) => a + b, 0) / Math.max(worst1.length, 1))).toFixed(2)}, frame time p50 ${pct(0.5).toFixed(2)} p95 ${pct(0.95).toFixed(2)} p99 ${pct(0.99).toFixed(2)} max ${(fts.at(-1) ?? 0).toFixed(1)} ms`,
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
