import { describe, expect, it } from 'vitest';
import { effectiveContext, mayPause, participationOf, type ConsoleSession } from '../src/console';
import { ConsoleRegistry } from '../src/consoleRegistry';
import type { ConsoleId, ControllerId, GameSessionId } from '../src/ids';
import { createFakeConsoleEnvironment } from './support/fakeConsoleEnvironment';

const FU = { gameId: 'foomerang-fu', minPlayers: 0, maxPlayers: 6 } as const;

function value<T>(result: { ok: true; value: T } | { ok: false; reason: string }): T {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.value;
}

function setup(options: { maxControllers?: number } = {}) {
  const env = createFakeConsoleEnvironment();
  const registry = new ConsoleRegistry(env, options);
  const session = value(registry.open());
  const id = session.consoleId;
  const code = session.joinCode;
  const tokens = new Map<ControllerId, string>();
  const api = {
    env,
    registry,
    id,
    code,
    session: (): ConsoleSession => {
      const s = registry.get(id);
      if (s === undefined) throw new Error('gone');
      return s;
    },
    join(name: string): ControllerId {
      const { controller } = value(registry.join(code, name));
      tokens.set(controller.controllerId, controller.reconnectToken.reveal());
      return controller.controllerId;
    },
    token: (c: ControllerId) => tokens.get(c) ?? '',
    controller: (c: ControllerId) => api.session().controllers.find((x) => x.controllerId === c),
    launch(): GameSessionId {
      return value(registry.launchGame(id, FU)).game.gameSessionId;
    },
    play(game: GameSessionId) {
      value(registry.beginMatch(id, game));
      value(registry.startPlaying(id, game));
    },
    participants: () => api.session().activeGame?.participants ?? [],
    after: (ms: number) => {
      env.time += ms;
      registry.reconcile();
    },
  };
  return api;
}

describe('a console session: Foomerang on one TV, before any game', () => {
  it('opens with a join code, a connected host, no controllers, no game, and the CONSOLE context', () => {
    const t = setup();
    const s = t.session();
    expect(s.state).toBe('OPEN');
    expect(t.registry.findByJoinCode(t.code.toLowerCase())?.consoleId).toBe(t.id);
    expect(s.host.connection.status).toBe('CONNECTED');
    expect(s.controllers).toEqual([]);
    expect(s.activeGame).toBeNull();
    expect(s.context).toEqual({ value: 'CONSOLE', secondaryAction: null, version: 1 });
  });

  it('a phone joins Foomerang itself: a controller, not a player of any game', () => {
    const t = setup();
    const a = t.join('Alice');
    expect(t.controller(a)).toMatchObject({
      displayName: 'Alice',
      connection: { status: 'CONNECTED' },
      membership: { status: 'HELD' },
    });
    expect(participationOf(t.session(), a)).toBe('NONE');
    expect(effectiveContext(t.session(), a)).toBe('CONSOLE');
  });

  it('holds at most 8 controllers (a console limit, not a game’s); a released one frees its place', () => {
    const t = setup();
    const ids = Array.from({ length: 8 }, (_, i) => t.join(`P${i + 1}`));
    expect(t.registry.join(t.code, 'Ninth')).toEqual({ ok: false, reason: 'CONSOLE_FULL' });
    value(t.registry.releaseController(t.id, ids[0] as ControllerId, 'LEFT'));
    expect(t.registry.join(t.code, 'Ninth').ok).toBe(true);
  });

  it('refuses a bad name and an unknown code, and a failed join changes nothing', () => {
    const t = setup();
    const before = t.session();
    expect(t.registry.join(t.code, '   ')).toEqual({ ok: false, reason: 'INVALID_DISPLAY_NAME' });
    expect(t.registry.join('ZZZZZZ', 'Al')).toEqual({ ok: false, reason: 'CONSOLE_NOT_FOUND' });
    expect(t.session()).toBe(before);
  });
});

