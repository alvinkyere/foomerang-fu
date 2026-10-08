import type { ControllerViewMessage } from '@foomerang/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeClient } from './support/fakes';
import { createRig, msg, type Rig } from './support/rig';

let rig: Rig;
beforeEach(async () => {
  // These tests drive a TV through quick bursts of game operations (open, launch, start, exit,
  // relaunch, then delayed messages). Rate limiting has its own tests; here the human-request
  // budget is lifted so the assertions are about lifecycle and epochs, not throttling.
  rig = createRig({ rateLimits: { room: { burst: 1_000, refillPerSecond: 1_000 } } });
  await rig.start();
});
afterEach(async () => {
  await rig.stop();
});

type Phone = ReturnType<Rig['controller']>;

/** A console with `n` phones and an active Fu launch (nobody seated yet). */
function party(n: number) {
  const { client: tv, joinCode, hostToken } = rig.console();
  const phones: Phone[] = Array.from({ length: n }, (_, i) =>
    rig.controller(joinCode, `P${i + 1}`),
  );
  tv.send(msg.gameLaunch());
  const game = tv.last('CONSOLE_UPDATED')?.payload.game?.gameSessionId ?? '';
  return { tv, joinCode, hostToken, phones, game };
}
let seq = 0;
const seat = (tv: FakeClient, game: string, phones: Phone[], firstSeat = 1) =>
  tv.send(
    msg.gameParticipants(
      (seq += 1),
      game,
      phones.map((p, i) => ({ controllerId: p.controllerId, seat: firstSeat + i })),
    ),
  );
/** The console flow's per-phone view (CONTROLLER_CONTEXT exists in both flows; this is the console's). */
const view = (phone: Phone) =>
  phone.client.last('CONTROLLER_CONTEXT')?.payload as ControllerViewMessage['payload'] | undefined;
const inputs = (tv: FakeClient) => tv.all('CONTROLLER_INPUT').map((m) => m.payload);
let ev = 0;
const press = (
  phone: Phone,
  action: 'PRIMARY' | 'MENU' = 'PRIMARY',
  phase: 'pressed' | 'released' = 'pressed',
) => phone.client.send(msg.action(`event-${(ev += 1)}-pad`, action, phase, ev));

describe('a game launch on a console: an epoch with participants the TV assigns', () => {
  it('GAME_LAUNCH creates a launch with nobody seated: members WAIT, nobody is made a player', () => {
    const { tv, phones, game } = party(3);
    expect(game).toMatch(/^game-/);
    expect(tv.last('CONSOLE_UPDATED')?.payload.game).toEqual({
      gameSessionId: game,
      gameId: 'foomerang-fu',
      state: 'LOBBY',
      participants: [],
    });
    for (const phone of phones) {
      expect(view(phone)).toMatchObject({
        context: 'CONSOLE', // the lobby: everybody still drives the console
        participation: { gameSessionId: game, status: 'WAITING' },
      });
      expect(phone.client.all('CONTROLLER_MANIFEST')).toEqual([]);
    }
  });

  it('only one game at a time; an unknown game is refused; only the TV launches', () => {
    const { tv, phones } = party(1);
    tv.send(msg.gameLaunch());
    tv.send(msg.gameLaunch('no-such-game'));
    phones[0]?.client.send(msg.gameLaunch());
    expect(tv.errors()).toEqual(['INVALID_STATE', 'UNKNOWN_GAME']);
    expect(phones[0]?.client.errors()).toEqual(['UNAUTHORIZED']);
  });

  it('seating: participants get the game’s manifest THEN their view (seat known before any game meaning)', () => {
    const { tv, phones, game } = party(2);
    const [a, b] = phones as [Phone, Phone];
    seat(tv, game, [a], 3);
    const types = a.client.received.map((m) => m.type);
    expect(types.slice(-2)).toEqual(['CONTROLLER_MANIFEST', 'CONTROLLER_CONTEXT']);
    expect(a.client.last('CONTROLLER_MANIFEST')?.payload.controls.map((c) => c.id)).toEqual([
      'MOVE',
      'SLASH',
      'THROW',
      'DASH',
    ]);
    expect(view(a)?.participation).toEqual({ gameSessionId: game, status: 'PARTICIPANT', seat: 3 });
    expect(view(b)?.participation).toEqual({ gameSessionId: game, status: 'WAITING' });
    expect(b.client.all('CONTROLLER_MANIFEST')).toEqual([]);
    expect(tv.last('CONSOLE_UPDATED')?.payload.game?.participants).toEqual([
      { controllerId: a.controllerId, seat: 3 },
    ]);
  });

  it('every view carries a newer version than the last', () => {
    const { tv, phones, game } = party(2);
    seat(tv, game, phones);
    tv.send(msg.gameMatchStart(game));
    tv.send(msg.tvContext(1, 'PAUSED', game));
    tv.send(msg.gameExit(game));
    const versions =
      phones[0]?.client.all('CONTROLLER_CONTEXT').map((m) => m.payload.version) ?? [];
    expect(versions.length).toBeGreaterThan(3);
    for (let i = 1; i < versions.length; i += 1) {
      expect((versions[i] ?? 0) > (versions[i - 1] ?? 0)).toBe(true);
    }
  });
});

