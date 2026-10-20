import {
  test as base,
  expect,
  type Browser,
  type Locator,
  type BrowserContext,
  type CDPSession,
  type Page,
  type WebSocketRoute,
} from '@playwright/test';
import type { StackInfo } from './stack';

/** The shape of the console's DEV-only read-only snapshot (a deep copy; see apps/console/src/debugHook.ts). */
export interface Snapshot {
  phase: string;
  /** The map of the current (or last) Foomerang Fu match. */
  arena: string | null;
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
  /** The props the 3D plaza draws broken, and the debris lying about. */
  drawnProps: { broken: string[]; pieces: number } | undefined;
  /** Which character each player is drawn as (the 3D plaza only). */
  drawnCharacters: Record<string, string> | undefined;
  /** The walls Phaser has on screen. */
  drawnWalls: { x: number; y: number; width: number; height: number }[] | undefined;
  /** Foomerang Fu's own state (undefined for the primitive arena). */
  game:
    | {
        round: number;
        /** The arena's walls, as the rules define them. */
        walls: { x: number; y: number; width: number; height: number }[];
        /** The breakable props broken this round (the rules' list). */
        broken: string[];
        phase: 'PLAYING' | 'ROUND_OVER' | 'MATCH_OVER';
        /** Slice 8: the kill race. */
        scores: Record<string, number>;
        matchOver: { winnerId: string } | undefined;
        tiebreak: boolean;
        roundLabel: { kind: string; round: number; of?: number };
        winnerId: string | undefined;
        players: {
          id: string;
          slot: number;
          alive: boolean;
          facing: { x: number; y: number };
          slash: 'READY' | 'ACTIVE' | 'RECOVERING';
          dash: 'READY' | 'DASHING';
          /** What they own, oldest first. */
          inventory: string[];
          /** THROW held: NONE, CHARGING or CANCELLED (by a dash). */
          charge: 'NONE' | 'CHARGING' | 'CANCELLED';
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
          /** How charged its throw was: 0 (a tap) to 1 (a full charge). */
          power: number;
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
    frameMaxMs: number | undefined;
  };
}

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** The TV: the console in a laptop-sized browser. */
/** Every phone that has joined each room (by room code), in join order: what the host's start() readies. */
const phonesByRoom = new Map<string, Phone[]>();

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

  /** The console's own journey: Home -> the game -> PLAY -> a real room. Returns the room code. */
  async createRoom(): Promise<string> {
    await this.page.getByRole('button', { name: 'Foomerang Fu', exact: true }).click();
    await this.page.getByRole('button', { name: 'PLAY', exact: true }).click();
    const code = this.page.getByTestId('room-code');
    await expect(code).toHaveText(/^[A-Z0-9]{6}$/);
    this.#roomCode = (await code.textContent()) ?? '';
    return this.#roomCode;
  }

  #roomCode = '';

