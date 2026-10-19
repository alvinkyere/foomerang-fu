import { describe, expect, it } from 'vitest';
import type { HostState } from '../../src/host';
import { buildShellModel, type AdapterInput } from '../../src/shell/adapter/buildModel';

const IDLE: HostState = {
  phase: 'IDLE',
  joinCode: undefined,
  gameId: undefined,
  roomState: undefined,
  roster: [],
  failure: undefined,
  notice: undefined,
  reclaimed: false,
  matchInterrupted: false,
};
const slots = new Map<string, number>();
const input = (state: Partial<HostState>, extra: Partial<AdapterInput> = {}): AdapterInput => ({
  state: { ...IDLE, ...state },
  cpus: [],
  slotOf: (id) => slots.get(id),
  startBlock: undefined,
  gameId: 'foomerang-fu',
  controllerBaseUrl: 'http://192.168.1.20:5173',
  warnings: [],
  version: '0.1',
  build: 'test',
  ...extra,
});

describe('buildShellModel (session state → what the shell shows)', () => {
  it('no room yet: phase none, nothing to join', () => {
    const { room, failure } = buildShellModel(input({}));
    expect(room.phase).toBe('none');
    expect(room.code).toBeUndefined();
    expect(failure).toBeUndefined();
  });

  it('maps every session phase to a room phase', () => {
    const phase = (p: HostState['phase']) => buildShellModel(input({ phase: p })).room.phase;
    expect(phase('CONNECTING')).toBe('opening');
    expect(phase('CREATING')).toBe('opening');
    expect(phase('ACTIVE')).toBe('open');
    expect(phase('RECONNECTING')).toBe('reconnecting');
    expect(phase('ENDED')).toBe('closed');
  });

  it('the join link is the controller address with the room and nothing else', () => {
    const { room } = buildShellModel(input({ phase: 'ACTIVE', joinCode: 'K7M4PX' }));
    const url = new URL(room.joinUrl ?? '');
    expect(url.origin).toBe('http://192.168.1.20:5173');
    expect([...url.searchParams.keys()]).toEqual(['room']);
    expect(url.searchParams.get('room')).toBe('K7M4PX');
    expect(room.shortAddress).toBe('192.168.1.20:5173');
  });

  it('seats follow the stable slots: colour, number and shape come from the seat, not the order', () => {
    slots.set('b', 3);
    slots.set('a', 0);
    const { room } = buildShellModel(
      input({
        phase: 'ACTIVE',
        joinCode: 'K7M4PX',
        roomState: 'LOBBY',
        roster: [
          { playerId: 'b', displayName: 'Bea', connection: 'CONNECTED', seat: 'HELD' },
          { playerId: 'a', displayName: 'Al', connection: 'RECONNECTING', seat: 'HELD' },
        ],
      }),
    );
    expect(room.seats).toHaveLength(6);
    expect(room.seats[0]).toMatchObject({
      kind: 'phone',
      name: 'Al',
      number: 1,
      marker: '●',
      status: 'reconnecting',
    });
    expect(room.seats[3]).toMatchObject({
      kind: 'phone',
      name: 'Bea',
      number: 4,
      marker: '◆',
      status: 'connected',
    });
    expect(room.seats[1]?.kind).toBe('empty');
    slots.clear();
  });

  it('a person without a seat (full table) is listed as waiting, and START says to remove a CPU', () => {
    const { room } = buildShellModel(
      input(
        {
          phase: 'ACTIVE',
          roomState: 'LOBBY',
          roster: [{ playerId: 'x', displayName: 'Xan', connection: 'CONNECTED', seat: 'HELD' }],
        },
        { startBlock: 'TOO_MANY' },
      ),
    );
    expect(room.waitingForSeat).toEqual(['Xan']);
    expect(room.canStart).toBe(false);
    expect(room.startBlockedReason).toMatch(/at most 6 players/);
  });

  it('START is available only when the session is live and the real start rules allow it', () => {
    const live = { phase: 'ACTIVE', roomState: 'LOBBY' } as const;
    expect(buildShellModel(input(live)).room.canStart).toBe(true);
    expect(buildShellModel(input(live, { startBlock: 'TOO_FEW' })).room.startBlockedReason).toMatch(
      /At least 2 players/,
    );
    const down = buildShellModel(input({ phase: 'RECONNECTING', roomState: 'LOBBY' }));
    expect(down.room.canStart).toBe(false);
    expect(down.room.startBlockedReason).toMatch(/Reconnecting/);
    const launching = buildShellModel(input({ phase: 'ACTIVE', roomState: 'STARTING' }));
    expect(launching.room.launching).toBe(true);
    expect(launching.room.canStart).toBe(false);
  });

  it('only Foomerang Fu offers CPUs, and never beyond six participants', () => {
    const cpu = (n: number) => ({ id: `cpu:${n}`, name: `CPU ${n}`, difficulty: 'HARD' as const });
    const live = { phase: 'ACTIVE', roomState: 'LOBBY' } as const;
    expect(buildShellModel(input(live)).room.canAddCpu).toBe(true);
    expect(
      buildShellModel(input(live, { gameId: 'primitive-arena', startBlock: undefined })).room
        .canAddCpu,
    ).toBe(false);
    const full = buildShellModel(
      input(live, { cpus: [1, 2, 3, 4, 5, 6].map(cpu), slotOf: (id) => Number(id.slice(4)) - 1 }),
    );
    expect(full.room.canAddCpu).toBe(false);
    expect(full.room.seats.every((s) => s.kind === 'cpu')).toBe(true);
    expect(full.room.seats[0]?.detail).toBe('Hard');
  });

  it('failures are said in plain words: no addresses, no technology names', () => {
    const opening = buildShellModel(input({ failure: { kind: 'CONNECTION_FAILED' } }));
    expect(opening.failure?.title).toBe('Couldn’t open a room');
    const closed = buildShellModel(
      input({ phase: 'ENDED', failure: { kind: 'SERVER', code: 'ROOM_NOT_FOUND' } }),
    );
    expect(closed.failure?.title).toBe('This room has closed');
    for (const f of [opening.failure, closed.failure]) {
      expect(`${f?.title} ${f?.message}`).not.toMatch(
        /socket|wss|http|\d+\.\d+\.\d+|transport|token/i,
      );
    }
  });

  it('configuration warnings become plain advice: no variable names, no URLs, no jargon', () => {
    const raw =
      'The controller URL points at this computer (localhost), so a phone cannot reach it. Set FOOMERANG_CONTROLLER_URL to http://192.168.1.20:5173.';
    const m = buildShellModel(input({}, { warnings: [raw] }));
    const shown = `${m.warnings.join(' ')} ${m.facts.addressNote}`;
    expect(shown).toMatch(/localhost/);
    expect(shown).not.toMatch(/FOOMERANG_|URL|http|environment|variable/);
  });

  it('a refusal that did not end the session is a notice, not a failure', () => {
    const m = buildShellModel(input({ phase: 'ACTIVE', notice: 'NOT_ENOUGH_PLAYERS' }));
    expect(m.room.notice).toMatch(/more players/);
    expect(m.failure).toBeUndefined();
  });
});