describe('GAME_PARTICIPANTS: the TV’s desired state, validated by the server, all or nothing', () => {
  it.each([
    ['a controller of another console', 'foreign'],
    ['an unknown controller', 'unknown'],
    ['the same controller twice', 'twice'],
    ['two people in one seat', 'sharedSeat'],
    ['a seat beyond the game (7 of 6)', 'seat7'],
    ['seat 0', 'seat0'],
    ['a controller that has left', 'left'],
  ])('rejects a list with %s, and changes nothing', (_name, kind) => {
    const { tv, phones, game } = party(3);
    const other = rig.console();
    const stranger = rig.controller(other.joinCode, 'Stranger');
    const [a, b, c] = phones as [Phone, Phone, Phone];
    seat(tv, game, [a]);
    if (kind === 'left') c.client.send(msg.controllerLeave());
    const before = JSON.stringify(tv.last('CONSOLE_UPDATED')?.payload.game);
    const beforeViews = phones.map((p) => p.client.all('CONTROLLER_CONTEXT').length);
    const lists: Record<string, { controllerId: string; seat: number }[]> = {
      foreign: [
        { controllerId: a.controllerId, seat: 1 },
        { controllerId: stranger.controllerId, seat: 2 },
      ],
      unknown: [
        { controllerId: a.controllerId, seat: 1 },
        { controllerId: 'controller-999', seat: 2 },
      ],
      twice: [
        { controllerId: a.controllerId, seat: 1 },
        { controllerId: a.controllerId, seat: 2 },
      ],
      sharedSeat: [
        { controllerId: a.controllerId, seat: 1 },
        { controllerId: b.controllerId, seat: 1 },
      ],
      seat7: [
        { controllerId: a.controllerId, seat: 1 },
        { controllerId: b.controllerId, seat: 7 },
      ],
      seat0: [{ controllerId: b.controllerId, seat: 0 }],
      left: [
        { controllerId: a.controllerId, seat: 1 },
        { controllerId: c.controllerId, seat: 2 },
      ],
    };
    tv.send(msg.gameParticipants((seq += 1), game, lists[kind] ?? []));
    expect(tv.errors().length).toBe(1);
    expect(JSON.stringify(tv.last('CONSOLE_UPDATED')?.payload.game)).toBe(before);
    expect(phones.map((p) => p.client.all('CONTROLLER_CONTEXT').length)).toEqual(beforeViews);
  });

  it('a stale or replayed sequence number has zero effect', () => {
    const { tv, phones, game } = party(2);
    const [a, b] = phones as [Phone, Phone];
    tv.send(msg.gameParticipants(10, game, [{ controllerId: a.controllerId, seat: 1 }]));
    tv.send(msg.gameParticipants(10, game, [{ controllerId: b.controllerId, seat: 1 }])); // replay
    tv.send(msg.gameParticipants(9, game, [{ controllerId: b.controllerId, seat: 1 }])); // older
    expect(tv.last('CONSOLE_UPDATED')?.payload.game?.participants).toEqual([
      { controllerId: a.controllerId, seat: 1 },
    ]);
    expect(tv.errors()).toEqual([]); // quietly dropped, like stale movement
    expect(rig.server.diagnostics().staleParticipantsDiscarded).toBe(2);
  });

  it('only the TV of this console may seat; never a phone', () => {
    const { phones, game } = party(1);
    phones[0]?.client.send(
      msg.gameParticipants(1, game, [{ controllerId: phones[0].controllerId, seat: 1 }]),
    );
    expect(phones[0]?.client.errors()).toEqual(['UNAUTHORIZED']);
  });

  it('every game operation is the TV’s: a phone gets UNAUTHORIZED and nothing changes', () => {
    const { tv, phones, game } = party(1);
    const phone = phones[0] as Phone;
    seat(tv, game, [phone]);
    const before = JSON.stringify(tv.last('CONSOLE_UPDATED')?.payload);
    phone.client.send(msg.gameLaunch());
    phone.client.send(msg.gameMatchStart(game));
    phone.client.send(msg.gameMatchEnd(game));
    phone.client.send(msg.tvContext(1, 'PAUSED', game));
    phone.client.send(msg.gameExit(game));
    expect(phone.client.errors()).toEqual(Array.from({ length: 5 }, () => 'UNAUTHORIZED'));
    expect(JSON.stringify(tv.last('CONSOLE_UPDATED')?.payload)).toBe(before);
  });

  it('no seat changes while a match runs or is paused; allowed again between matches', () => {
    const { tv, phones, game } = party(3);
    const [a, b, c] = phones as [Phone, Phone, Phone];
    seat(tv, game, [a, b]);
    tv.send(msg.gameMatchStart(game));
    seat(tv, game, [a, c]);
    tv.send(msg.tvContext(1, 'PAUSED', game));
    seat(tv, game, [a, c]);
    expect(tv.errors()).toEqual(['INVALID_STATE', 'INVALID_STATE']);
    tv.send(msg.tvContext(2, 'RESULTS', game)); // match over, on the TV
    seat(tv, game, [a, c]);
    expect(view(c)?.participation).toMatchObject({ status: 'PARTICIPANT' });
  });
});

