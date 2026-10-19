import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRig, msg, type Rig } from './support/rig';

// The TV asks for a controller to vibrate (the plaza's border warning). The server passes it on ONLY to a participant of the
// running match, and only from the TV that owns the console; the phone gets no other controller's id.

let rig: Rig;
beforeEach(async () => {
  rig = createRig({ rateLimits: { room: { burst: 1_000, refillPerSecond: 1_000 } } });
  await rig.start();
});
afterEach(async () => {
  await rig.stop();
});

function playing() {
  const { client: tv, joinCode } = rig.console();
  const a = rig.controller(joinCode, 'A');
  const b = rig.controller(joinCode, 'B');
  const spare = rig.controller(joinCode, 'Spare');
  tv.send(msg.gameLaunch());
  const game = tv.last('CONSOLE_UPDATED')?.payload.game?.gameSessionId ?? '';
  tv.send(
    msg.gameParticipants(1, game, [
      { controllerId: a.controllerId, seat: 1 },
      { controllerId: b.controllerId, seat: 2 },
    ]),
  );
  tv.send(msg.gameMatchStart(game));
  return { tv, joinCode, a, b, spare, game };
}

describe('CONTROLLER_RUMBLE', () => {
  it('reaches exactly the named participant, as RUMBLE with the launch, strength and duration', () => {
    const { tv, a, b, spare, game } = playing();
    tv.send(msg.rumble(game, a.controllerId, 0.7, 200));
    expect(a.client.all('RUMBLE').map((m) => m.payload)).toEqual([
      { gameSessionId: game, intensity: 0.7, durationMs: 200 },
    ]);
    expect(b.client.all('RUMBLE')).toEqual([]);
    expect(spare.client.all('RUMBLE')).toEqual([]);
    expect(tv.errors()).toEqual([]);
  });

  it('a controller that is not a participant (waiting) gets nothing', () => {
    const { tv, spare, game } = playing();
    tv.send(msg.rumble(game, spare.controllerId));
    expect(spare.client.all('RUMBLE')).toEqual([]);
  });

  it('nothing outside a running match: in the lobby, or aimed at a launch that has ended', () => {
    const { client: tv, joinCode } = rig.console();
    const a = rig.controller(joinCode, 'A');
    tv.send(msg.gameLaunch());
    const game = tv.last('CONSOLE_UPDATED')?.payload.game?.gameSessionId ?? '';
    tv.send(msg.gameParticipants(1, game, [{ controllerId: a.controllerId, seat: 1 }]));
    tv.send(msg.rumble(game, a.controllerId)); // seated, but no match yet
    tv.send(msg.gameMatchStart(game));
    tv.send(msg.gameMatchEnd(game));
    tv.send(msg.gameExit(game));
    tv.send(msg.rumble(game, a.controllerId)); // a past launch
    expect(a.client.all('RUMBLE')).toEqual([]);
  });

  it('only the console’s TV may ask: a phone asking is refused and nothing is sent', () => {
    const { a, b, game } = playing();
    a.client.send(msg.rumble(game, b.controllerId));
    expect(a.client.errors()).toEqual(['UNAUTHORIZED']);
    expect(b.client.all('RUMBLE')).toEqual([]);
  });

  it('another console’s TV cannot reach this console’s phones', () => {
    const { a, game } = playing();
    const { client: other } = rig.console();
    other.send(msg.rumble(game, a.controllerId));
    expect(a.client.all('RUMBLE')).toEqual([]);
  });

  it('it is charged to the TV’s action budget (a runaway TV is throttled like any client)', () => {
    const { tv, a, game } = playing();
    for (let i = 0; i < 200; i += 1) tv.send(msg.rumble(game, a.controllerId));
    expect(a.client.all('RUMBLE').length).toBeLessThan(200);
    expect(a.client.all('RUMBLE').length).toBeGreaterThan(0);
  });
});

// The room flow (what the TV and the phones use today): the room's host names a player.
describe('PLAYER_RUMBLE (room flow)', () => {
  const start = { type: 'MATCH_START', payload: {} };
  function room() {
    const { client: tv, joinCode } = rig.host('foomerang-fu');
    const a = rig.player(joinCode, 'A');
    const b = rig.player(joinCode, 'B');
    return { tv, joinCode, a, b };
  }

  it('during a match it reaches exactly the named player, as RUMBLE with the strength and duration', () => {
    const { tv, a, b } = room();
    tv.send(start);
    tv.send(msg.playerRumble(a.playerId, 0.8, 250));
    expect(a.client.all('RUMBLE').map((m) => m.payload)).toEqual([
      { intensity: 0.8, durationMs: 250 },
    ]);
    expect(b.client.all('RUMBLE')).toEqual([]);
    expect(tv.errors()).toEqual([]);
  });

  it('not in the lobby, and never to a player of another room', () => {
    const { tv, a } = room();
    tv.send(msg.playerRumble(a.playerId));
    expect(a.client.all('RUMBLE')).toEqual([]);
    const other = rig.host('foomerang-fu');
    rig.player(other.joinCode, 'C');
    other.client.send(start);
    other.client.send(msg.playerRumble(a.playerId));
    expect(a.client.all('RUMBLE')).toEqual([]);
  });

  it('only the host may ask: a player asking is refused and nothing is sent', () => {
    const { tv, a, b } = room();
    tv.send(start);
    a.client.send(msg.playerRumble(b.playerId));
    expect(a.client.errors()).toEqual(['UNAUTHORIZED']);
    expect(b.client.all('RUMBLE')).toEqual([]);
  });

  it('it is charged to the host’s action budget', () => {
    const { tv, a } = room();
    tv.send(start);
    for (let i = 0; i < 200; i += 1) tv.send(msg.playerRumble(a.playerId));
    const got = a.client.all('RUMBLE').length;
    expect(got).toBeGreaterThan(0);
    expect(got).toBeLessThan(200);
  });
});
