import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRig, msg, type Rig } from './support/rig';
import type { FakeClient } from './support/fakes';

let rig: Rig;
beforeEach(async () => {
  rig = createRig({ eventWindowCapacity: 4 });
  await rig.start();
});
afterEach(async () => {
  await rig.stop();
});

const moveSeqs = (host: FakeClient, playerId?: string) =>
  host
    .all('PLAYER_INPUT')
    .filter((m) => playerId === undefined || m.payload.playerId === playerId)
    .flatMap((m) => (m.payload.input.kind === 'MOVE' ? [m.payload.input.seq] : []));

const actionIds = (host: FakeClient) =>
  host
    .all('PLAYER_INPUT')
    .flatMap((m) => (m.payload.input.kind === 'ACTION' ? [m.payload.input.eventId] : []));

describe('movement is STATE: ordered by seq within a connection, latest wins', () => {
  it('discards a stale movement (1842, 1844, 1843) without treating it as an error', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');

    alice.client.send(msg.move(1842));
    alice.client.send(msg.move(1844));
    alice.client.send(msg.move(1843)); // arrives late
    alice.client.send(msg.move(1845));

    expect(moveSeqs(host)).toEqual([1842, 1844, 1845]);
    expect(alice.client.errors()).toEqual([]); // normal reordering is not a protocol violation
    expect(alice.client.closed).toBe(false);
    expect(rig.server.diagnostics().staleMovementDiscarded).toBe(1);
  });

  it('a repeated seq is discarded as well', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.send(msg.move(5));
    alice.client.send(msg.move(5));
    expect(moveSeqs(host)).toEqual([5]);
  });

  it.each([0, 1, 1_000_000, 4_294_967_295])('accepts a first movement with seq %i', (seq) => {
    const { client: host, joinCode } = rig.host();
    rig.player(joinCode, 'Alice').client.send(msg.move(seq));
    expect(moveSeqs(host)).toEqual([seq]);
  });

  it('routes the exact values, tagged with WHO sent them', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.send(msg.move(3, -0.25, 0.75));
    expect(host.last('PLAYER_INPUT')).toEqual({
      type: 'PLAYER_INPUT',
      payload: { playerId: alice.playerId, input: { kind: 'MOVE', seq: 3, x: -0.25, y: 0.75 } },
    });
  });

  it('ordering is per connection: two players may use the same sequence numbers', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    const bob = rig.player(joinCode, 'Bob');
    for (let seq = 1; seq <= 3; seq += 1) {
      alice.client.send(msg.move(seq, 1, 0));
      bob.client.send(msg.move(seq, -1, 0));
    }
    expect(moveSeqs(host, alice.playerId)).toEqual([1, 2, 3]);
    expect(moveSeqs(host, bob.playerId)).toEqual([1, 2, 3]);
  });

  it('many stale messages are still not fatal', () => {
    const { joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.send(msg.move(1_000));
    for (let seq = 0; seq < 150; seq += 1) alice.client.send(msg.move(seq));
    expect(alice.client.closed).toBe(false);
    expect(rig.server.diagnostics().staleMovementDiscarded).toBe(150);
  });
});

describe('the sequence belongs to the connection: a reconnected controller starts afresh', () => {
  it('seq 0 on the new connection is accepted even after 92,847 on the old one', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.send(msg.move(92_847));
    alice.client.drop();

    const phone = rig.connect('controller');
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    phone.send(msg.move(0));
    phone.send(msg.move(1));
    expect(moveSeqs(host, alice.playerId)).toEqual([92_847, 0, 1]);
  });

  it('after a takeover too', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.send(msg.move(500));
    const phone = rig.connect('controller');
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    phone.send(msg.move(0));
    expect(moveSeqs(host, alice.playerId)).toEqual([500, 0]);
  });
});

describe('movement with no host to receive it', () => {
  it('is dropped and counted, and routing resumes when the host returns', () => {
    const { client: host, joinCode, hostToken } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    host.drop();
    alice.client.send(msg.move(1));
    expect(rig.server.diagnostics().inputDroppedNoHost).toBe(1);
    expect(alice.client.closed).toBe(false);

    const next = rig.connect('console');
    next.send(msg.hostReconnect(joinCode, hostToken));
    alice.client.send(msg.move(2));
    expect(moveSeqs(next)).toEqual([2]);
  });
});

describe('action events are EVENTS: delivered once, deduplicated by eventId', () => {
  it('a retry is recognised and not applied twice', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.send(msg.press('press-000001'));
    alice.client.send(msg.press('press-000001')); // retry
    alice.client.send(msg.press('press-000001'));
    alice.client.send(msg.press('press-000002'));
    expect(actionIds(host)).toEqual(['press-000001', 'press-000002']);
    expect(rig.server.diagnostics().duplicateEventsDiscarded).toBe(2);
  });

  it('is identified by the PLAYER, so a retry from a new connection is still a duplicate', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.send(msg.press('press-000001'));
    alice.client.drop();
    const phone = rig.connect('controller');
    phone.send(msg.reconnect(joinCode, alice.reconnectToken));
    phone.send(msg.press('press-000001')); // the client re-sends what it never saw acknowledged
    expect(actionIds(host)).toEqual(['press-000001']);
  });

  it('two players may use the same eventId independently', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    const bob = rig.player(joinCode, 'Bob');
    alice.client.send(msg.press('press-000001'));
    bob.client.send(msg.press('press-000001'));
    expect(actionIds(host)).toEqual(['press-000001', 'press-000001']);
  });

  it('events are never discarded for arriving “out of order”: only duplicates are', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.send(msg.press('press-aaaaaa', 9));
    alice.client.send(msg.press('press-bbbbbb', 3));
    expect(actionIds(host)).toEqual(['press-aaaaaa', 'press-bbbbbb']);
  });

  it('routes the action with its identity and phase', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    alice.client.send(msg.press('press-000001', 1, 'SECONDARY'));
    expect(host.last('PLAYER_INPUT')?.payload).toEqual({
      playerId: alice.playerId,
      input: { kind: 'ACTION', eventId: 'press-000001', action: 'SECONDARY', phase: 'pressed' },
    });
  });

  it('remembers only a BOUNDED window (capacity 4 here): the oldest ids are forgotten first', () => {
    const { client: host, joinCode } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    for (let i = 1; i <= 10; i += 1)
      alice.client.send(msg.press(`press-${String(i).padStart(6, '0')}`));
    expect(actionIds(host)).toHaveLength(10);

    alice.client.send(msg.press('press-000010')); // recent: still a duplicate
    alice.client.send(msg.press('press-000008'));
    expect(actionIds(host)).toHaveLength(10);

    alice.client.send(msg.press('press-000001')); // long forgotten: treated as new (the documented limit)
    expect(actionIds(host)).toHaveLength(11);
  });

  it('an event with nobody to receive it is NOT remembered, so a later retry still gets through', () => {
    const { client: host, joinCode, hostToken } = rig.host();
    const alice = rig.player(joinCode, 'Alice');
    host.drop();
    alice.client.send(msg.press('press-000001')); // lost: no host
    const next = rig.connect('console');
    next.send(msg.hostReconnect(joinCode, hostToken));
    alice.client.send(msg.press('press-000001')); // the retry
    expect(actionIds(next)).toEqual(['press-000001']);
  });
});
