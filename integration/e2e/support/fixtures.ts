import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type Page,
  type WebSocketRoute,
} from '@playwright/test';
import type { StackInfo } from './stack';

/** The shape of the console's DEV-only read-only snapshot (a deep copy; see apps/console/src/debugHook.ts). */
export interface Snapshot {
  phase: string;
  joinCode: string | undefined;
  roomState: string | undefined;
  roster: { playerId: string; displayName: string; connection: string; seat: string }[];
  bodies: { id: string; x: number; y: number }[];
  drawn: { id: string; x: number; y: number }[] | undefined;
  drawnBoomerangs: { id: string; x: number; y: number }[] | undefined;
  /** What Phaser has drawn of the arena systems (gate/hazard status, platform places). */
  drawnSystems: Snapshot['game'] extends infer G
    ? (G extends { systems: infer S } ? S : never) | undefined
    : never;
  /** The pickups Phaser has on screen. */
  drawnPickups: { id: string; x: number; y: number }[] | undefined;
  /** The walls Phaser has on screen. */
  drawnWalls: { x: number; y: number; width: number; height: number }[] | undefined;
  /** Foomerang Fu's own state (undefined for the primitive arena). */
  game:
    | {
        round: number;
        /** The arena's walls, as the rules define them. */
        walls: { x: number; y: number; width: number; height: number }[];
        phase: 'PLAYING' | 'ROUND_OVER';
        winnerId: string | undefined;
        players: {
          id: string;
          slot: number;
          alive: boolean;
          facing: { x: number; y: number };
          slash: 'READY' | 'ACTIVE' | 'RECOVERING';
          dash: 'READY' | 'DASHING';
          /** Slice 5: mid Phase Dash, and whether the body is in a wall right now. */
          phasing: boolean;
          inWall: boolean;
          /** What they own, oldest first. */
          inventory: string[];
          fatigue: { dashes: number; recoverIn: number; fatigued: boolean };
        }[];
        /** Books lying in the arena: a Book carries no kind. */
        pickups: { id: number; x: number; y: number }[];
        awards: number;
        /** Slice 6: seconds of active play this round, and the arena systems exactly as the rules have them. */
        roundTime: number;
        systems: {
          gates: {
            status: 'OPEN' | 'CLOSING' | 'CLOSED';
            held: boolean;
            secondsToChange: number;
            rect: { x: number; y: number; width: number; height: number };
          }[];
          platforms: {
            moving: boolean;
            direction: { x: number; y: number };
            rect: { x: number; y: number; width: number; height: number };
          }[];
          hazards: {
            phase: 'SAFE' | 'WARNING' | 'ACTIVE';
            secondsToChange: number;
            rect: { x: number; y: number; width: number; height: number };
          }[];
        };
        boomerangs: {
          blast: boolean;
          direction: { x: number; y: number };
          ownerId: string;
          state: 'HELD' | 'THROWN' | 'RETURNING' | 'DEFLECTED';
          x: number;
          y: number;
          travelled: number;
          /** RETURNING and sliding along a wall: which hand (±1); 0 when flying free. */
          follow: number;
          wallSeconds: number;
          deflections: number;
          deflectedBy: string | undefined;
        }[];
        duplicatesIgnored: number;
        /** Slice 7: the CPU participants (software controllers) and what deciding for them costs the host. */
        cpus: {
          id: string;
          difficulty: string;
          throws: number;
          slashes: number;
          dashes: number;
          dodges: number;
          deflectTries: number;
          lapses: number;
        }[];
        cpuDecisionMs: { decisions: number; meanMs: number; maxMs: number };
      }
    | undefined;
  diagnostics: { actionsReceived: number; movementReceived: number; reconnects: number };
  slots: Record<string, number>;
  metrics: {
    staleNeutralizations: number;
    simulationSteps: number;
    catchUpFrames: number;
    discardEvents: number;
    discardedSimulationMs: number;
    fps: number | undefined;
    frameMs: number | undefined;
  };
}

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The TV: the console in a laptop-sized browser. */
export class Host {
  readonly errors: string[] = [];
  readonly requests: string[] = [];

