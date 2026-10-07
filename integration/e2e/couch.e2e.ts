import type { Locator } from '@playwright/test';
import { expect, test, type Host, type Phone } from './support/fixtures';

/**
 * Checkpoint B's couch test. The TV opens the room (until Checkpoint C, a phone can only connect to a
 * room that exists) and is then never touched again: no keyboard, no mouse. One phone runs the lobby,
 * starts, plays, pauses, resumes, finishes, rematches, leaves (confirmed on the TV), and keeps going.
 */

/** Where focus is on the TV, as a box (or undefined when nothing is focused). */
async function focusedBox(host: Host) {
  return host.page.evaluate(() => {
    const el = document.activeElement;
    if (el === null || el === document.body) return undefined;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: el.textContent ?? '' };
  });
}

/**
 * Moves the TV's focus to `target` with the phone's stick only, the way a person would: look at
 * where focus is, flick toward the target, and if that axis does not move it (a seat that uses ←/→
 * itself), try the other.
 */
async function steer(host: Host, phone: Phone, target: Locator, maxSteps = 14): Promise<void> {
  for (let step = 0; step < maxSteps; step += 1) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    const from = await focusedBox(host);
    const to = await target.boundingBox();
    if (from === undefined || to === null) throw new Error('nothing to steer from or to');
    // Move only along an axis where focus is really outside the target (a wide START button is
    // straight below a seat even when their centres differ).
    const below = from.y > to.y + to.height ? 'up' : from.y < to.y ? 'down' : undefined;
    const beside = from.x > to.x + to.width ? 'left' : from.x < to.x ? 'right' : undefined;
    const order = [below, beside].filter(
      (d): d is 'up' | 'down' | 'left' | 'right' => d !== undefined,
    );
    const first = order[0];
    if (first === undefined) break;
    await phone.flick(first);
    const after = await focusedBox(host);
    const second = order[1];
    if (second !== undefined && after?.x === from.x && after.y === from.y)
      await phone.flick(second);
  }
  await expect(target).toBeFocused();
}

test('couch test: with the TV untouched, one phone runs the lobby, plays, pauses, resumes, finishes, rematches and leaves', async ({
  hostAt,
  newPhone,
}) => {
  test.setTimeout(240_000);
  const host = await hostAt('?kills=2&powerups=off');
  const code = await host.createRoom(); // the last time anyone touches the TV
  const tv = host.page;

  const alice = await newPhone();
  await alice.join(code, 'Alice');
  const pad = alice.page;
  // In the lobby the phone is the console's controller, and its controls really work.
  await expect(pad.getByRole('group', { name: /navigate/i })).toBeVisible();
  await expect(pad.getByRole('button', { name: 'SELECT', exact: true })).toBeVisible();
  await expect(pad.getByRole('button', { name: 'BACK', exact: true })).toBeVisible();
  await expect(pad.getByRole('button', { name: 'PAUSE', exact: true })).toHaveCount(0);

  // BACK asks on the TV before anything is closed, and starts on Cancel.
  await alice.tap('BACK');
  await expect(tv.getByRole('dialog', { name: 'Close this room?' })).toBeVisible();
  await expect(tv.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await alice.tap('SELECT');
  await expect(tv.getByRole('dialog', { name: 'Close this room?' })).toHaveCount(0);

  // The phone adds a CPU opponent and starts the match.
  await steer(host, alice, tv.getByRole('button', { name: /empty seat/ }).first());
  await alice.tap('SELECT');
  await expect(host.cpuSeat(1)).toBeVisible();
  await expect(host.startButton).not.toHaveAttribute('aria-disabled', 'true');
  await steer(host, alice, host.startButton);
  await alice.tap('SELECT');
  await host.waitForDrawn(2);

  // GAMEPLAY: the game's own controls, plus the phone's PAUSE.
  await expect(pad.getByRole('group', { name: /move/i })).toBeVisible();
  await expect(pad.getByRole('button', { name: 'SLASH', exact: true })).toBeVisible();
  await alice.tap('PAUSE');
  const paused = tv.getByRole('dialog', { name: 'Paused' });
  await expect(paused).toBeVisible();
  await expect(tv.getByRole('button', { name: 'Resume' })).toBeFocused();
  await expect(pad.getByRole('button', { name: 'RESUME', exact: true })).toBeVisible();
  await expect(pad.getByRole('button', { name: 'SELECT', exact: true })).toBeVisible();

  // A real freeze: nothing moves while the menu is open.
  const before = (await host.snapshot()).bodies;
  await tv.waitForTimeout(600);
  expect((await host.snapshot()).bodies).toEqual(before);

  // SELECT on Resume: the match carries on, and that press was not a slash.
  await alice.tap('SELECT');
  await expect(paused).toHaveCount(0);
  await expect(pad.getByRole('button', { name: 'SLASH', exact: true })).toBeVisible();

  // The match runs to its end (the CPU races to the shortened target).
  const champion = tv.getByRole('dialog', { name: 'Match over' });
  await expect(champion).toBeVisible({ timeout: 150_000 });
  await expect(pad.getByText('RESULTS')).toBeVisible();
  await expect(tv.getByRole('button', { name: 'Rematch' })).toBeFocused();

  // REMATCH from the phone: a brand-new match, back to the game's controls.
  await alice.tap('SELECT');
  await expect(champion).toHaveCount(0);
  await expect(pad.getByRole('button', { name: 'SLASH', exact: true })).toBeVisible();
  await expect.poll(async () => (await host.fu()).round).toBe(1);

  // Leaving is confirmed on the TV, starting on Cancel; only a deliberate confirm ends the match.
  await alice.tap('PAUSE');
  await expect(paused).toBeVisible();
  await steer(host, alice, tv.getByRole('button', { name: 'Return to Lobby' }));
  await alice.tap('SELECT');
  const leave = tv.getByRole('dialog', { name: 'Leave this match?' });
  await expect(leave).toBeVisible();
  await expect(leave.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await steer(host, alice, leave.getByRole('button', { name: 'Return to Lobby' }));
  await alice.tap('SELECT');

  // Back in the lobby, same room, same phone, and it keeps driving the console.
  await expect(tv.getByTestId('room-code')).toHaveText(code);
  await expect(pad.getByRole('group', { name: /navigate/i })).toBeVisible();
  await alice.tap('BACK');
  await expect(tv.getByRole('dialog', { name: 'Close this room?' })).toBeVisible();
  await alice.tap('SELECT'); // Cancel: the room stays
  await expect(tv.getByRole('dialog', { name: 'Close this room?' })).toHaveCount(0);
  await expect(tv.getByTestId('room-code')).toHaveText(code);
});