describe('controller identity: reconnect, rotation, release', () => {
  it('reconnecting restores the SAME controller and rotates its credential', () => {
    const t = setup();
    const a = t.join('Alice');
    const old = t.token(a);
    value(t.registry.disconnectController(t.id, a));
    const back = value(t.registry.reconnectController(t.id, old));
    expect(back.controller.controllerId).toBe(a);
    expect(back.replacedActiveConnection).toBe(false);
    expect(back.controller.reconnectToken.equals(old)).toBe(false);
    expect(t.registry.reconnectController(t.id, old)).toEqual({
      ok: false,
      reason: 'INVALID_CREDENTIAL',
    });
  });

  it('a credential presented while still connected is a takeover', () => {
    const t = setup();
    const a = t.join('Alice');
    expect(value(t.registry.reconnectController(t.id, t.token(a))).replacedActiveConnection).toBe(
      true,
    );
  });

  it('a phone gone longer than the reservation is released; its credential no longer works', () => {
    const t = setup();
    const a = t.join('Alice');
    value(t.registry.disconnectController(t.id, a));
    t.after(10_000);
    expect(t.controller(a)?.connection.status).toBe('DISCONNECTED');
    expect(t.controller(a)?.membership.status).toBe('HELD');
    t.after(50_000);
    expect(t.controller(a)?.membership.status).toBe('RELEASED');
    expect(t.controller(a)?.releaseReason).toBe('ABSENT');
    expect(t.registry.reconnectController(t.id, t.token(a))).toEqual({
      ok: false,
      reason: 'MEMBERSHIP_RELEASED',
    });
  });

  it('removed by the TV: released at once, and the old credential cannot reclaim it', () => {
    const t = setup();
    const a = t.join('Alice');
    value(t.registry.releaseController(t.id, a, 'REMOVED'));
    expect(t.controller(a)).toMatchObject({
      membership: { status: 'RELEASED' },
      connection: { status: 'DISCONNECTED' },
      releaseReason: 'REMOVED',
    });
    expect(t.registry.reconnectController(t.id, t.token(a)).ok).toBe(false);
    const again = t.join('Alice'); // coming back means joining as somebody new
    expect(again).not.toBe(a);
  });
});