  constructor(
    readonly page: Page,
    private readonly url: string,
  ) {
    page.on('pageerror', (error) => this.errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') this.errors.push(`console.error: ${message.text()}`);
    });
    page.on('request', (request) => this.requests.push(request.url()));
  }

  async open(): Promise<void> {
    await this.page.goto(this.url);
  }

  async createRoom(): Promise<string> {
    await this.page.getByRole('button', { name: 'Create room' }).click();
    const code = this.page.locator('.room-code');
    await expect(code).toHaveText(/^[A-Z0-9]{6}$/);
    return (await code.textContent()) ?? '';
  }

  async snapshot(): Promise<Snapshot> {
    const snapshot = await this.page.evaluate(() => window.__FOOMERANG__?.snapshot());
    if (snapshot === undefined) throw new Error('the DEV debug hook is not installed');
    return snapshot;
  }

  async playerId(name: string): Promise<string> {
    const entry = (await this.snapshot()).roster.find((r) => r.displayName === name);
    if (entry === undefined) throw new Error(`no player named ${name}`);
    return entry.playerId;
  }

  async body(id: string): Promise<{ x: number; y: number }> {
    const body = (await this.snapshot()).bodies.find((b) => b.id === id);
    if (body === undefined) throw new Error(`no body ${id}`);
    return { x: body.x, y: body.y };
  }

  /** The Fu state; throws if this is not a Foomerang Fu match. */
  async fu(): Promise<NonNullable<Snapshot['game']>> {
    const { game } = await this.snapshot();
    if (game === undefined) throw new Error('no Foomerang Fu match is running');
    return game;
  }

  async start(): Promise<void> {
    await this.page.getByRole('button', { name: 'Start' }).click();
    await expect(this.page.getByTestId('arena')).toBeVisible();
  }

  /** Waits until Phaser is up and has drawn `count` circles. */
  async waitForDrawn(count: number): Promise<void> {
    await expect.poll(async () => (await this.snapshot()).drawn?.length ?? 0).toBe(count);
  }

  /** Waits until a body has stopped moving (same authoritative position over a quiet window) and returns it. */
  async settled(id: string, quietMs = 250): Promise<{ x: number; y: number }> {
    let last = await this.body(id);
    let stableSince = Date.now();
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      await sleep(50);
      const now = await this.body(id);
      if (now.x !== last.x || now.y !== last.y) {
        last = now;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= quietMs) {
        return now;
      }
    }
    throw new Error(`${id} never stopped moving`);
  }
}

/** One player's phone: an iPhone-sized touch browser context (Chromium — not Safari). */
export class Phone {
  readonly errors: string[] = [];
  private uplinkDropped = false;
  private connectionsBlocked = false;
  private current: WebSocketRoute | undefined;
  private point: { x: number; y: number } | undefined;

  private constructor(
    readonly context: BrowserContext,
    readonly page: Page,
    private readonly cdp: CDPSession,
    private readonly stack: StackInfo,
  ) {
    page.on('pageerror', (error) => this.errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') this.errors.push(`console.error: ${message.text()}`);
    });
  }

  static async create(browser: Browser, stack: StackInfo): Promise<Phone> {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: IPHONE_UA,
    });
    const page = await context.newPage();
    const phone = new Phone(context, page, await context.newCDPSession(page), stack);
    // Sit between the page and the real server so a test can cut the uplink or the connection
    // WITHOUT touching the page's own code. Everything else passes straight through.
    await page.routeWebSocket(/socket\.io/, (ws) => {
      if (phone.connectionsBlocked) {
        void ws.close();
        return;
      }
      phone.current = ws;
      const server = ws.connectToServer();
      ws.onMessage((message) => {
        if (!phone.uplinkDropped) server.send(message);
      });
      server.onMessage((message) => ws.send(message));
      ws.onClose(() => server.close());
      server.onClose(() => void ws.close());
    });
    return phone;
  }

  async join(roomCode: string, name: string): Promise<void> {
    // The link a QR code carries: the room and nothing else.
    await this.page.goto(`${this.stack.controllerUrl}/?room=${roomCode}`);
    await this.page.getByLabel('Your name').fill(name);
    await this.page.getByRole('button', { name: 'Join' }).click();
    await expect(this.page.getByRole('group', { name: /joystick/ })).toBeVisible();
    await expect(this.page.getByRole('status')).toHaveText(/Connected/);
  }

  private async zoneCenter(): Promise<{ x: number; y: number }> {
    const box = await this.page.getByRole('group', { name: /joystick/ }).boundingBox();
    if (box === null) throw new Error('no joystick on screen');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** Puts a real touch down on the joystick area (CDP touch → real pointer events). */
  async thumbDown(): Promise<void> {
    this.point = await this.zoneCenter();
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: this.point.x, y: this.point.y, id: 1 }],
    });
  }

  /** Drags the held thumb to `dx, dy` CSS pixels from where it landed. */
  async thumbMove(dx: number, dy: number): Promise<void> {
    if (this.point === undefined) throw new Error('thumb is not down');
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: this.point.x + dx, y: this.point.y + dy, id: 1 }],
    });
  }

  async thumbUp(): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    this.point = undefined;
  }

  private async buttonCenter(name: string): Promise<{ x: number; y: number }> {
    const box = await this.page.getByRole('button', { name, exact: true }).boundingBox();
    if (box === null) throw new Error(`no ${name} button on screen`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** A quick tap on the THROW button (real touch → real pointer events). */
  async tapThrow(): Promise<void> {
    await this.holdButton('THROW', 60);
  }

  /** A quick tap on the SLASH button. */
  async tapSlash(): Promise<void> {
    await this.holdButton('SLASH', 60);
  }

  /** A quick tap on the DASH button. */
  async tapDash(): Promise<void> {
    await this.holdButton('DASH', 60);
  }

  /** Puts a finger on THROW, keeps it there for `ms`, then lifts it. A held button must still send ONE press. */
  async holdThrow(ms: number): Promise<void> {
    await this.holdButton('THROW', ms);
  }

  /** Puts a finger on a button, keeps it there for `ms`, then lifts it. */
  async holdButton(name: 'THROW' | 'SLASH' | 'DASH', ms: number): Promise<void> {
    const at = await this.buttonCenter(name);
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: at.x, y: at.y, id: 2 }],
    });
    await sleep(ms);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  /** Movement from the phone stops reaching the server; the connection itself stays up. */
  dropUplink(dropped: boolean): void {
    this.uplinkDropped = dropped;
  }

  /** The network goes away: the socket is closed, and (while blocked) new connections fail. */
  async loseNetwork(): Promise<void> {
    this.connectionsBlocked = true;
    await this.current?.close();
  }

  restoreNetwork(): void {
    this.connectionsBlocked = false;
  }

  async close(): Promise<void> {
    await this.context.close();
  }
}

