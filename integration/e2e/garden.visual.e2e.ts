import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Host } from './support/fixtures';

/**
 * The visual-fidelity evidence for Garden: the canvas as the canonical camera draws it, written to docs/garden/ so it can be
 * overlaid on "Garden Map - Fu". (Run with FOOMERANG_GARDEN_SHOTS=1 to write them; the test otherwise only checks that the
 * arena draws.)
 */
const OUT = join(process.cwd(), '..', 'docs', 'garden');

async function addCpu(host: Host, difficulty: 'Easy' | 'Medium' | 'Hard'): Promise<void> {
  await host.page.getByLabel('New CPU difficulty').selectOption({ label: difficulty });
  await host.page.getByRole('button', { name: 'Add CPU' }).click();
}

test('Garden draws: the canonical canvas, with four characters in it', async ({ hostAt }) => {
  test.setTimeout(120_000);
  const host = await hostAt('?arena=garden&powerups=off&kills=13');
  await host.createRoom();
  for (const d of ['Easy', 'Medium', 'Hard', 'Easy'] as const) await addCpu(host, d);
  await host.start();
  await host.waitForDrawn(4);
  await host.page.waitForTimeout(1500);
  const canvas = host.page.getByTestId('arena').locator('canvas');
  await expect(canvas).toBeVisible();
  if (process.env['FOOMERANG_GARDEN_SHOTS'] === '1') {
    mkdirSync(OUT, { recursive: true });
    await canvas.screenshot({ path: join(OUT, 'implementation.png') });
  }
});