describe('games: launched on the console, participants scoped to one launch', () => {
  it('launch seats connected controllers in console join order up to the game’s capacity; the rest WAIT', () => {
    const t = setup();
    const ids = Array.from({ length: 8 }, (_, i) => t.join(`P${i + 1}`));
    const game = t.launch();
    expect(t.participants()).toEqual(ids.slice(0, 6));
    t.play(game);
    for (const id of ids.slice(0, 6)) expect(participationOf(t.session(), id)).toBe('PARTICIPANT');
    for (const id of ids.slice(6)) {
      expect(participationOf(t.session(), id)).toBe('WAITING');
      expect(effectiveContext(t.session(), id)).toBe('WAITING');
    }
  });

  it('a phone whose connection is lost for good (DISCONNECTED) is not seated; a briefly reconnecting one is', () => {
    const t = setup();
    const gone = t.join('Gone');
    const blip = t.join('Blip');
    value(t.registry.disconnectController(t.id, gone));
    t.after(10_000); // Gone: DISCONNECTED, still HELD
    value(t.registry.disconnectController(t.id, blip)); // Blip: RECONNECTING
    t.launch();
    expect(t.participants()).toEqual([blip]);
  });

  it('only one game at a time, with a valid capacity', () => {
    const t = setup();
    t.launch();
    expect(t.registry.launchGame(t.id, FU)).toEqual({ ok: false, reason: 'GAME_ALREADY_ACTIVE' });
    const u = setup();
    expect(u.registry.launchGame(u.id, { gameId: 'Bad Id', minPlayers: 0, maxPlayers: 6 })).toEqual(
      { ok: false, reason: 'INVALID_GAME_CONFIG' },
    );
  });

  it('a match: LOBBY → STARTING → PLAYING (GAMEPLAY) → RESULTS (CONSOLE) → LOBBY', () => {
    const t = setup();
    t.join('Alice');
    const game = t.launch();
    t.play(game);
    expect(t.session().activeGame?.state).toBe('PLAYING');
    expect(t.session().context.value).toBe('GAMEPLAY');
    value(t.registry.finishMatch(t.id, game));
    expect(t.session().activeGame?.state).toBe('RESULTS');
    expect(t.session().context.value).toBe('CONSOLE');
    value(t.registry.returnGameToLobby(t.id, game));
    expect(t.session().activeGame?.state).toBe('LOBBY');
    expect(t.registry.startPlaying(t.id, game)).toEqual({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
  });

  it('a message for a game that has been exited is stale: it never touches the next game', () => {
    const t = setup();
    t.join('Alice');
    const first = t.launch();
    value(t.registry.exitGame(t.id, first));
    const second = t.launch();
    expect(second).not.toBe(first);
    expect(t.registry.beginMatch(t.id, first)).toEqual({ ok: false, reason: 'STALE_GAME' });
    expect(t.registry.setParticipants(t.id, first, [])).toEqual({
      ok: false,
      reason: 'STALE_GAME',
    });
    expect(t.registry.exitGame(t.id, first)).toEqual({ ok: false, reason: 'STALE_GAME' });
    expect(t.session().activeGame?.gameSessionId).toBe(second);
  });

  it('returning Home ends the game and its seats, never the controllers', () => {
    const t = setup();
    const a = t.join('Alice');
    const b = t.join('Bob');
    const game = t.launch();
    t.play(game);
    value(t.registry.exitGame(t.id, game));
    const s = t.session();
    expect(s.activeGame).toBeNull();
    expect(s.context.value).toBe('CONSOLE');
    expect(s.controllers.map((c) => [c.controllerId, c.membership.status])).toEqual([
      [a, 'HELD'],
      [b, 'HELD'],
    ]);
    expect(participationOf(s, a)).toBe('NONE');
  });

  it('launching again seats afresh from who is connected now (no seat is permanent)', () => {
    const t = setup();
    const a = t.join('Alice');
    const b = t.join('Bob');
    const first = t.launch();
    value(t.registry.setParticipants(t.id, first, [b])); // Alice benched in the first game
    value(t.registry.exitGame(t.id, first));
    t.launch();
    expect(t.participants()).toEqual([a, b]);
  });
});

describe('seat changes follow the game’s lifecycle', () => {
  function sixPlusTwo() {
    const t = setup();
    const ids = Array.from({ length: 8 }, (_, i) => t.join(`P${i + 1}`));
    const game = t.launch();
    return { t, ids, game };
  }

  it('the host may bench and seat in the lobby', () => {
    const { t, ids, game } = sixPlusTwo();
    const seated = [...ids.slice(1, 6), ids[6]] as ControllerId[];
    value(t.registry.setParticipants(t.id, game, seated));
    expect(t.participants()).toEqual(seated);
  });

  it('never during a running match — playing or paused', () => {
    const { t, ids, game } = sixPlusTwo();
    t.play(game);
    const swap = [...ids.slice(0, 5), ids[6]] as ControllerId[];
    expect(t.registry.setParticipants(t.id, game, swap)).toEqual({
      ok: false,
      reason: 'INVALID_STATE',
    });
    value(t.registry.setContext(t.id, 'PAUSED', null));
    expect(t.registry.setParticipants(t.id, game, swap).ok).toBe(false);
  });

  it('between matches (match over: RESULTS) the host may seat a waiting controller for the rematch', () => {
    const { t, ids, game } = sixPlusTwo();
    t.play(game);
    value(t.registry.setContext(t.id, 'RESULTS', null));
    const swap = [...ids.slice(0, 5), ids[6]] as ControllerId[];
    value(t.registry.setParticipants(t.id, game, swap));
    expect(participationOf(t.session(), ids[6] as ControllerId)).toBe('PARTICIPANT');
  });

  it('a participant released mid-match leaves an empty seat: nobody waiting is promoted', () => {
    const { t, ids, game } = sixPlusTwo();
    t.play(game);
    const leaver = ids[2] as ControllerId;
    value(t.registry.releaseController(t.id, leaver, 'LEFT'));
    expect(t.participants()).toEqual(ids.slice(0, 6).filter((id) => id !== leaver));
    expect(participationOf(t.session(), ids[6] as ControllerId)).toBe('WAITING');
  });

  it('rejects unknown, released, repeated or too many controllers', () => {
    const { t, ids, game } = sixPlusTwo();
    value(t.registry.releaseController(t.id, ids[7] as ControllerId, 'LEFT'));
    const bad: [ControllerId[], string][] = [
      [['controller-404' as ControllerId], 'UNKNOWN_CONTROLLER'],
      [[ids[7] as ControllerId], 'UNKNOWN_CONTROLLER'],
      [[ids[0], ids[0]] as ControllerId[], 'INVALID_PARTICIPANTS'],
      [ids.slice(0, 7), 'TOO_MANY_PARTICIPANTS'],
    ];
    for (const [list, reason] of bad) {
      expect(t.registry.setParticipants(t.id, game, list)).toEqual({ ok: false, reason });
    }
  });
});

describe('what each phone’s controls mean, and who may pause', () => {
  it('WAITING only while a match is on; in the lobby a non-participant navigates the console', () => {
    const t = setup();
    const ids = Array.from({ length: 7 }, (_, i) => t.join(`P${i + 1}`));
    const game = t.launch();
    const spare = ids[6] as ControllerId;
    expect(participationOf(t.session(), spare)).toBe('WAITING');
    expect(effectiveContext(t.session(), spare)).toBe('CONSOLE');
    t.play(game);
    expect(effectiveContext(t.session(), spare)).toBe('WAITING');
    expect(effectiveContext(t.session(), ids[0] as ControllerId)).toBe('GAMEPLAY');
  });

  it('only an active participant may pause, and only while the match runs (or to resume it)', () => {
    const t = setup();
    const ids = Array.from({ length: 7 }, (_, i) => t.join(`P${i + 1}`));
    const game = t.launch();
    const player = ids[0] as ControllerId;
    const spare = ids[6] as ControllerId;
    expect(mayPause(t.session(), player)).toBe(false); // lobby: nothing to pause
    t.play(game);
    expect(mayPause(t.session(), player)).toBe(true);
    expect(mayPause(t.session(), spare)).toBe(false);
    value(t.registry.setContext(t.id, 'PAUSED', null));
    expect(mayPause(t.session(), player)).toBe(true); // resume
    expect(mayPause(t.session(), spare)).toBe(false);
    value(t.registry.setContext(t.id, 'RESULTS', null));
    expect(mayPause(t.session(), player)).toBe(false);
  });

  it('the context changes version only when it really changes; non-CONSOLE needs a running match', () => {
    const t = setup();
    expect(t.registry.setContext(t.id, 'GAMEPLAY', null)).toEqual({
      ok: false,
      reason: 'INVALID_STATE',
    });
    const before = t.session();
    value(t.registry.setContext(t.id, 'CONSOLE', null));
    expect(t.session().context.version).toBe(before.context.version);
    value(t.registry.setContext(t.id, 'CONSOLE', { label: 'OPTIONS' }));
    expect(t.session().context).toEqual({
      value: 'CONSOLE',
      secondaryAction: { label: 'OPTIONS' },
      version: before.context.version + 1,
    });
  });
});

describe('the TV: absence, recovery and closing', () => {
  it('an unestablished session (no controller) whose TV is gone for 10 minutes closes', () => {
    const t = setup();
    value(t.registry.disconnectHost(t.id));
    t.after(599_999);
    expect(t.session().state).toBe('OPEN');
    t.after(1);
    expect(t.session()).toMatchObject({ state: 'CLOSING', closeReason: 'TV_GONE' });
  });

  it('an established party survives a TV that lost Wi-Fi for 10 minutes, and closes only after the recovery window', () => {
    const t = setup();
    t.join('Alice');
    value(t.registry.disconnectHost(t.id));
    t.after(600_000);
    expect(t.session().state).toBe('OPEN');
    t.after(1_200_000);
    expect(t.session()).toMatchObject({ state: 'CLOSING', closeReason: 'TV_GONE' });
  });

  it('a TV that comes back in time keeps everything, and its absence clock starts again next time', () => {
    const t = setup();
    const a = t.join('Alice');
    value(t.registry.disconnectHost(t.id));
    t.after(1_000_000);
    const host = value(t.registry.reconnectHost(t.id, t.session().host.hostToken.reveal()));
    expect(host.session.state).toBe('OPEN');
    expect(t.controller(a)?.membership.status).toBe('HELD');
    value(t.registry.disconnectHost(t.id));
    t.after(1_000_000);
    expect(t.session().state).toBe('OPEN');
  });

  it('when every phone has gone during the absence, the 10-minute rule applies from the TV’s disconnect', () => {
    const t = setup();
    const a = t.join('Alice');
    value(t.registry.disconnectHost(t.id));
    value(t.registry.releaseController(t.id, a, 'LEFT'));
    t.after(600_000);
    expect(t.session()).toMatchObject({ state: 'CLOSING', closeReason: 'TV_GONE' });
  });

  it('closing from the TV releases every controller, ends the game, refuses joins, then frees the code', () => {
    const t = setup();
    const a = t.join('Alice');
    t.launch();
    value(t.registry.beginClose(t.id));
    const s = t.session();
    expect(s).toMatchObject({ state: 'CLOSING', closeReason: 'CLOSED_BY_TV', activeGame: null });
    expect(t.controller(a)).toMatchObject({
      membership: { status: 'RELEASED' },
      releaseReason: 'CONSOLE_CLOSED',
    });
    expect(t.registry.join(t.code, 'Late')).toEqual({ ok: false, reason: 'CONSOLE_NOT_JOINABLE' });
    expect(t.registry.reconnectController(t.id, t.token(a)).ok).toBe(false);
    value(t.registry.completeClose(t.id));
    expect(t.registry.get(t.id)).toBeUndefined();
    expect(t.registry.findByJoinCode(t.code)).toBeUndefined();
  });

  it('a failed operation commits nothing, not even the passage of time', () => {
    const t = setup();
    t.join('Alice');
    const before = t.session();
    t.env.time += 70_000;
    expect(t.registry.setContext(t.id, 'GAMEPLAY', null).ok).toBe(false);
    expect(t.registry.get(t.id)).toBe(before);
  });

  it('a clock that goes backwards is refused loudly', () => {
    const t = setup();
    t.env.time -= 1;
    expect(() => t.registry.join(t.code, 'Alice')).toThrow(/backwards/);
  });

  it('unknown console ids are reported, never invented', () => {
    const t = setup();
    expect(t.registry.join('ABCDEF', 'x').ok).toBe(false);
    expect(t.registry.launchGame('nope' as ConsoleId, FU)).toEqual({
      ok: false,
      reason: 'CONSOLE_NOT_FOUND',
    });
  });
});
