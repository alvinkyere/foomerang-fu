import { afterEach, describe, expect, it } from 'vitest';
import { createRig, msg, type Rig } from './support/rig';
import type { ServerOptions } from '../src/server';

let rig: Rig | undefined;
async function start(options: Partial<ServerOptions> = {}): Promise<Rig> {
  rig = createRig(options);
  await rig.start();
  return rig;
}
afterEach(async () => {
  await rig?.stop();
  rig = undefined;
});

const routed = (host: { all: (t: 'PLAYER_INPUT') => unknown[] }) => host.all('PLAYER_INPUT').length;

describe('rate limiting: one broken controller cannot monopolize the process', () => {
  it('movement flood: after the burst everything is dropped, counted, and the connection survives for a while', async () => {
    const r = await start();
    const { client: host, joinCode } = r.host();
    const alice = r.player(joinCode, 'Alice');

    // The clock stands still, so there is no refill: 1,000 messages in an instant.
    for (let seq = 0; seq < 1_000; seq += 1) alice.client.send(msg.move(seq));

    expect(routed(host)).toBe(240); // the default movement burst, no more
    expect(r.server.diagnostics().rateLimitedMessages).toBe(760);
    expect(alice.client.closed).toBe(false);
  });

  it('sustained abuse gets the connection cut with RATE_LIMITED', async () => {
    const r = await start();
    const { joinCode } = r.host();
    const alice = r.player(joinCode, 'Alice');
    for (let seq = 0; seq < 1_500; seq += 1) alice.client.send(msg.move(seq));
    expect(alice.client.closed).toBe(true);
    expect(alice.client.errors()).toContain('RATE_LIMITED');
    expect(r.server.diagnostics().connectionsClosedForAbuse).toBe(1);
  });

  it('a flooding client does not affect anyone else', async () => {
    const r = await start();
    const { client: host, joinCode } = r.host();
    const noisy = r.player(joinCode, 'Noisy');
    const polite = r.player(joinCode, 'Polite');
    for (let seq = 0; seq < 2_000; seq += 1) noisy.client.send(msg.move(seq));
    polite.client.send(msg.move(1));
    const politeInputs = host
      .all('PLAYER_INPUT')
      .filter((m) => m.payload.playerId === polite.playerId);
    expect(politeInputs).toHaveLength(1);
    expect(polite.client.closed).toBe(false);
  });

  it('tokens refill as time passes', async () => {
    const r = await start();
    const { client: host, joinCode } = r.host();
    const alice = r.player(joinCode, 'Alice');
    for (let seq = 0; seq < 240; seq += 1) alice.client.send(msg.move(seq));
    alice.client.send(msg.move(240));
    expect(routed(host)).toBe(240); // exhausted
    r.env.time += 1_000; // 120 messages’ worth of refill
    for (let seq = 241; seq < 241 + 150; seq += 1) alice.client.send(msg.move(seq));
    expect(routed(host)).toBe(240 + 120);
  });

  it('legitimate 60 Hz movement for ten seconds loses nothing', async () => {
    const r = await start();
    const { client: host, joinCode } = r.host();
    const alice = r.player(joinCode, 'Alice');
    for (let seq = 0; seq < 600; seq += 1) {
      r.env.time += 1000 / 60;
      alice.client.send(msg.move(seq));
    }
    expect(routed(host)).toBe(600);
    expect(r.server.diagnostics().rateLimitedMessages).toBe(0);
  });

  it('room operations are tightly limited: join spam is answered with RATE_LIMITED', async () => {
    const r = await start();
    const client = r.connect('controller');
    for (let i = 0; i < 20; i += 1) client.send(msg.join('ZZZZZZ'));
    const errors = client.errors();
    expect(errors.filter((e) => e === 'ROOM_NOT_FOUND')).toHaveLength(5); // the burst
    expect(errors.filter((e) => e === 'RATE_LIMITED')).toHaveLength(15);
    expect(client.closed).toBe(false);
  });

  it('handshakes are limited per connection', async () => {
    const r = await start();
    const client = r.connect('controller');
    for (let i = 0; i < 6; i += 1) client.send(msg.handshake());
    expect(client.errors()).toContain('RATE_LIMITED');
  });

  it('heartbeats are bounded too', async () => {
    const r = await start();
    const client = r.connect('controller');
    for (let i = 0; i < 100; i += 1) client.send(msg.heartbeat(i));
    expect(client.all('HEARTBEAT_ACK').length).toBeLessThanOrEqual(10);
  });

  it('limits are configurable', async () => {
    const r = await start({ rateLimits: { movement: { burst: 3, refillPerSecond: 1 } } });
    const { client: host, joinCode } = r.host();
    const alice = r.player(joinCode, 'Alice');
    for (let seq = 0; seq < 10; seq += 1) alice.client.send(msg.move(seq));
    expect(routed(host)).toBe(3);
  });

  it('the dropped-message tolerance is configurable', async () => {
    const r = await start({ rateLimits: { maxDroppedMessages: 5 } });
    const { joinCode } = r.host();
    const alice = r.player(joinCode, 'Alice');
    for (let seq = 0; seq < 300; seq += 1) alice.client.send(msg.move(seq));
    expect(alice.client.closed).toBe(true);
  });
});

