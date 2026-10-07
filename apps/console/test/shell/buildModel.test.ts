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
