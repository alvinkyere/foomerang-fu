import {
  createControllerSession,
  createSocketIOTransportFactory,
  type ControllerSession,
} from '@foomerang/controller-sdk';
import { expect, sleep, test } from './support/fixtures';

/**
 * OPT-IN soak (pnpm e2e:six): SIX simulated players on the real server, the production console in
 * real Chrome, for FOOMERANG_E2E_SIX_SECONDS (default 90). The controllers are the real controller
 * SDK (real 60 Hz sampler, heartbeats, Socket.IO) running in Node with random-walk thumbs — NOT
 * phones. It answers "does the host stay near 60 FPS with six players' traffic?", nothing more.
 */
const SECONDS = Number(process.env['FOOMERANG_E2E_SIX_SECONDS'] ?? 90);

/** Small deterministic PRNG so a run is repeatable. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const number = (text: string, label: string): number | undefined => {
  const match = new RegExp(`${label}\\s*\\n?\\s*([0-9.]+)`).exec(text);
  return match?.[1] === undefined ? undefined : Number(match[1]);
};

test.setTimeout((SECONDS + 90) * 1000);

test(`six simulated players for ${SECONDS}s: host frame rate and simulation health`, async ({
  productionHost: host,
  stack,
}) => {
  const code = await host.createRoom();
  const sessions: ControllerSession[] = [];
  try {
    for (let i = 1; i <= 6; i += 1) {
      const session = createControllerSession({
        transportFactory: createSocketIOTransportFactory(stack.serverUrl),
      });
      session.join(code, `Sim${i}`);
      sessions.push(session);
    }
    await expect
      .poll(() => sessions.every((s) => s.getState().phase === 'READY'), { timeout: 15_000 })
      .toBe(true);
    await expect(host.filledSeats).toHaveCount(6);

    await host.start();
    await expect(host.page.getByTestId('arena').locator('canvas')).toBeVisible();
    await host.page.keyboard.press('d');

    // Each player's thumb wanders: new direction every 100-500 ms, releasing about one time in six.
    const timers = sessions.map((session, index) => {
      const random = mulberry32(1000 + index);
      let stop = false;
      const loop = async (): Promise<void> => {
        while (!stop) {
          if (random() < 1 / 6) session.setControlValue('MOVE', { x: 0, y: 0 });
          else {
            const angle = random() * Math.PI * 2;
            session.setControlValue('MOVE', { x: Math.cos(angle), y: Math.sin(angle) });
          }
          await sleep(100 + random() * 400);
        }
      };
      void loop();
      return () => {
        stop = true;
      };
    });

    const fps: number[] = [];
    const frameMax: number[] = [];
    let last = '';
    const end = Date.now() + SECONDS * 1000;
    while (Date.now() < end) {
      await sleep(2_000);
      last = await host.page.getByLabel('Debug overlay').innerText();
      const f = number(last, 'FPS \\(rendered frames\\)');
      if (f !== undefined) fps.push(f);
      const m = /Frame time mean \/ max\s*\n?\s*[0-9.]+ \/ ([0-9.]+)/.exec(last);
      if (m?.[1] !== undefined) frameMax.push(Number(m[1]));
    }
    for (const stop of timers) stop();

    const sorted = [...fps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const report = [
      `six simulated players, ${SECONDS}s, production console, headless Chrome`,
      `FPS samples (every 2 s, each a 120-frame mean): n=${fps.length} min=${sorted[0]} median=${median} max=${sorted.at(-1)}`,
      `worst frame time seen in any window: ${Math.max(...frameMax)} ms`,
      'final overlay:',
      last,
    ].join('\n');
    console.log(report);
    test.info().annotations.push({ type: 'six-player report', description: report });

    expect(number(last, 'Players in match')).toBe(6);
    expect(fps.length).toBeGreaterThan(5);
  } finally {
    for (const session of sessions) session.dispose();
  }
});