describe('input routing follows participation and context; identity is the connection’s', () => {
  function playing(n: number, seated: number) {
    const p = party(n);
    seat(p.tv, p.game, p.phones.slice(0, seated));
    p.tv.send(msg.gameMatchStart(p.game));
    return p;
  }

  it('a participant’s input reaches the TV, tagged with ITS controller id and the launch', () => {
    const { tv, phones, game } = playing(2, 1);
    phones[0]?.client.send(msg.move(1, 0.5, 0));
    press(phones[0] as Phone);
    expect(inputs(tv)).toEqual([
      {
        controllerId: phones[0]?.controllerId,
        gameSessionId: game,
        input: { kind: 'MOVE', seq: 1, x: 0.5, y: 0 },
      },
      expect.objectContaining({ controllerId: phones[0]?.controllerId, gameSessionId: game }),
    ]);
  });

  it('a WAITING controller: no gameplay input, no pause, no release — nothing reaches the TV', () => {
    const { tv, phones } = playing(2, 1);
    const waiting = phones[1] as Phone;
    expect(view(waiting)?.context).toBe('WAITING');
    waiting.client.send(msg.move(1, 1, 0));
    press(waiting);
    press(waiting, 'PRIMARY', 'released');
    press(waiting, 'MENU');
    press(waiting, 'MENU', 'released');
    expect(inputs(tv)).toEqual([]);
    expect(waiting.client.errors()).toEqual([]); // quietly: it is not an error to press a phone
    expect(rig.server.diagnostics().consoleInputDropped).toBe(5);
  });

  it('MENU: an active participant may pause (and resume); simultaneous presses route ONE toggle', () => {
    const { tv, phones, game } = playing(3, 2);
    const [a, b] = phones as [Phone, Phone];
    press(a, 'MENU');
    press(b, 'MENU'); // at the same instant: coalesced
    expect(
      inputs(tv).filter(
        (i) =>
          i.input.kind === 'ACTION' && i.input.action === 'MENU' && i.input.phase === 'pressed',
      ),
    ).toHaveLength(1);
    press(a, 'MENU', 'released'); // releases always flow for those who may act
    tv.send(msg.tvContext(1, 'PAUSED', game)); // the TV paused: a new epoch of meaning
    press(b, 'MENU'); // resume, from the other participant
    const menus = inputs(tv).filter((i) => i.input.kind === 'ACTION' && i.input.action === 'MENU');
    expect(menus.map((m) => [m.controllerId, m.input.kind === 'ACTION' && m.input.phase])).toEqual([
      [a.controllerId, 'pressed'],
      [a.controllerId, 'released'],
      [b.controllerId, 'pressed'],
    ]);
  });

  it('…and after the coalescing window a lone press counts again even without a context change', () => {
    const { tv, phones } = playing(1, 1);
    press(phones[0] as Phone, 'MENU');
    rig.advance(1_000);
    press(phones[0] as Phone, 'MENU');
    expect(
      inputs(tv).filter((i) => i.input.kind === 'ACTION' && i.input.phase === 'pressed'),
    ).toHaveLength(2);
  });

  it('nobody pauses in the lobby or at the results; a released or previous-game controller cannot either', () => {
    const { tv, joinCode, phones, game } = party(2);
    const [a, b] = phones as [Phone, Phone];
    seat(tv, game, [a, b]);
    press(a, 'MENU'); // lobby: nothing to pause
    tv.send(msg.gameMatchStart(game));
    tv.send(msg.tvContext(1, 'RESULTS', game));
    press(a, 'MENU'); // results: nothing to pause
    tv.send(msg.gameExit(game));
    tv.send(msg.gameLaunch());
    const next = tv.last('CONSOLE_UPDATED')?.payload.game?.gameSessionId ?? '';
    seat(tv, next, [b]);
    tv.send(msg.gameMatchStart(next));
    rig.advance(1_000);
    press(a, 'MENU'); // A played the PREVIOUS launch, not this one
    b.client.send(msg.controllerLeave());
    press(b, 'MENU'); // left: no identity at all
    expect(
      inputs(tv).filter((i) => i.input.kind === 'ACTION' && i.input.action === 'MENU'),
    ).toEqual([]);
    expect(b.client.errors()).toEqual(['UNAUTHORIZED']);
    void joinCode;
  });

  it('outside a match every member drives the console: lobby and Home navigation reach the TV', () => {
    const { client: tv, joinCode } = rig.console();
    const home = rig.controller(joinCode, 'Home');
    home.client.send(msg.move(1, 0, 1));
    expect(inputs(tv)).toEqual([
      {
        controllerId: home.controllerId,
        gameSessionId: null,
        input: { kind: 'MOVE', seq: 1, x: 0, y: 1 },
      },
    ]);
  });

  it('stale movement and duplicate events are dropped, as for rooms; a retry from a new connection too', () => {
    const { tv, joinCode, phones } = playing(1, 1);
    const a = phones[0] as Phone;
    a.client.send(msg.move(5));
    a.client.send(msg.move(5));
    a.client.send(msg.move(4));
    a.client.send(msg.action('same-event-1', 'PRIMARY'));
    a.client.send(msg.action('same-event-1', 'PRIMARY'));
    const again = rig.connect('controller');
    again.send(msg.controllerReconnect(joinCode, a.reconnectToken));
    again.send(msg.move(1)); // a new connection starts a new stream
    again.send(msg.action('same-event-1', 'PRIMARY')); // but an event id is per controller
    expect(inputs(tv).map((i) => i.input.kind)).toEqual(['MOVE', 'ACTION', 'MOVE']);
  });

  it('input from an unbound or legacy connection never reaches a console', () => {
    const { tv } = playing(1, 1);
    const stranger = rig.connect('controller');
    stranger.send(msg.move(1));
    const room = rig.host();
    const player = rig.player(room.joinCode);
    player.client.send(msg.move(1));
    expect(stranger.errors()).toEqual(['UNAUTHORIZED']);
    expect(inputs(tv)).toEqual([]);
    expect(room.client.all('PLAYER_INPUT')).toHaveLength(1); // the legacy room still works
  });
});