  /**
   * Character select (Foomerang Fu): every phone in this room that is still choosing presses SELECT, exactly as its
   * player would, until the TV shows them READY. Nothing else is touched; other games have no character select.
   */
  async readyEveryone(): Promise<void> {
    if ((await this.characterSelect.count()) === 0) return;
    for (const phone of phonesByRoom.get(this.#roomCode) ?? []) {
      if (phone.closed || phone.name === undefined) continue;
      const choosing = this.page.getByRole('listitem', {
        name: new RegExp(`^Player \\d: ${phone.name}, .*, choosing$`),
      });
      if ((await choosing.count()) === 0) continue;
      await phone.ready();
      await expect(choosing).toHaveCount(0);
    }
  }

  /** A seat taken by someone (a phone or a CPU): Join's tiles, or character select's circles (Foomerang Fu). */
  get filledSeats(): Locator {
    return this.page.locator('.ptile:not(.ptile--empty), .cs__seat:not(.cs__seat--empty)');
  }

  /** The seat of "CPU n" (the nth CPU ever added in this console): its control on Join or on character select. */
  cpuSeat(n: number): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^Player \\d: CPU ${n}($|,)`) });
  }

  /** What starts a match: Join's START GAME, or character select's begin bar (Foomerang Fu). */
  get startButton(): Locator {
    return this.page
      .getByRole('button', { name: 'START GAME', exact: true })
      .or(this.page.getByRole('button', { name: /^Begin/ }));
  }

  /** Character select (Foomerang Fu) is showing. */
  get characterSelect(): Locator {
    return this.page.getByTestId('character-select');
  }

  #cpusAdded = 0;

  /**
   * Adds a CPU, then sets its difficulty with the arrow keys, as a host would. Foomerang Fu: the begin bar's "one bot
   * more" (the bar shows once every person in the room is READY); other games: Select on an empty seat.
   */
  async addCpu(difficulty: 'Easy' | 'Medium' | 'Hard'): Promise<void> {
    this.#cpusAdded += 1;
    const n = this.#cpusAdded;
    if ((await this.characterSelect.count()) > 0) {
      await this.readyEveryone(); // the begin bar (and its bots) shows once nobody is choosing
      await this.page.getByRole('button', { name: 'One bot more' }).click();
    } else {
      await this.page
        .getByRole('button', { name: /empty seat/ })
        .first()
        .click();
    }
    const seat = this.cpuSeat(n);
    await expect(seat).toBeVisible();
    if (difficulty !== 'Medium') {
      await seat.focus();
      await this.page.keyboard.press(difficulty === 'Easy' ? 'ArrowLeft' : 'ArrowRight');
    }
    await expect(seat).toContainText(difficulty);
  }

  /** Removes "CPU n" (Select on its seat). */
  async removeCpu(n: number): Promise<void> {
    await this.cpuSeat(n).click();
    await expect(this.cpuSeat(n)).toHaveCount(0);
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

  /** The scoreboard's CONTINUE (between rounds, Foomerang Fu). */
  get continueButton(): Locator {
    return this.page.getByRole('button', { name: 'CONTINUE', exact: true });
  }

  /**
   * For matches that run over many rounds: whenever the scoreboard waits between rounds, press CONTINUE — with this phone's
   * SELECT, as its player would, or (no phone: CPU-only matches) on the TV. Runs while Playwright waits on the page.
   */
  async autoContinue(phone?: Phone): Promise<void> {
    await this.page.addLocatorHandler(
      this.continueButton,
      async () => {
        if (phone === undefined) await this.continueButton.click();
        else await phone.tap('SELECT');
      },
      { noWaitAfter: true },
    );
  }

  /** Starts the match. Foomerang Fu: every phone in the room first gets READY on its character (see readyEveryone). */
  async start(): Promise<void> {
    await this.readyEveryone();
    await this.startButton.click();
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

  /** Every frame the server sent this phone (Socket.IO text frames), for tests that read what the phone was told. */
  readonly inbound: string[] = [];

  /** The RUMBLE messages this phone has received, in order. */
  rumbles(): { intensity: number; durationMs: number }[] {
    const out: { intensity: number; durationMs: number }[] = [];
    for (const frame of this.inbound) {
      if (!frame.includes('"RUMBLE"')) continue;
      const json = frame.slice(frame.indexOf('['));
      try {
        const data = JSON.parse(json) as unknown[];
        for (const item of data) {
          const m = item as { type?: string; payload?: { intensity: number; durationMs: number } };
          if (m?.type === 'RUMBLE' && m.payload) out.push(m.payload);
        }
      } catch {
        // not a JSON event frame
      }
    }
    return out;
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
      server.onMessage((message) => {
        if (typeof message === 'string') phone.inbound.push(message);
        ws.send(message);
      });
      ws.onClose(() => server.close());
      server.onClose(() => void ws.close());
    });
    return phone;
  }

  /** The name this phone joined with (undefined before it joins). */
  name: string | undefined;
  /** It was closed: it is no longer anyone's controller. */
  closed = false;

  async join(roomCode: string, name: string): Promise<void> {
    // The link a QR code carries: the room and nothing else.
    await this.page.goto(`${this.stack.controllerUrl}/?room=${roomCode}`);
    await this.page.getByLabel('Your name').fill(name);
    await this.page.getByRole('button', { name: 'Join' }).click();
    await expect(this.page.getByRole('group', { name: /joystick/ })).toBeVisible();
    await expect(this.page.getByRole('status')).toHaveText(/Connected/);
    this.name = name;
    const room = phonesByRoom.get(roomCode) ?? [];
    if (!room.includes(this)) room.push(this);
    phonesByRoom.set(roomCode, room);
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
  async holdButton(name: string, ms: number): Promise<void> {
    const at = await this.buttonCenter(name);
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: at.x, y: at.y, id: 2 }],
    });
    await sleep(ms);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  /** Character select: SELECT readies this player on the character under their cursor. */
  async ready(): Promise<void> {
    await this.tap('SELECT');
  }

  /** A quick tap on whatever button is called `name` right now (SELECT, BACK, PAUSE, RESUME, ...). */
  async tap(name: string): Promise<void> {
    await this.holdButton(name, 60);
    await sleep(260); // past the console's press gate: each tap is its own deliberate act
  }

  /** One deliberate flick of the stick: past the step threshold, back before it would repeat. */
  async flick(direction: 'up' | 'down' | 'left' | 'right'): Promise<void> {
    const far = 140;
    const offsets = { up: [0, -far], down: [0, far], left: [-far, 0], right: [far, 0] } as const;
    const [dx, dy] = offsets[direction];
    await this.thumbDown();
    await this.thumbMove(dx, dy);
    await sleep(150);
    await this.thumbUp();
    await sleep(160);
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
    this.closed = true;
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
   * can be tried in seconds; `enable` narrows which powers a Book may award (`?enable=SHIELD`).
   */
  powerHost: (enable?: string) => Promise<Host>;
  /** The Foomerang Fu console opened at any address query (e.g. `?kills=3&powerups=off`); closed (and checked for errors) afterwards. */
  hostAt: (query: string) => Promise<Host>;
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
    const host = new Host(
      await context.newPage(),
      `${stack.consoleUrl}/?arena=primitive&powerups=off`,
    );
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
  hostAt: async ({ browser, stack }, use) => {
    const opened: { host: Host; close: () => Promise<void> }[] = [];
    await use(async (query) => {
      const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      const host = new Host(await context.newPage(), `${stack.consoleUrl}/${query}`);
      await host.open();
      opened.push({ host, close: () => context.close() });
      return host;
    });
    for (const { host, close } of opened) {
      expect(host.errors, 'no console errors or uncaught exceptions on the console').toEqual([]);
      await close();
    }
  },
  powerHost: async ({ browser, stack }, use) => {
    const opened: { host: Host; close: () => Promise<void> }[] = [];
    await use(async (enable) => {
      const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
      const query = `?arena=primitive&powerups=fast${enable === undefined ? '' : `&enable=${enable}`}`;
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
