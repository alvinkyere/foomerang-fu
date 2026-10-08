import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './support/fixtures';

/**
 * The maps reconstructed from the master gameplay video running in the REAL game: rules → console → Phaser. Six CPUs play on
 * each; the renderer draws from the authoritative view only. Run with FOOMERANG_PLAZA_SHOTS=1 to write runtime screenshots
 * next to the reconstruction (art/reconstruction/output/runtime/<map>/) for the reference-vs-runtime comparison.
 */
const OUT = join(process.cwd(), '..', 'art', 'reconstruction', 'output', 'runtime');

for (const map of ['market_plaza', 'harbour_fort', 'sky_islands', 'pond_garden'] as const)
  test(`${map} draws in the real game: six CPUs, baked layers and pack characters, no errors`, async ({
    hostAt,
  }) => {
    test.setTimeout(180_000);
    const host = await hostAt(`?arena=${map}&powerups=normal&kills=14`);
    await host.createRoom();
    for (const d of ['Hard', 'Hard', 'Medium', 'Medium', 'Easy', 'Hard'] as const)
      await host.addCpu(d);
    await host.start();
    await host.waitForDrawn(6);
    // (in dev, React's double mount briefly leaves a cancelled renderer's canvas until its next frame tears it down)
    await expect.poll(() => host.page.getByTestId('arena').locator('canvas').count()).toBe(1);
    const canvas = host.page.getByTestId('arena').locator('canvas');
    await expect(canvas).toBeVisible();
    const snapshot = await host.snapshot();
    expect(snapshot.drawn?.length ?? 0).toBeGreaterThanOrEqual(6);
    if (process.env['FOOMERANG_PLAZA_SHOTS'] === '1') {
      mkdirSync(join(OUT, map), { recursive: true });
      for (let i = 0; i < 6; i += 1) {
        await host.page.waitForTimeout(1500);
        await canvas.screenshot({ path: join(OUT, map, `runtime_${i}.png`) });
      }
    }
    expect(host.errors).toEqual([]);
  });