describe('gameSessionId is an epoch: Fu A → GAME_EXIT → Fu B, nothing from A touches B', () => {
  function aThenB() {
    const p = party(3);
    const [a, b] = p.phones as [Phone, Phone];
    seat(p.tv, p.game, [a, b]);
    p.tv.send(msg.gameMatchStart(p.game));
    p.tv.send(msg.gameExit(p.game));
    p.tv.send(msg.gameLaunch());
    const next = p.tv.last('CONSOLE_UPDATED')?.payload.game?.gameSessionId ?? '';
    return { ...p, first: p.game, next };
  }

  it('a new launch is a new id', () => {
    const { first, next } = aThenB();
    expect(next).not.toBe(first);
    expect(next).toMatch(/^game-/);
  });

  it('delayed participant updates, match lifecycle and context for A have no effect on B', () => {
    const { tv, phones, first, next } = aThenB();
    const before = JSON.stringify(tv.last('CONSOLE_UPDATED')?.payload);
    const views = phones.map((p) => p.client.all('CONTROLLER_CONTEXT').length);
    tv.send(
      msg.gameParticipants(500, first, [{ controllerId: phones[2]?.controllerId ?? '', seat: 1 }]),
    );
    tv.send(msg.gameMatchStart(first));
    tv.send(msg.gameMatchEnd(first));
    tv.send(msg.tvContext(50, 'PAUSED', first));
    tv.send(msg.gameExit(first));
    expect(JSON.stringify(tv.last('CONSOLE_UPDATED')?.payload)).toBe(before);
    expect(phones.map((p) => p.client.all('CONTROLLER_CONTEXT').length)).toEqual(views);
    expect(tv.last('CONSOLE_UPDATED')?.payload.game?.gameSessionId).toBe(next);
    expect(rig.server.diagnostics().staleGameDiscarded).toBe(5);
    expect(tv.errors()).toEqual([]);
  });

  it('a context or match message from a console TV must name its launch', () => {
    const { tv, next } = aThenB();
    tv.send({ type: 'MATCH_START', payload: {} });
    tv.send({
      type: 'CONTROLLER_CONTEXT',
      seq: 99,
      payload: { context: 'CONSOLE', secondaryAction: null },
    });
    expect(tv.errors()).toEqual(['INVALID_MESSAGE', 'INVALID_MESSAGE']);
    expect(tv.last('CONSOLE_UPDATED')?.payload.game?.state).toBe('LOBBY');
    void next;
  });

  it('A’s players are not B’s: their input is console navigation, never gameplay, and is tagged B', () => {
    const { tv, phones, next } = aThenB();
    const a = phones[0] as Phone;
    expect(view(a)?.participation).toEqual({ gameSessionId: next, status: 'WAITING' });
    a.client.send(msg.move(1, 1, 0));
    expect(inputs(tv).at(-1)).toMatchObject({ controllerId: a.controllerId, gameSessionId: next });
    tv.send(msg.gameMatchStart(next)); // B starts with nobody of A seated
    a.client.send(msg.move(2, 1, 0));
    expect(inputs(tv)).toHaveLength(1);
  });
});

