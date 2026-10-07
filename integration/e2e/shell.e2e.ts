import type { Page, WebSocketRoute } from '@playwright/test';
import { Host, expect, test } from './support/fixtures';

/**
 * The console shell on the real product: the root route, a real server, real controller apps in phone-sized
 * browsers. Keyboard and mouse are driven as a person would; the gamepad abstraction shares the keyboard's code
 * path (focus/inputMap.ts) and has NOT been verified on hardware.
 */

const focusId = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset['focusId']);

/** Sits between the console page and the server so a test can cut the connection or refuse new ones. */
function networkOf(page: Page) {
  let blocked = false;
  let current: WebSocketRoute | undefined;
  const ready = page.routeWebSocket(/socket\.io/, (ws) => {
    if (blocked) {
      void ws.close();
      return;
    }
    current = ws;
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => ws.send(m));
    ws.onClose(() => server.close());
    server.onClose(() => void ws.close());
  });
  return {
    ready,
    block: () => (blocked = true),
    allow: () => (blocked = false),
    drop: async () => current?.close(),
  };
}

test('the root route is the console home — not a lobby — and a phone link lands on the controller, not the console', async ({
  hostAt,
  newPhone,
  stack,
}) => {
  const host = await hostAt(''); // no path, no query, no flag
  await expect(host.page.getByRole('button', { name: 'Foomerang Fu', exact: true })).toBeVisible();
  for (const name of ['Players', 'Controllers', 'Settings', 'Help', 'About']) {
    await expect(host.page.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await expect(host.page.getByRole('button', { name: 'Create room' })).toHaveCount(0);
  expect(host.page.url()).toBe(`${stack.consoleUrl}/`);
  // Home is focused from the first frame: the game tile.
  await expect.poll(() => focusId(host.page)).toBe('tile-foomerang-fu');

  const code = await host.createRoom();
  const phone = await newPhone();
  await phone.page.goto(`${stack.controllerUrl}/?room=${code}`);
  await expect(phone.page.getByLabel('Your name')).toBeVisible(); // the controller's join form
  await expect(phone.page.getByRole('button', { name: 'PLAY', exact: true })).toHaveCount(0); // never the console
  await expect(phone.page.getByRole('button', { name: 'Foomerang Fu', exact: true })).toHaveCount(
    0,
  );
});

test('couch flow by keyboard: Home → Fu → PLAY → phone joins → CPUs → START → real match → back on Join → close room → Home', async ({
  hostAt,
  newPhone,
}) => {
  test.setTimeout(240_000);
  const host = await hostAt('?kills=2&powerups=off');
  const page = host.page;

  await expect.poll(() => focusId(page)).toBe('tile-foomerang-fu'); // Home is up and focused
  await page.keyboard.press('Enter'); // the focused game
  await expect.poll(() => focusId(page)).toBe('play'); // PLAY is the default focus of the game page
  await page.keyboard.press('Enter'); // PLAY: a real room
  const codeEl = page.getByTestId('room-code');
  await expect(codeEl).toHaveText(/^[A-Z0-9]{6}$/);
  const code = (await codeEl.textContent()) ?? '';
  await expect(
    page.getByRole('img', { name: new RegExp(`QR code to join room ${code}`) }),
  ).toBeVisible();

  const alice = await newPhone();
  await alice.join(code, 'Alice');
  await expect(host.filledSeats).toHaveCount(1);
  await expect(host.filledSeats.first()).toContainText('Alice');
  await expect(host.filledSeats.first()).toContainText('Connected');
  await expect(host.startButton).toBeDisabled(); // alone: not a match, and it says why
  await expect(page.getByText(/At least 2 players are needed/)).toBeVisible();

  // Focus survived the seat being taken: Enter adds a CPU to the next empty seat, and ↓ → Enter another.
  await page.keyboard.press('Enter');
  await expect(host.filledSeats).toHaveCount(2);
  await expect(host.startButton).toBeEnabled();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(host.filledSeats).toHaveCount(3);

  for (let i = 0; i < 8 && (await focusId(page)) !== 'start'; i += 1) {
    await page.keyboard.press('ArrowDown');
  }
  await expect.poll(() => focusId(page)).toBe('start');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('arena')).toBeVisible();
  await host.waitForDrawn(3);

  // The match runs to its end (two kills here) and the champion screen is the arena's own.
  await expect(page.getByRole('dialog', { name: 'Match over' })).toBeVisible({ timeout: 150_000 });
  await page.getByRole('button', { name: 'Return to lobby' }).click();

  // The shell is back, on Join, with the same room and the same people.
  await expect(codeEl).toHaveText(code);
  await expect(host.filledSeats).toHaveCount(3);
  await expect(host.startButton).toBeEnabled();

  // Back asks first; a stray Back never closes a room.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Close this room?' })).toBeVisible();
  await expect.poll(() => focusId(page)).toBe('leave-cancel');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => focusId(page)).toBe('leave-confirm');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Foomerang Fu', exact: true })).toBeVisible();
  await expect(codeEl).toHaveCount(0);
});

