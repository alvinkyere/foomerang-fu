import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FakeClient } from './support/fakes';
import { codeFor } from './support/fakes';
import { createRig, msg, type Rig } from './support/rig';

let rig: Rig;
beforeEach(async () => {
  rig = createRig();
  await rig.start();
});
afterEach(async () => {
  await rig.stop();
});

/** The TV's current view of its controllers (from its latest snapshot). */
const roster = (tv: FakeClient) =>
  (tv.last('CONSOLE_UPDATED')?.payload.controllers ?? []).map((c) => [c.displayName, c.connection]);
const statuses = (phone: FakeClient) =>
  phone.all('CONSOLE_STATUS').map((m) => m.payload.hostConnection);
const MINUTE = 60_000;

describe('a TV opens Foomerang: a console session with a join code', () => {
  it('CONSOLE_OPEN answers with the code and the TV’s own credential, then a snapshot', () => {
    const tv = rig.connect('console');
    tv.send(msg.consoleOpen());
    const opened = tv.last('CONSOLE_OPENED');
    expect(opened?.payload.joinCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(opened?.payload.hostToken).toMatch(/^HOST-SECRET-/);
    expect(tv.last('CONSOLE_UPDATED')?.payload).toEqual({
      joinCode: opened?.payload.joinCode,
      state: 'OPEN',
      hostConnection: 'CONNECTED',
      controllers: [],
      game: null,
    });
  });

  it('only a console with no identity may open one; a phone may not', () => {
    const phone = rig.connect('controller');
    phone.send(msg.consoleOpen());
    expect(phone.errors()).toEqual(['UNAUTHORIZED']);
    const { client: tv } = rig.console();
    tv.send(msg.consoleOpen()); // one connection, one identity
    expect(tv.errors()).toEqual(['UNAUTHORIZED']);
    expect(tv.all('CONSOLE_OPENED')).toHaveLength(1);
  });
});

describe('phones join Foomerang as controllers', () => {
  it('a join makes a controller: its identity, its view (CONSOLE, no game) and the TV’s status', () => {
    const { client: tv, joinCode } = rig.console();
    const phone = rig.connect('controller');
    phone.send(msg.controllerJoin(joinCode.toLowerCase(), 'Alice'));
    const joined = phone.last('CONTROLLER_JOINED');
    expect(joined?.payload.controllerId).toBe('controller-1');
    expect(phone.received.map((m) => m.type)).toEqual([
      'HANDSHAKE_ACCEPTED',
      'CONTROLLER_JOINED',
      'CONTROLLER_CONTEXT',
      'CONSOLE_STATUS',
    ]);
    expect(phone.last('CONTROLLER_CONTEXT')?.payload).toEqual({
      context: 'CONSOLE',
      secondaryAction: null,
      version: 1,
      participation: null,
    });
    expect(statuses(phone)).toEqual(['CONNECTED']);
    expect(roster(tv)).toEqual([['Alice', 'CONNECTED']]);
  });

  it('several phones: the TV sees them in join order, with identities but never credentials', () => {
    const { client: tv, joinCode } = rig.console();
    const names = ['Alice', 'Bob', 'Cleo'];
    const phones = names.map((name) => rig.controller(joinCode, name));
    expect(roster(tv)).toEqual(names.map((n) => [n, 'CONNECTED']));
    expect(tv.last('CONSOLE_UPDATED')?.payload.controllers.map((c) => c.controllerId)).toEqual(
      phones.map((p) => p.controllerId),
    );
    const everythingTheTvSaw = JSON.stringify(tv.received);
    for (const phone of phones) expect(everythingTheTvSaw).not.toContain(phone.reconnectToken);
    // each phone learns only its own credential
    const bob = JSON.stringify(phones[1]?.client.received);
    expect(bob).not.toContain(phones[0]?.reconnectToken);
    expect(bob).not.toContain(phones[2]?.reconnectToken);
  });

  it('holds 8 controllers; the ninth is refused with CONSOLE_FULL and nothing changes', () => {
    const { client: tv, joinCode } = rig.console();
    for (let i = 1; i <= 8; i += 1) rig.controller(joinCode, `P${i}`);
    const snapshots = tv.all('CONSOLE_UPDATED').length;
    const ninth = rig.connect('controller');
    ninth.send(msg.controllerJoin(joinCode, 'Ninth'));
    expect(ninth.errors()).toEqual(['CONSOLE_FULL']);
    expect(tv.all('CONSOLE_UPDATED')).toHaveLength(snapshots);
    ninth.send(msg.controllerJoin(joinCode, 'Ninth')); // and it may try again later
    expect(ninth.errors()).toEqual(['CONSOLE_FULL', 'CONSOLE_FULL']);
  });

  it('a bad name or an unknown code is refused; a join code grants nothing but the join', () => {
    const { joinCode } = rig.console();
    const phone = rig.connect('controller');
    phone.send(msg.controllerJoin(joinCode, '   '));
    phone.send(msg.controllerJoin('ZZZZZZ', 'Alice'));
    phone.send(msg.controllerRemove('controller-1')); // a code is not authority over anybody
    phone.send(msg.consoleClose());
    expect(phone.errors()).toEqual([
      'INVALID_DISPLAY_NAME',
      'ROOM_NOT_FOUND',
      'UNAUTHORIZED',
      'UNAUTHORIZED',
    ]);
  });
});

describe('controller identity survives transport replacement', () => {
  it('drop → the TV sees Reconnecting → reconnect: the SAME controller, a rotated credential', () => {
    const { client: tv, joinCode } = rig.console();
    const alice = rig.controller(joinCode, 'Alice');
    alice.client.drop();
    expect(roster(tv)).toEqual([['Alice', 'RECONNECTING']]);
    const again = rig.connect('controller');
    again.send(msg.controllerReconnect(joinCode, alice.reconnectToken));
    const back = again.last('CONTROLLER_RECONNECTED');
    expect(back?.payload.controllerId).toBe(alice.controllerId);
    expect(back?.payload.reconnectToken).not.toBe(alice.reconnectToken);
    expect(again.last('CONTROLLER_CONTEXT')?.payload.context).toBe('CONSOLE');
    expect(roster(tv)).toEqual([['Alice', 'CONNECTED']]);

    const thief = rig.connect('controller');
    thief.send(msg.controllerReconnect(joinCode, alice.reconnectToken)); // the old one is dead
    expect(thief.errors()).toEqual(['INVALID_RECONNECT_TOKEN']);
  });

  it('takeover: a second device with the credential wins; the old socket’s LATE close changes nothing', () => {
    const { client: tv, joinCode } = rig.console();
    const alice = rig.controller(joinCode, 'Alice');
    alice.client.connection.deferCloseEvent = true;
    const newPhone = rig.connect('controller');
    newPhone.send(msg.controllerReconnect(joinCode, alice.reconnectToken));
    expect(newPhone.last('CONTROLLER_RECONNECTED')?.payload.controllerId).toBe(alice.controllerId);
    expect(alice.client.closed).toBe(true);
    alice.client.connection.flushClose(); // the stale close arrives only now
    expect(roster(tv)).toEqual([['Alice', 'CONNECTED']]);
    expect(rig.server.diagnostics().staleClosesIgnored).toBe(1);
    expect(rig.server.diagnostics().takeovers).toBe(1);
    newPhone.drop(); // the CURRENT transport does count
    expect(roster(tv)).toEqual([['Alice', 'RECONNECTING']]);
  });

  it('gone past the reservation: the membership is released and the TV no longer lists it', () => {
    const { client: tv, joinCode } = rig.console();
    const alice = rig.controller(joinCode, 'Alice');
    alice.client.drop();
    rig.advance(10_000);
    expect(roster(tv)).toEqual([['Alice', 'DISCONNECTED']]);
    rig.advance(50_000);
    expect(roster(tv)).toEqual([]);
    const back = rig.connect('controller');
    back.send(msg.controllerReconnect(joinCode, alice.reconnectToken));
    expect(back.errors()).toEqual(['SEAT_RELEASED']);
  });
});

describe('leaving and removal are terminal', () => {
  it('explicit leave: released at once, the TV is told, the credential never works again', () => {
    const { client: tv, joinCode } = rig.console();
    const alice = rig.controller(joinCode, 'Alice');
    alice.client.send(msg.controllerLeave());
    expect(roster(tv)).toEqual([]);
    alice.client.send(msg.controllerLeave()); // no identity any more
    expect(alice.client.errors()).toEqual(['UNAUTHORIZED']);
    const back = rig.connect('controller');
    back.send(msg.controllerReconnect(joinCode, alice.reconnectToken));
    expect(back.errors()).toEqual(['SEAT_RELEASED']);
    alice.client.drop(); // its transport ending later is not a second disconnect
    expect(rig.internalErrors).toEqual([]);
  });

  it('the TV removes a controller: the phone is told and closed; its old credential cannot reclaim it', () => {
    const { client: tv, joinCode } = rig.console();
    const alice = rig.controller(joinCode, 'Alice');
    const bob = rig.controller(joinCode, 'Bob');
    tv.send(msg.controllerRemove(alice.controllerId));
    expect(alice.client.last('CONSOLE_ENDED')?.payload.reason).toBe('REMOVED');
    expect(alice.client.closed).toBe(true);
    expect(roster(tv)).toEqual([['Bob', 'CONNECTED']]);
    expect(bob.client.all('CONSOLE_ENDED')).toEqual([]);
    const back = rig.connect('controller');
    back.send(msg.controllerReconnect(joinCode, alice.reconnectToken));
    expect(back.errors()).toEqual(['SEAT_RELEASED']);
    tv.send(msg.controllerRemove(alice.controllerId)); // twice: refused, changes nothing
    tv.send(msg.controllerRemove('controller-404'));
    expect(tv.errors()).toEqual(['INVALID_STATE', 'INVALID_STATE']);
    expect(roster(tv)).toEqual([['Bob', 'CONNECTED']]);
  });

  it('only this console’s TV may remove: a phone, or another console’s TV, may not', () => {
    const a = rig.console();
    const b = rig.console();
    const alice = rig.controller(a.joinCode, 'Alice');
    b.client.send(msg.controllerRemove(alice.controllerId));
    alice.client.send(msg.controllerRemove(alice.controllerId));
    expect(b.client.errors()).toEqual(['INVALID_STATE']); // not one of ITS controllers
    expect(alice.client.errors()).toEqual(['UNAUTHORIZED']);
    expect(roster(a.client)).toEqual([['Alice', 'CONNECTED']]);
  });
});

describe('the TV’s connection: recovery versus expiry', () => {
  it('TV drops → phones hear “reconnecting” → the TV reclaims → same console, same controllers', () => {
    const { client: tv, joinCode, hostToken } = rig.console();
    const alice = rig.controller(joinCode, 'Alice');
    tv.drop();
    expect(statuses(alice.client)).toEqual(['CONNECTED', 'RECONNECTING']);
    rig.advance(10_000);
    expect(statuses(alice.client)).toEqual(['CONNECTED', 'RECONNECTING', 'DISCONNECTED']);

    const tv2 = rig.connect('console');
    tv2.send(msg.hostReconnect(joinCode, hostToken));
    const reclaimed = tv2.last('HOST_RECONNECTED');
    expect(reclaimed?.payload.joinCode).toBe(joinCode);
    expect(reclaimed?.payload.hostToken).not.toBe(hostToken);
    expect(roster(tv2)).toEqual([['Alice', 'CONNECTED']]);
    expect(statuses(alice.client).at(-1)).toBe('CONNECTED');

    const old = rig.connect('console');
    old.send(msg.hostReconnect(joinCode, hostToken)); // the old TV credential is dead
    expect(old.errors()).toEqual(['UNAUTHORIZED']);
  });

  it('an established party survives a TV gone for 10 minutes', () => {
    const { client: tv, joinCode } = rig.console();
    const alice = rig.controller(joinCode, 'Alice');
    tv.drop();
    rig.advance(10 * MINUTE);
    expect(alice.client.all('CONSOLE_ENDED')).toEqual([]);
    expect(alice.client.closed).toBe(false);
  });

  it('…and ends, with every phone told, when the recovery window (30 min) expires', () => {
    const { client: tv, joinCode, hostToken } = rig.console();
    const alice = rig.controller(joinCode, 'Alice');
    const bob = rig.controller(joinCode, 'Bob');
    tv.drop();
    rig.advance(30 * MINUTE);
    for (const phone of [alice, bob]) {
      expect(phone.client.last('CONSOLE_ENDED')?.payload.reason).toBe('TV_GONE');
      expect(phone.client.closed).toBe(true);
    }
    const late = rig.connect('console');
    late.send(msg.hostReconnect(joinCode, hostToken));
    expect(late.errors()).toEqual(['ROOM_NOT_FOUND']);
    const phone = rig.connect('controller');
    phone.send(msg.controllerJoin(joinCode, 'Late'));
    expect(phone.errors()).toEqual(['ROOM_NOT_FOUND']);
  });

  it('an unestablished console (nobody ever joined) whose TV is gone for 10 minutes is cleaned up', () => {
    const { client: tv, joinCode, hostToken } = rig.console();
    tv.drop();
    rig.advance(10 * MINUTE - 1_000);
    const early = rig.connect('console');
    early.send(msg.hostReconnect(joinCode, hostToken));
    expect(early.last('HOST_RECONNECTED')).toBeDefined(); // still there just before
    early.drop();
    rig.advance(10 * MINUTE);
    const late = rig.connect('console');
    late.send(msg.hostReconnect(joinCode, early.last('HOST_RECONNECTED')?.payload.hostToken ?? ''));
    expect(late.errors()).toEqual(['ROOM_NOT_FOUND']);
  });
});

describe('closing Foomerang from the TV', () => {
  it('every phone is told and closed, the code is freed, and the TV may open a new console', () => {
    const { client: tv, joinCode } = rig.console();
    const alice = rig.controller(joinCode, 'Alice');
    tv.send(msg.consoleClose());
    expect(alice.client.last('CONSOLE_ENDED')?.payload.reason).toBe('CLOSED_BY_TV');
    expect(alice.client.closed).toBe(true);
    expect(tv.last('CONSOLE_UPDATED')?.payload).toMatchObject({ state: 'CLOSED', controllers: [] });
    const phone = rig.connect('controller');
    phone.send(msg.controllerJoin(joinCode, 'Late'));
    expect(phone.errors()).toEqual(['ROOM_NOT_FOUND']);
    tv.send(msg.consoleClose()); // nothing to close any more
    expect(tv.errors()).toEqual(['UNAUTHORIZED']);
    tv.send(msg.consoleOpen());
    expect(tv.all('CONSOLE_OPENED')).toHaveLength(2);
    expect(rig.server.diagnostics().staleClosesIgnored).toBe(0);
  });
});

describe('malformed and unauthorized messages change nothing', () => {
  it('malformed console messages are INVALID_MESSAGE', () => {
    const { client: tv, joinCode } = rig.console();
    rig.controller(joinCode, 'Alice');
    const before = tv.all('CONSOLE_UPDATED').length;
    tv.send({ type: 'CONTROLLER_REMOVE', payload: { controllerId: 'bad id' } });
    tv.send({ type: 'CONTROLLER_REMOVE', payload: {} });
    tv.send({ type: 'CONSOLE_CLOSE', payload: { force: true } });
    const phone = rig.connect('controller');
    phone.send({
      type: 'CONTROLLER_JOIN',
      payload: { joinCode, displayName: 'X', controllerId: 'controller-1' },
    });
    expect(tv.errors()).toEqual(['INVALID_MESSAGE', 'INVALID_MESSAGE', 'INVALID_MESSAGE']);
    expect(phone.errors()).toEqual(['INVALID_MESSAGE']);
    expect(tv.all('CONSOLE_UPDATED')).toHaveLength(before);
    expect(roster(tv)).toEqual([['Alice', 'CONNECTED']]);
  });

  it('game operations are not served yet (C4): refused as invalid, nothing changes', () => {
    const { client: tv } = rig.console();
    tv.send({ type: 'GAME_LAUNCH', payload: { gameId: 'foomerang-fu' } });
    tv.send({ type: 'MATCH_START', payload: { gameSessionId: 'game-1' } });
    expect(tv.errors()).toEqual(['INVALID_MESSAGE', 'INVALID_MESSAGE']);
    expect(tv.last('CONSOLE_UPDATED')?.payload.game).toBeNull();
  });

  it('identities do not cross flows: a console TV is not a room host, a controller is not a player', () => {
    const { client: tv, joinCode } = rig.console();
    const alice = rig.controller(joinCode, 'Alice');
    tv.send({ type: 'MATCH_START', payload: {} });
    tv.send({ type: 'MATCH_END', payload: {} });
    tv.send({
      type: 'CONTROLLER_CONTEXT',
      seq: 1,
      payload: { context: 'CONSOLE', secondaryAction: null },
    });
    alice.client.send(msg.move(1));
    alice.client.send(msg.join(joinCode, 'Again'));
    expect(tv.errors()).toEqual(['UNAUTHORIZED', 'UNAUTHORIZED', 'UNAUTHORIZED']);
    expect(alice.client.errors()).toEqual(['UNAUTHORIZED', 'UNAUTHORIZED']);
    const room = rig.host();
    room.client.send(msg.controllerRemove(alice.controllerId)); // a legacy room host has no console
    room.client.send(msg.consoleClose());
    expect(room.client.errors()).toEqual(['UNAUTHORIZED', 'UNAUTHORIZED']);
  });

  it('replays: a used credential, a second join on one connection', () => {
    const { joinCode } = rig.console();
    const alice = rig.controller(joinCode, 'Alice');
    alice.client.send(msg.controllerJoin(joinCode, 'Twice'));
    expect(alice.client.errors()).toEqual(['UNAUTHORIZED']);
    const a = rig.connect('controller');
    a.send(msg.controllerReconnect(joinCode, alice.reconnectToken));
    const b = rig.connect('controller');
    b.send(msg.controllerReconnect(joinCode, alice.reconnectToken)); // the same proof, replayed
    expect(a.last('CONTROLLER_RECONNECTED')).toBeDefined();
    expect(b.errors()).toEqual(['INVALID_RECONNECT_TOKEN']);
  });
});

describe('legacy rooms and console sessions coexist without ambiguity', () => {
  it('one join-code space: a colliding candidate is skipped; each code finds only its own kind', () => {
    rig.env.scriptedCodes.push(codeFor(900), codeFor(900), codeFor(901));
    const room = rig.host(); // takes codeFor(900)
    const { client: tv, joinCode, hostToken } = rig.console(); // 900 taken → 901
    expect(room.joinCode).toBe(codeFor(900));
    expect(joinCode).toBe(codeFor(901));

    const phone = rig.connect('controller');
    phone.send(msg.controllerJoin(room.joinCode, 'Alice')); // a room is not a console
    const player = rig.connect('controller');
    player.send(msg.join(joinCode, 'Bob')); // a console is not a room
    expect(phone.errors()).toEqual(['ROOM_NOT_FOUND']);
    expect(player.errors()).toEqual(['ROOM_NOT_FOUND']);

    // reclaiming finds the right kind by code
    tv.drop();
    room.client.drop();
    const tv2 = rig.connect('console');
    tv2.send(msg.hostReconnect(joinCode, hostToken));
    const host2 = rig.connect('console');
    host2.send(msg.hostReconnect(room.joinCode, room.hostToken));
    expect(tv2.last('CONSOLE_UPDATED')).toBeDefined();
    expect(tv2.last('ROOM_UPDATED')).toBeUndefined();
    expect(host2.last('ROOM_UPDATED')).toBeDefined();
    expect(host2.last('CONSOLE_UPDATED')).toBeUndefined();
    // a room's host credential does not open the console, nor the reverse
    const cross = rig.connect('console');
    cross.send(msg.hostReconnect(joinCode, room.hostToken));
    expect(cross.errors()).toEqual(['UNAUTHORIZED']);
  });

  it('the legacy Checkpoint B flow is unaffected alongside a console', () => {
    rig.console();
    const { client: host, joinCode } = rig.host();
    const alvin = rig.player(joinCode, 'Alvin');
    alvin.client.send(msg.move(1));
    expect(host.last('ROOM_UPDATED')?.payload.players.map((p) => p.displayName)).toEqual(['Alvin']);
    expect(host.all('PLAYER_INPUT')).toHaveLength(1);
  });
});