describe('membership across games: exit keeps every controller; reconnect keeps the seat', () => {
  it('GAME_EXIT destroys the launch and seats, never the controllers', () => {
    const { tv, phones, game } = party(3);
    seat(tv, game, phones);
    tv.send(msg.gameMatchStart(game));
    tv.send(msg.gameExit(game));
    const snapshot = tv.last('CONSOLE_UPDATED')?.payload;
    expect(snapshot?.game).toBeNull();
    expect(snapshot?.controllers.map((c) => c.displayName)).toEqual(['P1', 'P2', 'P3']);
    for (const phone of phones) {
      expect(view(phone)).toMatchObject({ context: 'CONSOLE', participation: null });
    }
  });

  it('a participant who reconnects mid-match keeps its seat and gets the manifest again', () => {
    const { tv, joinCode, phones, game } = party(2);
    const a = phones[0] as Phone;
    seat(tv, game, [a], 4);
    tv.send(msg.gameMatchStart(game));
    a.client.drop();
    const back = rig.connect('controller');
    back.send(msg.controllerReconnect(joinCode, a.reconnectToken));
    expect(back.received.map((m) => m.type).slice(1)).toEqual([
      'CONTROLLER_RECONNECTED',
      'CONTROLLER_MANIFEST',
      'CONTROLLER_CONTEXT',
      'CONSOLE_STATUS',
    ]);
    expect(back.last('CONTROLLER_CONTEXT')?.payload).toMatchObject({
      context: 'GAMEPLAY',
      participation: { gameSessionId: game, status: 'PARTICIPANT', seat: 4 },
    });
  });

  it('a participant gone past the reservation leaves an EMPTY seat: no spectator is promoted', () => {
    const { tv, phones, game } = party(3);
    const [a, b, c] = phones as [Phone, Phone, Phone];
    seat(tv, game, [a, b]);
    tv.send(msg.gameMatchStart(game));
    a.client.drop();
    rig.advance(60_000);
    expect(tv.last('CONSOLE_UPDATED')?.payload.game?.participants).toEqual([
      { controllerId: b.controllerId, seat: 2 },
    ]);
    expect(view(c)?.context).toBe('WAITING');
    expect(view(c)?.participation).toMatchObject({ status: 'WAITING' });
  });

  it('a phone joining Foomerang mid-match changes nothing about the game', () => {
    const { tv, joinCode, phones, game } = party(1);
    seat(tv, game, phones);
    tv.send(msg.gameMatchStart(game));
    const before = JSON.stringify(tv.last('CONSOLE_UPDATED')?.payload.game);
    const late = rig.controller(joinCode, 'Late');
    expect(JSON.stringify(tv.last('CONSOLE_UPDATED')?.payload.game)).toBe(before);
    expect(view(late)).toMatchObject({ context: 'WAITING', participation: { status: 'WAITING' } });
  });
});