test('Join survives an interruption: the room is kept, START waits, and everything is back when the line is', async ({
  browser,
  stack,
  newPhone,
}) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const net = networkOf(page);
  await net.ready;
  const host = new Host(page, `${stack.consoleUrl}/?powerups=off`);
  await host.open();
  try {
    const code = await host.createRoom();
    const alice = await newPhone();
    await alice.join(code, 'Alice');
    await host.addCpu('Medium');
    await expect(host.startButton).toBeEnabled();

    net.block(); // the line is down, and stays down while we look
    await net.drop();
    await expect(page.getByText(/Reconnecting… your room is still here/)).toBeVisible();
    await expect(host.startButton).toBeDisabled();
    await expect(page.getByText(/START is back as soon as the connection is/)).toBeVisible();
    await expect(page.getByTestId('room-code')).toHaveText(code); // still the same room
    await expect(host.filledSeats).toHaveCount(2); // nobody was thrown out

    net.allow();
    await expect(page.getByText(/Reconnecting… your room is still here/)).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(host.startButton).toBeEnabled();
    await expect(host.filledSeats).toHaveCount(2);
    await expect(page.getByTestId('room-code')).toHaveText(code);
  } finally {
    await context.close();
  }
});

test('a room that cannot be opened says so plainly and Try again really tries again', async ({
  browser,
  stack,
}) => {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const net = networkOf(page);
  await net.ready;
  net.block();
  const host = new Host(page, `${stack.consoleUrl}/`);
  await host.open();
  try {
    await page.getByRole('button', { name: 'Foomerang Fu', exact: true }).click();
    await page.getByRole('button', { name: 'PLAY', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Couldn’t open a room' });
    await expect(dialog).toBeVisible();
    await expect(dialog).not.toContainText(/socket|http|\d+\.\d+\.\d+\.\d+/i); // plain words, no addresses
    await expect.poll(() => focusId(page)).toBe('failure-retry');

    net.allow();
    await page.keyboard.press('Enter'); // Try again, from the keyboard
    await expect(page.getByTestId('room-code')).toHaveText(/^[A-Z0-9]{6}$/);
    await expect(dialog).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('Settings are real: a change applies at once, survives leaving and coming back, and survives a reload', async ({
  hostAt,
}) => {
  const host = await hostAt('');
  const page = host.page;
  await page.evaluate(() => window.localStorage.removeItem('foomerang.shell.settings'));
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const row = page.getByRole('button', { name: /Text Size/ });
  await row.click(); // mouse: pressing a choice steps it
  await expect(row).toContainText('Large');
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');

  await page.keyboard.press('Escape'); // Back (row → category)
  await page.keyboard.press('Escape'); // Back (category → Home)
  await expect(page.getByRole('button', { name: 'Foomerang Fu', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: /Text Size/ })).toContainText('Large');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: /Text Size/ })).toContainText('Large');
  await page.evaluate(() => window.localStorage.removeItem('foomerang.shell.settings'));
});

test('the system bar has no dead buttons', async ({ hostAt }) => {
  const host = await hostAt('');
  const page = host.page;
  for (const [name, dialog] of [
    ['Players', 'Players'],
    ['Controllers', 'Controllers'],
    ['Help', 'Help'],
    ['About', 'About Foomerang'],
  ] as const) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('dialog', { name: dialog })).toBeVisible();
    await page.keyboard.press('Escape'); // there is always a way out
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

/**
 * The real product at the four TV sizes, written to docs/shell/real-<size>-<screen>.png (opt-in:
 * FOOMERANG_SHELL_SHOTS=1). Always checks that nothing scrolls and nothing is cut off at any size.
 */
for (const [width, height] of [
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
] as const) {
  test(`the real shell fits a ${width}×${height} TV: no scrolling, nothing cut off`, async ({
    browser,
    stack,
    newPhone,
  }) => {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const host = new Host(page, `${stack.consoleUrl}/?powerups=off`);
    await host.open();
    const fits = () =>
      page.evaluate(() => {
        const d = document.documentElement;
        const tol = innerHeight * 0.012; // a focused control lifts and scales a little
        const main = document.querySelector('.shell__main')?.getBoundingClientRect();
        const hints = document.querySelector('.hintbar')?.getBoundingClientRect();
        const items = [
          ...document.querySelectorAll<HTMLElement>(
            '.shell__main button, .shell__main h1, .shell__main h2, .qrcard, .join__codevalue, .join__or',
          ),
        ];
        const bad: string[] = [];
        for (const el of items) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue;
          const name = (el.textContent ?? el.className).slice(0, 24);
          if (
            (main && r.bottom > main.bottom + tol) ||
            r.right > innerWidth + 1 ||
            r.left < -1 ||
            r.top < -1
          ) {
            bad.push(`outside: ${name}`);
          }
          if (hints && r.bottom > hints.top + 1 && r.right > hints.left && r.left < hints.right) {
            bad.push(`under the controls: ${name}`);
          }
        }
        return {
          scrolls: d.scrollWidth > innerWidth + 1 || d.scrollHeight > innerHeight + 1,
          bad,
        };
      });
    const shot = async (name: string) => {
      if (process.env['FOOMERANG_SHELL_SHOTS'] === '1') {
        const { mkdirSync } = await import('node:fs');
        const { join } = await import('node:path');
        const out = join(process.cwd(), '..', 'docs', 'shell');
        mkdirSync(out, { recursive: true });
        await page.screenshot({ path: join(out, `real-${width}x${height}-${name}.png`) });
      }
    };
    try {
      await expect(page.getByRole('button', { name: 'Foomerang Fu', exact: true })).toBeVisible();
      await page.waitForTimeout(600);
      expect(await fits()).toEqual({ scrolls: false, bad: [] });
      await shot('1-home');
      const code = await host.createRoom();
      const alice = await newPhone();
      await alice.join(code, 'Alice');
      await host.addCpu('Hard');
      await expect(host.startButton).toBeEnabled();
      await page.waitForTimeout(700);
      expect(await fits()).toEqual({ scrolls: false, bad: [] });
      await shot('4-join');
    } finally {
      await context.close();
    }
  });
}