describe('character select (Foomerang Fu’s lobby, game-setting.mp4)', () => {
  const lobby = (extra: Partial<AdapterInput> = {}) =>
    buildShellModel(
      input(
        {
          phase: 'ACTIVE',
          joinCode: 'K7M4PX',
          roomState: 'LOBBY',
          roster: [
            { playerId: 'a', displayName: 'Al', connection: 'CONNECTED', seat: 'HELD' },
            { playerId: 'b', displayName: 'Bea', connection: 'CONNECTED', seat: 'HELD' },
          ],
        },
        {
          slotOf: (id) => ({ a: 0, b: 1, 'cpu:1': 2 })[id],
          picks: new Map([
            ['a', { character: 'milk', ready: true }],
            ['b', { character: 'milk', ready: false }],
          ]),
          ...extra,
        },
      ),
    ).room.select;

  it('six circles: each player’s character, colour and READY', () => {
    const select = lobby();
    expect(select?.seats).toHaveLength(6);
    const [a, b, empty] = select?.seats ?? [];
    expect(a).toMatchObject({ kind: 'phone', name: 'Al', number: 1, ready: true });
    expect(a?.character).toMatchObject({
      id: 'milk',
      name: 'Milk',
      color: '#5597de',
      portrait: 'characters/milk.webp',
    });
    expect(b).toMatchObject({ kind: 'phone', number: 2, ready: false });
    expect(empty).toMatchObject({ kind: 'empty', number: 3, ready: false });
    expect(empty?.character).toBeUndefined();
  });

  it('the grid is the 10 characters in the video’s order, with every cursor on its tile in seat order', () => {
    const grid = lobby()?.grid ?? [];
    expect(grid.map((row) => row.map((t) => t.character.id))).toEqual([
      ['avocado', 'banana', 'milk', 'watermelon', 'donut'],
      ['coffee', 'icecream', 'bread', 'bacon', 'carrot'],
    ]);
    expect(grid[0]?.[2]?.cursors).toEqual([
      { number: 1, color: '#5597de', ready: true },
      { number: 2, color: '#5597de', ready: false },
    ]);
  });

  it('the begin bar shows only when no person is still choosing; CPUs count as bots', () => {
    expect(lobby()?.everyoneReady).toBe(false);
    const ready = lobby({
      picks: new Map([
        ['a', { character: 'milk', ready: true }],
        ['b', { character: 'bread', ready: true }],
        ['cpu:1', { character: 'donut', ready: true }],
      ]),
      cpus: [{ id: 'cpu:1', name: 'CPU 1', difficulty: 'HARD' }],
    });
    expect(ready?.everyoneReady).toBe(true);
    expect(ready?.bots).toBe(1);
    expect(ready?.canAddBot).toBe(true);
    expect(ready?.seats[2]).toMatchObject({ kind: 'cpu', detail: 'Hard', ready: true });
  });

  it('badges and READY fills are the video’s palette (owner, 2026-10-19), measured from game-setting.mp4', () => {
    const all = [
      'avocado',
      'bacon',
      'banana',
      'bread',
      'carrot',
      'coffee',
      'donut',
      'icecream',
      'milk',
      'watermelon',
    ] as const;
    const select = (id: (typeof all)[number]) =>
      lobby({ picks: new Map([['a', { character: id, ready: true }]]) })?.seats[0]?.character;
    expect(Object.fromEntries(all.map((id) => [id, select(id)?.color]))).toEqual({
      avocado: '#93d15a',
      bacon: '#d18667',
      banana: '#e1c83e',
      bread: '#b08f4c',
      carrot: '#de8b56',
      coffee: '#aeb5b1',
      donut: '#e8768f',
      icecream: '#50c9ba',
      milk: '#5597de',
      watermelon: '#e74548',
    });
    // the READY fills the video shows, exactly; the others by the video's own rule (same hue, saturation 0.25, value 0.99)
    expect(select('banana')?.tint).toBe('#fcf2b9');
    expect(select('watermelon')?.tint).toBe('#ffc2c4');
    expect(select('donut')?.tint).toBe('#ffc4d3');
    expect(select('coffee')?.tint).toBe('#fbf9f3');
    expect(select('milk')?.tint).toBe('#bddcfc');
  });

  it('other games have no character select', () => {
    const model = buildShellModel(
      input(
        { phase: 'ACTIVE', joinCode: 'K7M4PX', roomState: 'LOBBY', gameId: 'primitive-arena' },
        {
          gameId: 'primitive-arena',
        },
      ),
    );
    expect(model.room.select).toBeUndefined();
  });
});
