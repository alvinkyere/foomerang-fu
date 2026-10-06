import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRig, msg, type Rig } from './support/rig';

let rig: Rig;
beforeEach(async () => {
  rig = createRig();
  await rig.start();
});
afterEach(async () => {
  await rig.stop();
});

const start = { type: 'MATCH_START', payload: {} };
const state = (host: ReturnType<Rig['host']>['client']) => host.last('ROOM_UPDATED')?.payload.state;

describe('starting a match', () => {
  it('the host moves the room LOBBY → PLAYING and is told', () => {
    const { client: host, joinCode } = rig.host('primitive-arena');
    rig.player(joinCode, 'Alice');
    expect(state(host)).toBe('LOBBY');
    host.send(start);
    expect(state(host)).toBe('PLAYING');
    expect(host.errors()).toEqual([]);
  });

  it('the primitive arena can be started by a single phone (Foomerang Fu itself needs two)', () => {
    const { client: host, joinCode } = rig.host('primitive-arena');
    rig.player(joinCode, 'Alice');
    host.send(start);
    expect(state(host)).toBe('PLAYING');

    const fu = rig.host('foomerang-fu');
    rig.player(fu.joinCode, 'Solo');
    fu.client.send(start);
    expect(fu.client.errors()).toEqual(['NOT_ENOUGH_PLAYERS']);
    expect(state(fu.client)).toBe('LOBBY');
  });

  it('a room with nobody in it cannot start', () => {
    const { client: host } = rig.host('primitive-arena');
    host.send(start);
    expect(host.errors()).toEqual(['NOT_ENOUGH_PLAYERS']);
    expect(state(host)).toBe('LOBBY');
  });

  it('starting twice is INVALID_STATE and changes nothing', () => {
    const { client: host, joinCode } = rig.host('primitive-arena');
    rig.player(joinCode, 'Alice');
    host.send(start);
    host.send(start);
    expect(host.errors()).toEqual(['INVALID_STATE']);
    expect(state(host)).toBe('PLAYING');
  });

  it('a player counts toward the minimum only while CONNECTED', () => {
    const { client: host, joinCode } = rig.host('primitive-arena');
    rig.player(joinCode, 'Alice').client.drop();
    host.send(start);
    expect(host.errors()).toEqual(['NOT_ENOUGH_PLAYERS']);
  });
});

describe('authorization: only the room’s host may start it', () => {
  it('a controller cannot', () => {
    const { client: host, joinCode } = rig.host('primitive-arena');
    const alice = rig.player(joinCode, 'Alice');
    alice.client.send(start);
    expect(alice.client.errors()).toEqual(['UNAUTHORIZED']);
    expect(state(host)).toBe('LOBBY');
  });

  it('a console that holds no room cannot', () => {
    const { client: host, joinCode } = rig.host('primitive-arena');
    rig.player(joinCode, 'Alice');
    const bare = rig.connect('console');
    bare.send(start);
    expect(bare.errors()).toEqual(['UNAUTHORIZED']);
    expect(state(host)).toBe('LOBBY');
  });

  it('nothing before the handshake', () => {
    const client = rig.raw();
    client.send(start);
    expect(client.errors()).toEqual(['HANDSHAKE_REQUIRED']);
    expect(client.closed).toBe(true);
  });

  it('is limited like other room operations (no start spam)', () => {
    const { client: host } = rig.host('primitive-arena');
    for (let i = 0; i < 12; i += 1) host.send(start);
    expect(host.errors()).toContain('RATE_LIMITED');
  });
});

describe('after the match has started', () => {
  it('nobody new can join, but a player who dropped can come back as the same player', () => {
    const { client: host, joinCode } = rig.host('primitive-arena');
    const alice = rig.player(joinCode, 'Alice');
    host.send(start);

    const late = rig.connect('controller');
    late.send(msg.join(joinCode, 'Late'));
    expect(late.errors()).toEqual(['ROOM_NOT_JOINABLE']);

    alice.client.drop();
    const phone = rig.connect('controller');
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    expect(phone.last('PLAYER_RECONNECTED')?.payload.playerId).toBe(alice.playerId);
    phone.send(msg.move(1));
    expect(host.all('PLAYER_INPUT').length).toBeGreaterThan(0);
  });
});

describe('the primitive arena game', () => {
  it('advertises the same one-joystick controller, for up to six players', () => {
    const { joinCode } = rig.host('primitive-arena');
    const alice = rig.player(joinCode, 'Alice');
    expect(alice.client.last('CONTROLLER_MANIFEST')?.payload).toEqual({
      gameId: 'primitive-arena',
      orientation: 'landscape',
      controls: [{ id: 'MOVE', type: 'joystick' }],
    });
    for (let i = 2; i <= 6; i += 1) rig.player(joinCode, `P${i}`);
    const seventh = rig.connect('controller');
    seventh.send(msg.join(joinCode, 'P7'));
    expect(seventh.errors()).toEqual(['ROOM_FULL']);
  });
});
