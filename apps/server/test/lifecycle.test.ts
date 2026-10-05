import { describe, expect, it } from 'vitest';
import { createRig, msg } from './support/rig';

describe('server start / stop (fake transport)', () => {
  it('starts exactly once', async () => {
    const rig = createRig();
    await rig.start();
    await expect(rig.server.start()).rejects.toThrow();
    await rig.stop();
  });

  it('cannot be restarted after stopping', async () => {
    const rig = createRig();
    await rig.start();
    await rig.stop();
    await expect(rig.server.start()).rejects.toThrow();
  });

  it('stopping is idempotent and legal even if it never started', async () => {
    const never = createRig();
    await expect(never.stop()).resolves.toBeUndefined();

    const rig = createRig();
    await rig.start();
    await rig.stop();
    await expect(rig.stop()).resolves.toBeUndefined();
  });

  it('while running, exactly one timer exists: the reconcile sweep', async () => {
    const rig = createRig();
    await rig.start();
    expect(rig.scheduler.pending).toBe(1);
    await rig.stop();
  });

  it('leaves NO timers behind, even with connections still waiting to handshake', async () => {
    const rig = createRig();
    await rig.start();
    rig.raw(); // a handshake timer is pending
    rig.raw();
    const { joinCode } = rig.host();
    rig.player(joinCode);
    expect(rig.scheduler.pending).toBeGreaterThan(1);
    await rig.stop();
    expect(rig.scheduler.pending).toBe(0);
  });

  it('closes every connection and stops the transport', async () => {
    const rig = createRig();
    await rig.start();
    const { client: host, joinCode } = rig.host();
    const { client: player } = rig.player(joinCode);
    const stray = rig.raw();
    await rig.stop();
    expect([host.closed, player.closed, stray.closed]).toEqual([true, true, true]);
    expect(rig.transport.stopped).toBe(true);
  });

  it('refuses new connections once stopping, and does no further work', async () => {
    const rig = createRig();
    await rig.start();
    await rig.stop();
    const late = rig.raw();
    expect(late.closed).toBe(true);
    expect(rig.scheduler.pending).toBe(0);
  });

  it('shutting down does not emit roster noise or throw for connections that held identities', async () => {
    const rig = createRig();
    await rig.start();
    const { client: host, joinCode } = rig.host();
    rig.player(joinCode);
    const updates = host.all('ROOM_UPDATED').length;
    await expect(rig.stop()).resolves.toBeUndefined();
    expect(host.all('ROOM_UPDATED')).toHaveLength(updates);
    expect(rig.internalErrors).toEqual([]);
  });

  it('the sweep stops with the server', async () => {
    const rig = createRig();
    await rig.start();
    const { client: host, joinCode } = rig.host();
    rig.player(joinCode).client.drop();
    await rig.stop();
    const updates = host.all('ROOM_UPDATED').length;
    rig.env.time += 120_000;
    rig.scheduler.advance(120_000);
    expect(host.all('ROOM_UPDATED')).toHaveLength(updates);
  });

  it('reports the port the transport bound', async () => {
    const rig = createRig();
    await expect(rig.server.start()).resolves.toEqual({ port: 0 });
    await rig.stop();
  });

  it('is usable after start with the documented defaults (1 s sweep, 5 s handshake timeout)', async () => {
    const rig = createRig();
    await rig.start();
    const client = rig.raw();
    rig.scheduler.advance(5_000);
    expect(client.closed).toBe(true);
    const ok = rig.connect('controller');
    ok.send(msg.heartbeat(1));
    expect(ok.last('HEARTBEAT_ACK')).toBeDefined();
    await rig.stop();
  });
});