interface Fixtures {
  stack: StackInfo;
  host: Host;
  /** The console opened for Foomerang Fu (the default game). */
  fuHost: Host;
  /**
   * The Foomerang Fu console with a Book every second (`?powerups=fast`, developer only) so every power
   * can be tried in seconds; `enable` narrows which powers a Book may award (`?enable=GUARD`).
   */
  powerHost: (enable?: string) => Promise<Host>;
  /** The Foomerang Fu console in the Slice 6 arena (`?arena=systems`), with no Books. */
  systemsHost: Host;
  /** The console from `vite build`: no debug hook, so tests can only look at what a person sees. */
  productionHost: Host;
  newPhone: () => Promise<Phone>;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  stack: async ({}, use) => {
    const raw = process.env['FOOMERANG_E2E_STACK'];
    if (raw === undefined)
      throw new Error('the E2E stack is not running (global setup did not run)');
    await use(JSON.parse(raw) as StackInfo);
  },

  host: async ({ browser, stack }, use) => {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    // The PLATFORM tests use the primitive arena (test infrastructure), asked for by name.
    const host = new Host(await context.newPage(), `${stack.consoleUrl}/?game=primitive-arena`);
    await host.open();
    await use(host);
    expect(host.errors, 'no console errors or uncaught exceptions on the console').toEqual([]);
    await context.close();
  },

  // The Slice 1–4 journeys are played with no pickups (`?powerups=off`), exactly as they were written.
  fuHost: async ({ browser, stack }, use) => {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const host = new Host(await context.newPage(), `${stack.consoleUrl}/?powerups=off`);
    await host.open();
    await use(host);
    expect(host.errors, 'no console errors or uncaught exceptions on the Fu console').toEqual([]);
    await context.close();
  },
  systemsHost: async ({ browser, stack }, use) => {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const host = new Host(
      await context.newPage(),
      `${stack.consoleUrl}/?arena=systems&powerups=off`,
    );
    await host.open();
    await use(host);
    expect(host.errors, 'no console errors or uncaught exceptions on the systems console').toEqual(
      [],
    );
    await context.close();
  },
  powerHost: async ({ browser, stack }, use) => {
    const opened: { host: Host; close: () => Promise<void> }[] = [];
    await use(async (enable) => {
      const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      const query = `?powerups=fast${enable === undefined ? '' : `&enable=${enable}`}`;
      const host = new Host(await context.newPage(), `${stack.consoleUrl}/${query}`);
      await host.open();
      opened.push({ host, close: () => context.close() });
      return host;
    });
    for (const { host, close } of opened) {
      expect(host.errors, 'no console errors or uncaught exceptions on the power console').toEqual(
        [],
      );
      await close();
    }
  },

  productionHost: async ({ browser, stack }, use) => {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const host = new Host(
      await context.newPage(),
      `${stack.productionConsoleUrl}/?game=primitive-arena`,
    );
    await host.open();
    await use(host);
    expect(
      host.errors,
      'no console errors or uncaught exceptions on the production console',
    ).toEqual([]);
    await context.close();
  },

  newPhone: async ({ browser, stack }, use) => {
    const phones: Phone[] = [];
    await use(async () => {
      const phone = await Phone.create(browser, stack);
      phones.push(phone);
      return phone;
    });
    for (const phone of phones) {
      expect(phone.errors, 'no console errors or uncaught exceptions on a controller').toEqual([]);
    }
    await Promise.all(phones.map((phone) => phone.close()));
  },
});

export { expect };