describe('invalid messages', () => {
  it('are answered with INVALID_MESSAGE, never crash anything, and are counted', async () => {
    const r = await start();
    const client = r.connect('controller');
    for (const garbage of [null, 42, 'x', [], {}, { type: 'TELEPORT' }, { type: 'INPUT_MOVE' }]) {
      client.send(garbage);
    }
    expect(client.errors().every((e) => e === 'INVALID_MESSAGE')).toBe(true);
    expect(r.server.diagnostics().invalidMessages).toBe(7);
    expect(client.closed).toBe(false);
  });

  it('a controller that keeps sending them is eventually disconnected', async () => {
    const r = await start({ rateLimits: { other: { burst: 1_000, refillPerSecond: 1_000 } } });
    const client = r.connect('controller');
    for (let i = 0; i < 60; i += 1) client.send({ nonsense: i });
    expect(client.closed).toBe(true);
    expect(r.server.diagnostics().connectionsClosedForAbuse).toBe(1);
  });

  it('out-of-range or non-finite axes never reach the host', async () => {
    const r = await start();
    const { client: host, joinCode } = r.host();
    const alice = r.player(joinCode, 'Alice');
    alice.client.send(msg.move(1, 2, 0));
    alice.client.send(msg.move(2, Number.NaN, 0));
    alice.client.send(msg.move(3, Number.POSITIVE_INFINITY, 0));
    alice.client.send(msg.move(4, 394, 12));
    expect(routed(host)).toBe(0);
    expect(alice.client.errors()).toEqual([
      'INVALID_MESSAGE',
      'INVALID_MESSAGE',
      'INVALID_MESSAGE',
      'INVALID_MESSAGE',
    ]);
  });
});

describe('diagnostics', () => {
  it('expose a fixed set of numeric counters only — no payloads, no identities, no credentials', async () => {
    const r = await start();
    const snapshot = r.server.diagnostics();
    expect(Object.keys(snapshot).sort()).toEqual(
      [
        'connectionsAccepted',
        'connectionsClosedForAbuse',
        'connectionsRefused',
        'duplicateEventsDiscarded',
        'eventsRouted',
        'handshakeTimeouts',
        'handshakesAccepted',
        'handshakesRejected',
        'heartbeats',
        'inputDroppedNoHost',
        'internalErrors',
        'invalidMessages',
        'movementRouted',
        'rateLimitedMessages',
        'staleClosesIgnored',
        'staleContextDiscarded',
        'staleGameDiscarded',
        'staleParticipantsDiscarded',
        'consoleInputDropped',
        'staleMovementDiscarded',
        'takeovers',
        'unauthorizedMessages',
      ].sort(),
    );
    expect(Object.values(snapshot).every((value) => typeof value === 'number')).toBe(true);
  });

  it('a snapshot is a copy: mutating it changes nothing', async () => {
    const r = await start();
    const snapshot = r.server.diagnostics() as Record<string, number>;
    snapshot['invalidMessages'] = 999;
    expect(r.server.diagnostics().invalidMessages).toBe(0);
  });
});
